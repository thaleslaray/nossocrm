/**
 * @fileoverview Channel Router Service
 *
 * Main service for messaging operations. Routes messages to the correct
 * provider based on the channel configuration.
 *
 * @module lib/messaging/channel-router.service
 *
 * @example
 * ```ts
 * const router = new ChannelRouterService();
 *
 * // Send a message
 * const result = await router.sendMessage(channelId, {
 *   conversationId: 'uuid',
 *   to: '+5511999999999',
 *   content: { type: 'text', text: 'Hello!' },
 * });
 *
 * // Handle incoming webhook
 * const event = await router.handleIncomingWebhook(channelId, payload);
 * ```
 */

import { createStaticAdminClient } from '@/lib/supabase/server';
import { ChannelProviderFactory } from './channel-factory';

// IMPORTANT: Import providers to trigger automatic factory registration
// This must be imported before any ChannelProviderFactory.createProvider() calls
import './providers';
import type {
  ChannelType,
  MessagingChannel,
  IChannelProvider,
  ProviderConfig,
  SendMessageParams,
  SendMessageResult,
  SendTemplateParams,
  ConnectionStatusResult,
  WebhookHandlerResult,
  MediaUploadResult,
  MediaDownloadResult,
  QrCodeResult,
  TemplateSyncResult,
  transformChannel,
} from './types';
import { transformChannel as transformChannelFn } from './types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for the channel router service.
 */
export interface ChannelRouterOptions {
  /** Whether to cache provider instances. Default: true */
  cacheProviders?: boolean;
  /** TTL for cached providers in ms. Default: 5 minutes */
  providerCacheTtl?: number;
}

/**
 * Cached provider entry.
 */
interface CachedProvider {
  provider: IChannelProvider;
  channelId: string;
  createdAt: number;
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Channel Router Service.
 *
 * Manages messaging operations across multiple channels and providers.
 * Uses the Strategy pattern - the actual messaging logic is delegated
 * to the appropriate provider.
 *
 * Features:
 * - Provider instance caching (optional)
 * - Automatic provider selection based on channel config
 * - Error handling and logging
 *
 * @example
 * ```ts
 * const router = new ChannelRouterService({ cacheProviders: true });
 *
 * // Send message
 * const result = await router.sendMessage(channelId, params);
 *
 * // Get connection status
 * const status = await router.getChannelStatus(channelId);
 *
 * // Handle webhook
 * const event = await router.handleIncomingWebhook(channelId, payload);
 * ```
 */
export class ChannelRouterService {
  private providerCache: Map<string, CachedProvider> = new Map();
  private options: Required<ChannelRouterOptions>;

  constructor(options: ChannelRouterOptions = {}) {
    this.options = {
      cacheProviders: options.cacheProviders ?? true,
      providerCacheTtl: options.providerCacheTtl ?? 5 * 60 * 1000, // 5 minutes
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Send a message through a channel.
   *
   * @param channelId - The channel ID
   * @param params - Message parameters
   * @returns Send result
   */
  async sendMessage(
    channelId: string,
    params: SendMessageParams
  ): Promise<SendMessageResult> {
    try {
      const provider = await this.getProviderForChannel(channelId);
      return await provider.sendMessage(params);
    } catch (error) {
      console.error('[ChannelRouter] sendMessage error:', error);
      return {
        success: false,
        error: {
          code: 'ROUTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: false,
        },
      };
    }
  }

  /**
   * Send a template message through a channel.
   *
   * @param channelId - The channel ID
   * @param params - Template parameters
   * @returns Send result
   */
  async sendTemplate(
    channelId: string,
    params: SendTemplateParams
  ): Promise<SendMessageResult> {
    try {
      const provider = await this.getProviderForChannel(channelId);

      if (!provider.sendTemplate) {
        return {
          success: false,
          error: {
            code: 'TEMPLATES_NOT_SUPPORTED',
            message: `Provider ${provider.providerName} does not support templates`,
            retryable: false,
          },
        };
      }

      return await provider.sendTemplate(params);
    } catch (error) {
      console.error('[ChannelRouter] sendTemplate error:', error);
      return {
        success: false,
        error: {
          code: 'ROUTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: false,
        },
      };
    }
  }

  /**
   * Get connection status for a channel.
   *
   * @param channelId - The channel ID
   * @returns Connection status
   */
  async getChannelStatus(channelId: string): Promise<ConnectionStatusResult> {
    try {
      const provider = await this.getProviderForChannel(channelId);
      return await provider.getStatus();
    } catch (error) {
      console.error('[ChannelRouter] getChannelStatus error:', error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle incoming webhook from a provider.
   *
   * @param channelId - The channel ID
   * @param payload - Raw webhook payload
   * @returns Normalized webhook event
   */
  async handleIncomingWebhook(
    channelId: string,
    payload: unknown
  ): Promise<WebhookHandlerResult> {
    const provider = await this.getProviderForChannel(channelId);
    return await provider.handleWebhook(payload);
  }

  /**
   * Verify webhook signature.
   *
   * @param channelId - The channel ID
   * @param payload - Raw webhook payload
   * @param signature - Signature from request headers
   * @returns True if signature is valid
   */
  async verifyWebhookSignature(
    channelId: string,
    payload: unknown,
    signature: string
  ): Promise<boolean> {
    try {
      const provider = await this.getProviderForChannel(channelId);

      if (!provider.verifyWebhookSignature) {
        // Provider doesn't support signature verification
        return true;
      }

      return provider.verifyWebhookSignature(payload, signature);
    } catch (error) {
      console.error('[ChannelRouter] verifyWebhookSignature error:', error);
      return false;
    }
  }

  /**
   * Get QR code for WhatsApp Web connection.
   *
   * @param channelId - The channel ID
   * @returns QR code data
   */
  async getQrCode(channelId: string): Promise<QrCodeResult | null> {
    try {
      const provider = await this.getProviderForChannel(channelId);

      if (!provider.getQrCode) {
        return null;
      }

      return await provider.getQrCode();
    } catch (error) {
      console.error('[ChannelRouter] getQrCode error:', error);
      return null;
    }
  }

  /**
   * Upload media for a channel.
   *
   * @param channelId - The channel ID
   * @param file - File data (File or Blob for browser/edge compatibility)
   * @param mimeType - MIME type
   * @returns Upload result
   */
  async uploadMedia(
    channelId: string,
    file: File | Blob,
    mimeType: string
  ): Promise<MediaUploadResult> {
    try {
      const provider = await this.getProviderForChannel(channelId);

      if (!provider.uploadMedia) {
        return {
          success: false,
          error: {
            code: 'MEDIA_NOT_SUPPORTED',
            message: `Provider ${provider.providerName} does not support media upload`,
            retryable: false,
          },
        };
      }

      return await provider.uploadMedia(file, mimeType);
    } catch (error) {
      console.error('[ChannelRouter] uploadMedia error:', error);
      return {
        success: false,
        error: {
          code: 'ROUTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: false,
        },
      };
    }
  }

  /**
   * Download media from a received message.
   *
   * @param channelId - The channel ID
   * @param mediaId - Media ID from the message
   * @returns Download result
   */
  async downloadMedia(
    channelId: string,
    mediaId: string
  ): Promise<MediaDownloadResult> {
    try {
      const provider = await this.getProviderForChannel(channelId);

      if (!provider.downloadMedia) {
        return {
          success: false,
          error: {
            code: 'MEDIA_NOT_SUPPORTED',
            message: `Provider ${provider.providerName} does not support media download`,
            retryable: false,
          },
        };
      }

      return await provider.downloadMedia(mediaId);
    } catch (error) {
      console.error('[ChannelRouter] downloadMedia error:', error);
      return {
        success: false,
        error: {
          code: 'ROUTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: false,
        },
      };
    }
  }

  /**
   * Sync templates from provider.
   *
   * @param channelId - The channel ID
   * @returns Sync result
   */
  async syncTemplates(channelId: string): Promise<TemplateSyncResult> {
    try {
      const provider = await this.getProviderForChannel(channelId);

      if (!provider.syncTemplates) {
        return {
          success: false,
          error: {
            code: 'TEMPLATES_NOT_SUPPORTED',
            message: `Provider ${provider.providerName} does not support template sync`,
            retryable: false,
          },
        };
      }

      return await provider.syncTemplates();
    } catch (error) {
      console.error('[ChannelRouter] syncTemplates error:', error);
      return {
        success: false,
        error: {
          code: 'ROUTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: false,
        },
      };
    }
  }

  /**
   * Disconnect a channel.
   *
   * @param channelId - The channel ID
   */
  async disconnectChannel(channelId: string): Promise<void> {
    try {
      const provider = await this.getProviderForChannel(channelId);
      await provider.disconnect();
      this.removeFromCache(channelId);
    } catch (error) {
      console.error('[ChannelRouter] disconnectChannel error:', error);
      throw error;
    }
  }

  /**
   * Clear the provider cache.
   */
  clearCache(): void {
    this.providerCache.clear();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Get or create a provider instance for a channel.
   */
  private async getProviderForChannel(channelId: string): Promise<IChannelProvider> {
    // Check cache first
    if (this.options.cacheProviders) {
      const cached = this.providerCache.get(channelId);
      if (cached && !this.isCacheExpired(cached)) {
        return cached.provider;
      }
    }

    // Fetch channel from database
    const channel = await this.fetchChannel(channelId);

    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    // Create provider instance
    const provider = ChannelProviderFactory.createProvider(
      channel.channelType,
      channel.provider
    );

    // Initialize with config
    const config: ProviderConfig = {
      channelId: channel.id,
      channelType: channel.channelType,
      provider: channel.provider,
      externalIdentifier: channel.externalIdentifier,
      credentials: channel.credentials as Record<string, string>,
      webhookUrl: channel.settings.webhookUrl,
      settings: channel.settings,
    };

    await provider.initialize(config);

    // Cache the provider
    if (this.options.cacheProviders) {
      this.providerCache.set(channelId, {
        provider,
        channelId,
        createdAt: Date.now(),
      });
    }

    return provider;
  }

  /**
   * Fetch channel from database.
   * Uses admin client (service role) to bypass RLS since this runs server-side.
   */
  private async fetchChannel(channelId: string): Promise<MessagingChannel | null> {
    const supabase = createStaticAdminClient();

    const { data, error } = await supabase
      .from('messaging_channels')
      .select('*')
      .eq('id', channelId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      console.error('[ChannelRouter] fetchChannel error:', error);
      return null;
    }

    return transformChannelFn(data);
  }

  /**
   * Check if a cached provider is expired.
   */
  private isCacheExpired(cached: CachedProvider): boolean {
    return Date.now() - cached.createdAt > this.options.providerCacheTtl;
  }

  /**
   * Remove a provider from cache.
   */
  private removeFromCache(channelId: string): void {
    this.providerCache.delete(channelId);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default channel router instance.
 * Use this for most cases.
 */
let defaultRouter: ChannelRouterService | null = null;

/**
 * Get the default channel router instance.
 * Creates one if it doesn't exist.
 */
export function getChannelRouter(): ChannelRouterService {
  if (!defaultRouter) {
    defaultRouter = new ChannelRouterService();
  }
  return defaultRouter;
}

/**
 * Reset the default channel router (for testing).
 */
export function resetChannelRouter(): void {
  if (defaultRouter) {
    defaultRouter.clearCache();
    defaultRouter = null;
  }
}

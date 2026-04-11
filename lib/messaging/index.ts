/**
 * @fileoverview Messaging Module
 *
 * Central export for the messaging system.
 * Provides omnichannel messaging capabilities (WhatsApp, Instagram, Email, SMS).
 *
 * @module lib/messaging
 *
 * @example
 * ```ts
 * import {
 *   // Types
 *   MessagingChannel,
 *   MessagingConversation,
 *   MessagingMessage,
 *
 *   // Factory
 *   ChannelProviderFactory,
 *
 *   // Service
 *   ChannelRouterService,
 *   getChannelRouter,
 *
 *   // Base Provider
 *   BaseChannelProvider,
 * } from '@/lib/messaging';
 *
 * // Send a message
 * const router = getChannelRouter();
 * const result = await router.sendMessage(channelId, {
 *   conversationId: 'uuid',
 *   to: '+5511999999999',
 *   content: { type: 'text', text: 'Hello!' },
 * });
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

export * from './types';

// =============================================================================
// FACTORY
// =============================================================================

export {
  ChannelProviderFactory,
  registerProvider,
} from './channel-factory';

export type {
  ProviderRegistryEntry,
  ProviderConfigField,
  ProviderFeature,
} from './channel-factory';

// =============================================================================
// SERVICE
// =============================================================================

export {
  ChannelRouterService,
  getChannelRouter,
  resetChannelRouter,
} from './channel-router.service';

export type { ChannelRouterOptions } from './channel-router.service';

// =============================================================================
// PROVIDERS
// =============================================================================

// Import providers module to trigger automatic factory registration
import './providers';

// Export base provider
export { BaseChannelProvider } from './providers/base.provider';

// Export WhatsApp providers
export { ZApiWhatsAppProvider, MetaCloudWhatsAppProvider } from './providers/whatsapp';
export type {
  ZApiCredentials,
  ZApiWebhookPayload,
  MetaCloudCredentials,
  MetaCloudWebhookPayload,
} from './providers/whatsapp';

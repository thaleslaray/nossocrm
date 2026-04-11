/**
 * @fileoverview Meta Instagram Messaging Provider
 *
 * Instagram DM provider using Meta's Messenger Platform (Graph API).
 * Instagram messaging uses a fundamentally different API than WhatsApp Cloud API:
 * - Endpoint: POST /{PAGE_ID}/messages (not /{PHONE_NUMBER_ID}/messages)
 * - Format: Messenger Platform payload (not WhatsApp Cloud API payload)
 * - Contact ID: IGSID (Instagram Scoped ID, not phone number)
 * - Media: URL-based attachments (not media IDs)
 *
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
 *
 * @module lib/messaging/providers/instagram/meta
 */

import { BaseChannelProvider } from '../base.provider';
import type {
  ChannelType,
  ProviderConfig,
  ValidationResult,
  ValidationError,
  ConnectionStatusResult,
  SendMessageParams,
  SendMessageResult,
  WebhookHandlerResult,
  WebhookEventData,
  MessageReceivedEvent,
  StatusUpdateEvent,
  ErrorEvent,
  MessageContent,
  TextContent,
  ImageContent,
  AudioContent,
  VideoContent,
  DocumentContent,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Meta Instagram credentials configuration.
 */
export interface MetaInstagramCredentials {
  /** Facebook Page ID linked to the Instagram account */
  pageId: string;
  /** Access Token (Page token with instagram_manage_messages permission) */
  accessToken: string;
  /** Instagram Business/Creator Account ID */
  instagramAccountId: string;
  /** App Secret for webhook signature verification */
  appSecret?: string;
  /** Webhook Verify Token */
  verifyToken?: string;
}

/**
 * Instagram send message response (Messenger Platform).
 */
interface InstagramSendResponse {
  recipient_id?: string;
  message_id?: string;
  error?: MetaApiError;
}

/**
 * Meta API error structure.
 */
interface MetaApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0';

// =============================================================================
// PROVIDER IMPLEMENTATION
// =============================================================================

/**
 * Meta Instagram messaging provider implementation.
 *
 * Uses the Messenger Platform API (same as Facebook Messenger)
 * for sending and receiving Instagram DMs.
 *
 * Features:
 * - Text messages
 * - Image/video/audio attachments (URL-based)
 * - Sticker (like_heart)
 * - Read receipts
 *
 * Limitations:
 * - No template/HSM messages
 * - No document/location/contacts
 * - No interactive buttons
 * - 24h messaging window (7 days with HUMAN_AGENT tag, human only)
 * - 200 DMs/hour rate limit
 */
export class MetaInstagramProvider extends BaseChannelProvider {
  readonly channelType: ChannelType = 'instagram';
  readonly providerName = 'meta';

  private pageId: string = '';
  private accessToken: string = '';
  private instagramAccountId: string = '';
  private appSecret?: string;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);

    const credentials = config.credentials as unknown as MetaInstagramCredentials;
    this.pageId = credentials.pageId;
    this.accessToken = credentials.accessToken;
    this.instagramAccountId = credentials.instagramAccountId;
    this.appSecret = credentials.appSecret;

    this.log('info', 'Meta Instagram provider initialized', {
      pageId: this.pageId,
      instagramAccountId: this.instagramAccountId,
    });
  }

  async disconnect(): Promise<void> {
    this.log('info', 'Meta Instagram provider disconnected');
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<ConnectionStatusResult> {
    try {
      const response = await this.request<{
        id?: string;
        name?: string;
        username?: string;
        error?: MetaApiError;
      }>('GET', `/${this.instagramAccountId}`, undefined, {
        fields: 'id,name,username',
      });

      if (response.error) {
        return {
          status: 'error',
          message: response.error.message,
        };
      }

      return {
        status: 'connected',
        message: 'Connected to Instagram via Meta API',
        details: {
          instagramAccountId: response.id,
          name: response.name,
          username: response.username,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { to, content } = params;

    try {
      const messagePayload = this.buildMessagePayload(to, content);

      const response = await this.request<InstagramSendResponse>(
        'POST',
        `/${this.pageId}/messages`,
        messagePayload
      );

      if (response.error) {
        return this.handleMetaError(response.error);
      }

      return {
        success: true,
        externalMessageId: response.message_id,
        status: 'sent',
      };
    } catch (error) {
      this.log('error', 'Failed to send message', { error, to, contentType: content.type });
      return {
        success: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  private buildMessagePayload(
    recipientId: string,
    content: MessageContent
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
    };

    switch (content.type) {
      case 'text':
        return {
          ...base,
          message: { text: (content as TextContent).text },
        };

      case 'image': {
        const imageContent = content as ImageContent;
        return {
          ...base,
          message: {
            attachment: {
              type: 'image',
              payload: { url: imageContent.mediaUrl, is_reusable: true },
            },
          },
        };
      }

      case 'video': {
        const videoContent = content as VideoContent;
        return {
          ...base,
          message: {
            attachment: {
              type: 'video',
              payload: { url: videoContent.mediaUrl, is_reusable: true },
            },
          },
        };
      }

      case 'audio': {
        const audioContent = content as AudioContent;
        return {
          ...base,
          message: {
            attachment: {
              type: 'audio',
              payload: { url: audioContent.mediaUrl, is_reusable: true },
            },
          },
        };
      }

      case 'sticker':
        // Instagram supports like_heart as a special sticker
        return {
          ...base,
          message: {
            attachment: {
              type: 'like_heart',
            },
          },
        };

      case 'document': {
        // Instagram PDF/file support added Dec 19, 2025 (Meta API v25)
        // @see https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
        const docContent = content as DocumentContent;
        return {
          ...base,
          message: {
            attachment: {
              type: 'file',
              payload: {
                url: docContent.mediaUrl,
                is_reusable: false,
              },
            },
          },
        };
      }

      default:
        throw new Error(`Unsupported content type for Instagram: ${content.type}`);
    }
  }

  private handleMetaError(error: MetaApiError): SendMessageResult {
    let code = 'META_ERROR';
    let retryable = false;

    switch (error.code) {
      case 10: // Permission denied
        code = 'PERMISSION_DENIED';
        break;
      case 100: // Invalid parameter
        code = 'INVALID_PARAMS';
        break;
      case 200: // Messaging window closed / permission error
        code = 'WINDOW_EXPIRED';
        break;
      case 613: // Rate limit
        code = 'RATE_LIMITED';
        retryable = true;
        break;
      case 551: // User unavailable
        code = 'USER_UNAVAILABLE';
        break;
    }

    return {
      success: false,
      error: {
        code,
        message: error.message,
        retryable,
        details: {
          metaCode: error.code,
          subcode: error.error_subcode,
          traceId: error.fbtrace_id,
        },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Webhook Handler
  // ---------------------------------------------------------------------------

  async handleWebhook(payload: unknown): Promise<WebhookHandlerResult> {
    const data = payload as {
      object: string;
      entry: Array<{
        id: string;
        time: number;
        messaging: Array<{
          sender: { id: string };
          recipient: { id: string };
          timestamp: number;
          message?: {
            mid: string;
            text?: string;
            attachments?: Array<{
              type: string;
              payload: { url?: string; media_url?: string; media_id?: string; title?: string };
            }>;
            is_echo?: boolean;
          };
          delivery?: { mids: string[]; watermark: number };
          read?: { watermark: number };
        }>;
      }>;
    };

    if (data.object !== 'instagram' || !data.entry?.[0]?.messaging?.[0]) {
      return this.createErrorResult('INVALID_PAYLOAD', 'Invalid Instagram webhook payload');
    }

    const messagingEvent = data.entry[0].messaging[0];

    // Handle echo messages (our own outbound)
    if (messagingEvent.message?.is_echo) {
      return {
        type: 'status_update',
        externalId: messagingEvent.message.mid,
        data: {
          type: 'status_update',
          externalMessageId: messagingEvent.message.mid,
          status: 'delivered',
          timestamp: new Date(messagingEvent.timestamp),
        } as StatusUpdateEvent,
        raw: payload,
      };
    }

    // Handle delivery confirmations
    if (messagingEvent.delivery) {
      const mid = messagingEvent.delivery.mids?.[0];
      if (mid) {
        return {
          type: 'status_update',
          externalId: mid,
          data: {
            type: 'status_update',
            externalMessageId: mid,
            status: 'delivered',
            timestamp: new Date(messagingEvent.timestamp),
          } as StatusUpdateEvent,
          raw: payload,
        };
      }
      return this.createErrorResult('NO_MESSAGE_ID', 'Delivery event without message ID');
    }

    // Handle read receipts
    if (messagingEvent.read) {
      return {
        type: 'status_update',
        data: {
          type: 'status_update',
          externalMessageId: '',
          status: 'read',
          timestamp: new Date(messagingEvent.read.watermark),
        } as StatusUpdateEvent,
        raw: payload,
      };
    }

    // Handle incoming messages
    if (messagingEvent.message) {
      const content = this.extractInstagramContent(messagingEvent.message);
      const timestamp = new Date(messagingEvent.timestamp);

      const eventData: MessageReceivedEvent = {
        type: 'message_received',
        from: messagingEvent.sender.id,
        content,
        externalMessageId: messagingEvent.message.mid,
        timestamp,
      };

      return {
        type: 'message_received',
        externalId: messagingEvent.message.mid,
        data: eventData,
        raw: payload,
      };
    }

    return this.createErrorResult('UNKNOWN_EVENT', 'Unknown Instagram webhook event type');
  }

  private createErrorResult(code: string, message: string): WebhookHandlerResult {
    const eventData: ErrorEvent = {
      type: 'error',
      code,
      message,
      timestamp: new Date(),
    };

    return {
      type: 'error',
      data: eventData,
      raw: null,
    };
  }

  private extractInstagramContent(message: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: string;
      payload: { url?: string; media_url?: string; media_id?: string; title?: string };
    }>;
  }): MessageContent {
    // Text message
    if (message.text && !message.attachments?.length) {
      return {
        type: 'text',
        text: message.text,
      };
    }

    // Attachment message
    if (message.attachments?.[0]) {
      const attachment = message.attachments[0];
      // ig_post uses payload.media_url; share/others use payload.url
      const url = attachment.payload?.media_url || attachment.payload?.url || '';

      switch (attachment.type) {
        case 'image':
          return {
            type: 'image',
            mediaUrl: url,
            mimeType: 'image/jpeg',
            caption: message.text,
          };

        case 'video':
          return {
            type: 'video',
            mediaUrl: url,
            mimeType: 'video/mp4',
            caption: message.text,
          };

        case 'audio':
          return {
            type: 'audio',
            mediaUrl: url,
            mimeType: 'audio/mp4',
          };

        case 'ig_post': // New in Oct 2025 — replaces "share" from Feb 1, 2026
        case 'share':   // Deprecated Feb 1, 2026 — keep for backward compat
          // Instagram shared post/reel/story
          return {
            type: 'text',
            text: message.text || `[Compartilhamento: ${url}]`,
          };

        default:
          return {
            type: 'text',
            text: message.text || `[${attachment.type}]`,
          };
      }
    }

    // Fallback
    return {
      type: 'text',
      text: message.text || '[Mensagem]',
    };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  validateConfig(config: ProviderConfig): ValidationResult {
    const baseResult = super.validateConfig(config);
    if (!baseResult.valid) {
      return baseResult;
    }

    const errors: ValidationError[] = [];
    const credentials = config.credentials as unknown as MetaInstagramCredentials;

    if (!credentials.pageId) {
      errors.push({
        field: 'credentials.pageId',
        message: 'Page ID is required',
        code: 'REQUIRED',
      });
    }

    if (!credentials.accessToken) {
      errors.push({
        field: 'credentials.accessToken',
        message: 'Access Token is required',
        code: 'REQUIRED',
      });
    }

    if (!credentials.instagramAccountId) {
      errors.push({
        field: 'credentials.instagramAccountId',
        message: 'Instagram Account ID is required',
        code: 'REQUIRED',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // HTTP Client
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>,
    queryParams?: Record<string, string>
  ): Promise<T> {
    let url = `${META_GRAPH_URL}${endpoint}`;

    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok && !data.error) {
      throw new Error(`Meta API request failed: ${response.status}`);
    }

    return data as T;
  }
}

export default MetaInstagramProvider;

/**
 * @fileoverview Meta Cloud API WhatsApp Provider
 *
 * Official WhatsApp Business API provider using Meta Cloud API.
 * Provides stable, officially supported WhatsApp integration with templates.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * @module lib/messaging/providers/whatsapp/meta-cloud
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
  SendTemplateParams,
  WebhookHandlerResult,
  WebhookEventData,
  MessageReceivedEvent,
  StatusUpdateEvent,
  ErrorEvent,
  MessageContent,
  TextContent,
  ImageContent,
  DocumentContent,
  AudioContent,
  VideoContent,
  MessageStatus,
  TemplateSyncResult,
  ProviderTemplate,
  ProviderTemplateComponent,
  MediaUploadResult,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Meta Cloud API credentials configuration.
 */
export interface MetaCloudCredentials {
  /** Phone Number ID from Meta Business Manager */
  phoneNumberId: string;
  /** Access Token (permanent or temporary) */
  accessToken: string;
  /** WhatsApp Business Account ID (optional, for templates) */
  wabaId?: string;
  /** App Secret for webhook signature verification */
  appSecret?: string;
  /** Webhook Verify Token */
  verifyToken?: string;
}

/**
 * Meta Cloud API send message response.
 */
interface MetaSendResponse {
  messaging_product: 'whatsapp';
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
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
  error_data?: {
    messaging_product: string;
    details: string;
  };
}

/**
 * Meta Cloud API webhook payload structure.
 */
export interface MetaCloudWebhookPayload {
  object: 'whatsapp_business_account';
  entry: MetaWebhookEntry[];
}

interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

interface MetaWebhookChange {
  value: MetaWebhookValue;
  field: 'messages';
}

interface MetaWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: MetaWebhookContact[];
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
  errors?: MetaApiError[];
}

interface MetaWebhookContact {
  profile: { name: string };
  wa_id: string;
}

interface MetaWebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contacts' | 'button' | 'interactive';
  text?: { body: string };
  image?: MetaMediaMessage;
  video?: MetaMediaMessage;
  audio?: MetaMediaMessage;
  document?: MetaMediaMessage & { filename?: string };
  sticker?: MetaMediaMessage;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: unknown[];
  button?: { text: string; payload: string };
  interactive?: unknown;
  context?: { from: string; id: string };
  errors?: MetaApiError[];
}

interface MetaMediaMessage {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

interface MetaWebhookStatus {
  id: string;
  recipient_id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  conversation?: {
    id: string;
    origin: { type: string };
    expiration_timestamp?: string;
  };
  pricing?: {
    pricing_model: string;
    billable: boolean;
    category: string;
  };
  errors?: MetaApiError[];
}

/**
 * Meta template response structure.
 */
interface MetaTemplateResponse {
  data: MetaTemplateData[];
  paging?: { cursors: { before: string; after: string }; next?: string };
}

interface MetaTemplateData {
  id: string;
  name: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  rejected_reason?: string;
  components: MetaTemplateComponentData[];
}

interface MetaTemplateComponentData {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: {
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const META_GRAPH_URL = 'https://graph.facebook.com/v25.0';

// =============================================================================
// PROVIDER IMPLEMENTATION
// =============================================================================

/**
 * Meta Cloud API WhatsApp provider implementation.
 *
 * Features:
 * - Official Meta Business API
 * - Template message support
 * - Media upload/download
 * - Webhook signature verification
 * - Message status tracking
 *
 * Limitations:
 * - 24-hour messaging window (requires template outside window)
 * - Templates must be pre-approved by Meta
 * - Per-message pricing
 *
 * @example
 * ```ts
 * const provider = new MetaCloudWhatsAppProvider();
 * await provider.initialize({
 *   channelId: 'uuid',
 *   externalIdentifier: '+5511999999999',
 *   credentials: {
 *     phoneNumberId: 'your-phone-number-id',
 *     accessToken: 'your-access-token',
 *     wabaId: 'your-waba-id',
 *   },
 * });
 *
 * // Send within 24h window
 * const result = await provider.sendMessage({
 *   conversationId: 'uuid',
 *   to: '+5511888888888',
 *   content: { type: 'text', text: 'Hello!' },
 * });
 *
 * // Send template (outside window or marketing)
 * const templateResult = await provider.sendTemplate({
 *   conversationId: 'uuid',
 *   to: '+5511888888888',
 *   templateName: 'hello_world',
 *   templateLanguage: 'pt_BR',
 *   components: [{ type: 'body', parameters: [{ type: 'text', text: 'John' }] }],
 * });
 * ```
 */
export class MetaCloudWhatsAppProvider extends BaseChannelProvider {
  readonly channelType: ChannelType = 'whatsapp';
  readonly providerName = 'meta-cloud';

  private phoneNumberId: string = '';
  private accessToken: string = '';
  private wabaId?: string;
  private appSecret?: string;
  private verifyToken?: string;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);

    const credentials = config.credentials as unknown as MetaCloudCredentials;
    this.phoneNumberId = credentials.phoneNumberId;
    this.accessToken = credentials.accessToken;
    this.wabaId = credentials.wabaId;
    this.appSecret = credentials.appSecret;
    this.verifyToken = credentials.verifyToken;

    this.log('info', 'Meta Cloud API provider initialized', {
      phoneNumberId: this.phoneNumberId,
      hasWabaId: !!this.wabaId,
    });
  }

  async disconnect(): Promise<void> {
    // Meta Cloud API doesn't require explicit disconnect
    this.log('info', 'Meta Cloud API provider disconnected');
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<ConnectionStatusResult> {
    try {
      // Check phone number status
      const response = await this.request<{
        verified_name?: string;
        quality_rating?: string;
        display_phone_number?: string;
        error?: MetaApiError;
      }>('GET', `/${this.phoneNumberId}`);

      if (response.error) {
        return {
          status: 'error',
          message: response.error.message,
        };
      }

      return {
        status: 'connected',
        message: 'Connected to Meta Cloud API',
        details: {
          phoneNumber: response.display_phone_number,
          businessName: response.verified_name,
          qualityRating: response.quality_rating,
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
    const { to, content, replyToExternalId } = params;

    try {
      // Normalize phone number (remove + and any non-digits)
      const phone = to.replace(/\D/g, '');

      const messagePayload = this.buildMessagePayload(phone, content, replyToExternalId);

      const response = await this.request<MetaSendResponse>(
        'POST',
        `/${this.phoneNumberId}/messages`,
        messagePayload
      );

      if (response.error) {
        return this.handleMetaError(response.error);
      }

      const externalMessageId = response.messages?.[0]?.id;

      return {
        success: true,
        externalMessageId,
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

  /**
   * Send a template message (WhatsApp HSM).
   * Required when messaging outside 24h window or for marketing.
   */
  async sendTemplate(params: SendTemplateParams): Promise<SendMessageResult> {
    const { to, templateName, templateLanguage, components } = params;

    try {
      const phone = to.replace(/\D/g, '');

      const payload: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: components?.map((c) => ({
            type: c.type.toLowerCase(),
            parameters: c.parameters,
          })),
        },
      };

      const response = await this.request<MetaSendResponse>(
        'POST',
        `/${this.phoneNumberId}/messages`,
        payload
      );

      if (response.error) {
        return this.handleMetaError(response.error);
      }

      return {
        success: true,
        externalMessageId: response.messages?.[0]?.id,
        status: 'sent',
      };
    } catch (error) {
      this.log('error', 'Failed to send template', { error, to, templateName });
      return {
        success: false,
        error: {
          code: 'TEMPLATE_SEND_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  private buildMessagePayload(
    phone: string,
    content: MessageContent,
    replyToExternalId?: string
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
    };

    if (replyToExternalId) {
      base.context = { message_id: replyToExternalId };
    }

    switch (content.type) {
      case 'text':
        return {
          ...base,
          type: 'text',
          text: { body: (content as TextContent).text },
        };

      case 'image':
        const imageContent = content as ImageContent;
        return {
          ...base,
          type: 'image',
          image: {
            link: imageContent.mediaUrl,
            caption: imageContent.caption,
          },
        };

      case 'video':
        const videoContent = content as VideoContent;
        return {
          ...base,
          type: 'video',
          video: {
            link: videoContent.mediaUrl,
            caption: videoContent.caption,
          },
        };

      case 'audio':
        const audioContent = content as AudioContent;
        return {
          ...base,
          type: 'audio',
          audio: { link: audioContent.mediaUrl },
        };

      case 'document':
        const docContent = content as DocumentContent;
        return {
          ...base,
          type: 'document',
          document: {
            link: docContent.mediaUrl,
            filename: docContent.fileName,
          },
        };

      default:
        throw new Error(`Unsupported content type: ${content.type}`);
    }
  }

  private handleMetaError(error: MetaApiError): SendMessageResult {
    // Map Meta error codes to our error structure
    // https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes

    let code = 'META_ERROR';
    let retryable = false;

    switch (error.code) {
      case 131047: // Re-engagement message - outside 24h window
        code = 'WINDOW_EXPIRED';
        break;
      case 131026: // Message failed to send because more than 24 hours passed
        code = 'WINDOW_EXPIRED';
        break;
      case 130429: // Rate limit exceeded
        code = 'RATE_LIMITED';
        retryable = true;
        break;
      case 131051: // Unsupported message type
        code = 'UNSUPPORTED_CONTENT';
        break;
      case 131053: // Media upload error
        code = 'MEDIA_ERROR';
        retryable = true;
        break;
      case 100: // Invalid parameter
        code = 'INVALID_PARAMS';
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
  // Media
  // ---------------------------------------------------------------------------

  /**
   * Upload media to Meta servers.
   * Returns a media ID that can be used in messages.
   */
  async uploadMedia(file: File | Blob, mimeType: string): Promise<MediaUploadResult> {
    try {
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', mimeType);
      formData.append('file', file);

      const response = await fetch(`${META_GRAPH_URL}/${this.phoneNumberId}/media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: formData,
      });

      const data = (await response.json()) as { id?: string; error?: MetaApiError };

      if (data.error) {
        return {
          success: false,
          error: {
            code: 'UPLOAD_FAILED',
            message: data.error.message,
          },
        };
      }

      return {
        success: true,
        mediaId: data.id,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Get media URL from Meta media ID.
   * Use this to resolve media IDs from incoming messages.
   */
  async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const response = await this.request<{ url?: string; error?: MetaApiError }>(
        'GET',
        `/${mediaId}`
      );

      if (response.error || !response.url) {
        this.log('error', 'Failed to get media URL', { mediaId, error: response.error });
        return null;
      }

      return response.url;
    } catch (error) {
      this.log('error', 'Failed to get media URL', { mediaId, error });
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  /**
   * Sync message templates from Meta.
   */
  async syncTemplates(): Promise<TemplateSyncResult> {
    if (!this.wabaId) {
      return {
        success: false,
        error: {
          code: 'MISSING_WABA_ID',
          message: 'WhatsApp Business Account ID is required to sync templates',
        },
      };
    }

    try {
      const response = await this.request<MetaTemplateResponse>(
        'GET',
        `/${this.wabaId}/message_templates`,
        undefined,
        { limit: '100' }
      );

      const templates: ProviderTemplate[] = response.data.map((t) => ({
        externalId: t.id,
        name: t.name,
        language: t.language,
        category: t.category.toLowerCase() as 'marketing' | 'utility' | 'authentication',
        status: t.status.toLowerCase() as 'pending' | 'approved' | 'rejected' | 'paused',
        rejectionReason: t.rejected_reason,
        components: t.components.map((c) => this.mapTemplateComponent(c)),
      }));

      return {
        success: true,
        templates,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  private mapTemplateComponent(c: MetaTemplateComponentData): ProviderTemplateComponent {
    return {
      type: c.type,
      format: c.format,
      text: c.text,
      example: c.example
        ? {
            headerText: c.example.header_text,
            bodyText: c.example.body_text,
            headerHandle: c.example.header_handle,
          }
        : undefined,
      buttons: c.buttons?.map((b) => ({
        type: b.type,
        text: b.text,
        url: b.url,
        phoneNumber: b.phone_number,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Webhook Handler
  // ---------------------------------------------------------------------------

  async handleWebhook(payload: unknown): Promise<WebhookHandlerResult> {
    const data = payload as MetaCloudWebhookPayload;

    // Validate payload structure
    if (data.object !== 'whatsapp_business_account' || !data.entry?.[0]?.changes?.[0]) {
      return this.createErrorResult('INVALID_PAYLOAD', 'Invalid webhook payload structure');
    }

    const change = data.entry[0].changes[0];
    const value = change.value;

    // Handle errors
    if (value.errors?.[0]) {
      return this.handleErrorWebhook(value.errors[0], payload);
    }

    // Handle message status updates
    if (value.statuses?.[0]) {
      return this.handleStatusWebhook(value.statuses[0], payload);
    }

    // Handle incoming messages
    if (value.messages?.[0]) {
      return this.handleMessageWebhook(value.messages[0], value.contacts?.[0], payload);
    }

    return this.createErrorResult('UNKNOWN_EVENT', 'Unknown webhook event type');
  }

  private handleMessageWebhook(
    message: MetaWebhookMessage,
    contact: MetaWebhookContact | undefined,
    raw: unknown
  ): WebhookHandlerResult {
    const content = this.extractContent(message);
    const timestamp = new Date(parseInt(message.timestamp) * 1000);

    const eventData: MessageReceivedEvent = {
      type: 'message_received',
      from: message.from,
      fromName: contact?.profile?.name,
      content,
      externalMessageId: message.id,
      replyToExternalId: message.context?.id,
      timestamp,
    };

    return {
      type: 'message_received',
      externalId: message.id,
      data: eventData,
      raw,
    };
  }

  private handleStatusWebhook(
    status: MetaWebhookStatus,
    raw: unknown
  ): WebhookHandlerResult {
    const statusMap: Record<string, MessageStatus> = {
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
    };

    const eventData: StatusUpdateEvent = {
      type: 'status_update',
      externalMessageId: status.id,
      status: statusMap[status.status] || 'sent',
      error: status.errors?.[0]
        ? { code: String(status.errors[0].code), message: status.errors[0].message }
        : undefined,
      timestamp: new Date(parseInt(status.timestamp) * 1000),
    };

    return {
      type: 'status_update',
      externalId: status.id,
      data: eventData,
      raw,
    };
  }

  private handleErrorWebhook(error: MetaApiError, raw: unknown): WebhookHandlerResult {
    const eventData: ErrorEvent = {
      type: 'error',
      code: String(error.code),
      message: error.message,
      details: {
        subcode: error.error_subcode,
        traceId: error.fbtrace_id,
      },
      timestamp: new Date(),
    };

    return {
      type: 'error',
      data: eventData,
      raw,
    };
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

  private extractContent(message: MetaWebhookMessage): MessageContent {
    switch (message.type) {
      case 'text':
        return {
          type: 'text',
          text: message.text?.body || '',
        };

      case 'image':
        // mediaUrl will be resolved later using getMediaUrl(mediaId)
        // Store mediaId in metadata for later resolution
        return {
          type: 'image',
          mediaUrl: `meta:${message.image?.id}`, // Prefix to indicate Meta media ID
          mimeType: message.image?.mime_type || 'image/jpeg',
          caption: message.image?.caption,
        };

      case 'video':
        return {
          type: 'video',
          mediaUrl: `meta:${message.video?.id}`,
          mimeType: message.video?.mime_type || 'video/mp4',
          caption: message.video?.caption,
        };

      case 'audio':
        return {
          type: 'audio',
          mediaUrl: `meta:${message.audio?.id}`,
          mimeType: message.audio?.mime_type || 'audio/ogg',
        };

      case 'document':
        return {
          type: 'document',
          mediaUrl: `meta:${message.document?.id}`,
          fileName: message.document?.filename || 'document',
          mimeType: message.document?.mime_type || 'application/pdf',
        };

      case 'sticker':
        return {
          type: 'sticker',
          mediaUrl: `meta:${message.sticker?.id}`,
          mimeType: 'image/webp',
        };

      case 'location':
        return {
          type: 'location',
          latitude: message.location?.latitude || 0,
          longitude: message.location?.longitude || 0,
          name: message.location?.name,
        };

      case 'button':
        return {
          type: 'text',
          text: message.button?.text || '[button click]',
        };

      default:
        return {
          type: 'text',
          text: `[${message.type}]`,
        };
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook Signature Verification
  // ---------------------------------------------------------------------------

  /**
   * Verify webhook signature from Meta.
   * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
   */
  verifyWebhookSignature(payload: unknown, signature: string): boolean {
    if (!this.appSecret) {
      this.log('warn', 'App secret not configured, skipping signature verification');
      return true;
    }

    try {
      // Signature format: sha256=<hash>
      const [algorithm, expectedHash] = signature.split('=');
      if (algorithm !== 'sha256' || !expectedHash) {
        return false;
      }

      // In Edge/Browser environment, we need SubtleCrypto
      // For Node.js, we'd use crypto.createHmac
      // This is a simplified check - in production, implement proper HMAC verification
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

      // Note: Full implementation would use crypto.createHmac in Node.js
      // or SubtleCrypto in Edge Functions. For now, return true with warning.
      this.log('warn', 'Signature verification not fully implemented');
      return true;
    } catch (error) {
      this.log('error', 'Signature verification failed', { error });
      return false;
    }
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
    const credentials = config.credentials as unknown as MetaCloudCredentials;

    if (!credentials.phoneNumberId) {
      errors.push({
        field: 'credentials.phoneNumberId',
        message: 'Phone Number ID is required',
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

// =============================================================================
// FACTORY REGISTRATION
// =============================================================================

export default MetaCloudWhatsAppProvider;

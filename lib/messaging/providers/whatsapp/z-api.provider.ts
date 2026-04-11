/**
 * @fileoverview Z-API WhatsApp Provider
 *
 * Unofficial WhatsApp API provider using Z-API.
 * Provides quick setup via QR code scanning, no Meta verification required.
 *
 * @see https://developer.z-api.io/
 *
 * @module lib/messaging/providers/whatsapp/z-api
 */

import { BaseChannelProvider } from '../base.provider';
import type {
  ChannelType,
  ProviderConfig,
  ValidationResult,
  ValidationError,
  ConnectionStatusResult,
  QrCodeResult,
  SendMessageParams,
  SendMessageResult,
  WebhookHandlerResult,
  MessageReceivedEvent,
  StatusUpdateEvent,
  ErrorEvent,
  MessageContent,
  TextContent,
  ImageContent,
  DocumentContent,
  AudioContent,
  VideoContent,
  StickerContent,
  LocationContent,
  ReactionContent,
  MessageStatus,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Z-API credentials configuration.
 */
export interface ZApiCredentials {
  instanceId: string;
  token: string;
  clientToken?: string;
}

/**
 * Z-API connection status response.
 */
interface ZApiStatusResponse {
  connected: boolean;
  smartphoneConnected?: boolean;
  session?: string;
  webhookUrl?: string;
  webhookReceived?: string;
  webhookReceivedAck?: string;
  webhookStatus?: string;
  webhookPresence?: string;
  error?: string;
}

/**
 * Z-API QR code response.
 */
interface ZApiQrCodeResponse {
  value?: string;
  connected?: boolean;
  error?: string;
}

/**
 * Z-API send message response.
 */
interface ZApiSendResponse {
  zapiMessageId?: string;
  messageId?: string;
  id?: string;
  error?: string;
}

/**
 * Z-API webhook payload for received messages.
 */
export interface ZApiWebhookPayload {
  // Message identification
  messageId?: string;
  zapiMessageId?: string;

  // Contact info
  phone?: string;
  chatId?: string;
  instanceId?: string;

  // Message details
  fromMe?: boolean;
  mompilesent?: number;
  moment?: number;
  type?: string;

  // Content by type
  text?: { message: string };
  image?: { imageUrl: string; caption?: string; mimeType?: string };
  video?: { videoUrl: string; caption?: string; mimeType?: string };
  audio?: { audioUrl: string; mimeType?: string };
  document?: { documentUrl: string; fileName?: string; mimeType?: string };
  sticker?: { stickerUrl: string };
  location?: { latitude: number; longitude: number; name?: string };

  // Contact info in message
  senderName?: string;
  senderPhoto?: string;

  // Status updates
  status?: 'SENT' | 'DELIVERED' | 'READ' | 'PLAYED';
  ids?: string[];

  // Error info
  error?: string;
  errorMessage?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const Z_API_BASE_URL = 'https://api.z-api.io/instances';

// =============================================================================
// PROVIDER IMPLEMENTATION
// =============================================================================

/**
 * Z-API WhatsApp provider implementation.
 *
 * Features:
 * - QR code authentication
 * - Text, image, video, audio, document messages
 * - Message status tracking (sent/delivered/read)
 * - Webhook support for incoming messages
 *
 * @example
 * ```ts
 * const provider = new ZApiWhatsAppProvider();
 * await provider.initialize({
 *   channelId: 'uuid',
 *   externalIdentifier: '+5511999999999',
 *   credentials: {
 *     instanceId: 'your-instance-id',
 *     token: 'your-token',
 *     clientToken: 'your-client-token',
 *   },
 * });
 *
 * const result = await provider.sendMessage({
 *   conversationId: 'uuid',
 *   to: '+5511888888888',
 *   content: { type: 'text', text: 'Hello!' },
 * });
 * ```
 */
export class ZApiWhatsAppProvider extends BaseChannelProvider {
  readonly channelType: ChannelType = 'whatsapp';
  readonly providerName = 'z-api';

  private instanceId: string = '';
  private token: string = '';
  private clientToken?: string;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);

    const credentials = config.credentials as unknown as ZApiCredentials;
    this.instanceId = credentials.instanceId;
    this.token = credentials.token;
    this.clientToken = credentials.clientToken;

    this.log('info', 'Z-API provider initialized', {
      instanceId: this.instanceId,
      hasClientToken: !!this.clientToken,
    });
  }

  async disconnect(): Promise<void> {
    // Z-API doesn't require explicit disconnect
    // Session persists on their servers
    this.log('info', 'Z-API provider disconnected');
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<ConnectionStatusResult> {
    try {
      const response = await this.request<ZApiStatusResponse>('GET', '/status');

      if (response.error) {
        return {
          status: 'error',
          message: response.error,
        };
      }

      if (response.connected && response.smartphoneConnected) {
        return {
          status: 'connected',
          message: 'Connected to WhatsApp',
          details: {
            session: response.session,
            webhookConfigured: !!response.webhookReceived,
          },
        };
      }

      if (response.connected && !response.smartphoneConnected) {
        return {
          status: 'connecting',
          message: 'Connected to Z-API, waiting for smartphone',
        };
      }

      return {
        status: 'disconnected',
        message: 'Not connected. Scan QR code to connect.',
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get QR code for WhatsApp Web connection.
   * Returns base64 encoded QR code image.
   * @throws Error if QR code cannot be retrieved
   */
  async getQrCode(): Promise<QrCodeResult> {
    const response = await this.request<ZApiQrCodeResponse>('GET', '/qr-code/image');

    if (response.error) {
      throw new Error(`QR code error: ${response.error}`);
    }

    if (response.connected) {
      throw new Error('Instance is already connected');
    }

    if (!response.value) {
      throw new Error('QR code not available');
    }

    return {
      qrCode: response.value,
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString(), // QR codes expire in ~60s
    };
  }

  /**
   * Configure webhook URL for receiving messages.
   */
  async configureWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('PUT', '/update-webhook-received', {
        webhookReceived: webhookUrl,
      });

      // Also configure status webhook
      await this.request('PUT', '/update-webhook-status', {
        webhookStatus: webhookUrl,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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

      let response: ZApiSendResponse;

      switch (content.type) {
        case 'text':
          response = await this.sendTextMessage(phone, content as TextContent, replyToExternalId);
          break;

        case 'image':
          response = await this.sendImageMessage(phone, content as ImageContent, replyToExternalId);
          break;

        case 'video':
          response = await this.sendVideoMessage(phone, content as VideoContent, replyToExternalId);
          break;

        case 'audio':
          response = await this.sendAudioMessage(phone, content as AudioContent, replyToExternalId);
          break;

        case 'document':
          response = await this.sendDocumentMessage(phone, content as DocumentContent, replyToExternalId);
          break;

        case 'sticker':
          response = await this.sendStickerMessage(phone, content as StickerContent, replyToExternalId);
          break;

        case 'location':
          response = await this.sendLocationMessage(phone, content as LocationContent, replyToExternalId);
          break;

        case 'reaction':
          response = await this.sendReactionMessage(phone, content as ReactionContent);
          break;

        default:
          return {
            success: false,
            error: {
              code: 'UNSUPPORTED_CONTENT',
              message: `Content type "${content.type}" is not supported by Z-API`,
            },
          };
      }

      if (response.error) {
        return {
          success: false,
          error: {
            code: 'SEND_FAILED',
            message: response.error,
          },
        };
      }

      const externalMessageId = response.zapiMessageId || response.messageId || response.id;

      return {
        success: true,
        externalMessageId,
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

  private async sendTextMessage(
    phone: string,
    content: TextContent,
    replyToMessageId?: string
  ): Promise<ZApiSendResponse> {
    const body: Record<string, unknown> = {
      phone,
      message: content.text,
    };

    if (replyToMessageId) {
      body.messageId = replyToMessageId;
    }

    return this.request<ZApiSendResponse>('POST', '/send-text', body);
  }

  private async sendImageMessage(
    phone: string,
    content: ImageContent,
    replyToMessageId?: string
  ): Promise<ZApiSendResponse> {
    const body: Record<string, unknown> = {
      phone,
      image: content.mediaUrl,
    };

    if (content.caption) {
      body.caption = content.caption;
    }

    if (replyToMessageId) {
      body.messageId = replyToMessageId;
    }

    return this.request<ZApiSendResponse>('POST', '/send-image', body);
  }

  private async sendVideoMessage(
    phone: string,
    content: VideoContent,
    replyToMessageId?: string
  ): Promise<ZApiSendResponse> {
    const body: Record<string, unknown> = {
      phone,
      video: content.mediaUrl,
    };

    if (content.caption) {
      body.caption = content.caption;
    }

    if (replyToMessageId) {
      body.messageId = replyToMessageId;
    }

    return this.request<ZApiSendResponse>('POST', '/send-video', body);
  }

  private async sendAudioMessage(
    phone: string,
    content: AudioContent,
    replyToMessageId?: string
  ): Promise<ZApiSendResponse> {
    const body: Record<string, unknown> = {
      phone,
      audio: content.mediaUrl,
    };

    if (replyToMessageId) {
      body.messageId = replyToMessageId;
    }

    return this.request<ZApiSendResponse>('POST', '/send-audio', body);
  }

  private async sendDocumentMessage(
    phone: string,
    content: DocumentContent,
    replyToMessageId?: string
  ): Promise<ZApiSendResponse> {
    const body: Record<string, unknown> = {
      phone,
      document: content.mediaUrl,
    };

    if (content.fileName) {
      body.fileName = content.fileName;
    }

    if (content.caption) {
      body.caption = content.caption;
    }

    if (replyToMessageId) {
      body.messageId = replyToMessageId;
    }

    // Z-API requires the file extension in the URL path
    const ext = this.getExtensionFromMimeType(content.mimeType, content.fileName);
    return this.request<ZApiSendResponse>('POST', `/send-document/${ext}`, body);
  }

  private async sendStickerMessage(
    phone: string,
    content: StickerContent,
    replyToMessageId?: string
  ): Promise<ZApiSendResponse> {
    const body: Record<string, unknown> = {
      phone,
      sticker: content.mediaUrl,
    };

    if (replyToMessageId) {
      body.messageId = replyToMessageId;
    }

    return this.request<ZApiSendResponse>('POST', '/send-sticker', body);
  }

  private async sendLocationMessage(
    phone: string,
    content: LocationContent,
    replyToMessageId?: string
  ): Promise<ZApiSendResponse> {
    const body: Record<string, unknown> = {
      phone,
      latitude: String(content.latitude),
      longitude: String(content.longitude),
      title: content.name || 'Localização',
      address: content.address || '',
    };

    if (replyToMessageId) {
      body.messageId = replyToMessageId;
    }

    return this.request<ZApiSendResponse>('POST', '/send-location', body);
  }

  private async sendReactionMessage(
    phone: string,
    content: ReactionContent
  ): Promise<ZApiSendResponse> {
    return this.request<ZApiSendResponse>('POST', '/send-reaction', {
      phone,
      reaction: content.emoji,
      messageId: content.messageId,
    });
  }

  /**
   * Derive the file extension Z-API needs in the URL from mimeType or fileName.
   * Falls back to 'pdf' if undetermined.
   */
  private getExtensionFromMimeType(mimeType: string, fileName?: string): string {
    // Try to get from fileName first (most reliable)
    if (fileName) {
      const parts = fileName.split('.');
      if (parts.length > 1) {
        return parts[parts.length - 1].toLowerCase();
      }
    }

    // Fall back to mimeType mapping
    const mimeToExt: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'text/csv': 'csv',
    };

    return mimeToExt[mimeType] ?? 'pdf';
  }

  // ---------------------------------------------------------------------------
  // Webhook Handler
  // ---------------------------------------------------------------------------

  async handleWebhook(payload: unknown): Promise<WebhookHandlerResult> {
    const data = payload as ZApiWebhookPayload;

    // Error event
    if (data.error || data.errorMessage) {
      const errorData: ErrorEvent = {
        type: 'error',
        code: data.error || 'UNKNOWN',
        message: data.errorMessage || 'Unknown error',
        timestamp: new Date(),
      };
      return {
        type: 'error',
        externalId: data.messageId || data.zapiMessageId,
        data: errorData,
        raw: payload,
      };
    }

    // Status update event (has status field and ids array)
    if (data.status && data.ids) {
      return this.handleStatusUpdate(data, payload);
    }

    // Message received (has phone and not from us)
    if (data.phone && !data.fromMe) {
      return this.handleMessageReceived(data, payload);
    }

    // Unknown event type
    const errorData: ErrorEvent = {
      type: 'error',
      code: 'UNKNOWN_EVENT',
      message: 'Unknown webhook event type',
      timestamp: new Date(),
    };
    return {
      type: 'error',
      data: errorData,
      raw: payload,
    };
  }

  private handleMessageReceived(data: ZApiWebhookPayload, raw: unknown): WebhookHandlerResult {
    const content = this.extractContent(data);
    const timestamp = data.moment
      ? new Date(data.moment * 1000)
      : new Date();

    const eventData: MessageReceivedEvent = {
      type: 'message_received',
      from: data.phone || '',
      fromName: data.senderName,
      fromAvatar: data.senderPhoto,
      content,
      externalMessageId: data.messageId || data.zapiMessageId || '',
      timestamp,
    };

    return {
      type: 'message_received',
      externalId: eventData.externalMessageId,
      data: eventData,
      raw,
    };
  }

  private handleStatusUpdate(data: ZApiWebhookPayload, raw: unknown): WebhookHandlerResult {
    // Map Z-API status to our status
    const statusMap: Record<string, MessageStatus> = {
      SENT: 'sent',
      DELIVERED: 'delivered',
      READ: 'read',
      PLAYED: 'read', // Audio/video played = read
    };

    const eventData: StatusUpdateEvent = {
      type: 'status_update',
      externalMessageId: data.ids?.[0] || '',
      status: statusMap[data.status || ''] || 'sent',
      timestamp: new Date(),
    };

    return {
      type: 'status_update',
      externalId: eventData.externalMessageId,
      data: eventData,
      raw,
    };
  }

  private extractContent(data: ZApiWebhookPayload): MessageContent {
    if (data.text) {
      return {
        type: 'text',
        text: data.text.message,
      };
    }

    if (data.image) {
      return {
        type: 'image',
        mediaUrl: data.image.imageUrl,
        mimeType: data.image.mimeType || 'image/jpeg',
        caption: data.image.caption,
      };
    }

    if (data.video) {
      return {
        type: 'video',
        mediaUrl: data.video.videoUrl,
        mimeType: data.video.mimeType || 'video/mp4',
        caption: data.video.caption,
      };
    }

    if (data.audio) {
      return {
        type: 'audio',
        mediaUrl: data.audio.audioUrl,
        mimeType: data.audio.mimeType || 'audio/ogg',
      };
    }

    if (data.document) {
      return {
        type: 'document',
        mediaUrl: data.document.documentUrl,
        fileName: data.document.fileName || 'document',
        mimeType: data.document.mimeType || 'application/pdf',
      };
    }

    if (data.sticker) {
      return {
        type: 'sticker',
        mediaUrl: data.sticker.stickerUrl,
        mimeType: 'image/webp',
      };
    }

    if (data.location) {
      return {
        type: 'location',
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        name: data.location.name,
      };
    }

    // Default to text with type info
    return {
      type: 'text',
      text: `[${data.type || 'unknown'}]`,
    };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  validateConfig(config: ProviderConfig): ValidationResult {
    // Run base validation first
    const baseResult = super.validateConfig(config);
    if (!baseResult.valid) {
      return baseResult;
    }

    const errors: ValidationError[] = [];
    const credentials = config.credentials as unknown as ZApiCredentials;

    if (!credentials.instanceId) {
      errors.push({
        field: 'credentials.instanceId',
        message: 'Z-API Instance ID is required',
        code: 'REQUIRED',
      });
    }

    if (!credentials.token) {
      errors.push({
        field: 'credentials.token',
        message: 'Z-API Token is required',
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
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${Z_API_BASE_URL}/${this.instanceId}/token/${this.token}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.clientToken) {
      headers['Client-Token'] = this.clientToken;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const requestBody = body ? JSON.stringify(body) : undefined;
    this.log('info', `${method} ${endpoint}`, body ? { ...body, document: (body as Record<string,unknown>).document, image: (body as Record<string,unknown>).image, audio: (body as Record<string,unknown>).audio } : undefined);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await response.text();
    this.log('info', `response ${response.status}`, responseText.slice(0, 500));

    if (!response.ok) {
      throw new Error(`Z-API request failed: ${response.status} ${responseText}`);
    }

    return JSON.parse(responseText) as T;
  }
}

// =============================================================================
// FACTORY REGISTRATION
// =============================================================================

export default ZApiWhatsAppProvider;

/**
 * @fileoverview Evolution API WhatsApp Provider
 *
 * Self-hosted WhatsApp API provider using Evolution API.
 * Provides quick setup via QR code scanning, no Meta verification required.
 *
 * @see https://doc.evolution-api.com/
 *
 * @module lib/messaging/providers/whatsapp/evolution
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
  MessageSentEvent,
  StatusUpdateEvent,
  ConnectionUpdateEvent,
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
 * Evolution API credentials configuration.
 */
export interface EvolutionCredentials {
  serverUrl: string;    // e.g. http://localhost:8080
  instanceName: string; // instance name on the Evolution server
  apiKey: string;       // AUTHENTICATION_API_KEY from the server
}

/**
 * Evolution API connection state response.
 */
interface EvolutionConnectionStateResponse {
  instance?: {
    state?: string; // "open" | "close" | "connecting" | "refused"
  };
}

/**
 * Evolution API QR code response.
 */
interface EvolutionQrCodeResponse {
  qrcode?: {
    base64?: string;
  };
  error?: string;
}

/**
 * Evolution API send message response (all send endpoints).
 */
interface EvolutionSendResponse {
  key?: {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
  };
  status?: string;
  error?: string;
}

/**
 * Evolution API webhook payload.
 * Covers both messages.upsert (received) and messages.update (status) events,
 * as well as connection.update events.
 */
export interface EvolutionWebhookPayload {
  event?: string;       // "messages.upsert" | "messages.update" | "connection.update"
  instance?: string;

  // messages.upsert — data is a single object
  data?: {
    key?: {
      remoteJid?: string;
      id?: string;
      fromMe?: boolean;
    };
    pushName?: string;
    senderPn?: string;
    message?: Record<string, unknown>;
    messageType?: string;
    messageTimestamp?: number;
    instanceId?: string;
    source?: string;
  };

  // messages.update — data is an array of update objects
  // (reuse the data field; when it's an array the union below applies)
}

/**
 * Single item inside a messages.update payload array.
 */
interface EvolutionStatusUpdateItem {
  key?: {
    remoteJid?: string;
    id?: string;
    fromMe?: boolean;
  };
  update?: {
    status?: number; // 3=sent, 4=delivered, 5=read
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalize a WhatsApp JID to a plain phone number string.
 *
 * - "5511999999999@s.whatsapp.net" → "5511999999999"
 * - "{lid}@lid" (rare bug) → falls back to senderPn when available
 */
function normalizePhone(remoteJid: string, senderPn?: string): string {
  if (remoteJid.includes('@lid') && senderPn) return senderPn;
  return remoteJid.split('@')[0];
}

// =============================================================================
// PROVIDER IMPLEMENTATION
// =============================================================================

/**
 * Evolution API WhatsApp provider implementation.
 *
 * Features:
 * - QR code authentication (self-hosted server)
 * - Text, image, video, audio, document, sticker, location, reaction messages
 * - Message status tracking (sent/delivered/read)
 * - Webhook support for incoming messages and status updates
 * - Webhook auto-configuration
 *
 * @example
 * ```ts
 * const provider = new EvolutionWhatsAppProvider();
 * await provider.initialize({
 *   channelId: 'uuid',
 *   externalIdentifier: '+5511999999999',
 *   credentials: {
 *     serverUrl: 'http://localhost:8080',
 *     instanceName: 'minha-instancia',
 *     apiKey: 'my-api-key',
 *   },
 * });
 *
 * const result = await provider.sendMessage({
 *   conversationId: 'uuid',
 *   to: '+5511888888888',
 *   content: { type: 'text', text: 'Olá!' },
 * });
 * ```
 */
export class EvolutionWhatsAppProvider extends BaseChannelProvider {
  readonly channelType: ChannelType = 'whatsapp';
  readonly providerName = 'evolution';

  private serverUrl: string = '';
  private instanceName: string = '';
  private apiKey: string = '';

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);

    const credentials = config.credentials as unknown as EvolutionCredentials;
    this.serverUrl = credentials.serverUrl.replace(/\/$/, ''); // strip trailing slash
    this.instanceName = credentials.instanceName;
    this.apiKey = credentials.apiKey;

    this.log('info', 'Evolution API provider initialized', {
      serverUrl: this.serverUrl,
      instanceName: this.instanceName,
    });
  }

  async disconnect(): Promise<void> {
    // Evolution API does not require an explicit disconnect call.
    // The session persists on the self-hosted server.
    this.log('info', 'Evolution API provider disconnected');
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<ConnectionStatusResult> {
    try {
      const response = await this.request<EvolutionConnectionStateResponse>(
        'GET',
        `/instance/connectionState/${this.instanceName}`
      );

      const state = response.instance?.state;

      switch (state) {
        case 'open':
          return {
            status: 'connected',
            message: 'Connected to WhatsApp',
            details: { instanceName: this.instanceName },
          };

        case 'connecting':
          return {
            status: 'connecting',
            message: 'Connecting to WhatsApp',
          };

        case 'close':
          return {
            status: 'disconnected',
            message: 'Not connected. Scan QR code to connect.',
          };

        case 'refused':
          return {
            status: 'error',
            message: 'Connection refused by WhatsApp',
          };

        default:
          return {
            status: 'disconnected',
            message: 'Unknown connection state',
            details: { state },
          };
      }
    } catch (error) {
      this.log('error', 'getStatus failed', { error: error instanceof Error ? error.message : error, instanceName: this.instanceName });
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get QR code for WhatsApp connection.
   * Returns a base64-encoded data URL (data:image/png;base64,...).
   * @throws Error if QR code cannot be retrieved
   */
  async getQrCode(): Promise<QrCodeResult> {
    const response = await this.request<EvolutionQrCodeResponse>(
      'GET',
      `/instance/connect?instanceName=${this.instanceName}`
    );

    if (response.error) {
      throw new Error(`QR code error: ${response.error}`);
    }

    const base64 = response.qrcode?.base64;
    if (!base64) {
      throw new Error('QR code not available. Instance may already be connected.');
    }

    return {
      qrCode: base64,
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString(), // QR codes expire in ~60s
    };
  }

  /**
   * Configure webhook URL for receiving messages and status updates.
   */
  async configureWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('POST', `/webhook/set/${this.instanceName}`, {
        enabled: true,
        url: webhookUrl,
        byEvents: true,
        events: ['messages.upsert', 'messages.update', 'connection.update'],
      });

      return { success: true };
    } catch (error) {
      this.log('error', 'configureWebhook failed', { error: error instanceof Error ? error.message : error });
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
      // Normalize phone number (remove + and any non-digit characters)
      const number = to.replace(/\D/g, '');

      let response: EvolutionSendResponse;

      switch (content.type) {
        case 'text':
          response = await this.sendTextMessage(number, content as TextContent);
          break;

        case 'image':
          response = await this.sendImageMessage(number, content as ImageContent);
          break;

        case 'video':
          response = await this.sendVideoMessage(number, content as VideoContent);
          break;

        case 'audio':
          response = await this.sendAudioMessage(number, content as AudioContent);
          break;

        case 'document':
          response = await this.sendDocumentMessage(number, content as DocumentContent);
          break;

        case 'sticker':
          response = await this.sendStickerMessage(number, content as StickerContent);
          break;

        case 'location':
          response = await this.sendLocationMessage(number, content as LocationContent);
          break;

        case 'reaction':
          response = await this.sendReactionMessage(
            number,
            content as ReactionContent,
            replyToExternalId
          );
          break;

        default:
          return {
            success: false,
            error: {
              code: 'UNSUPPORTED_CONTENT',
              message: `Content type "${content.type}" is not supported by Evolution API`,
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

      const externalMessageId = response.key?.id;

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

  private async sendTextMessage(
    number: string,
    content: TextContent
  ): Promise<EvolutionSendResponse> {
    return this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendText/${this.instanceName}`,
      { number, text: content.text }
    );
  }

  private async sendImageMessage(
    number: string,
    content: ImageContent
  ): Promise<EvolutionSendResponse> {
    const body: Record<string, unknown> = {
      number,
      mediatype: 'image',
      media: content.mediaUrl,
    };

    if (content.caption) body.caption = content.caption;
    if (content.mimeType) body.mimetype = content.mimeType;

    return this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendMedia/${this.instanceName}`,
      body
    );
  }

  private async sendVideoMessage(
    number: string,
    content: VideoContent
  ): Promise<EvolutionSendResponse> {
    const body: Record<string, unknown> = {
      number,
      mediatype: 'video',
      media: content.mediaUrl,
    };

    if (content.caption) body.caption = content.caption;

    return this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendMedia/${this.instanceName}`,
      body
    );
  }

  private async sendAudioMessage(
    number: string,
    content: AudioContent
  ): Promise<EvolutionSendResponse> {
    return this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendWhatsAppAudio/${this.instanceName}`,
      { number, audio: content.mediaUrl }
    );
  }

  private async sendDocumentMessage(
    number: string,
    content: DocumentContent
  ): Promise<EvolutionSendResponse> {
    const body: Record<string, unknown> = {
      number,
      mediatype: 'document',
      media: content.mediaUrl,
      fileName: content.fileName,
    };

    if (content.mimeType) body.mimetype = content.mimeType;

    return this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendMedia/${this.instanceName}`,
      body
    );
  }

  private async sendStickerMessage(
    number: string,
    content: StickerContent
  ): Promise<EvolutionSendResponse> {
    return this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendSticker/${this.instanceName}`,
      { number, sticker: content.mediaUrl }
    );
  }

  private async sendLocationMessage(
    number: string,
    content: LocationContent
  ): Promise<EvolutionSendResponse> {
    return this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendLocation/${this.instanceName}`,
      {
        number,
        latitude: content.latitude,
        longitude: content.longitude,
        name: content.name || '',
        address: content.address || '',
      }
    );
  }

  private async sendReactionMessage(
    number: string,
    content: ReactionContent,
    remoteJid?: string
  ): Promise<EvolutionSendResponse> {
    return this.request<EvolutionSendResponse>(
      'POST',
      `/message/sendReaction/${this.instanceName}`,
      {
        key: {
          id: content.messageId,
          remoteJid: remoteJid ?? `${number}@s.whatsapp.net`,
          fromMe: true,
        },
        reaction: content.emoji,
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Webhook Handler
  // ---------------------------------------------------------------------------

  async handleWebhook(payload: unknown): Promise<WebhookHandlerResult> {
    const raw = payload as EvolutionWebhookPayload & { data?: unknown };
    const event = raw.event;

    // messages.upsert — new inbound message
    if (event === 'messages.upsert') {
      return this.handleMessageUpsert(raw, payload);
    }

    // messages.update — delivery/read status update
    if (event === 'messages.update') {
      return this.handleMessageUpdate(raw, payload);
    }

    // connection.update — instance connection state changed
    if (event === 'connection.update') {
      return this.handleConnectionUpdate(raw, payload);
    }

    // Unknown event — surface as error so the router can decide what to do
    const errorData: ErrorEvent = {
      type: 'error',
      code: 'UNKNOWN_EVENT',
      message: `Unknown Evolution webhook event: ${event ?? '(none)'}`,
      timestamp: new Date(),
    };
    return {
      type: 'error',
      data: errorData,
      raw: payload,
    };
  }

  private handleMessageUpsert(
    raw: EvolutionWebhookPayload,
    originalPayload: unknown
  ): WebhookHandlerResult {
    const data = raw.data;

    if (!data) {
      const errorData: ErrorEvent = {
        type: 'error',
        code: 'MISSING_DATA',
        message: 'messages.upsert payload missing data field',
        timestamp: new Date(),
      };
      return { type: 'error', data: errorData, raw: originalPayload };
    }

    // fromMe=true: outbound echo (message sent from the phone/app).
    // Return message_sent so the channel router can store it as direction='outbound'.
    if (data.key?.fromMe) {
      const sentEventData: MessageSentEvent = {
        type: 'message_sent',
        externalMessageId: data.key?.id ?? '',
        status: 'sent',
        timestamp: data.messageTimestamp
          ? new Date(data.messageTimestamp * 1000)
          : new Date(),
      };
      return {
        type: 'message_sent',
        externalId: data.key?.id ?? '',
        data: sentEventData,
        raw: originalPayload,
      };
    }

    const remoteJid = data.key?.remoteJid ?? '';
    const from = normalizePhone(remoteJid, data.senderPn);
    const timestamp = data.messageTimestamp
      ? new Date(data.messageTimestamp * 1000)
      : new Date();
    const content = this.extractContent(data.messageType, data.message);

    const eventData: MessageReceivedEvent = {
      type: 'message_received',
      from,
      fromName: data.pushName,
      content,
      externalMessageId: data.key?.id ?? '',
      timestamp,
    };

    return {
      type: 'message_received',
      externalId: eventData.externalMessageId,
      data: eventData,
      raw: originalPayload,
    };
  }

  private handleMessageUpdate(
    raw: EvolutionWebhookPayload & { data?: unknown },
    originalPayload: unknown
  ): WebhookHandlerResult {
    // messages.update data is an array of update objects
    const updates = raw.data as unknown as EvolutionStatusUpdateItem[] | undefined;
    const first = Array.isArray(updates) ? updates[0] : undefined;

    if (!first) {
      const errorData: ErrorEvent = {
        type: 'error',
        code: 'MISSING_DATA',
        message: 'messages.update payload missing data array',
        timestamp: new Date(),
      };
      return { type: 'error', data: errorData, raw: originalPayload };
    }

    // Map Evolution numeric status codes to internal MessageStatus
    const statusMap: Record<number, MessageStatus> = {
      3: 'sent',
      4: 'delivered',
      5: 'read',
    };

    const numericStatus = first.update?.status ?? 0;
    const mapped = statusMap[numericStatus];
    if (!mapped && numericStatus !== undefined) {
      this.log('warn', `Status code desconhecido: ${numericStatus}, tratando como 'sent'`);
    }
    const status: MessageStatus = mapped ?? 'sent';

    const eventData: StatusUpdateEvent = {
      type: 'status_update',
      externalMessageId: first.key?.id ?? '',
      status,
      timestamp: new Date(),
    };

    return {
      type: 'status_update',
      externalId: eventData.externalMessageId,
      data: eventData,
      raw: originalPayload,
    };
  }

  private handleConnectionUpdate(
    raw: EvolutionWebhookPayload & { data?: unknown },
    originalPayload: unknown
  ): WebhookHandlerResult {
    // connection.update data may contain a state field
    const connData = raw.data as { state?: string } | undefined;
    const stateRaw = connData?.state ?? 'close';

    // 'connecting' is intentionally omitted — writing that status breaks subsequent webhook
    // lookups (channel query filters by status IN ('connected', 'active') only).
    const stateToChannelStatus: Record<string, 'connected' | 'disconnected' | 'error'> = {
      open: 'connected',
      close: 'disconnected',
      refused: 'error',
    };

    const eventData: ConnectionUpdateEvent = {
      type: 'connection_update',
      status: stateToChannelStatus[stateRaw] ?? 'disconnected',
      message: `Evolution instance state: ${stateRaw}`,
      timestamp: new Date(),
    };

    return {
      type: 'connection_update',
      data: eventData,
      raw: originalPayload,
    };
  }

  /**
   * Extract normalized MessageContent from an Evolution messageType and raw message object.
   */
  private extractContent(
    messageType: string | undefined,
    message: Record<string, unknown> | undefined
  ): MessageContent {
    if (!message) {
      return { type: 'text', text: '[empty message]' };
    }

    switch (messageType) {
      case 'conversation':
        return {
          type: 'text',
          text: (message.conversation as string) ?? '',
        };

      case 'extendedTextMessage': {
        const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
        return {
          type: 'text',
          text: (ext?.text as string) ?? '',
        };
      }

      case 'imageMessage': {
        const img = message.imageMessage as Record<string, unknown> | undefined;
        return {
          type: 'image',
          mediaUrl: (img?.url as string) ?? '',
          mimeType: (img?.mimetype as string) ?? 'image/jpeg',
          caption: img?.caption as string | undefined,
        };
      }

      case 'videoMessage': {
        const vid = message.videoMessage as Record<string, unknown> | undefined;
        return {
          type: 'video',
          mediaUrl: (vid?.url as string) ?? '',
          mimeType: (vid?.mimetype as string) ?? 'video/mp4',
          caption: vid?.caption as string | undefined,
        };
      }

      case 'audioMessage': {
        const aud = message.audioMessage as Record<string, unknown> | undefined;
        return {
          type: 'audio',
          mediaUrl: (aud?.url as string) ?? '',
          mimeType: (aud?.mimetype as string) ?? 'audio/ogg',
        };
      }

      case 'documentMessage': {
        const doc = message.documentMessage as Record<string, unknown> | undefined;
        return {
          type: 'document',
          mediaUrl: (doc?.url as string) ?? '',
          fileName: (doc?.fileName as string) ?? 'document',
          mimeType: (doc?.mimetype as string) ?? 'application/octet-stream',
        };
      }

      case 'stickerMessage': {
        const stk = message.stickerMessage as Record<string, unknown> | undefined;
        return {
          type: 'sticker',
          mediaUrl: (stk?.url as string) ?? '',
          mimeType: 'image/webp',
        };
      }

      case 'locationMessage': {
        const loc = message.locationMessage as Record<string, unknown> | undefined;
        return {
          type: 'location',
          latitude: (loc?.degreesLatitude as number) ?? 0,
          longitude: (loc?.degreesLongitude as number) ?? 0,
          name: loc?.name as string | undefined,
          address: loc?.address as string | undefined,
        };
      }

      case 'reactionMessage': {
        const reaction = (message as Record<string, unknown>).reactionMessage as Record<string, unknown>;
        return {
          type: 'reaction',
          emoji: (reaction?.text as string) || '',
          messageId: ((reaction?.key as Record<string, unknown>)?.id as string) || '',
        };
      }

      case 'contactMessage':
        // Contact cards are not fully modeled; surface as text placeholder
        return {
          type: 'text',
          text: '[contact]',
        };

      default:
        return {
          type: 'text',
          text: `[${messageType ?? 'unknown'}]`,
        };
    }
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
    const credentials = config.credentials as unknown as EvolutionCredentials;

    if (!credentials.serverUrl) {
      errors.push({
        field: 'credentials.serverUrl',
        message: 'Evolution API server URL is required',
        code: 'REQUIRED',
      });
    } else {
      try {
        const url = new URL(credentials.serverUrl as string);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return {
            valid: false,
            errors: [{
              field: 'credentials.serverUrl',
              message: 'serverUrl deve começar com http:// ou https://',
              code: 'INVALID_URL',
            }],
          };
        }
      } catch {
        return {
          valid: false,
          errors: [{
            field: 'credentials.serverUrl',
            message: 'serverUrl não é uma URL válida (exemplo: http://localhost:8080)',
            code: 'INVALID_URL',
          }],
        };
      }
    }

    if (!credentials.instanceName) {
      errors.push({
        field: 'credentials.instanceName',
        message: 'Evolution API instance name is required',
        code: 'REQUIRED',
      });
    }

    if (!credentials.apiKey) {
      errors.push({
        field: 'credentials.apiKey',
        message: 'Evolution API key is required',
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
    const url = `${this.serverUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const requestBody = body ? JSON.stringify(body) : undefined;
    this.log('info', `${method} ${endpoint}`);

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
    this.log('info', `${method} ${endpoint} response (${Date.now()}ms): ${response.status}`);

    if (!response.ok) {
      throw new Error(`Evolution API request failed: ${response.status} ${responseText}`);
    }

    try {
      return JSON.parse(responseText) as T;
    } catch {
      throw new Error(`Evolution API retornou resposta não-JSON em ${endpoint}: ${responseText.slice(0, 200)}`);
    }
  }
}

// =============================================================================
// FACTORY REGISTRATION
// =============================================================================

export default EvolutionWhatsAppProvider;

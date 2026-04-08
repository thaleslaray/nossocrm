/**
 * @fileoverview Messaging Provider Types
 *
 * Interfaces for channel providers (Z-API, Meta Cloud API, etc.)
 * Providers implement the IChannelProvider interface to handle
 * sending/receiving messages for a specific service.
 *
 * @module lib/messaging/types/provider
 */

import type { ChannelType, ChannelStatus, MessagingChannel } from './channel.types';
import type { MessageContent, MessageStatus, MessagingMessage } from './message.types';

// =============================================================================
// PROVIDER INTERFACE
// =============================================================================

/**
 * Channel provider interface.
 * All providers must implement this interface to be usable by the system.
 *
 * @example
 * ```ts
 * class ZApiProvider implements IChannelProvider {
 *   readonly channelType = 'whatsapp';
 *   readonly providerName = 'z-api';
 *   // ... implement methods
 * }
 * ```
 */
export interface IChannelProvider {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  /** Channel type this provider supports */
  readonly channelType: ChannelType;

  /** Provider name (e.g., 'z-api', 'meta-cloud') */
  readonly providerName: string;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize the provider with channel configuration.
   * Called when a channel is created or reactivated.
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Disconnect from the service.
   * Called when a channel is deactivated or deleted.
   */
  disconnect(): Promise<void>;

  /**
   * Get current connection status.
   */
  getStatus(): Promise<ConnectionStatusResult>;

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  /**
   * Send a message to an external contact.
   */
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;

  /**
   * Send a template message (WhatsApp HSM).
   * Not all providers support templates.
   */
  sendTemplate?(params: SendTemplateParams): Promise<SendMessageResult>;

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  /**
   * Upload media for sending.
   * Returns a media ID or URL for use in messages.
   * Note: Uses File | Blob for browser/edge compatibility.
   */
  uploadMedia?(file: File | Blob, mimeType: string): Promise<MediaUploadResult>;

  /**
   * Download media from a received message.
   */
  downloadMedia?(mediaId: string): Promise<MediaDownloadResult>;

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /**
   * Process an incoming webhook payload.
   * Returns normalized event data.
   */
  handleWebhook(payload: unknown): Promise<WebhookHandlerResult>;

  /**
   * Verify webhook signature (for security).
   */
  verifyWebhookSignature?(payload: unknown, signature: string): boolean;

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * Validate provider configuration before saving.
   */
  validateConfig(config: ProviderConfig): ValidationResult;

  // -------------------------------------------------------------------------
  // Provider-Specific (Optional)
  // -------------------------------------------------------------------------

  /**
   * Get QR code for WhatsApp Web connection.
   * Only applicable for providers using WhatsApp Web (e.g., Z-API).
   */
  getQrCode?(): Promise<QrCodeResult>;

  /**
   * Sync message templates from provider.
   * Only applicable for template-supporting providers.
   */
  syncTemplates?(): Promise<TemplateSyncResult>;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Provider configuration passed to initialize().
 */
export interface ProviderConfig {
  /** Channel ID in our database */
  channelId: string;
  /** Channel type */
  channelType: ChannelType;
  /** Provider name */
  provider: string;
  /** External identifier (phone number, email, etc.) */
  externalIdentifier: string;
  /** Provider-specific credentials */
  credentials: Record<string, string>;
  /** Webhook URL for inbound messages */
  webhookUrl?: string;
  /** Additional settings */
  settings?: Record<string, unknown>;
}

/**
 * Result of configuration validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

/**
 * Validation error details.
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// =============================================================================
// CONNECTION TYPES
// =============================================================================

/**
 * Result of getStatus().
 */
export interface ConnectionStatusResult {
  status: ChannelStatus;
  message?: string;
  details?: {
    /** Phone number if connected */
    phoneNumber?: string;
    /** Business name if available */
    businessName?: string;
    /** Last activity timestamp */
    lastActivity?: string;
    /** Additional provider-specific info */
    [key: string]: unknown;
  };
}

/**
 * Result of getQrCode().
 */
export interface QrCodeResult {
  qrCode: string; // Base64 encoded image or data URL
  expiresAt?: string;
}

// =============================================================================
// MESSAGING TYPES
// =============================================================================

/**
 * Parameters for sendMessage().
 */
export interface SendMessageParams {
  /** Conversation ID in our database */
  conversationId: string;
  /** External contact identifier (phone, email, etc.) */
  to: string;
  /** Message content */
  content: MessageContent;
  /** Message to reply to (optional) */
  replyToMessageId?: string;
  /** External message ID to reply to (optional) */
  replyToExternalId?: string;
}

/**
 * Parameters for sendTemplate().
 */
export interface SendTemplateParams {
  /** Conversation ID in our database */
  conversationId: string;
  /** External contact identifier */
  to: string;
  /** Template name */
  templateName: string;
  /** Template language (e.g., 'pt_BR') */
  templateLanguage: string;
  /** Template components with parameters */
  components?: TemplateComponentParam[];
}

/**
 * Template component parameter for sending.
 */
export interface TemplateComponentParam {
  type: 'header' | 'body' | 'button';
  parameters?: {
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
    text?: string;
    currency?: { code: string; amount: number };
    dateTime?: { fallbackValue: string };
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
  }[];
}

/**
 * Result of sendMessage() or sendTemplate().
 */
export interface SendMessageResult {
  success: boolean;
  /** External message ID assigned by the provider */
  externalMessageId?: string;
  /** Initial status from provider */
  status?: MessageStatus;
  /** Error details if failed */
  error?: ProviderError;
  /** Raw provider response */
  raw?: unknown;
}

/**
 * Provider error details.
 */
export interface ProviderError {
  code: string;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

// =============================================================================
// MEDIA TYPES
// =============================================================================

/**
 * Result of uploadMedia().
 */
export interface MediaUploadResult {
  success: boolean;
  /** Media ID for use in messages */
  mediaId?: string;
  /** Direct URL if available */
  mediaUrl?: string;
  error?: ProviderError;
}

/**
 * Result of downloadMedia().
 */
export interface MediaDownloadResult {
  success: boolean;
  /** Raw file data (ArrayBuffer for browser/edge compatibility) */
  data?: ArrayBuffer;
  /** MIME type */
  mimeType?: string;
  /** File name if available */
  fileName?: string;
  error?: ProviderError;
}

// =============================================================================
// WEBHOOK TYPES
// =============================================================================

/**
 * Webhook event type.
 */
export type WebhookEventType =
  | 'message_received'   // New inbound message
  | 'message_sent'       // Our message was sent
  | 'status_update'      // Delivery status changed
  | 'connection_update'  // Connection status changed
  | 'error';             // Error event

/**
 * Result of handleWebhook().
 */
export interface WebhookHandlerResult {
  /** Type of event */
  type: WebhookEventType;
  /** External ID for deduplication */
  externalId?: string;
  /** Normalized event data */
  data: WebhookEventData;
  /** Raw payload for debugging */
  raw: unknown;
}

/**
 * Normalized webhook event data.
 */
export type WebhookEventData =
  | MessageReceivedEvent
  | MessageSentEvent
  | StatusUpdateEvent
  | ConnectionUpdateEvent
  | ErrorEvent;

/**
 * Inbound message event.
 */
export interface MessageReceivedEvent {
  type: 'message_received';
  /** External contact identifier (sender) */
  from: string;
  /** Contact display name */
  fromName?: string;
  /** Contact profile picture URL */
  fromAvatar?: string;
  /** Message content */
  content: MessageContent;
  /** External message ID */
  externalMessageId: string;
  /** Reply context */
  replyToExternalId?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Outbound message confirmation event.
 */
export interface MessageSentEvent {
  type: 'message_sent';
  /** External message ID */
  externalMessageId: string;
  /** Status */
  status: MessageStatus;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Message status update event.
 */
export interface StatusUpdateEvent {
  type: 'status_update';
  /** External message ID */
  externalMessageId: string;
  /** New status */
  status: MessageStatus;
  /** Error info if failed */
  error?: { code: string; message: string };
  /** Timestamp */
  timestamp: Date;
}

/**
 * Connection status change event.
 */
export interface ConnectionUpdateEvent {
  type: 'connection_update';
  /** New connection status */
  status: ChannelStatus;
  /** Status message */
  message?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Error event.
 */
export interface ErrorEvent {
  type: 'error';
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

// =============================================================================
// TEMPLATE SYNC TYPES
// =============================================================================

/**
 * Result of syncTemplates().
 */
export interface TemplateSyncResult {
  success: boolean;
  /** Templates synced */
  templates?: ProviderTemplate[];
  error?: ProviderError;
}

/**
 * Template from provider.
 */
export interface ProviderTemplate {
  externalId: string;
  name: string;
  language: string;
  category: 'marketing' | 'utility' | 'authentication';
  status: 'pending' | 'approved' | 'rejected' | 'paused';
  rejectionReason?: string;
  components: ProviderTemplateComponent[];
}

/**
 * Template component from provider.
 */
export interface ProviderTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: {
    headerText?: string[];
    bodyText?: string[][];
    headerHandle?: string[];
  };
  buttons?: {
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phoneNumber?: string;
  }[];
}

// =============================================================================
// PROVIDER REGISTRY TYPES
// =============================================================================

/**
 * Provider constructor type.
 */
export type ProviderConstructor = new () => IChannelProvider;

/**
 * Provider registry entry.
 */
export interface ProviderRegistryEntry {
  channelType: ChannelType;
  providerName: string;
  constructor: ProviderConstructor;
  displayName: string;
  description: string;
  configFields: ProviderConfigField[];
  features: ProviderFeature[];
}

/**
 * Provider configuration field definition.
 */
export interface ProviderConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'phone' | 'email';
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

/**
 * Provider feature flags.
 */
export type ProviderFeature =
  | 'templates'        // Supports message templates
  | 'media'            // Supports media messages
  | 'reactions'        // Supports reactions
  | 'read_receipts'    // Supports read receipts
  | 'typing_indicator' // Supports typing indicators
  | 'qr_code';         // Requires QR code for connection

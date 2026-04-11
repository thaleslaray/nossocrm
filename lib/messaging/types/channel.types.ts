/**
 * @fileoverview Messaging Channel Types
 *
 * Types for messaging channels (WhatsApp, Instagram, Email, etc.)
 * Channels represent connected messaging accounts that can send/receive messages.
 *
 * @module lib/messaging/types/channel
 */

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

/**
 * Supported messaging channel types.
 * Each channel type may have multiple provider implementations.
 */
export type ChannelType =
  | 'whatsapp'
  | 'instagram'
  | 'email'
  | 'sms'
  | 'telegram'
  | 'voice';

/**
 * Available providers for each channel type.
 * Maps channel type to array of provider names.
 */
export const CHANNEL_PROVIDERS: Record<ChannelType, string[]> = {
  whatsapp: ['z-api', 'evolution', 'meta-cloud'],
  instagram: ['meta'],
  email: ['smtp', 'resend'],
  sms: ['twilio', 'vonage'],
  telegram: ['telegram-bot'],
  voice: ['twilio'],
} as const;

/**
 * Connection status of a channel.
 */
export type ChannelStatus =
  | 'pending'       // Initial state, not configured
  | 'connecting'    // Connection in progress
  | 'connected'     // Ready to send/receive
  | 'disconnected'  // Was connected, now offline
  | 'error'         // Configuration or auth error
  | 'waiting_qr';   // Waiting for QR code scan (WhatsApp Web)

/**
 * Human-readable labels for channel statuses (PT-BR).
 */
export const CHANNEL_STATUS_LABELS: Record<ChannelStatus, string> = {
  pending: 'Pendente',
  connecting: 'Conectando...',
  connected: 'Conectado',
  disconnected: 'Desconectado',
  error: 'Erro',
  waiting_qr: 'Aguardando QR Code',
} as const;

/**
 * Colors for channel status badges.
 */
export const CHANNEL_STATUS_COLORS: Record<ChannelStatus, string> = {
  pending: 'bg-gray-500',
  connecting: 'bg-yellow-500',
  connected: 'bg-green-500',
  disconnected: 'bg-gray-400',
  error: 'bg-red-500',
  waiting_qr: 'bg-blue-500',
} as const;

/**
 * Display info for each channel type.
 */
export const CHANNEL_TYPE_INFO: Record<ChannelType, {
  label: string;
  icon: string;
  color: string;
}> = {
  whatsapp: { label: 'WhatsApp', icon: 'MessageCircle', color: 'bg-green-500' },
  instagram: { label: 'Instagram', icon: 'Instagram', color: 'bg-pink-500' },
  email: { label: 'Email', icon: 'Mail', color: 'bg-blue-500' },
  sms: { label: 'SMS', icon: 'Smartphone', color: 'bg-purple-500' },
  telegram: { label: 'Telegram', icon: 'Send', color: 'bg-sky-500' },
  voice: { label: 'Voz', icon: 'Phone', color: 'bg-orange-500' },
} as const;

// =============================================================================
// DATABASE INTERFACES (snake_case - match DB schema)
// =============================================================================

/**
 * Database representation of a messaging channel.
 * Uses snake_case to match PostgreSQL column names.
 */
export interface DbMessagingChannel {
  id: string;
  organization_id: string;
  business_unit_id: string;
  channel_type: ChannelType;
  provider: string;
  external_identifier: string;
  name: string;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
  status: ChannelStatus;
  status_message: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// =============================================================================
// APP INTERFACES (camelCase - for React components)
// =============================================================================

/**
 * App-level representation of a messaging channel.
 * Uses camelCase for TypeScript/React conventions.
 */
export interface MessagingChannel {
  id: string;
  organizationId: string;
  businessUnitId: string;
  businessUnitName?: string;
  channelType: ChannelType;
  provider: string;
  externalIdentifier: string;
  name: string;
  credentials: Record<string, unknown>;
  settings: ChannelSettings;
  status: ChannelStatus;
  statusMessage?: string;
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/**
 * Channel settings (common across providers).
 */
export interface ChannelSettings {
  /** Webhook URL for inbound messages */
  webhookUrl?: string;
  /**
   * Human-readable phone number (e.g. "+55 11 99999-9999").
   * Backfilled from Meta's display_phone_number on first webhook receipt.
   * Use this instead of externalIdentifier (which stores the numeric phoneNumberId).
   */
  displayPhone?: string;
  /** Auto-reply when offline */
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  /** Business hours (for auto-reply) */
  businessHours?: {
    enabled: boolean;
    timezone: string;
    schedule: {
      day: number; // 0-6 (Sun-Sat)
      start: string; // "09:00"
      end: string; // "18:00"
    }[];
  };
  /** Provider-specific settings */
  [key: string]: unknown;
}

// =============================================================================
// PROVIDER-SPECIFIC CREDENTIALS
// =============================================================================

/**
 * Z-API credentials for WhatsApp.
 */
export interface ZApiCredentials {
  instanceId: string;
  token: string;
  clientToken?: string;
}

/**
 * Meta Cloud API credentials for WhatsApp/Instagram.
 */
export interface MetaCloudCredentials {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  appId?: string;
  appSecret?: string;
}

/**
 * Meta Instagram credentials for Instagram DMs.
 */
export interface MetaInstagramCredentials {
  accessToken: string;
  pageId: string;
  instagramAccountId: string;
  appSecret?: string;
}

/**
 * SMTP credentials for Email.
 */
export interface SmtpCredentials {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

/**
 * Resend credentials for Email.
 */
export interface ResendCredentials {
  apiKey: string;
  fromName: string;
  fromEmail: string;
}

// =============================================================================
// INPUT/FORM TYPES
// =============================================================================

/**
 * Input for creating a new channel.
 */
export interface CreateChannelInput {
  businessUnitId: string;
  channelType: ChannelType;
  provider: string;
  externalIdentifier: string;
  name: string;
  credentials: Record<string, unknown>;
  settings?: Partial<ChannelSettings>;
}

/**
 * Input for updating a channel.
 */
export interface UpdateChannelInput {
  name?: string;
  credentials?: Record<string, unknown>;
  settings?: Partial<ChannelSettings>;
  status?: ChannelStatus;
  statusMessage?: string;
}

// =============================================================================
// TRANSFORMATION FUNCTIONS
// =============================================================================

/**
 * Transform database channel to app channel.
 */
export function transformChannel(
  db: DbMessagingChannel & { business_unit_name?: string }
): MessagingChannel {
  return {
    id: db.id,
    organizationId: db.organization_id,
    businessUnitId: db.business_unit_id,
    businessUnitName: db.business_unit_name,
    channelType: db.channel_type,
    provider: db.provider,
    externalIdentifier: db.external_identifier,
    name: db.name,
    credentials: db.credentials,
    settings: db.settings as ChannelSettings,
    status: db.status,
    statusMessage: db.status_message ?? undefined,
    lastConnectedAt: db.last_connected_at ?? undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deletedAt: db.deleted_at ?? undefined,
  };
}

/**
 * Transform app channel input to database format.
 */
export function transformChannelToDb(
  input: CreateChannelInput | UpdateChannelInput,
  organizationId?: string
): Partial<DbMessagingChannel> {
  const db: Partial<DbMessagingChannel> = {};

  if ('businessUnitId' in input && input.businessUnitId) {
    db.business_unit_id = input.businessUnitId;
  }
  if ('channelType' in input && input.channelType) {
    db.channel_type = input.channelType;
  }
  if ('provider' in input && input.provider) {
    db.provider = input.provider;
  }
  if ('externalIdentifier' in input && input.externalIdentifier) {
    db.external_identifier = input.externalIdentifier;
  }
  if (input.name !== undefined) {
    db.name = input.name;
  }
  if (input.credentials !== undefined) {
    db.credentials = input.credentials;
  }
  if (input.settings !== undefined) {
    db.settings = input.settings;
  }
  if ('status' in input && input.status !== undefined) {
    db.status = input.status;
  }
  if ('statusMessage' in input && input.statusMessage !== undefined) {
    db.status_message = input.statusMessage;
  }
  if (organizationId) {
    db.organization_id = organizationId;
  }

  return db;
}

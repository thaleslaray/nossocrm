/**
 * @fileoverview Messaging Message Types
 *
 * Types for conversations and messages in the messaging system.
 * Includes support for multiple content types (text, media, templates).
 *
 * @module lib/messaging/types/message
 */

import type { ChannelType } from './channel.types';

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

/**
 * Conversation status.
 * MVP supports only 'open' and 'resolved'.
 */
export type ConversationStatus = 'open' | 'resolved';

/**
 * Conversation priority levels.
 */
export type ConversationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Message direction.
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Message content types supported by the system.
 */
export type MessageContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'template'
  | 'interactive'
  | 'reaction';

/**
 * Message delivery status.
 */
export type MessageStatus =
  | 'pending'    // Created locally, not yet sent
  | 'queued'     // Queued for sending
  | 'sent'       // Sent to provider
  | 'delivered'  // Delivered to recipient
  | 'read'       // Read by recipient
  | 'failed';    // Failed to send

/**
 * Human-readable labels for conversation statuses (PT-BR).
 */
export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  open: 'Aberta',
  resolved: 'Resolvida',
} as const;

/**
 * Human-readable labels for priorities (PT-BR).
 */
export const PRIORITY_LABELS: Record<ConversationPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
} as const;

/**
 * Colors for priority badges.
 */
export const PRIORITY_COLORS: Record<ConversationPriority, string> = {
  low: 'bg-gray-500',
  normal: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
} as const;

/**
 * Human-readable labels for message statuses (PT-BR).
 */
export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  pending: 'Pendente',
  queued: 'Na fila',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
} as const;

// =============================================================================
// DATABASE INTERFACES (snake_case)
// =============================================================================

/**
 * Database representation of a conversation.
 */
export interface DbMessagingConversation {
  id: string;
  organization_id: string;
  channel_id: string;
  business_unit_id: string;
  contact_id: string | null;
  external_contact_id: string;
  external_contact_name: string | null;
  external_contact_avatar: string | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  assigned_user_id: string | null;
  assigned_at: string | null;
  window_expires_at: string | null;
  unread_count: number;
  message_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: MessageDirection | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Database representation of a message.
 */
export interface DbMessagingMessage {
  id: string;
  conversation_id: string;
  external_id: string | null;
  direction: MessageDirection;
  content_type: MessageContentType;
  content: MessageContent;
  reply_to_message_id: string | null;
  status: MessageStatus;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  sender_name: string | null;
  sender_profile_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// =============================================================================
// APP INTERFACES (camelCase)
// =============================================================================

/**
 * App-level representation of a conversation.
 */
export interface MessagingConversation {
  id: string;
  organizationId: string;
  channelId: string;
  businessUnitId: string;
  contactId?: string;
  externalContactId: string;
  externalContactName?: string;
  externalContactAvatar?: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  assignedUserId?: string;
  assignedAt?: string;
  windowExpiresAt?: string;
  unreadCount: number;
  messageCount: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageDirection?: MessageDirection;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Conversation with denormalized data for display.
 */
export interface ConversationView extends MessagingConversation {
  /** Channel info */
  channelType: ChannelType;
  channelName: string;
  /** Channel provider (e.g. 'z-api', 'meta-cloud', 'resend'). Window expiry only applies to 'meta-cloud'. */
  channelProvider?: string;
  /** Contact info (if linked) */
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAiPaused?: boolean;
  /** Assigned user info */
  assignedUserName?: string;
  assignedUserAvatar?: string;
  /** Whether response window is expired */
  isWindowExpired: boolean;
  /** Minutes until window expires (if applicable) */
  windowMinutesRemaining?: number;
}

/**
 * App-level representation of a message.
 */
export interface MessagingMessage {
  id: string;
  conversationId: string;
  externalId?: string;
  direction: MessageDirection;
  contentType: MessageContentType;
  content: MessageContent;
  replyToMessageId?: string;
  status: MessageStatus;
  errorCode?: string;
  errorMessage?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  senderName?: string;
  senderProfileUrl?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// =============================================================================
// MESSAGE CONTENT TYPES
// =============================================================================

/**
 * Union type for all possible message content structures.
 */
export type MessageContent =
  | TextContent
  | ImageContent
  | VideoContent
  | AudioContent
  | DocumentContent
  | StickerContent
  | LocationContent
  | ContactContent
  | TemplateContent
  | InteractiveContent
  | ReactionContent;

/**
 * Text message content.
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image message content.
 */
export interface ImageContent {
  type: 'image';
  mediaUrl: string;
  mimeType: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
}

/**
 * Video message content.
 */
export interface VideoContent {
  type: 'video';
  mediaUrl: string;
  mimeType: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number; // seconds
}

/**
 * Audio message content.
 */
export interface AudioContent {
  type: 'audio';
  mediaUrl: string;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  duration?: number; // seconds
}

/**
 * Document message content.
 */
export interface DocumentContent {
  type: 'document';
  mediaUrl: string;
  mimeType: string;
  fileName: string;
  fileSize?: number;
  caption?: string;
}

/**
 * Sticker message content.
 */
export interface StickerContent {
  type: 'sticker';
  mediaUrl: string;
  mimeType: string;
  animated?: boolean;
}

/**
 * Location message content.
 */
export interface LocationContent {
  type: 'location';
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * Contact card message content.
 */
export interface ContactContent {
  type: 'contact';
  contacts: {
    name: {
      formattedName: string;
      firstName?: string;
      lastName?: string;
    };
    phones?: { type: string; phone: string }[];
    emails?: { type: string; email: string }[];
  }[];
}

/**
 * WhatsApp template message content.
 */
export interface TemplateContent {
  type: 'template';
  templateName: string;
  templateLanguage: string;
  components?: TemplateComponent[];
}

/**
 * Template component (header, body, button).
 */
export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  subType?: 'quick_reply' | 'url' | 'phone_number';
  index?: number;
  parameters?: TemplateParameter[];
}

/**
 * Template parameter (variable replacement).
 */
export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { code: string; amount: number };
  dateTime?: { fallbackValue: string };
  image?: { link: string };
  document?: { link: string; filename?: string };
  video?: { link: string };
}

/**
 * Interactive message content (buttons, lists).
 */
export interface InteractiveContent {
  type: 'interactive';
  interactiveType: 'button' | 'list' | 'product' | 'product_list';
  header?: { type: 'text' | 'image' | 'video' | 'document'; text?: string; mediaUrl?: string };
  body: { text: string };
  footer?: { text: string };
  action: InteractiveAction;
}

/**
 * Interactive action (buttons or list sections).
 */
export interface InteractiveAction {
  buttons?: { type: 'reply'; reply: { id: string; title: string } }[];
  button?: string; // List button text
  sections?: {
    title?: string;
    rows: { id: string; title: string; description?: string }[];
  }[];
}

/**
 * Reaction message content.
 */
export interface ReactionContent {
  type: 'reaction';
  emoji: string;
  messageId: string; // ID of the message being reacted to
}

// =============================================================================
// INPUT/FORM TYPES
// =============================================================================

/**
 * Input for sending a message.
 */
export interface SendMessageInput {
  conversationId: string;
  content: MessageContent;
  replyToMessageId?: string;
}

/**
 * Input for updating a conversation.
 */
export interface UpdateConversationInput {
  status?: ConversationStatus;
  priority?: ConversationPriority;
  assignedUserId?: string | null;
}

/**
 * Filters for conversation list.
 */
export interface ConversationFilters {
  status?: ConversationStatus | 'all';
  channelId?: string;
  channelType?: ChannelType;
  businessUnitId?: string;
  assignedUserId?: string | 'unassigned';
  hasUnread?: boolean;
  search?: string;
  sortBy?: 'lastMessageAt' | 'createdAt' | 'unreadCount';
  sortOrder?: 'asc' | 'desc';
}

// =============================================================================
// TRANSFORMATION FUNCTIONS
// =============================================================================

/**
 * Transform database conversation to app conversation.
 */
export function transformConversation(db: DbMessagingConversation): MessagingConversation {
  return {
    id: db.id,
    organizationId: db.organization_id,
    channelId: db.channel_id,
    businessUnitId: db.business_unit_id,
    contactId: db.contact_id ?? undefined,
    externalContactId: db.external_contact_id,
    externalContactName: db.external_contact_name ?? undefined,
    externalContactAvatar: db.external_contact_avatar ?? undefined,
    status: db.status,
    priority: db.priority,
    assignedUserId: db.assigned_user_id ?? undefined,
    assignedAt: db.assigned_at ?? undefined,
    windowExpiresAt: db.window_expires_at ?? undefined,
    unreadCount: db.unread_count,
    messageCount: db.message_count,
    lastMessageAt: db.last_message_at ?? undefined,
    lastMessagePreview: db.last_message_preview ?? undefined,
    lastMessageDirection: db.last_message_direction ?? undefined,
    metadata: db.metadata,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

/**
 * Transform database message to app message.
 */
export function transformMessage(db: DbMessagingMessage): MessagingMessage {
  return {
    id: db.id,
    conversationId: db.conversation_id,
    externalId: db.external_id ?? undefined,
    direction: db.direction,
    contentType: db.content_type,
    content: db.content,
    replyToMessageId: db.reply_to_message_id ?? undefined,
    status: db.status,
    errorCode: db.error_code ?? undefined,
    errorMessage: db.error_message ?? undefined,
    sentAt: db.sent_at ?? undefined,
    deliveredAt: db.delivered_at ?? undefined,
    readAt: db.read_at ?? undefined,
    failedAt: db.failed_at ?? undefined,
    senderName: db.sender_name ?? undefined,
    senderProfileUrl: db.sender_profile_url ?? undefined,
    metadata: db.metadata,
    createdAt: db.created_at,
  };
}

/**
 * Check if conversation window is expired.
 * Only applies to WhatsApp via official Meta Cloud API ('meta-cloud' provider).
 * Unofficial providers (z-api, etc.) have no 24h window restriction.
 */
export function isWindowExpired(conversation: MessagingConversation, channelProvider?: string): boolean {
  if (channelProvider && channelProvider !== 'meta-cloud') return false;
  if (!conversation.windowExpiresAt) return false;
  return new Date(conversation.windowExpiresAt) < new Date();
}

/**
 * Get minutes remaining in conversation window.
 */
export function getWindowMinutesRemaining(conversation: MessagingConversation): number | undefined {
  if (!conversation.windowExpiresAt) return undefined;
  const diff = new Date(conversation.windowExpiresAt).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60));
}

/**
 * Create a text message content object.
 */
export function createTextContent(text: string): TextContent {
  return { type: 'text', text };
}

/**
 * Get preview text for a message content.
 */
export function getMessagePreview(content: MessageContent): string {
  switch (content.type) {
    case 'text':
      return content.text.slice(0, 100);
    case 'image':
      return content.caption || '[Imagem]';
    case 'video':
      return content.caption || '[Video]';
    case 'audio':
      return '[Audio]';
    case 'document':
      return content.fileName || '[Documento]';
    case 'sticker':
      return '[Sticker]';
    case 'location':
      return content.name || '[Localização]';
    case 'contact':
      return content.contacts[0]?.name.formattedName || '[Contato]';
    case 'template':
      return `[Template: ${content.templateName}]`;
    case 'interactive':
      return content.body.text.slice(0, 100);
    case 'reaction':
      return content.emoji;
    default:
      return '[Mensagem]';
  }
}

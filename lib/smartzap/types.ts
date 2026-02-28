/**
 * Tipos para integração com SmartZap como provedor WhatsApp
 */

// ---------------------------------------------------------------------------
// Canal WhatsApp (configuração do SmartZap)
// ---------------------------------------------------------------------------

export interface WhatsAppChannel {
  id: string
  name: string
  provider: 'smartzap'
  smartzapUrl?: string
  smartzapApiKey?: string
  webhookSecret?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------

export interface WhatsAppConversation {
  id: string
  channelId?: string
  contactId?: string
  contactPhone: string
  contactName?: string
  externalConversationId?: string
  status: 'open' | 'resolved' | 'waiting'
  unreadCount: number
  lastMessageAt?: string
  lastMessagePreview?: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'template'
  | 'interactive'
  | 'other'

export type WhatsAppMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
export type WhatsAppMessageDirection = 'inbound' | 'outbound'

export interface WhatsAppMessage {
  id: string
  conversationId: string
  externalMessageId?: string
  direction: WhatsAppMessageDirection
  messageType: WhatsAppMessageType
  content?: string
  mediaUrl?: string
  mediaMimeType?: string
  status: WhatsAppMessageStatus
  errorMessage?: string
  sentAt?: string
  deliveredAt?: string
  readAt?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

// ---------------------------------------------------------------------------
// SmartZap API — Payloads
// ---------------------------------------------------------------------------

export interface SmartZapSendTextPayload {
  to: string
  type: 'text'
  text: string
  previewUrl?: boolean
  replyToMessageId?: string
}

export interface SmartZapSendTemplatePayload {
  to: string
  type: 'template'
  templateName: string
  templateParams?: Record<string, string[]>
}

export type SmartZapSendPayload = SmartZapSendTextPayload | SmartZapSendTemplatePayload

export interface SmartZapSendResult {
  success: boolean
  messageId?: string
  error?: string
  details?: unknown
}

// ---------------------------------------------------------------------------
// Webhook inbound (SmartZap → CRM)
// ---------------------------------------------------------------------------

/**
 * Payload enviado pelo SmartZap para o webhook do CRM
 * quando uma nova mensagem WhatsApp é recebida.
 */
export interface SmartZapInboundWebhookPayload {
  event: 'message.received'
  messageId: string
  from: string              // Telefone do remetente (E.164 ou dígitos)
  contactName?: string
  type: WhatsAppMessageType
  text?: string
  mediaUrl?: string
  mediaMimeType?: string
  timestamp?: string        // ISO 8601
  conversationId?: string   // ID da conversa no SmartZap
  phoneNumberId?: string
}

/**
 * Payload enviado pelo SmartZap para o webhook do CRM
 * quando o status de entrega de uma mensagem muda.
 */
export interface SmartZapStatusWebhookPayload {
  event: 'message.status'
  messageId: string         // external_message_id no CRM
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp?: string
  errorMessage?: string
}

export type SmartZapWebhookPayload =
  | SmartZapInboundWebhookPayload
  | SmartZapStatusWebhookPayload

/**
 * @fileoverview WhatsApp / Evolution API type definitions for FullHouse CRM.
 */

// =============================================================================
// WHATSAPP INSTANCE
// =============================================================================

export type WhatsAppInstanceStatus = 'disconnected' | 'connecting' | 'connected' | 'banned';

export interface WhatsAppInstance {
  id: string;
  organization_id: string;
  instance_id: string;     // Evolution API instance ID
  instance_token: string;  // Evolution API instance apikey
  client_token?: string;   // Deprecated (not used by Evolution API)
  evolution_instance_name?: string; // Evolution API instance name (used in URL paths)
  name: string;
  phone?: string;
  status: WhatsAppInstanceStatus;
  webhook_url?: string;
  ai_enabled: boolean;
  connected_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppInstanceCreate {
  name: string;
}

// =============================================================================
// WHATSAPP CONVERSATIONS
// =============================================================================

export type ConversationStatus = 'open' | 'closed' | 'archived';

export interface WhatsAppConversation {
  id: string;
  instance_id: string;
  organization_id: string;
  phone: string;
  contact_name?: string;
  contact_photo?: string;
  is_group: boolean;
  contact_id?: string;
  status: ConversationStatus;
  ai_active: boolean;
  ai_paused_by?: string;
  ai_paused_at?: string;
  ai_pause_reason?: string;
  last_message_text?: string;
  last_message_at?: string;
  last_message_from_me?: boolean;
  unread_count: number;
  created_at: string;
  updated_at: string;
  // Joined relations
  contact?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
}

// =============================================================================
// WHATSAPP MESSAGES
// =============================================================================

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'reaction'
  | 'poll'
  | 'button_response'
  | 'list_response'
  | 'system';

export type MessageStatus = 'pending' | 'sent' | 'received' | 'read' | 'failed' | 'deleted';

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  organization_id: string;
  evolution_message_id?: string;
  from_me: boolean;
  sender_name?: string;
  message_type: MessageType;
  text_body?: string;
  media_url?: string;
  media_mime_type?: string;
  media_filename?: string;
  media_caption?: string;
  latitude?: number;
  longitude?: number;
  quoted_message_id?: string;
  quoted_text?: string;
  status: MessageStatus;
  sent_by?: string;
  whatsapp_timestamp?: string;
  created_at: string;
}

// =============================================================================
// WHATSAPP AI CONFIGURATION
// =============================================================================

export type AgentTone = 'professional' | 'friendly' | 'casual' | 'formal';

export interface WhatsAppAIConfig {
  id: string;
  instance_id: string;
  organization_id: string;
  agent_name: string;
  agent_role?: string;
  agent_tone: AgentTone;
  system_prompt: string;
  reply_delay_ms: number;
  max_messages_per_conversation?: number;
  auto_pause_on_human_reply: boolean;
  greeting_message?: string;
  away_message?: string;
  transfer_message: string;
  working_hours_start?: string;
  working_hours_end?: string;
  working_days: number[];
  outside_hours_message?: string;
  auto_create_contact: boolean;
  auto_create_deal: boolean;
  default_board_id?: string;
  default_stage_id?: string;
  default_tags: string[];
  // Intelligence features
  memory_enabled: boolean;
  follow_up_enabled: boolean;
  auto_label_enabled: boolean;
  lead_scoring_enabled: boolean;
  summary_enabled: boolean;
  smart_pause_enabled: boolean;
  follow_up_default_delay_minutes: number;
  follow_up_max_per_conversation: number;
  follow_up_quiet_hours_start?: string;
  follow_up_quiet_hours_end?: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppAIConfigUpdate {
  agent_name?: string;
  agent_role?: string;
  agent_tone?: AgentTone;
  system_prompt?: string;
  reply_delay_ms?: number;
  max_messages_per_conversation?: number;
  auto_pause_on_human_reply?: boolean;
  greeting_message?: string;
  away_message?: string;
  transfer_message?: string;
  working_hours_start?: string | null;
  working_hours_end?: string | null;
  working_days?: number[];
  outside_hours_message?: string;
  auto_create_contact?: boolean;
  auto_create_deal?: boolean;
  default_board_id?: string | null;
  default_stage_id?: string | null;
  default_tags?: string[];
  // Intelligence features
  memory_enabled?: boolean;
  follow_up_enabled?: boolean;
  auto_label_enabled?: boolean;
  lead_scoring_enabled?: boolean;
  summary_enabled?: boolean;
  smart_pause_enabled?: boolean;
  follow_up_default_delay_minutes?: number;
  follow_up_max_per_conversation?: number;
  follow_up_quiet_hours_start?: string | null;
  follow_up_quiet_hours_end?: string | null;
}

// =============================================================================
// EVOLUTION API WEBHOOK PAYLOADS
// =============================================================================

export interface EvolutionWebhookKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export interface EvolutionMessageUpsert {
  event: 'messages.upsert';
  instance: string;
  data: {
    key: EvolutionWebhookKey;
    pushName?: string;
    message: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: {
        url?: string;
        directPath?: string;
        mimetype: string;
        caption?: string;
        jpegThumbnail?: string;
      };
      videoMessage?: {
        url?: string;
        directPath?: string;
        mimetype: string;
        caption?: string;
      };
      audioMessage?: {
        url?: string;
        directPath?: string;
        mimetype: string;
        ptt?: boolean;
      };
      documentMessage?: {
        url?: string;
        directPath?: string;
        mimetype: string;
        title?: string;
        fileName?: string;
      };
      stickerMessage?: {
        url?: string;
        directPath?: string;
        mimetype: string;
      };
      locationMessage?: {
        degreesLatitude: number;
        degreesLongitude: number;
        name?: string;
        address?: string;
      };
      reactionMessage?: {
        key: EvolutionWebhookKey;
        text: string;
      };
      contactMessage?: Record<string, unknown>;
      listResponseMessage?: Record<string, unknown>;
      buttonsResponseMessage?: Record<string, unknown>;
    };
    messageTimestamp: number;
    messageType?: string;
  };
}

export interface EvolutionMessageUpdate {
  event: 'messages.update';
  instance: string;
  data: {
    key: EvolutionWebhookKey;
    update: {
      status: 'PENDING' | 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'PLAYED';
    };
  }[];
}

export interface EvolutionConnectionUpdate {
  event: 'connection.update';
  instance: string;
  data: {
    state: 'open' | 'close' | 'connecting';
    statusReason?: number;
  };
}

export interface EvolutionQRCodeUpdate {
  event: 'qrcode.updated';
  instance: string;
  data: {
    qrcode: {
      pairingCode?: string;
      code?: string;
      base64?: string;
      count?: number;
    };
  };
}

export type EvolutionWebhookPayload =
  | EvolutionMessageUpsert
  | EvolutionMessageUpdate
  | EvolutionConnectionUpdate
  | EvolutionQRCodeUpdate;

// =============================================================================
// AI AGENT LOG
// =============================================================================

export type AILogAction =
  | 'replied'
  | 'paused'
  | 'resumed'
  | 'escalated'
  | 'contact_created'
  | 'deal_created'
  | 'stage_changed'
  | 'tag_added'
  | 'error'
  | 'memory_extracted'
  | 'follow_up_scheduled'
  | 'follow_up_sent'
  | 'follow_up_cancelled'
  | 'label_assigned'
  | 'label_removed'
  | 'lead_score_updated'
  | 'summary_generated'
  | 'intent_detected'
  | 'smart_paused'
  | 'smart_resumed'
  | 'stage_auto_changed'
  | 'deal_auto_updated';

export interface WhatsAppAILog {
  id: string;
  conversation_id: string;
  organization_id: string;
  action: AILogAction;
  details: Record<string, unknown>;
  message_id?: string;
  triggered_by?: string;
  created_at: string;
}

// =============================================================================
// CHAT MEMORY
// =============================================================================

export type MemoryType =
  | 'fact'
  | 'preference'
  | 'objection'
  | 'family'
  | 'timeline'
  | 'budget'
  | 'interest'
  | 'personal'
  | 'interaction';

export interface ChatMemory {
  id: string;
  conversation_id: string;
  organization_id: string;
  contact_id?: string;
  memory_type: MemoryType;
  key: string;
  value: string;
  context?: string;
  source_message_id?: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// SMART FOLLOW-UPS
// =============================================================================

export type FollowUpStatus = 'pending' | 'sent' | 'cancelled' | 'failed' | 'skipped';
export type FollowUpType = 'smart' | 'scheduled' | 'reminder' | 'nurture' | 'reactivation';

export interface WhatsAppFollowUp {
  id: string;
  conversation_id: string;
  organization_id: string;
  instance_id: string;
  trigger_at: string;
  status: FollowUpStatus;
  follow_up_type: FollowUpType;
  detected_intent?: string;
  intent_confidence?: number;
  context: Record<string, unknown>;
  original_customer_message?: string;
  ai_generated_message?: string;
  custom_instructions?: string;
  original_message_id?: string;
  sent_message_id?: string;
  created_by: string;
  max_retries: number;
  retry_count: number;
  created_at: string;
  updated_at: string;
  sent_at?: string;
}

// =============================================================================
// LABELS
// =============================================================================

export interface WhatsAppLabel {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  auto_assign: boolean;
  auto_assign_conditions?: Record<string, unknown>;
  is_system: boolean;
  sort_order: number;
  created_at: string;
}

export interface ConversationLabel {
  id: string;
  conversation_id: string;
  label_id: string;
  organization_id: string;
  assigned_by: string;
  reason?: string;
  assigned_at: string;
  // Joined
  label?: WhatsAppLabel;
}

// =============================================================================
// LEAD SCORING
// =============================================================================

export type LeadTemperature = 'cold' | 'warm' | 'hot' | 'on_fire';
export type BuyingStage =
  | 'awareness'
  | 'interest'
  | 'consideration'
  | 'decision'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export interface LeadScore {
  id: string;
  conversation_id: string;
  organization_id: string;
  contact_id?: string;
  score: number;
  temperature: LeadTemperature;
  factors: Record<string, number>;
  buying_stage: BuyingStage;
  score_history: Array<{ score: number; timestamp: string; reason: string }>;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// CONVERSATION SUMMARIES
// =============================================================================

export type CustomerSentiment = 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';

export interface ConversationSummary {
  id: string;
  conversation_id: string;
  organization_id: string;
  summary: string;
  key_points: string[];
  next_actions: string[];
  customer_sentiment?: CustomerSentiment;
  trigger_reason: string;
  message_range_start?: string;
  message_range_end?: string;
  created_at: string;
}

// =============================================================================
// INTENT DETECTION (used by AI agent internally)
// =============================================================================

export interface DetectedIntent {
  intent: string;
  confidence: number;
  follow_up_delay_minutes?: number;
  customer_message: string;
  context: Record<string, unknown>;
}

export interface ExtractedMemory {
  memory_type: MemoryType;
  key: string;
  value: string;
  context?: string;
  confidence: number;
}

export interface ConversationIntelligence {
  intents: DetectedIntent[];
  memories: ExtractedMemory[];
  sentiment: CustomerSentiment;
  lead_score_delta: number;
  buying_stage?: BuyingStage;
  suggested_labels: string[];
  summary?: string;
  should_pause: boolean;
  pause_reason?: string;
}

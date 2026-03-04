/**
 * Supabase service layer for WhatsApp entities.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WhatsAppInstance,
  WhatsAppInstanceCreate,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppAIConfig,
  WhatsAppAIConfigUpdate,
  WhatsAppAILog,
  AILogAction,
} from '@/types/whatsapp';

// =============================================================================
// INSTANCES
// =============================================================================

export async function getInstances(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<WhatsAppInstance[]> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getInstance(
  supabase: SupabaseClient,
  instanceId: string,
): Promise<WhatsAppInstance | null> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function createInstance(
  supabase: SupabaseClient,
  organizationId: string,
  input: WhatsAppInstanceCreate,
): Promise<WhatsAppInstance> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .insert({
      organization_id: organizationId,
      ...input,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateInstance(
  supabase: SupabaseClient,
  instanceId: string,
  updates: Partial<WhatsAppInstance>,
): Promise<WhatsAppInstance> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', instanceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteInstance(
  supabase: SupabaseClient,
  instanceId: string,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_instances')
    .delete()
    .eq('id', instanceId);

  if (error) throw error;
}

// =============================================================================
// CONVERSATIONS
// =============================================================================

export async function getConversations(
  supabase: SupabaseClient,
  organizationId: string,
  options?: {
    instanceId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
): Promise<WhatsAppConversation[]> {
  let query = supabase
    .from('whatsapp_conversations')
    .select('*, contact:contacts(id, name, email, phone)')
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (options?.instanceId) {
    query = query.eq('instance_id', options.instanceId);
  }
  if (options?.status) {
    query = query.eq('status', options.status);
  }
  if (options?.search) {
    query = query.or(
      `contact_name.ilike.%${options.search}%,phone.ilike.%${options.search}%`,
    );
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options?.limit ?? 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<WhatsAppConversation | null> {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*, contact:contacts(id, name, email, phone)')
    .eq('id', conversationId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function getOrCreateConversation(
  supabase: SupabaseClient,
  organizationId: string,
  instanceId: string,
  phone: string,
  contactName?: string,
  contactPhoto?: string,
  isGroup?: boolean,
): Promise<WhatsAppConversation> {
  // Try to find existing conversation
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('*, contact:contacts(id, name, email, phone)')
    .eq('instance_id', instanceId)
    .eq('phone', phone)
    .single();

  if (existing) {
    // Update contact info if provided
    if (contactName || contactPhoto) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (contactName) updates.contact_name = contactName;
      if (contactPhoto) updates.contact_photo = contactPhoto;
      await supabase
        .from('whatsapp_conversations')
        .update(updates)
        .eq('id', existing.id);
    }
    return existing;
  }

  // Create new conversation
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      instance_id: instanceId,
      organization_id: organizationId,
      phone,
      contact_name: contactName,
      contact_photo: contactPhoto,
      is_group: isGroup ?? false,
    })
    .select('*, contact:contacts(id, name, email, phone)')
    .single();

  if (error) throw error;
  return data;
}

export async function updateConversation(
  supabase: SupabaseClient,
  conversationId: string,
  updates: Partial<WhatsAppConversation>,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) throw error;
}

export async function markConversationRead(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) throw error;
}

// =============================================================================
// MESSAGES
// =============================================================================

export async function getMessages(
  supabase: SupabaseClient,
  conversationId: string,
  options?: { limit?: number; before?: string },
): Promise<WhatsAppMessage[]> {
  let query = supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (options?.before) {
    query = query.lt('created_at', options.before);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function insertMessage(
  supabase: SupabaseClient,
  message: Omit<WhatsAppMessage, 'id' | 'created_at'>,
): Promise<WhatsAppMessage> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert(message)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMessageStatus(
  supabase: SupabaseClient,
  evolutionMessageId: string,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_messages')
    .update({ status })
    .eq('evolution_message_id', evolutionMessageId);

  if (error) throw error;
}

// =============================================================================
// AI CONFIG
// =============================================================================

export async function getAIConfig(
  supabase: SupabaseClient,
  instanceId: string,
): Promise<WhatsAppAIConfig | null> {
  const { data, error } = await supabase
    .from('whatsapp_ai_config')
    .select('*')
    .eq('instance_id', instanceId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data ?? null;
}

export async function upsertAIConfig(
  supabase: SupabaseClient,
  instanceId: string,
  organizationId: string,
  updates: WhatsAppAIConfigUpdate,
): Promise<WhatsAppAIConfig> {
  const { data, error } = await supabase
    .from('whatsapp_ai_config')
    .upsert(
      {
        instance_id: instanceId,
        organization_id: organizationId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'instance_id' },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =============================================================================
// AI LOGS
// =============================================================================

export async function insertAILog(
  supabase: SupabaseClient,
  log: {
    conversation_id: string;
    organization_id: string;
    action: AILogAction;
    details?: Record<string, unknown>;
    message_id?: string;
    triggered_by?: string;
  },
): Promise<WhatsAppAILog> {
  const { data, error } = await supabase
    .from('whatsapp_ai_logs')
    .insert({
      ...log,
      details: log.details ?? {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAILogs(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 50,
): Promise<WhatsAppAILog[]> {
  const { data, error } = await supabase
    .from('whatsapp_ai_logs')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

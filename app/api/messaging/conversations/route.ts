import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { normalizePhoneE164 } from '@/lib/phone';
import type { ConversationStatus, ConversationPriority } from '@/lib/messaging/types';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * GET /api/messaging/conversations
 * Lista conversas da organização do usuário
 */
export async function GET(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  // Parse query params
  const url = new URL(req.url);
  const status = url.searchParams.get('status') as ConversationStatus | 'all' | null;
  const channelId = url.searchParams.get('channelId');
  const businessUnitId = url.searchParams.get('businessUnitId');
  const assignedUserId = url.searchParams.get('assignedUserId');
  const hasUnread = url.searchParams.get('hasUnread');
  const search = url.searchParams.get('search');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Build query
  let query = supabase
    .from('messaging_conversations')
    .select(`
      *,
      messaging_channels (
        id,
        name,
        channel_type,
        provider
      ),
      contacts (
        id,
        name,
        email,
        phone
      ),
      profiles!messaging_conversations_assigned_user_id_fkey (
        id,
        email
      )
    `, { count: 'exact' })
    .eq('organization_id', profile.organization_id);

  // Apply filters
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (channelId) {
    query = query.eq('channel_id', channelId);
  }

  if (businessUnitId) {
    query = query.eq('business_unit_id', businessUnitId);
  }

  if (assignedUserId === 'unassigned') {
    query = query.is('assigned_user_id', null);
  } else if (assignedUserId) {
    query = query.eq('assigned_user_id', assignedUserId);
  }

  if (hasUnread === 'true') {
    query = query.gt('unread_count', 0);
  }

  if (search) {
    query = query.or(`external_contact_name.ilike.%${search}%,external_contact_id.ilike.%${search}%`);
  }

  // Ordering and pagination
  query = query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  const { data: conversations, error, count } = await query;

  if (error) {
    console.error('Error fetching conversations:', error);
    return json({ error: 'Internal server error' }, 500);
  }

  return json({
    conversations: conversations || [],
    total: count || 0,
    limit,
    offset,
  });
}

/**
 * POST /api/messaging/conversations
 * Cria uma nova conversa (iniciar conversa proativamente)
 */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  let body: {
    channelId: string;
    externalContactId: string;
    externalContactName?: string;
    contactId?: string;
    priority?: ConversationPriority;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Validação básica
  if (!body.channelId || !body.externalContactId) {
    return json({ error: 'Missing required fields: channelId, externalContactId' }, 400);
  }

  // Buscar canal
  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('id, organization_id, business_unit_id, channel_type, status')
    .eq('id', body.channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single();

  if (channelError || !channel) {
    return json({ error: 'Channel not found' }, 404);
  }

  if (channel.status !== 'connected') {
    return json({ error: 'Channel is not connected' }, 400);
  }

  // Normalizar telefone se for WhatsApp
  let normalizedContactId = body.externalContactId;
  if (channel.channel_type === 'whatsapp') {
    const normalized = normalizePhoneE164(body.externalContactId);
    if (normalized) {
      normalizedContactId = normalized;
    }
  }

  // Verificar se já existe conversa
  const { data: existingConv } = await supabase
    .from('messaging_conversations')
    .select('id')
    .eq('channel_id', body.channelId)
    .eq('external_contact_id', normalizedContactId)
    .maybeSingle();

  if (existingConv) {
    return json({ error: 'Conversation already exists', conversationId: existingConv.id }, 409);
  }

  // Tentar encontrar contato por telefone se não fornecido
  let contactId = body.contactId;
  if (!contactId && channel.channel_type === 'whatsapp') {
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('phone', normalizedContactId)
      .is('deleted_at', null)
      .maybeSingle();

    if (contact) {
      contactId = contact.id;
    }
  }

  // Criar conversa
  const { data: conversation, error: createError } = await supabase
    .from('messaging_conversations')
    .insert({
      organization_id: profile.organization_id,
      channel_id: body.channelId,
      business_unit_id: channel.business_unit_id,
      external_contact_id: normalizedContactId,
      external_contact_name: body.externalContactName || normalizedContactId,
      contact_id: contactId || null,
      status: 'open',
      priority: body.priority || 'normal',
    })
    .select()
    .single();

  if (createError) {
    console.error('Error creating conversation:', createError);
    return json({ error: createError.message }, 500);
  }

  return json({ conversation }, 201);
}

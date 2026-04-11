import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import type { ChannelType } from '@/lib/messaging/types';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * GET /api/messaging/channels
 * Lista todos os canais da organização do usuário
 */
export async function GET() {
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

  // Apenas admins podem gerenciar canais
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  const { data: channels, error } = await supabase
    .from('messaging_channels')
    .select(`
      id,
      organization_id,
      business_unit_id,
      channel_type,
      provider,
      external_identifier,
      name,
      status,
      status_message,
      last_connected_at,
      settings,
      created_at,
      updated_at,
      business_units (
        id,
        name,
        key
      )
    `)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching channels:', error);
    return json({ error: 'Internal server error' }, 500);
  }

  return json({ channels: channels || [] });
}

/**
 * POST /api/messaging/channels
 * Cria um novo canal de messaging
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

  // Apenas admins podem criar canais
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  let body: {
    business_unit_id: string;
    channel_type: ChannelType;
    provider: string;
    external_identifier: string;
    name: string;
    credentials: Record<string, string>;
    settings?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Validação básica
  const requiredFields = ['business_unit_id', 'channel_type', 'provider', 'external_identifier', 'name', 'credentials'];
  for (const field of requiredFields) {
    if (!body[field as keyof typeof body]) {
      return json({ error: `Missing required field: ${field}` }, 400);
    }
  }

  // Verificar se business_unit pertence à organização
  const { data: businessUnit, error: buError } = await supabase
    .from('business_units')
    .select('id')
    .eq('id', body.business_unit_id)
    .eq('organization_id', profile.organization_id)
    .single();

  if (buError || !businessUnit) {
    return json({ error: 'Business unit not found or not accessible' }, 404);
  }

  // Verificar se já existe canal com mesmo identificador
  const { data: existingChannel } = await supabase
    .from('messaging_channels')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('channel_type', body.channel_type)
    .eq('external_identifier', body.external_identifier)
    .is('deleted_at', null)
    .maybeSingle();

  if (existingChannel) {
    return json({ error: 'Channel with this identifier already exists' }, 409);
  }

  // Criar canal
  const { data: channel, error: createError } = await supabase
    .from('messaging_channels')
    .insert({
      organization_id: profile.organization_id,
      business_unit_id: body.business_unit_id,
      channel_type: body.channel_type,
      provider: body.provider,
      external_identifier: body.external_identifier,
      name: body.name,
      credentials: body.credentials,
      settings: body.settings || {},
      status: 'pending',
    })
    .select()
    .single();

  if (createError) {
    console.error('Error creating channel:', createError);
    return json({ error: createError.message }, 500);
  }

  return json({ channel }, 201);
}

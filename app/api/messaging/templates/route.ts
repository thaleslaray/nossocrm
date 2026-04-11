import { createClient } from '@/lib/supabase/server';
import { transformTemplate } from '@/lib/messaging/types';
import type { DbMessagingTemplate } from '@/lib/messaging/types';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * GET /api/messaging/templates
 * Lista templates de um canal específico
 *
 * Query params:
 * - channelId (required): ID do canal
 * - status (optional): Filtrar por status (approved, pending, rejected, paused)
 * - category (optional): Filtrar por categoria (marketing, utility, authentication)
 *
 * Returns: { templates: MessagingTemplate[] }
 */
export async function GET(req: Request) {
  const supabase = await createClient();

  // Autenticação
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  // Buscar profile
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
  const channelId = url.searchParams.get('channelId');
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');

  if (!channelId) {
    return json({ error: 'Missing required query param: channelId' }, 400);
  }

  // Verificar que o canal pertence à organização do usuário
  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('id')
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single();

  if (channelError || !channel) {
    return json({ error: 'Channel not found' }, 404);
  }

  // Buscar templates
  let query = supabase
    .from('messaging_templates')
    .select('*')
    .eq('channel_id', channelId);

  if (status) {
    query = query.eq('status', status);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data: templates, error } = await query.order('name');

  if (error) {
    console.error('Error fetching templates:', error);
    return json({ error: 'Internal server error' }, 500);
  }

  // Transform to app format
  const transformedTemplates = (templates as DbMessagingTemplate[]).map(transformTemplate);

  return json({ templates: transformedTemplates });
}

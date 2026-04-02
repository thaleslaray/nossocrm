import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { MetaCloudWhatsAppProvider } from '@/lib/messaging/providers/whatsapp/meta-cloud.provider';
import type { DbMessagingTemplate } from '@/lib/messaging/types';

export const maxDuration = 60;

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * POST /api/messaging/templates/sync
 * Sincroniza templates do Meta WhatsApp Cloud API para o banco de dados
 *
 * Body: { channelId: string }
 * Returns: { success: boolean, templates: MessagingTemplate[], synced: number }
 */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

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

  // Apenas admins podem sincronizar templates
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  // Parse body
  let body: { channelId: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.channelId) {
    return json({ error: 'Missing required field: channelId' }, 400);
  }

  // Buscar canal com credentials
  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('*')
    .eq('id', body.channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single();

  if (channelError || !channel) {
    return json({ error: 'Channel not found' }, 404);
  }

  // Verificar se é canal Meta Cloud
  if (channel.provider !== 'meta-cloud') {
    return json(
      { error: 'Templates sync is only supported for Meta Cloud API channels' },
      400
    );
  }

  // Verificar se tem WABA ID nas credentials
  const credentials = channel.credentials as Record<string, string>;
  if (!credentials.wabaId) {
    return json(
      { error: 'WhatsApp Business Account ID (wabaId) is required to sync templates' },
      400
    );
  }

  try {
    // Instanciar provider
    const provider = new MetaCloudWhatsAppProvider();
    await provider.initialize({
      channelId: channel.id,
      channelType: 'whatsapp',
      provider: 'meta-cloud',
      externalIdentifier: channel.external_identifier,
      credentials: credentials,
      settings: channel.settings as Record<string, unknown>,
    });

    // Sincronizar templates do Meta
    const result = await provider.syncTemplates();

    if (!result.success) {
      return json(
        { error: result.error?.message || 'Failed to sync templates' },
        500
      );
    }

    // Upsert templates no banco
    const templates = result.templates || [];
    const now = new Date().toISOString();

    const upsertData: Partial<DbMessagingTemplate>[] = templates.map((t) => ({
      channel_id: channel.id,
      external_id: t.externalId,
      name: t.name,
      language: t.language,
      category: t.category,
      components: t.components,
      status: t.status,
      rejection_reason: t.rejectionReason || null,
      updated_at: now,
    }));

    // Upsert em paralelo usando external_id + channel_id como chave
    const upsertResults = await Promise.all(
      upsertData.map((template) =>
        supabase
          .from('messaging_templates')
          .upsert(template, { onConflict: 'channel_id,name,language' })
          .then(({ error }) => {
            if (error) {
              console.error('Error upserting template:', error, template.name);
            }
            return !error;
          })
      )
    );
    const syncedCount = upsertResults.filter(Boolean).length;

    // Buscar templates atualizados
    const { data: savedTemplates } = await supabase
      .from('messaging_templates')
      .select('*')
      .eq('channel_id', channel.id)
      .order('name');

    return json({
      success: true,
      synced: syncedCount,
      total: templates.length,
      templates: savedTemplates || [],
    });
  } catch (error) {
    console.error('Error syncing templates:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
}

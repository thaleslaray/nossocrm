import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { ChannelProviderFactory } from '@/lib/messaging';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/messaging/channels/[id]/qr-code
 * Obtém QR code para conexão do canal Z-API
 */
export async function POST(req: Request, { params }: RouteParams) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { id: channelId } = await params;
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

  // Buscar canal
  const { data: channel, error: channelError } = await supabase
    .from('messaging_channels')
    .select('id, channel_type, provider, external_identifier, credentials, status')
    .eq('id', channelId)
    .eq('organization_id', profile.organization_id)
    .is('deleted_at', null)
    .single();

  if (channelError || !channel) {
    return json({ error: 'Channel not found' }, 404);
  }

  // Verificar se é canal Z-API
  if (channel.channel_type !== 'whatsapp' || channel.provider !== 'z-api') {
    return json({ error: 'QR code is only available for Z-API WhatsApp channels' }, 400);
  }

  // Verificar se já está conectado
  if (channel.status === 'connected') {
    return json({ error: 'Channel is already connected' }, 400);
  }

  try {
    // Criar provider e obter QR code
    const provider = ChannelProviderFactory.createProvider('whatsapp', 'z-api');

    await provider.initialize({
      channelId: channel.id,
      channelType: 'whatsapp',
      provider: 'z-api',
      externalIdentifier: channel.external_identifier,
      credentials: channel.credentials as Record<string, string>,
    });

    // Chamar método específico do Z-API provider
    if (!('getQrCode' in provider)) {
      return json({ error: 'Provider does not support QR code' }, 500);
    }

    const qrResult = await (provider as { getQrCode: () => Promise<{ qrCode: string; expiresAt: string }> }).getQrCode();

    // Atualizar status do canal para waiting_qr
    await supabase
      .from('messaging_channels')
      .update({
        status: 'waiting_qr',
        updated_at: new Date().toISOString(),
      })
      .eq('id', channelId);

    return json({
      qrCode: qrResult.qrCode,
      expiresAt: qrResult.expiresAt,
    });
  } catch (error) {
    console.error('Error getting QR code:', error);

    // Atualizar status do canal para error
    await supabase
      .from('messaging_channels')
      .update({
        status: 'error',
        status_message: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', channelId);

    return json({
      error: error instanceof Error ? error.message : 'Failed to get QR code'
    }, 500);
  }
}

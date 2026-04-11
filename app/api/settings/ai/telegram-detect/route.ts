import { createClient } from '@/lib/supabase/server';
import { detectRecentTelegramMessage } from '@/lib/notifications/telegram';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.organization_id) return json({ error: 'Organization not found' }, 404);
  if (profile.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const { data: org } = await supabase
    .from('organization_settings')
    .select('telegram_bot_token')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (!org?.telegram_bot_token) {
    return json({ error: 'Token não configurado' }, 400);
  }

  try {
    const msg = await detectRecentTelegramMessage(org.telegram_bot_token);
    if (!msg) return json({ found: false });

    // Salva o chat_id detectado
    await supabase
      .from('organization_settings')
      .upsert(
        {
          organization_id: profile.organization_id,
          telegram_chat_id: String(msg.chatId),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
      );

    return json({ found: true, chatId: msg.chatId, firstName: msg.firstName, username: msg.username });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return json({ error: message }, 502);
  }
}

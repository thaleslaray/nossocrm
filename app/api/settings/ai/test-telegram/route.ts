import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
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
    .select('telegram_bot_token, telegram_chat_id')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (!org?.telegram_bot_token || !org?.telegram_chat_id) {
    return json({ error: 'Telegram não configurado. Salve o token e o Chat ID primeiro.' }, 400);
  }

  try {
    await sendTelegramMessage(
      org.telegram_bot_token,
      org.telegram_chat_id,
      '✅ <b>NossoCRM — Teste de notificação</b>\n\nSe você recebeu esta mensagem, as notificações de handoff estão configuradas corretamente!',
    );
    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return json({ error: `Falha ao enviar: ${message}` }, 502);
  }
}

import { createClient } from '@/lib/supabase/server';
import { getTelegramBotInfo } from '@/lib/notifications/telegram';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function GET(): Promise<Response> {
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
    const info = await getTelegramBotInfo(org.telegram_bot_token);
    return json({ username: info.username, firstName: info.firstName });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return json({ error: message }, 502);
  }
}

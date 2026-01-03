import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function asOptionalString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function POST(req: Request) {
  // Mitigação CSRF: endpoint autenticado por cookies.
  if (!isAllowedOrigin(req)) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json().catch(() => null) as any;
  const conversationId = asOptionalString(body?.conversationId);

  if (!conversationId) {
    return new Response('conversationId obrigatório', { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  const organizationId = profile?.organization_id ?? null;
  if (!organizationId) {
    return new Response('Profile sem organização', { status: 409 });
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('gptmaker_conversations')
    .update({
      human_takeover_at: now,
      human_takeover_by: user.id,
      updated_at: now,
    })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
}

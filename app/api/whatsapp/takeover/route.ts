import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function asOptionalString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function isMissingTableError(message: string) {
  const m = message.toLowerCase();
  return m.includes("could not find the table") && m.includes('whatsapp_conversations');
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

  // Estratégia de migração: tenta WhatsApp nativo primeiro, depois legado GPTMaker.
  const { data: waUpdated, error: waErr } = await supabase
    .from('whatsapp_conversations')
    .update({
      human_takeover_at: now,
      human_takeover_by: user.id,
      updated_at: now,
    })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle();

  if (waErr) {
    if (isMissingTableError(waErr.message)) {
      return new Response(
        'Tabela whatsapp_conversations não existe neste projeto Supabase. Aplique as migrations em supabase/migrations/20260104010000_whatsapp_core.sql e 20260104020000_whatsapp_zapi_singleton.sql no mesmo projeto configurado em NEXT_PUBLIC_SUPABASE_URL.',
        { status: 500 }
      );
    }
    return new Response(waErr.message, { status: 500 });
  }

  if (!waUpdated) {
    const { data: legacyUpdated, error: legacyErr } = await supabase
      .from('gptmaker_conversations')
      .update({
        human_takeover_at: now,
        human_takeover_by: user.id,
        updated_at: now,
      })
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .select('id')
      .maybeSingle();

    if (legacyErr) {
      return new Response(legacyErr.message, { status: 500 });
    }

    if (!legacyUpdated) {
      return new Response('Conversa não encontrada', { status: 404 });
    }
  }

  return Response.json({ ok: true }, { status: 200 });
}

import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function asOptionalString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function GET(req: Request) {
  // Mitigação CSRF: endpoint autenticado por cookies.
  if (!isAllowedOrigin(req)) {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const contactId = asOptionalString(url.searchParams.get('contactId'));
  const dealId = asOptionalString(url.searchParams.get('dealId'));

  if (!contactId) {
    return Response.json({ conversation: null, messages: [] }, { status: 200 });
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  let organizationId = profile?.organization_id ?? null;

  // Best-effort: infer org from deal (se vier) quando profile tá incompleto.
  if (!organizationId && dealId) {
    const { data: deal } = await supabase
      .from('deals')
      .select('organization_id')
      .eq('id', dealId)
      .maybeSingle();
    organizationId = deal?.organization_id ?? null;
  }

  if (!organizationId) {
    return new Response('Profile sem organização', { status: 409 });
  }

  // Seleciona conversa mais recente do contato
  const { data: conversation, error: convErr } = await supabase
    .from('gptmaker_conversations')
    .select('id, context_id, channel, contact_phone, contact_name, human_takeover_at, human_takeover_by, last_message_at')
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (convErr) {
    return Response.json({ error: convErr.message }, { status: 500 });
  }

  if (!conversation) {
    return Response.json({ conversation: null, messages: [] }, { status: 200 });
  }

  const { data: messages, error: msgErr } = await supabase
    .from('gptmaker_messages')
    .select('id, role, text, sent_at')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .order('sent_at', { ascending: true });

  if (msgErr) {
    return Response.json({ error: msgErr.message }, { status: 500 });
  }

  return Response.json({ conversation, messages: messages ?? [] }, { status: 200 });
}

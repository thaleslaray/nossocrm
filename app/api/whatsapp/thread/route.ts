import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { normalizePhoneE164 } from '@/lib/phone';

function asOptionalString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function isMissingTableError(message: string) {
  // Supabase/PostgREST error for missing table in schema cache typically looks like:
  // "Could not find the table 'public.whatsapp_conversations' in the schema cache"
  const m = message.toLowerCase();
  return (
    m.includes("could not find the table") &&
    (m.includes('whatsapp_conversations') || m.includes('whatsapp_messages'))
  );
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

  // Estratégia de migração: tenta WhatsApp nativo primeiro (whatsapp_*), senão cai no legado (gptmaker_*).

  // Busca telefone do contato (para fallback por contact_phone quando a ingestão não conseguiu resolver contact_id)
  const { data: contactRow } = await supabase
    .from('contacts')
    .select('phone')
    .eq('organization_id', organizationId)
    .eq('id', contactId)
    .maybeSingle();

  const contactPhoneE164 = normalizePhoneE164(contactRow?.phone ?? null, { defaultCountry: 'BR' }) || null;

  // 1) WhatsApp nativo
  const { data: waConversation, error: waConvErr } = await supabase
    .from('whatsapp_conversations')
    .select(
      'id, provider_conversation_id, channel, contact_phone, human_takeover_at, human_takeover_by, last_message_at, contact:contacts(name)'
    )
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (waConvErr) {
    if (isMissingTableError(waConvErr.message)) {
      return new Response(
        'Tabelas do WhatsApp Lite não existem neste projeto Supabase. Aplique as migrations em supabase/migrations/20260104010000_whatsapp_core.sql e 20260104020000_whatsapp_zapi_singleton.sql no mesmo projeto configurado em NEXT_PUBLIC_SUPABASE_URL.',
        { status: 500 }
      );
    }

    return Response.json({ error: waConvErr.message }, { status: 500 });
  }

  // Fallback: se a conversa nativa foi ingerida sem contact_id, tenta casar por telefone.
  const waConversationByPhone =
    !waConversation && contactPhoneE164
      ? (
          await supabase
            .from('whatsapp_conversations')
            .select(
              'id, provider_conversation_id, channel, contact_phone, human_takeover_at, human_takeover_by, last_message_at, contact:contacts(name)'
            )
            .eq('organization_id', organizationId)
            .eq('contact_phone', contactPhoneE164)
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        )
      : null;

  const waConversationFinal = waConversation ?? waConversationByPhone?.data ?? null;
  const waConvPhoneErr = waConversationByPhone?.error ?? null;

  if (waConvPhoneErr) {
    if (isMissingTableError(waConvPhoneErr.message)) {
      return new Response(
        'Tabelas do WhatsApp Lite não existem neste projeto Supabase. Aplique as migrations em supabase/migrations/20260104010000_whatsapp_core.sql e 20260104020000_whatsapp_zapi_singleton.sql no mesmo projeto configurado em NEXT_PUBLIC_SUPABASE_URL.',
        { status: 500 }
      );
    }
    return Response.json({ error: waConvPhoneErr.message }, { status: 500 });
  }

  if (waConversationFinal) {
    const { data: waMessages, error: waMsgErr } = await supabase
      .from('whatsapp_messages')
      .select('id, role, text, sent_at')
      .eq('organization_id', organizationId)
      .eq('conversation_id', waConversationFinal.id)
      .order('sent_at', { ascending: true });

    if (waMsgErr) {
      if (isMissingTableError(waMsgErr.message)) {
        return new Response(
          'Tabelas do WhatsApp Lite não existem neste projeto Supabase. Aplique as migrations em supabase/migrations/20260104010000_whatsapp_core.sql e 20260104020000_whatsapp_zapi_singleton.sql no mesmo projeto configurado em NEXT_PUBLIC_SUPABASE_URL.',
          { status: 500 }
        );
      }

      return Response.json({ error: waMsgErr.message }, { status: 500 });
    }

    const conversation = {
      id: waConversationFinal.id,
      context_id: waConversationFinal.provider_conversation_id,
      channel: waConversationFinal.channel,
      contact_phone: waConversationFinal.contact_phone,
      contact_name: (waConversationFinal as any)?.contact?.name ?? null,
      human_takeover_at: waConversationFinal.human_takeover_at,
      human_takeover_by: waConversationFinal.human_takeover_by,
      last_message_at: waConversationFinal.last_message_at,
    };

    return Response.json({ conversation, messages: waMessages ?? [] }, { status: 200 });
  }

  // 2) Legado GPTMaker
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

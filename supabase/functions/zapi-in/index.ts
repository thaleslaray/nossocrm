/**
 * Webhook de entrada Z-API (WhatsApp Lite).
 *
 * Rota (Supabase Edge Functions):
 * - `POST /functions/v1/zapi-in/<token>`
 *
 * Autenticação:
 * - Token na URL (webhook_token de whatsapp_accounts).
 *
 * Comportamento:
 * - Normaliza telefone para E.164 (assume BR)
 * - Resolve contato/deal best-effort
 * - Upsert de conversa por (organization_id, account_id, provider_conversation_id)
 * - Dedupe de mensagens por provider_message_id
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { parsePhoneNumberFromString } from "npm:libphonenumber-js@1";

type ZapiInbound = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getTokenFromPath(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "zapi-in");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

function toOptionalString(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normalizePhoneBrE164(raw?: string) {
  if (!raw) return undefined;
  const parsed = parsePhoneNumberFromString(raw, "BR");
  if (parsed?.isValid()) return parsed.number;
  return undefined;
}

function digitsOnly(v?: string) {
  if (!v) return undefined;
  const d = v.replace(/\D+/g, "");
  return d ? d : undefined;
}

function parseSentAtBestEffort(payload: ZapiInbound): string {
  const candidates = [
    payload["timestamp"],
    payload["time"],
    payload["date"],
    payload["createdAt"],
    payload["created_at"],
  ];

  for (const c of candidates) {
    if (typeof c === "string") {
      const dt = new Date(c);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
    if (typeof c === "number") {
      const dt = new Date(c);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }

  return new Date().toISOString();
}

function pickText(payload: ZapiInbound): string | undefined {
  const keys = ["text", "message", "mensagem", "body", "content"];
  for (const k of keys) {
    const v = toOptionalString(payload[k]);
    if (v) return v;
  }

  const msg = payload["msg"];
  if (msg && typeof msg === "object") {
    for (const k of keys) {
      const v = toOptionalString((msg as Record<string, unknown>)[k]);
      if (v) return v;
    }
  }

  return undefined;
}

function pickFromPhone(payload: ZapiInbound): string | undefined {
  const keys = ["phone", "from", "sender", "remoteJid", "participant", "chatId"];
  for (const k of keys) {
    const v = toOptionalString(payload[k]);
    if (v) return v;
  }
  const msg = payload["msg"];
  if (msg && typeof msg === "object") {
    for (const k of keys) {
      const v = toOptionalString((msg as Record<string, unknown>)[k]);
      if (v) return v;
    }
  }
  return undefined;
}

function pickMessageId(payload: ZapiInbound): string | undefined {
  const keys = ["messageId", "message_id", "id", "msgId", "keyId"];
  for (const k of keys) {
    const v = toOptionalString(payload[k]);
    if (v) return v;
  }
  const msg = payload["msg"];
  if (msg && typeof msg === "object") {
    for (const k of keys) {
      const v = toOptionalString((msg as Record<string, unknown>)[k]);
      if (v) return v;
    }
    const key = (msg as Record<string, unknown>)["key"];
    if (key && typeof key === "object") {
      const v = toOptionalString((key as Record<string, unknown>)["id"]);
      if (v) return v;
    }
  }
  return undefined;
}

function pickConversationId(payload: ZapiInbound, phoneE164?: string, msgId?: string): string {
  // Precisa ser estável para threading: preferimos algo que a Z-API envie (chatId/remoteJid).
  const candidateKeys = ["chatId", "remoteJid", "conversationId", "conversation_id", "from"];
  for (const k of candidateKeys) {
    const v = toOptionalString(payload[k]);
    if (v) return v;
  }
  const msg = payload["msg"];
  if (msg && typeof msg === "object") {
    for (const k of candidateKeys) {
      const v = toOptionalString((msg as Record<string, unknown>)[k]);
      if (v) return v;
    }
  }

  // Fallback: por telefone (e164 ou dígitos). Evita quebrar por falta de chave.
  return phoneE164 ?? digitsOnly(phoneE164) ?? msgId ?? crypto.randomUUID();
}

async function selectDefaultBoard(
  supabase: ReturnType<typeof createClient>,
  organizationId: string
): Promise<string | null> {
  // T065: Selecionar board default (is_default=true, senão primeiro por created_at)
  const { data: board } = await supabase
    .from("boards")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return board?.id ?? null;
}

async function selectDefaultStage(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  boardId: string
): Promise<string | null> {
  // T066: Selecionar stage default (menor order)
  const { data: stage } = await supabase
    .from("board_stages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("board_id", boardId)
    .order("order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return stage?.id ?? null;
}

async function createOrGetDealForContact(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  contactId: string
): Promise<string | null> {
  // T069: Tratar duplicidade de deals no retry
  // 1) Buscar deal aberto existente do contato
  const { data: existingDeal } = await supabase
    .from("deals")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("is_won", false)
    .eq("is_lost", false)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingDeal?.id) return existingDeal.id;

  // 2) Selecionar board/stage default para novo deal
  const boardId = await selectDefaultBoard(supabase, organizationId);
  if (!boardId) return null;

  const stageId = await selectDefaultStage(supabase, organizationId, boardId);
  if (!stageId) return null;

  // 3) Resolver nome do contato (best-effort)
  const { data: contact } = await supabase
    .from("contacts")
    .select("name")
    .eq("id", contactId)
    .single();

  const contactName = contact?.name ?? "Lead WhatsApp";
  const dealTitle = `WhatsApp - ${contactName}`;

  // 4) Criar novo deal (com defaults do repo)
  const { data: newDeal, error: dealErr } = await supabase
    .from("deals")
    .insert({
      organization_id: organizationId,
      title: dealTitle,
      board_id: boardId,
      stage_id: stageId,
      contact_id: contactId,
      status: "open",
      value: 0,
      probability: 0,
      is_won: false,
      is_lost: false,
    })
    .select("id")
    .single();

  if (dealErr) {
    // T069: Se trigger de duplicidade retornar erro unique, fazer retry com fetch
    if (dealErr.code === "23505" || dealErr.message?.includes("unique")) {
      const { data: retryDeal } = await supabase
        .from("deals")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .eq("is_won", false)
        .eq("is_lost", false)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return retryDeal?.id ?? null;
    }
    return null;
  }

  return newDeal?.id ?? null;
}

async function bestEffortResolveContactAndDeal(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  phoneE164?: string
): Promise<{ contactId: string | null; dealId: string | null }> {
  if (!phoneE164) return { contactId: null, dealId: null };

  // 1) Match exato em E.164
  const { data: contactExact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phoneE164)
    .maybeSingle();

  let contactId = contactExact?.id ?? null;

  // T067: Se não encontrou contato, criar automaticamente
  if (!contactId) {
    const contactName = `WhatsApp ${phoneE164}`;
    const { data: newContact, error: contactErr } = await supabase
      .from("contacts")
      .insert({
        organization_id: organizationId,
        name: contactName,
        phone: phoneE164,
        stage: "LEAD",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    if (contactErr) {
      // Best-effort: se duplicidade, buscar contato existente
      if (contactErr.code === "23505" || contactErr.message?.includes("unique")) {
        const { data: retryContact } = await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("phone", phoneE164)
          .maybeSingle();

        contactId = retryContact?.id ?? null;
      }
    } else {
      contactId = newContact?.id ?? null;
    }
  }

  if (!contactId) return { contactId: null, dealId: null };

  // T068: Criar ou buscar deal aberto do contato
  const dealId = await createOrGetDealForContact(supabase, organizationId, contactId);

  return { contactId, dealId: dealId ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  const token = getTokenFromPath(req);
  if (!token) return json(404, { error: "token ausente na URL" });

  const supabaseUrl = Deno.env.get("CRM_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("CRM_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "Supabase não configurado no runtime" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: account, error: accountErr } = await supabase
    .from("whatsapp_accounts")
    .select("id, organization_id, active, provider")
    .eq("webhook_token", token)
    .maybeSingle();

  if (accountErr) return json(500, { error: "Erro ao buscar account", details: accountErr.message });
  if (!account || !account.active) return json(404, { error: "Account não encontrada/inativa" });

  let payload: ZapiInbound;
  try {
    payload = (await req.json()) as ZapiInbound;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  // Direção/role: Z-API tende a mandar eventos inbound do cliente.
  const text = pickText(payload);
  const fromRaw = pickFromPhone(payload);
  const fromE164 = normalizePhoneBrE164(fromRaw) ?? normalizePhoneBrE164(digitsOnly(fromRaw));
  const sentAt = parseSentAtBestEffort(payload);
  const providerMessageId = pickMessageId(payload);
  const providerConversationId = pickConversationId(payload, fromE164, providerMessageId);

  // Resolve contato/deal pelo telefone
  const { contactId, dealId } = await bestEffortResolveContactAndDeal(
    supabase,
    account.organization_id,
    fromE164
  );

  const { data: conversation, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .upsert(
      {
        organization_id: account.organization_id,
        account_id: account.id,
        provider_conversation_id: providerConversationId,
        channel: "WHATSAPP",
        contact_phone: fromE164 ?? null,
        contact_id: contactId,
        deal_id: dealId,
        last_message_at: sentAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,account_id,provider_conversation_id" }
    )
    .select("id, provider_conversation_id")
    .maybeSingle();

  if (convErr) return json(500, { error: "Erro ao upsert conversa", details: convErr.message });
  if (!conversation) return json(500, { error: "Falha ao resolver conversa" });

  const role = "user";

  const { error: msgErr } = await supabase
    .from("whatsapp_messages")
    .upsert(
      {
        organization_id: account.organization_id,
        conversation_id: conversation.id,
        provider_message_id: providerMessageId ?? null,
        direction: "in",
        role,
        text: text ?? null,
        media: {},
        raw_payload: payload as unknown as Record<string, unknown>,
        sent_at: sentAt,
      },
      providerMessageId ? { onConflict: "conversation_id,provider_message_id" } : undefined
    );

  if (msgErr) return json(500, { error: "Erro ao gravar mensagem", details: msgErr.message });

  // Atualiza last_message_at (best-effort)
  await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: sentAt, updated_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("organization_id", account.organization_id);

  return json(200, {
    ok: true,
    type: "message",
    provider: account.provider,
    account_id: account.id,
    conversation_id: conversation.id,
    provider_conversation_id: conversation.provider_conversation_id,
    contact_id: contactId ?? null,
    deal_id: dealId ?? null,
    message_id: providerMessageId ?? null,
  });
});

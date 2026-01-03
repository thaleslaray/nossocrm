/**
 * Webhook de entrada GPTMaker (WhatsApp).
 *
 * Rota (Supabase Edge Functions):
 * - `POST /functions/v1/gptmaker-in/<token>`
 *
 * Autenticação:
 * - Token na URL (porque o GPTMaker pode não permitir headers/secret no webhook).
 *
 * Comportamento:
 * - Normaliza payloads reais do GPTMaker (message vs mensagem, assistantId vs agentId, contactPhone vs recipient)
 * - Ignora eventos `role=tool`
 * - Dedupe por messageId
 * - Upsert de conversa por (organization_id, context_id)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

type GPTMakerBase = {
  date?: string | number;
  channel?: string;
  contextId?: string;
  channelId?: string;
  contactPhone?: string;
  recipient?: string;
  contactName?: string;
  name?: string;
  messageId?: string;
  role?: string;
  message?: string;
  mensagem?: string;
  assistantId?: string;
  agentId?: string;
  images?: unknown[];
  audios?: unknown[];
};

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
  // pathname esperado: /functions/v1/gptmaker-in/<token>
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "gptmaker-in");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

function toOptionalString(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normalizeText(payload: GPTMakerBase) {
  return toOptionalString(payload.message) ?? toOptionalString(payload.mensagem);
}

function normalizePhone(payload: GPTMakerBase) {
  return toOptionalString(payload.contactPhone) ?? toOptionalString(payload.recipient);
}

function normalizeAgentId(payload: GPTMakerBase) {
  return toOptionalString(payload.assistantId) ?? toOptionalString(payload.agentId);
}

function parseSentAt(payload: GPTMakerBase): string {
  const d = payload.date;
  if (typeof d === "string") {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  if (typeof d === "number") {
    const dt = new Date(d);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return new Date().toISOString();
}

async function bestEffortResolveContactAndDeal(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  phone?: string
): Promise<{ contactId: string | null; dealId: string | null }>{
  if (!phone) return { contactId: null, dealId: null };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle();

  const contactId = contact?.id ?? null;
  if (!contactId) return { contactId: null, dealId: null };

  const { data: deal } = await supabase
    .from("deals")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { contactId, dealId: deal?.id ?? null };
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

  const { data: source, error: sourceErr } = await supabase
    .from("gptmaker_webhook_sources")
    .select("id, organization_id, active")
    .eq("token", token)
    .maybeSingle();

  if (sourceErr) return json(500, { error: "Erro ao buscar source", details: sourceErr.message });
  if (!source || !source.active) return json(404, { error: "Source não encontrada/inativa" });

  let payload: GPTMakerBase;
  try {
    payload = (await req.json()) as GPTMakerBase;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const role = toOptionalString(payload.role) ?? "";
  if (role.toLowerCase() === "tool") {
    return json(200, { ok: true, ignored: true, reason: "role=tool" });
  }

  const contextId = toOptionalString(payload.contextId);
  if (!contextId) return json(400, { error: "contextId ausente" });

  const messageId = toOptionalString(payload.messageId);
  const text = normalizeText(payload);
  const phone = normalizePhone(payload);
  const contactName = toOptionalString(payload.contactName) ?? toOptionalString(payload.name);
  const channel = toOptionalString(payload.channel) ?? "WHATSAPP";
  const channelId = toOptionalString(payload.channelId);
  const agentId = normalizeAgentId(payload);

  const sentAt = parseSentAt(payload);

  // Upsert de conversa
  const { contactId, dealId } = await bestEffortResolveContactAndDeal(
    supabase,
    source.organization_id,
    phone
  );

  const { data: conversation, error: convErr } = await supabase
    .from("gptmaker_conversations")
    .upsert(
      {
        organization_id: source.organization_id,
        context_id: contextId,
        channel,
        channel_id: channelId,
        contact_phone: phone ?? null,
        contact_name: contactName ?? null,
        contact_id: contactId,
        deal_id: dealId,
        last_message_at: sentAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,context_id" }
    )
    .select("id, organization_id, context_id, human_takeover_at")
    .maybeSingle();

  if (convErr) return json(500, { error: "Erro ao upsert conversa", details: convErr.message });
  if (!conversation) return json(500, { error: "Falha ao resolver conversa" });

  // Se for evento de takeover (sem texto), marca takeover
  // (Payloads reais de takeover chegam sem role/messageId, mas com channelId/agentId/recipient)
  const seemsTakeover = !text && !messageId && !!agentId && !!channelId;
  if (seemsTakeover) {
    if (!conversation.human_takeover_at) {
      const { error: takeoverErr } = await supabase
        .from("gptmaker_conversations")
        .update({
          human_takeover_at: new Date().toISOString(),
          last_message_at: sentAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id)
        .eq("organization_id", source.organization_id);

      if (takeoverErr) {
        return json(500, { error: "Erro ao marcar takeover", details: takeoverErr.message });
      }
    }

    return json(200, { ok: true, type: "takeover", conversation_id: conversation.id });
  }

  // Mensagem precisa de role + texto (ou pode vir sem texto quando mídia; MVP: armazena arrays)
  if (!role) return json(400, { error: "role ausente" });

  const images = Array.isArray(payload.images) ? payload.images : [];
  const audios = Array.isArray(payload.audios) ? payload.audios : [];

  const { error: msgErr } = await supabase
    .from("gptmaker_messages")
    .upsert(
      {
        organization_id: source.organization_id,
        conversation_id: conversation.id,
        message_id: messageId ?? null,
        role,
        text: text ?? null,
        images: images as unknown as unknown,
        audios: audios as unknown as unknown,
        raw_payload: payload as unknown as Record<string, unknown>,
        sent_at: sentAt,
      },
      messageId
        ? { onConflict: "conversation_id,message_id" }
        : undefined
    );

  if (msgErr) return json(500, { error: "Erro ao gravar mensagem", details: msgErr.message });

  // Atualiza last_message_at (best-effort)
  await supabase
    .from("gptmaker_conversations")
    .update({ last_message_at: sentAt, updated_at: new Date().toISOString() })
    .eq("id", conversation.id)
    .eq("organization_id", source.organization_id);

  return json(200, {
    ok: true,
    type: "message",
    conversation_id: conversation.id,
    context_id: conversation.context_id,
    channel,
    message_id: messageId ?? null,
  });
});

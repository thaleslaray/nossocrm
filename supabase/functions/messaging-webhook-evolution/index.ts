/**
 * Evolution API Webhook Handler
 *
 * Recebe eventos da Evolution API (mensagens, status, etc.) e processa:
 * - Mensagens recebidas → cria/atualiza conversa + insere mensagem
 * - Status updates → atualiza status da mensagem
 *
 * Autenticação:
 * - Header `x-api-key` ou `apikey` verificado contra `EVOLUTION_WEBHOOK_SECRET`
 * - Se `EVOLUTION_WEBHOOK_SECRET` não configurado, aceita qualquer request
 *
 * Deploy:
 * - Esta função deve ser deployada com `--no-verify-jwt` pois recebe
 *   chamadas externas da Evolution API sem JWT do Supabase.
 * - Exemplo: `supabase functions deploy messaging-webhook-evolution --no-verify-jwt`
 */
import { createClient } from "npm:@supabase/supabase-js@2";

// =============================================================================
// TYPES
// =============================================================================

interface EvolutionMessageKey {
  remoteJid: string;
  id: string;
  fromMe: boolean;
}

interface EvolutionMessageContent {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  audioMessage?: Record<string, unknown>;
  videoMessage?: { caption?: string };
  documentMessage?: { fileName?: string };
  stickerMessage?: Record<string, unknown>;
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number };
}

interface EvolutionMessageData {
  key: EvolutionMessageKey;
  pushName?: string;
  message?: EvolutionMessageContent;
  messageType?: string;
  messageTimestamp?: number;
}

interface EvolutionUpdateData {
  key: EvolutionMessageKey;
  update: { status?: number };
}

interface EvolutionUpsertPayload {
  event: "messages.upsert";
  instance: string;
  data: EvolutionMessageData;
}

interface EvolutionUpdatePayload {
  event: "messages.update";
  instance: string;
  data: EvolutionUpdateData[];
}

type EvolutionPayload = EvolutionUpsertPayload | EvolutionUpdatePayload | {
  event: string;
  instance: string;
  data: unknown;
};

// =============================================================================
// HELPERS
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getApiKeyFromRequest(req: Request): string {
  const xApiKey = req.headers.get("x-api-key") || "";
  if (xApiKey.trim()) return xApiKey.trim();

  const apikey = req.headers.get("apikey") || "";
  if (apikey.trim()) return apikey.trim();

  return "";
}

/**
 * Normalize remoteJid to a clean phone number.
 * Handles @s.whatsapp.net and @lid suffixes.
 */
function normalizeRemoteJid(remoteJid: string): string | null {
  if (!remoteJid) return null;
  // Extract the part before @
  const phone = remoteJid.split("@")[0];
  if (!phone) return null;
  // Remove non-digits
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

/**
 * Extract text content from Evolution API message by messageType.
 */
function extractMessageText(data: EvolutionMessageData): string {
  const { messageType, message } = data;
  if (!message) return "[mensagem]";

  switch (messageType) {
    case "conversation":
      return message.conversation || "[mensagem]";
    case "extendedTextMessage":
      return message.extendedTextMessage?.text || "[mensagem]";
    case "imageMessage":
      return message.imageMessage?.caption || "[imagem]";
    case "audioMessage":
      return "[áudio]";
    case "videoMessage":
      return message.videoMessage?.caption || "[vídeo]";
    case "documentMessage":
      return message.documentMessage?.fileName || "[documento]";
    case "stickerMessage":
      return "[sticker]";
    case "locationMessage": {
      const lat = message.locationMessage?.degreesLatitude ?? 0;
      const lng = message.locationMessage?.degreesLongitude ?? 0;
      return `[localização: ${lat}, ${lng}]`;
    }
    default:
      return "[mensagem]";
  }
}

/**
 * Map Evolution API numeric status to internal string status.
 * 3 → sent, 4 → delivered, 5 → read
 */
function mapNumericStatus(status: number): string | null {
  const map: Record<number, string> = {
    3: "sent",
    4: "delivered",
    5: "read",
  };
  return map[status] ?? null;
}

/**
 * Trigger AI Agent processing for inbound message.
 * Fire-and-forget: errors are logged but don't fail the webhook.
 */
async function triggerAIProcessing(params: {
  conversationId: string;
  organizationId: string;
  messageText: string;
  messageId?: string;
}): Promise<void> {
  const appUrl = Deno.env.get("APP_URL") || Deno.env.get("CRM_APP_URL") || "http://localhost:3000";
  const internalSecret = Deno.env.get("INTERNAL_API_SECRET");

  if (!internalSecret) {
    console.log("[Evolution] INTERNAL_API_SECRET not set, skipping AI processing");
    return;
  }

  const endpoint = `${appUrl}/api/messaging/ai/process`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify({
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        messageText: params.messageText,
        messageId: params.messageId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Evolution] AI processing failed: ${response.status} ${text}`);
      return;
    }

    const result = await response.json();
    console.log("[Evolution] AI processing result:", result);
  } catch (error) {
    console.error("[Evolution] AI processing fetch error:", error);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Método não permitido" });
  }

  // Auth: check x-api-key / apikey against EVOLUTION_WEBHOOK_SECRET
  const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (webhookSecret) {
    const providedKey = getApiKeyFromRequest(req);
    if (!providedKey) {
      return json(401, { error: "API key ausente" });
    }
    if (providedKey !== webhookSecret) {
      return json(401, { error: "API key inválida" });
    }
  }

  // Parse payload
  let payload: EvolutionPayload;
  try {
    payload = (await req.json()) as EvolutionPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const instanceName = payload.instance;
  if (!instanceName) {
    return json(200, { ok: false, error: "instance ausente no payload" });
  }

  // Setup Supabase client
  const supabaseUrl =
    Deno.env.get("CRM_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("CRM_SUPABASE_SECRET_KEY") ??
    Deno.env.get("CRM_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "Supabase não configurado no runtime" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Fetch channel by provider + external_identifier (instanceName)
  const { data: channel, error: channelErr } = await supabase
    .from("messaging_channels")
    .select("id, organization_id, business_unit_id, external_identifier, status")
    .eq("provider", "evolution")
    .eq("external_identifier", instanceName)
    .in("status", ["connected", "active"])
    .maybeSingle();

  if (channelErr) {
    console.error("[Evolution] Error fetching channel:", channelErr);
    return json(200, { ok: false, error: "Erro ao buscar canal" });
  }

  if (!channel) {
    console.warn(`[Evolution] No active channel found for instance: ${instanceName}`);
    return json(200, { ok: false, error: "Canal não encontrado" });
  }

  try {
    if (payload.event === "messages.upsert") {
      await handleMessagesUpsert(supabase, channel, payload as EvolutionUpsertPayload);
    } else if (payload.event === "messages.update") {
      await handleMessagesUpdate(supabase, payload as EvolutionUpdatePayload);
    } else {
      console.log(`[Evolution] Unhandled event: ${payload.event}`);
    }

    return json(200, { ok: true, event: payload.event });
  } catch (error) {
    console.error("[Evolution] Webhook processing error:", error);
    // Always return 200 to avoid retry storms
    return json(200, {
      ok: false,
      error: "Erro ao processar webhook",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleMessagesUpsert(
  supabase: ReturnType<typeof createClient>,
  channel: {
    id: string;
    organization_id: string;
    business_unit_id: string;
    external_identifier: string;
  },
  payload: EvolutionUpsertPayload
) {
  const { data } = payload;

  const remoteJid = data.key.remoteJid;

  // Skip groups and broadcast — not supported for now
  if (remoteJid.includes("@g.us")) return;
  if (remoteJid === "status@broadcast") return;

  const isFromMe = data.key.fromMe === true;
  const direction = isFromMe ? "outbound" : "inbound";

  const phone = normalizeRemoteJid(remoteJid);
  if (!phone) {
    console.warn(`[Evolution] Could not normalize remoteJid: ${remoteJid}`);
    return;
  }

  const externalMessageId = data.key.id;
  const messageText = extractMessageText(data);
  const pushName = data.pushName;
  const timestamp = data.messageTimestamp
    ? new Date(data.messageTimestamp * 1000)
    : new Date();

  // Find existing conversation
  const { data: existingConv, error: convFindErr } = await supabase
    .from("messaging_conversations")
    .select("id, contact_id")
    .eq("channel_id", channel.id)
    .eq("external_contact_id", phone)
    .maybeSingle();

  if (convFindErr) throw convFindErr;

  let conversationId: string;
  let contactId: string | null = null;

  if (existingConv) {
    conversationId = existingConv.id;
    contactId = existingConv.contact_id;
  } else {
    // Find or create contact
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", channel.organization_id)
      .eq("phone", phone)
      .is("deleted_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const contactName = pushName || phone;

      const { data: newContact, error: contactCreateErr } = await supabase
        .from("contacts")
        .insert({
          organization_id: channel.organization_id,
          name: contactName,
          phone: phone,
          source: "whatsapp",
          metadata: {
            auto_created: true,
            created_from: "messaging_webhook_evolution",
            whatsapp_name: pushName,
            business_unit_id: channel.business_unit_id,
          },
        })
        .select("id")
        .single();

      if (contactCreateErr) {
        console.error("[Evolution] Error auto-creating contact:", contactCreateErr);
      } else {
        contactId = newContact.id;
        console.log(`[Evolution] Auto-created contact: ${contactId} for phone ${phone}`);
      }
    }

    // Create conversation
    const { data: newConv, error: convCreateErr } = await supabase
      .from("messaging_conversations")
      .insert({
        organization_id: channel.organization_id,
        channel_id: channel.id,
        business_unit_id: channel.business_unit_id,
        external_contact_id: phone,
        external_contact_name: pushName || phone,
        contact_id: contactId,
        status: "open",
        priority: "normal",
      })
      .select("id")
      .single();

    if (convCreateErr) throw convCreateErr;
    conversationId = newConv.id;

    // Auto-create deal if lead routing rule exists
    if (contactId) {
      const routingRule = await getLeadRoutingRule(supabase, channel.id);
      if (routingRule) {
        await autoCreateDeal(supabase, {
          organizationId: channel.organization_id,
          contactId,
          boardId: routingRule.boardId,
          stageId: routingRule.stageId,
          conversationId,
          contactName: pushName || phone,
        });
      }
    }
  }

  // Insert message (inbound or outbound from WhatsApp app)
  const { error: msgErr } = await supabase.from("messaging_messages").insert({
    conversation_id: conversationId,
    external_id: externalMessageId,
    direction,
    content_type: "text",
    content: { type: "text", text: messageText },
    status: direction === "outbound" ? "sent" : "delivered",
    ...(direction === "outbound"
      ? { sent_at: timestamp.toISOString() }
      : { delivered_at: timestamp.toISOString() }),
    sender_name: isFromMe ? "Você" : pushName,
    metadata: {
      evolution_message_id: externalMessageId,
      message_type: data.messageType,
      timestamp: data.messageTimestamp,
    },
  });

  if (msgErr) {
    if (!msgErr.message.toLowerCase().includes("duplicate")) {
      throw msgErr;
    }
    console.log(`[Evolution] Duplicate message ignored: ${externalMessageId}`);
    return;
  }

  // Update conversation
  await supabase
    .from("messaging_conversations")
    .update({
      last_message_at: timestamp.toISOString(),
      last_message_preview: messageText.slice(0, 100),
      status: "open",
    })
    .eq("id", conversationId);

  // Only trigger AI for inbound messages
  if (!isFromMe) {
    const { data: insertedMsg } = await supabase
      .from("messaging_messages")
      .select("id")
      .eq("external_id", externalMessageId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    triggerAIProcessing({
      conversationId,
      organizationId: channel.organization_id,
      messageText,
      messageId: insertedMsg?.id ?? externalMessageId,
    }).catch((err) => {
      console.error("[Evolution] AI processing trigger error:", err);
    });
  }
}

async function handleMessagesUpdate(
  supabase: ReturnType<typeof createClient>,
  payload: EvolutionUpdatePayload
) {
  const updates = payload.data;
  if (!Array.isArray(updates)) return;

  for (const update of updates) {
    // Only process outbound message status updates
    if (!update.key.fromMe) continue;

    const externalId = update.key.id;
    const numericStatus = update.update?.status;
    if (numericStatus === undefined) continue;

    const newStatus = mapNumericStatus(numericStatus);
    if (!newStatus) {
      console.log(`[Evolution] Unmapped status code: ${numericStatus} for ${externalId}`);
      continue;
    }

    const { error } = await supabase
      .from("messaging_messages")
      .update({
        status: newStatus,
        ...(newStatus === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
        ...(newStatus === "read" ? { read_at: new Date().toISOString() } : {}),
      })
      .eq("external_id", externalId);

    if (error) {
      console.error(`[Evolution] Error updating status for ${externalId}:`, error);
    } else {
      console.log(`[Evolution] Status updated: ${externalId} → ${newStatus}`);
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

async function getLeadRoutingRule(
  supabase: ReturnType<typeof createClient>,
  channelId: string
): Promise<{ boardId: string; stageId: string | null } | null> {
  const { data, error } = await supabase
    .from("lead_routing_rules")
    .select("board_id, stage_id, enabled")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error) {
    console.error("[Evolution] Error fetching lead routing rule:", error);
    return null;
  }

  if (!data || !data.enabled || !data.board_id) return null;

  return { boardId: data.board_id, stageId: data.stage_id };
}

async function autoCreateDeal(
  supabase: ReturnType<typeof createClient>,
  params: {
    organizationId: string;
    contactId: string;
    boardId: string;
    stageId?: string | null;
    conversationId: string;
    contactName: string;
  }
) {
  try {
    let stageId = params.stageId;

    if (!stageId) {
      const { data: firstStage, error: stageErr } = await supabase
        .from("board_stages")
        .select("id")
        .eq("board_id", params.boardId)
        .order("order", { ascending: true })
        .limit(1)
        .single();

      if (stageErr || !firstStage) {
        console.error("[Evolution] Could not find first stage for auto-create deal:", stageErr);
        return;
      }
      stageId = firstStage.id;
    }

    const { data: newDeal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: params.organizationId,
        board_id: params.boardId,
        stage_id: stageId,
        contact_id: params.contactId,
        title: `${params.contactName} - WhatsApp`,
        value: 0,
        source: "whatsapp",
        metadata: {
          auto_created: true,
          created_from: "messaging_webhook_evolution",
          conversation_id: params.conversationId,
        },
      })
      .select("id")
      .single();

    if (dealErr) {
      console.error("[Evolution] Error auto-creating deal:", dealErr);
      return;
    }

    console.log(`[Evolution] Auto-created deal: ${newDeal.id} for contact ${params.contactId}`);

    // Update conversation metadata with deal reference
    const { data: conv } = await supabase
      .from("messaging_conversations")
      .select("metadata")
      .eq("id", params.conversationId)
      .maybeSingle();

    await supabase
      .from("messaging_conversations")
      .update({
        metadata: {
          ...((conv?.metadata as Record<string, unknown>) || {}),
          deal_id: newDeal.id,
          auto_created_deal: true,
        },
      })
      .eq("id", params.conversationId);
  } catch (error) {
    console.error("[Evolution] Unexpected error in autoCreateDeal:", error);
  }
}

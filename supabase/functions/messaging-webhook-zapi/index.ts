/**
 * Z-API Webhook Handler
 *
 * Recebe eventos do Z-API (mensagens, status, etc.) e processa:
 * - Mensagens recebidas → cria/atualiza conversa + insere mensagem
 * - Status updates → atualiza status da mensagem
 *
 * Rota:
 * - `POST /functions/v1/messaging-webhook-zapi/<channel_id>`
 *
 * Autenticação:
 * - Header `X-Webhook-Secret: <secret>` ou
 * - Header `Authorization: Bearer <secret>`
 * - Valor deve bater com o secret configurado no canal
 *
 * Deploy:
 * - Esta função deve ser deployada com `--no-verify-jwt` pois recebe
 *   chamadas externas do Z-API sem JWT do Supabase.
 * - Exemplo: `supabase functions deploy messaging-webhook-zapi --no-verify-jwt`
 */
import { createClient } from "npm:@supabase/supabase-js@2";

// =============================================================================
// TYPES
// =============================================================================

interface ZApiWebhookPayload {
  // Message identification
  messageId?: string;
  zapiMessageId?: string;

  // Contact info
  phone?: string;
  chatId?: string;
  instanceId?: string;

  // Message details
  fromMe?: boolean;
  moment?: number;
  type?: string;

  // Content by type
  text?: { message: string };
  image?: { imageUrl: string; caption?: string; mimeType?: string };
  video?: { videoUrl: string; caption?: string; mimeType?: string };
  audio?: { audioUrl: string; mimeType?: string };
  document?: { documentUrl: string; fileName?: string; mimeType?: string };
  sticker?: { stickerUrl: string };
  location?: { latitude: number; longitude: number; name?: string };

  // Contact info in message
  senderName?: string;
  senderPhoto?: string;

  // Status updates
  status?: "SENT" | "DELIVERED" | "READ" | "PLAYED";
  ids?: string[];

  // Error info
  error?: string;
  errorMessage?: string;
}

interface ZApiPresencePayload {
  type: "PresenceChatCallback";
  phone: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "COMPOSING" | "RECORDING" | "PAUSED";
  lastSeen: string | null;
  instanceId: string;
}

interface MessageContent {
  type: string;
  text?: string;
  mediaUrl?: string;
  mimeType?: string;
  caption?: string;
  fileName?: string;
  latitude?: number;
  longitude?: number;
  name?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Secret, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getChannelIdFromPath(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "messaging-webhook-zapi");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

function getSecretFromRequest(req: Request): string {
  const xSecret = req.headers.get("X-Webhook-Secret") || "";
  if (xSecret.trim()) return xSecret.trim();

  const auth = req.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();

  return "";
}

function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  // Remove non-digits and add +
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function extractContent(data: ZApiWebhookPayload): MessageContent {
  if (data.text) {
    return {
      type: "text",
      text: data.text.message,
    };
  }

  if (data.image) {
    return {
      type: "image",
      mediaUrl: data.image.imageUrl,
      mimeType: data.image.mimeType || "image/jpeg",
      caption: data.image.caption,
    };
  }

  if (data.video) {
    return {
      type: "video",
      mediaUrl: data.video.videoUrl,
      mimeType: data.video.mimeType || "video/mp4",
      caption: data.video.caption,
    };
  }

  if (data.audio) {
    return {
      type: "audio",
      mediaUrl: data.audio.audioUrl,
      mimeType: data.audio.mimeType || "audio/ogg",
    };
  }

  if (data.document) {
    return {
      type: "document",
      mediaUrl: data.document.documentUrl,
      fileName: data.document.fileName || "document",
      mimeType: data.document.mimeType || "application/pdf",
    };
  }

  if (data.sticker) {
    return {
      type: "sticker",
      mediaUrl: data.sticker.stickerUrl,
      mimeType: "image/webp",
    };
  }

  if (data.location) {
    return {
      type: "location",
      latitude: data.location.latitude,
      longitude: data.location.longitude,
      name: data.location.name,
    };
  }

  return {
    type: "text",
    text: `[${data.type || "unknown"}]`,
  };
}

function getMessagePreview(content: MessageContent): string {
  switch (content.type) {
    case "text":
      return (content.text || "").slice(0, 100);
    case "image":
      return content.caption || "[Imagem]";
    case "video":
      return content.caption || "[Vídeo]";
    case "audio":
      return "[Áudio]";
    case "document":
      return content.fileName || "[Documento]";
    case "sticker":
      return "[Sticker]";
    case "location":
      return content.name || "[Localização]";
    default:
      return "[Mensagem]";
  }
}

/**
 * Trigger AI Agent processing for inbound message.
 * Calls the Next.js API endpoint to process and potentially respond.
 * Fire-and-forget: errors are logged but don't fail the webhook.
 */
async function triggerAIProcessing(params: {
  conversationId: string;
  organizationId: string;
  messageText: string;
  messageId?: string;
}): Promise<void> {
  const appUrl = Deno.env.get("CRM_APP_URL");
  if (!appUrl) {
    console.log("[Webhook] CRM_APP_URL not set, skipping AI processing");
    return;
  }

  const internalSecret = Deno.env.get("INTERNAL_API_SECRET");
  if (!internalSecret) {
    console.log("[Webhook] INTERNAL_API_SECRET not set, skipping AI processing");
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
      console.error(`[Webhook] AI processing failed: ${response.status} ${text}`);
      return;
    }

    const result = await response.json();
    console.log("[Webhook] AI processing result:", result);
  } catch (error) {
    console.error("[Webhook] AI processing fetch error:", error);
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

  const channelId = getChannelIdFromPath(req);
  if (!channelId) {
    return json(404, { error: "channel_id ausente na URL" });
  }

  // Parse payload
  let payload: ZApiWebhookPayload;
  try {
    payload = (await req.json()) as ZApiWebhookPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
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

  // Fetch channel with business unit info
  const { data: channel, error: channelErr } = await supabase
    .from("messaging_channels")
    .select(`
      id,
      organization_id,
      business_unit_id,
      external_identifier,
      credentials,
      status,
      business_unit:business_units(
        id,
        name
      )
    `)
    .eq("id", channelId)
    .is("deleted_at", null)
    .maybeSingle();

  if (channelErr) {
    return json(500, { error: "Erro ao buscar canal", details: channelErr.message });
  }

  if (!channel) {
    return json(404, { error: "Canal não encontrado" });
  }

  // Validate secret - if channel has a secret configured, it MUST be present and match
  const secretHeader = getSecretFromRequest(req);
  const channelSecret = (channel.credentials as Record<string, unknown>)?.webhookSecret;

  if (channelSecret) {
    if (!secretHeader) {
      return json(401, { error: "Secret ausente" });
    }
    if (String(channelSecret) !== String(secretHeader)) {
      return json(401, { error: "Secret inválido" });
    }
  }

  // Presence events — broadcast only, no DB write
  if (payload.type === "PresenceChatCallback") {
    return await handlePresenceEvent(supabase, channel, payload as unknown as ZApiPresencePayload);
  }

  // Generate stable event ID for deduplication
  // For status updates: status_{ids[0]}_{status}
  // For messages: msg_{messageId}
  const externalEventId = generateStableEventId(payload);

  const { error: eventInsertErr } = await supabase
    .from("messaging_webhook_events")
    .insert({
      channel_id: channelId,
      event_type: determineEventType(payload),
      external_event_id: externalEventId,
      payload: payload as unknown as Record<string, unknown>,
      processed: false,
    });

  // If duplicate (already processed), return early with success
  if (eventInsertErr?.message?.toLowerCase().includes("duplicate")) {
    console.log(`[Webhook] Duplicate event ignored: ${externalEventId}`);
    return json(200, { ok: true, duplicate: true, event_id: externalEventId });
  }

  // Log other errors but continue
  if (eventInsertErr) {
    console.error("Error logging webhook event:", eventInsertErr);
  }

  // Z-API sends non-message callbacks (delivery, read receipts, connect/disconnect,
  // presence) that have a phone field but are NOT actual messages. Letting them
  // fall into handleInboundMessage would create fake messages like "[DeliveryCallback]".
  const NON_MESSAGE_TYPES = new Set([
    "DeliveryCallback",
    "ReadCallback",
    "MessageStatusCallback",
    "ConnectedCallback",
    "DisconnectedCallback",
    "PresenceChatCallback",
  ]);

  if (payload.type && NON_MESSAGE_TYPES.has(payload.type)) {
    console.log(`[Webhook] Skipping non-message event type: ${payload.type}`);
    await supabase
      .from("messaging_webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("external_event_id", externalEventId);
    return json(200, { ok: true, skipped: true, event_type: payload.type });
  }

  try {
    // Determine event type and process
    if (payload.status && payload.ids) {
      // Status update
      await handleStatusUpdate(supabase, channel, payload);
    } else if (payload.phone && !payload.fromMe) {
      // Inbound message
      await handleInboundMessage(supabase, channel, payload);
    } else if (payload.phone && payload.fromMe) {
      // Outbound message confirmation (our message was sent)
      await handleOutboundConfirmation(supabase, channel, payload);
    }

    // Mark event as processed
    await supabase
      .from("messaging_webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("external_event_id", externalEventId);

    return json(200, { ok: true, event_type: determineEventType(payload) });
  } catch (error) {
    console.error("Webhook processing error:", error);

    // Log error in webhook event
    await supabase
      .from("messaging_webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("channel_id", channelId)
      .eq("external_event_id", externalEventId);

    // Return 200 to prevent Z-API from retrying on processing errors
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

/**
 * Generate stable event ID for deduplication.
 * Uses payload data instead of timestamps to ensure idempotency.
 */
function generateStableEventId(payload: ZApiWebhookPayload): string {
  // For status updates: status_{firstId}_{status}
  if (payload.status && payload.ids?.length) {
    return `status_${payload.ids[0]}_${payload.status}`;
  }

  // For messages: msg_{messageId}
  if (payload.messageId || payload.zapiMessageId) {
    return `msg_${payload.messageId || payload.zapiMessageId}`;
  }

  // Fallback: use a stable fingerprint from the payload content
  const raw = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `zapi_${payload.phone || "unknown"}_${(hash >>> 0).toString(36)}`;
}

function determineEventType(payload: ZApiWebhookPayload): string {
  if (payload.error || payload.errorMessage) return "error";
  if (payload.status && payload.ids) return "status_update";
  if (payload.phone && !payload.fromMe) return "message_received";
  if (payload.phone && payload.fromMe) return "message_sent";
  return "unknown";
}

/**
 * Fetch lead routing rule for a channel.
 * Returns null if no rule exists or rule is disabled.
 */
async function getLeadRoutingRule(
  supabase: ReturnType<typeof createClient>,
  channelId: string
): Promise<{
  boardId: string;
  stageId: string | null;
} | null> {
  const { data, error } = await supabase
    .from("lead_routing_rules")
    .select("board_id, stage_id, enabled")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error) {
    console.error("[Webhook] Error fetching lead routing rule:", error);
    return null;
  }

  if (!data || !data.enabled || !data.board_id) {
    return null;
  }

  return {
    boardId: data.board_id,
    stageId: data.stage_id,
  };
}

async function handleInboundMessage(
  supabase: ReturnType<typeof createClient>,
  channel: {
    id: string;
    organization_id: string;
    business_unit_id: string;
    external_identifier: string;
    business_unit?: {
      id: string;
      name: string;
    } | null;
  },
  payload: ZApiWebhookPayload
) {
  const phone = normalizePhone(payload.phone);
  if (!phone) throw new Error("Phone number is required");

  const externalMessageId = payload.messageId || payload.zapiMessageId || "";
  const content = extractContent(payload);
  const timestamp = payload.moment
    ? new Date(payload.moment * 1000)
    : new Date();

  // Find or create conversation
  const { data: existingConv, error: convFindErr } = await supabase
    .from("messaging_conversations")
    .select("id, contact_id, unread_count, message_count")
    .eq("channel_id", channel.id)
    .eq("external_contact_id", phone)
    .maybeSingle();

  if (convFindErr) throw convFindErr;

  let conversationId: string;
  let contactId: string | null = null;
  let isNewConversation = false;

  if (existingConv) {
    conversationId = existingConv.id;
    contactId = existingConv.contact_id;
  } else {
    isNewConversation = true;

    // Try to find existing contact by phone (order+limit to handle duplicates)
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
      // AUTO-CREATE CONTACT (default behavior)
      // Use WhatsApp name or phone as contact name
      const contactName = payload.senderName || phone;

      const { data: newContact, error: contactCreateErr } = await supabase
        .from("contacts")
        .insert({
          organization_id: channel.organization_id,
          name: contactName,
          phone: phone,
          source: "whatsapp", // Track that this contact came from WhatsApp
          metadata: {
            auto_created: true,
            created_from: "messaging_webhook",
            whatsapp_name: payload.senderName,
            whatsapp_avatar: payload.senderPhoto,
            business_unit_id: channel.business_unit_id,
          },
        })
        .select("id")
        .single();

      if (contactCreateErr) {
        console.error("Error auto-creating contact:", contactCreateErr);
        // Continue without contact if creation fails
      } else {
        contactId = newContact.id;
        console.log(`[Webhook] Auto-created contact: ${contactId} for phone ${phone}`);
      }
    }

    // Create new conversation (always linked to contact now)
    const { data: newConv, error: convCreateErr } = await supabase
      .from("messaging_conversations")
      .insert({
        organization_id: channel.organization_id,
        channel_id: channel.id,
        business_unit_id: channel.business_unit_id,
        external_contact_id: phone,
        external_contact_name: payload.senderName || phone,
        external_contact_avatar: payload.senderPhoto,
        contact_id: contactId,
        status: "open",
        priority: "normal",
        // Z-API does not have a 24h response window restriction (unofficial API)
        // window_expires_at intentionally omitted
      })
      .select("id")
      .single();

    if (convCreateErr) throw convCreateErr;
    conversationId = newConv.id;

    // AUTO-CREATE DEAL if lead routing rule exists for this channel
    if (contactId) {
      const routingRule = await getLeadRoutingRule(supabase, channel.id);
      if (routingRule) {
        await autoCreateDeal(supabase, {
          organizationId: channel.organization_id,
          contactId,
          boardId: routingRule.boardId,
          stageId: routingRule.stageId,
          conversationId,
          contactName: payload.senderName || phone,
          businessUnitName: channel.business_unit?.name || "Sem unidade",
        });
      }
    }
  }

  // Insert message
  const { error: msgErr } = await supabase.from("messaging_messages").insert({
    conversation_id: conversationId,
    external_id: externalMessageId,
    direction: "inbound",
    content_type: content.type,
    content: content,
    status: "delivered", // Inbound messages are already delivered
    delivered_at: timestamp.toISOString(),
    sender_name: payload.senderName,
    sender_profile_url: payload.senderPhoto,
    metadata: {
      zapi_message_id: payload.zapiMessageId,
      moment: payload.moment,
    },
  });

  if (msgErr) {
    // Ignore duplicate messages
    if (!msgErr.message.toLowerCase().includes("duplicate")) {
      throw msgErr;
    }
  }

  // Update conversation counters (done by trigger, but also update window)
  await supabase
    .from("messaging_conversations")
    .update({
      last_message_at: timestamp.toISOString(),
      last_message_preview: getMessagePreview(content),
      last_message_direction: "inbound",
      // Z-API has no 24h window — do not set window_expires_at
      // Reopen if resolved
      status: "open",
    })
    .eq("id", conversationId);

  // Trigger AI Agent processing (async, fire-and-forget)
  // Only process text messages for AI response
  if (content.type === "text" && content.text) {
    triggerAIProcessing({
      conversationId,
      organizationId: channel.organization_id,
      messageText: content.text,
      messageId: externalMessageId,
    }).catch((err) => {
      // Log but don't fail the webhook
      console.error("[Webhook] AI processing trigger error:", err);
    });
  }
}

/**
 * Auto-create a deal when a new conversation starts.
 * Uses stageId from lead_routing_rules, or falls back to first stage of board.
 */
async function autoCreateDeal(
  supabase: ReturnType<typeof createClient>,
  params: {
    organizationId: string;
    contactId: string;
    boardId: string;
    stageId?: string | null;
    conversationId: string;
    contactName: string;
    businessUnitName: string;
  }
) {
  try {
    let stageId = params.stageId;

    // If no stageId provided, get the first stage of the board
    if (!stageId) {
      const { data: firstStage, error: stageErr } = await supabase
        .from("board_stages")
        .select("id")
        .eq("board_id", params.boardId)
        .order("order", { ascending: true })
        .limit(1)
        .single();

      if (stageErr || !firstStage) {
        console.error("[Webhook] Could not find first stage for auto-create deal:", stageErr);
        return;
      }
      stageId = firstStage.id;
    }

    // Create the deal
    const dealTitle = `${params.contactName} - WhatsApp`;

    const { data: newDeal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: params.organizationId,
        board_id: params.boardId,
        stage_id: stageId,
        contact_id: params.contactId,
        title: dealTitle,
        value: 0,
        source: "whatsapp",
        metadata: {
          auto_created: true,
          created_from: "messaging_webhook",
          conversation_id: params.conversationId,
          business_unit: params.businessUnitName,
        },
      })
      .select("id")
      .single();

    if (dealErr) {
      console.error("[Webhook] Error auto-creating deal:", dealErr);
      return;
    }

    console.log(`[Webhook] Auto-created deal: ${newDeal.id} for contact ${params.contactId}`);

    // Update conversation with deal reference - merge with existing metadata
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
    console.error("[Webhook] Unexpected error in autoCreateDeal:", error);
  }
}

async function handleOutboundConfirmation(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string },
  payload: ZApiWebhookPayload
) {
  const externalMessageId = payload.messageId || payload.zapiMessageId;
  if (!externalMessageId) return;

  // Update message with external ID if not already set
  await supabase
    .from("messaging_messages")
    .update({
      external_id: externalMessageId,
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("external_id", externalMessageId)
    .is("sent_at", null);
}

async function handlePresenceEvent(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; organization_id: string },
  payload: ZApiPresencePayload
): Promise<Response> {
  const phone = normalizePhone(payload.phone);
  if (!phone) return json(200, { ok: true, skipped: "invalid_phone" });

  // Only broadcast for contacts that exist AND have an open deal
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("organization_id", channel.organization_id)
    .eq("phone", phone)
    .is("deleted_at", null)
    .maybeSingle();

  if (!contact) return json(200, { ok: true, skipped: "unknown_contact" });

  // Check if contact has an open deal
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contact.id)
    .eq("is_won", false)
    .eq("is_lost", false);

  if (!count || count === 0) return json(200, { ok: true, skipped: "no_open_deal" });

  // Broadcast via Supabase Realtime (no DB write — presence is ephemeral)
  const broadcastChannel = supabase.channel(`org:${channel.organization_id}:presence`);
  await broadcastChannel.send({
    type: "broadcast",
    event: "presence",
    payload: {
      contactId: contact.id,
      contactName: contact.name,
      phone,
      status: payload.status,
      channelId: channel.id,
      timestamp: Date.now(),
    },
  });
  await supabase.removeChannel(broadcastChannel);

  return json(200, { ok: true, event: "presence_broadcast", contact: contact.id, status: payload.status });
}

async function handleStatusUpdate(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string },
  payload: ZApiWebhookPayload
) {
  // Map Z-API status to our status
  const statusMap: Record<string, string> = {
    SENT: "sent",
    DELIVERED: "delivered",
    READ: "read",
    PLAYED: "read",
  };

  const newStatus = statusMap[payload.status || ""];
  if (!newStatus) return;

  const timestamp = new Date().toISOString();

  // Update all affected messages using RPC for atomic, idempotent updates
  for (const externalId of payload.ids || []) {
    const { data: result, error } = await supabase.rpc("update_message_status_if_newer", {
      p_external_id: externalId,
      p_new_status: newStatus,
      p_timestamp: timestamp,
      p_error_code: null,
      p_error_message: null,
    });

    if (error) {
      console.error(`[Webhook] Status update RPC error for ${externalId}:`, error);
      continue;
    }

    // Log result for debugging
    if (result?.updated) {
      console.log(`[Webhook] Status updated: ${externalId} → ${newStatus}`);
    } else {
      console.log(`[Webhook] Status skipped (${result?.reason}): ${externalId} → ${newStatus}`);
    }
  }
}

/**
 * Meta Cloud API Webhook Handler
 *
 * Recebe eventos do Meta Cloud API (WhatsApp Business) e processa:
 * - Mensagens recebidas → cria/atualiza conversa + insere mensagem
 * - Status updates → atualiza status da mensagem
 *
 * Rotas:
 * - `GET /functions/v1/messaging-webhook-meta/<channel_id>` → Verificação do webhook (Meta challenge)
 * - `POST /functions/v1/messaging-webhook-meta/<channel_id>` → Eventos do webhook
 *
 * Autenticação:
 * - GET: Query param `hub.verify_token` deve bater com verify_token do canal
 * - POST: Header `X-Hub-Signature-256` para verificação de assinatura (opcional)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

// =============================================================================
// TYPES
// =============================================================================

interface MetaCloudWebhookPayload {
  object: "whatsapp_business_account" | "instagram";
  entry: MetaWebhookEntry[];
}

interface MetaWebhookEntry {
  id: string;
  changes?: MetaWebhookChange[];
  // Instagram Messenger Platform uses `messaging` instead of `changes`
  time?: number;
  messaging?: InstagramMessagingEvent[];
}

interface MetaWebhookChange {
  value: MetaWebhookValue;
  field: "messages";
}

interface MetaWebhookValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: MetaWebhookContact[];
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
  errors?: MetaApiError[];
}

interface MetaWebhookContact {
  profile: { name: string };
  wa_id: string;
}

interface MetaWebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contacts" | "button" | "interactive";
  text?: { body: string };
  image?: MetaMediaMessage;
  video?: MetaMediaMessage;
  audio?: MetaMediaMessage;
  document?: MetaMediaMessage & { filename?: string };
  sticker?: MetaMediaMessage;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: unknown[];
  button?: { text: string; payload: string };
  interactive?: unknown;
  context?: { from: string; id: string };
  errors?: MetaApiError[];
}

interface MetaMediaMessage {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

interface MetaWebhookStatus {
  id: string;
  recipient_id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  conversation?: {
    id: string;
    origin: { type: string };
    expiration_timestamp?: string;
  };
  pricing?: {
    pricing_model: string;
    billable: boolean;
    category: string;
  };
  errors?: MetaApiError[];
}

interface MetaApiError {
  code: number;
  title?: string;
  message?: string;
  error_data?: { details: string };
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

// Instagram Messenger Platform types
interface InstagramMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: InstagramMessage;
  delivery?: { mids: string[]; watermark: number };
  read?: { watermark: number };
}

interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: InstagramAttachment[];
  is_echo?: boolean;
}

interface InstagramAttachment {
  type: string;
  payload: { url?: string; media_url?: string; media_id?: string; title?: string };
}

// =============================================================================
// HELPERS
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Hub-Signature-256, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function text(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain", ...corsHeaders },
  });
}

function getChannelIdFromPath(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "messaging-webhook-meta");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  // Remove non-digits and add +
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

/**
 * Detects if a wa_id value is a BSUID (Business-Scoped User ID) rather than a phone number.
 * Meta will migrate from phone numbers to opaque BSUIDs in June 2026.
 * BSUIDs are non-numeric strings (e.g. "BSUIDxxxxxxxxxxxxxxxxxx").
 * Phone numbers consist only of digits (possibly with +, spaces, or dashes).
 */
function isBSUID(value?: string): boolean {
  if (!value) return false;
  return !/^\+?[\d\s\-()+]+$/.test(value);
}

function extractContent(message: MetaWebhookMessage): MessageContent {
  switch (message.type) {
    case "text":
      return {
        type: "text",
        text: message.text?.body || "",
      };

    case "image":
      return {
        type: "image",
        mediaUrl: `meta:${message.image?.id}`, // Prefixo para indicar Meta media ID
        mimeType: message.image?.mime_type || "image/jpeg",
        caption: message.image?.caption,
      };

    case "video":
      return {
        type: "video",
        mediaUrl: `meta:${message.video?.id}`,
        mimeType: message.video?.mime_type || "video/mp4",
        caption: message.video?.caption,
      };

    case "audio":
      return {
        type: "audio",
        mediaUrl: `meta:${message.audio?.id}`,
        mimeType: message.audio?.mime_type || "audio/ogg",
      };

    case "document":
      return {
        type: "document",
        mediaUrl: `meta:${message.document?.id}`,
        fileName: message.document?.filename || "document",
        mimeType: message.document?.mime_type || "application/pdf",
      };

    case "sticker":
      return {
        type: "sticker",
        mediaUrl: `meta:${message.sticker?.id}`,
        mimeType: "image/webp",
      };

    case "location":
      return {
        type: "location",
        latitude: message.location?.latitude || 0,
        longitude: message.location?.longitude || 0,
        name: message.location?.name,
      };

    case "button":
      return {
        type: "text",
        text: message.button?.text || "[button click]",
      };

    default:
      return {
        type: "text",
        text: `[${message.type}]`,
      };
  }
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
 * Verify Meta webhook signature using HMAC-SHA256.
 * Note: In production, implement proper signature verification.
 */
async function verifySignature(
  payload: string,
  signature: string,
  appSecret: string
): Promise<boolean> {
  // Signature format: sha256=<hash>
  const [algorithm, expectedHash] = signature.split("=");
  if (algorithm !== "sha256" || !expectedHash) {
    return false;
  }

  try {
    // Encode the payload and secret
    const encoder = new TextEncoder();
    const keyData = encoder.encode(appSecret);
    const data = encoder.encode(payload);

    // Import the key
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign the payload
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, data);

    // Convert to hex
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const computedHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Constant-time comparison to prevent timing attacks
    if (computedHash.length !== expectedHash.length) return false;
    let mismatch = 0;
    for (let i = 0; i < computedHash.length; i++) {
      mismatch |= computedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    return mismatch === 0;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
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

  const channelId = getChannelIdFromPath(req);
  if (!channelId) {
    return json(404, { error: "channel_id ausente na URL" });
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
      settings,
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

  const credentials = channel.credentials as Record<string, unknown>;
  const settings = channel.settings as Record<string, unknown>;

  // ==========================================================================
  // GET: Webhook Verification (Meta challenge)
  // ==========================================================================
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe") {
      return json(400, { error: "Invalid mode" });
    }

    // Check verifyToken in settings first, then fallback to credentials (legacy)
    const verifyToken = settings?.verifyToken || credentials?.verifyToken;
    if (!verifyToken || token !== verifyToken) {
      console.log("Verify token mismatch:", { received: token, expected: verifyToken });
      return json(403, { error: "Verification failed" });
    }

    // Return the challenge to complete verification
    return text(200, challenge || "");
  }

  // ==========================================================================
  // POST: Webhook Events
  // ==========================================================================
  if (req.method !== "POST") {
    return json(405, { error: "Método não permitido" });
  }

  // Get raw body for signature verification
  const rawBody = await req.text();

  // Verify signature - mandatory when appSecret is configured
  const appSecret = credentials?.appSecret as string | undefined;
  const signature = req.headers.get("X-Hub-Signature-256") || "";

  if (!appSecret) {
    console.error("[Webhook] appSecret not configured for channel — rejecting request");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!signature) {
    console.error("[Webhook] Missing X-Hub-Signature-256 header");
    return new Response(JSON.stringify({ error: "Missing X-Hub-Signature-256" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const isValid = await verifySignature(rawBody, signature, appSecret);
  if (!isValid) {
    console.error("[Webhook] Invalid webhook signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse payload
  let payload: MetaCloudWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaCloudWebhookPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  // Route by object type: WhatsApp vs Instagram
  if (payload.object === "instagram") {
    // ========================================================================
    // INSTAGRAM WEBHOOK HANDLER
    // ========================================================================
    return await handleInstagramWebhookFlow(supabase, channel, channelId, payload);
  }

  if (payload.object !== "whatsapp_business_account" || !payload.entry?.[0]?.changes?.[0]) {
    // Meta sends different objects for different purposes, just ACK if not ours
    return json(200, { ok: true, ignored: true });
  }

  // ========================================================================
  // ========================================================================
  // WHATSAPP WEBHOOK HANDLER
  // ========================================================================
  const change = payload.entry[0].changes[0];
  const value = change.value;

  // Opportunistically backfill display_phone_number into channel settings.
  // Every Meta webhook carries metadata.display_phone_number (e.g. "+55 11 99999-9999").
  // We only write once — if settings.displayPhone is already set, skip.
  const displayPhone = value.metadata?.display_phone_number;
  if (displayPhone && !(settings as Record<string, unknown>)?.displayPhone) {
    await supabase
      .from("messaging_channels")
      .update({ settings: { ...(settings as Record<string, unknown>), displayPhone } })
      .eq("id", channelId);
  }

  // Generate stable event ID for deduplication
  // For status updates: status_{wamid}_{status}
  // For messages: msg_{wamid}
  // For others: meta_{entry_id}_{timestamp}
  const externalEventId = generateStableEventId(payload, value);

  const { error: eventInsertErr } = await supabase
    .from("messaging_webhook_events")
    .insert({
      channel_id: channelId,
      event_type: determineEventType(value),
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

  try {
    // Process errors
    if (value.errors?.[0]) {
      console.error("Meta webhook error:", value.errors[0]);
      // Still return 200 to ACK receipt
    }

    // Process status updates
    if (value.statuses?.[0]) {
      for (const status of value.statuses) {
        await handleStatusUpdate(supabase, channel, status);
      }
    }

    // Process incoming messages
    if (value.messages?.[0]) {
      const contact = value.contacts?.[0];
      for (const message of value.messages) {
        await handleInboundMessage(supabase, channel, message, contact);
      }
    }

    // Mark event as processed
    await supabase
      .from("messaging_webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("external_event_id", externalEventId);

    return json(200, { ok: true, event_type: determineEventType(value) });
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

    // Still return 200 to prevent Meta from retrying
    return json(200, {
      ok: false,
      error: "Processing error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// =============================================================================
// AI PROCESSING TRIGGER
// =============================================================================

/**
 * Trigger AI processing for an inbound message.
 * Calls the internal API endpoint to process the message with AI.
 * This is a fire-and-forget operation - errors are logged but don't fail the webhook.
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
      const errorText = await response.text();
      console.error(`[Webhook] AI processing failed: ${response.status} - ${errorText}`);
    } else {
      console.log(`[Webhook] AI processing triggered for conversation ${params.conversationId}`);
    }
  } catch (error) {
    console.error("[Webhook] Error triggering AI processing:", error);
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Generate stable event ID for deduplication.
 * Uses payload data instead of timestamps to ensure idempotency.
 */
function generateStableEventId(
  payload: MetaCloudWebhookPayload,
  value: MetaWebhookValue
): string {
  // For status updates: status_{wamid}_{status}
  if (value.statuses?.[0]) {
    const status = value.statuses[0];
    return `status_${status.id}_${status.status}`;
  }

  // For messages: msg_{wamid}
  if (value.messages?.[0]) {
    return `msg_${value.messages[0].id}`;
  }

  // For errors: error_{entry_id}_{error_code}
  if (value.errors?.[0]) {
    return `error_${payload.entry[0].id}_${value.errors[0].code}`;
  }

  // Fallback: meta_{entry_id}_{phone_number_id}
  return `meta_${payload.entry[0].id}_${value.metadata?.phone_number_id || "unknown"}`;
}

function determineEventType(value: MetaWebhookValue): string {
  if (value.errors?.[0]) return "error";
  if (value.statuses?.[0]) return "status_update";
  if (value.messages?.[0]) return "message_received";
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
  message: MetaWebhookMessage,
  contact?: MetaWebhookContact
) {
  const rawFrom = message.from;
  if (!rawFrom) throw new Error("Message sender (from) is required");

  // Detect BSUID vs phone number (Meta migrates wa_id → BSUID in June 2026)
  const waIsBSUID = isBSUID(rawFrom);
  const bsuid = waIsBSUID ? rawFrom : null;
  const phone = waIsBSUID ? null : normalizePhone(rawFrom);

  // For conversation lookup, use bsuid if available, else phone
  const externalContactId = bsuid ?? phone;
  if (!externalContactId) throw new Error("Phone number or BSUID is required");

  const externalMessageId = message.id;
  const content = extractContent(message);
  const timestamp = new Date(parseInt(message.timestamp) * 1000);
  const senderName = contact?.profile?.name;

  // Find or create conversation
  // During transition: try bsuid first, then phone fallback for existing convs
  let existingConv: { id: string; contact_id: string | null; unread_count: number; message_count: number } | null = null;
  let convFindErr: unknown = null;

  if (bsuid) {
    // Try by BSUID first
    const res = await supabase
      .from("messaging_conversations")
      .select("id, contact_id, unread_count, message_count")
      .eq("channel_id", channel.id)
      .eq("external_contact_id", bsuid)
      .maybeSingle();
    convFindErr = res.error;
    existingConv = res.data;

    // Fallback: old conversation stored by phone — skip for now (BSUIDs are opaque)
  } else {
    const res = await supabase
      .from("messaging_conversations")
      .select("id, contact_id, unread_count, message_count")
      .eq("channel_id", channel.id)
      .eq("external_contact_id", phone!)
      .maybeSingle();
    convFindErr = res.error;
    existingConv = res.data;
  }

  if (convFindErr) throw convFindErr;

  let conversationId: string;
  let contactId: string | null = null;

  if (existingConv) {
    conversationId = existingConv.id;
    contactId = existingConv.contact_id;

    // Backfill: if we have a BSUID now but the contact was found by phone, store bsuid
    if (bsuid && contactId) {
      await supabase
        .from("contacts")
        .update({ whatsapp_bsuid: bsuid })
        .eq("id", contactId)
        .is("whatsapp_bsuid", null); // Only update if not already set (avoid overwrite)
    }
  } else {
    // Try to find existing contact
    let existingContact: { id: string } | null = null;

    if (bsuid) {
      // 1. Try by BSUID first
      const res = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", channel.organization_id)
        .eq("whatsapp_bsuid", bsuid)
        .is("deleted_at", null)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      existingContact = res.data;
    }

    if (!existingContact && phone) {
      // 2. Fallback: look up by phone (handles transition period + phone-based wa_ids)
      const res = await supabase
        .from("contacts")
        .select("id, whatsapp_bsuid")
        .eq("organization_id", channel.organization_id)
        .eq("phone", phone)
        .is("deleted_at", null)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      existingContact = res.data;

      // Backfill BSUID on existing phone-based contact if BSUID now available
      if (res.data && bsuid && !res.data.whatsapp_bsuid) {
        await supabase
          .from("contacts")
          .update({ whatsapp_bsuid: bsuid })
          .eq("id", res.data.id);
      }
    }

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // AUTO-CREATE CONTACT (default behavior)
      const contactName = senderName || externalContactId;

      const insertData: Record<string, unknown> = {
        organization_id: channel.organization_id,
        name: contactName,
        source: "whatsapp",
        metadata: {
          auto_created: true,
          created_from: "messaging_webhook",
          whatsapp_name: senderName,
          business_unit_id: channel.business_unit_id,
        },
      };

      if (phone) insertData.phone = phone;
      if (bsuid) insertData.whatsapp_bsuid = bsuid;

      const { data: newContact, error: contactCreateErr } = await supabase
        .from("contacts")
        .insert(insertData)
        .select("id")
        .single();

      if (contactCreateErr) {
        console.error("Error auto-creating contact:", contactCreateErr);
      } else {
        contactId = newContact.id;
        console.log(`[Webhook] Auto-created contact: ${contactId} for ${bsuid ? `bsuid ${bsuid}` : `phone ${phone}`}`);
      }
    }

    // Create new conversation (always linked to contact now)
    const { data: newConv, error: convCreateErr } = await supabase
      .from("messaging_conversations")
      .insert({
        organization_id: channel.organization_id,
        channel_id: channel.id,
        business_unit_id: channel.business_unit_id,
        external_contact_id: externalContactId,
        external_contact_name: senderName || externalContactId,
        contact_id: contactId,
        status: "open",
        priority: "normal",
        // WhatsApp 24h window starts when customer sends message
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
          contactName: senderName || externalContactId,
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
    sender_name: senderName,
    reply_to_message_id: message.context?.id ? await findMessageByExternalId(supabase, conversationId, message.context.id) : null,
    metadata: {
      meta_message_id: message.id,
      timestamp: message.timestamp,
      context: message.context,
    },
  });

  if (msgErr) {
    // Ignore duplicate messages
    if (!msgErr.message.toLowerCase().includes("duplicate")) {
      throw msgErr;
    }
  }

  // Update conversation (trigger will update counters)
  await supabase
    .from("messaging_conversations")
    .update({
      last_message_at: timestamp.toISOString(),
      last_message_preview: getMessagePreview(content),
      last_message_direction: "inbound",
      // Reset 24h window on new inbound message
      window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      // Reopen if resolved
      status: "open",
      // Update contact name if we have one
      ...(senderName && { external_contact_name: senderName }),
    })
    .eq("id", conversationId);

  // Trigger AI processing for text messages (fire-and-forget)
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
    source?: string;
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
    const source = params.source || "whatsapp";
    const sourceLabel = source === "instagram" ? "Instagram" : "WhatsApp";
    const dealTitle = `${params.contactName} - ${sourceLabel}`;

    const { data: newDeal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: params.organizationId,
        board_id: params.boardId,
        stage_id: stageId,
        status: stageId, // CRM uses both stage_id and status - must be equal
        contact_id: params.contactId,
        title: dealTitle,
        value: 0,
        source: source,
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

    // Registrar activity para o usuário entender que o lead veio do canal de mensagens
    const sourceLabel = (params.source || "whatsapp") === "instagram" ? "Instagram" : "WhatsApp";
    await supabase.from("deal_activities").insert({
      deal_id: newDeal.id,
      organization_id: params.organizationId,
      activity_type: "note",
      title: `Lead criado automaticamente via ${sourceLabel}`,
      description: `Este negócio foi criado automaticamente quando ${params.contactName} enviou uma mensagem pelo ${sourceLabel}. Nenhuma ação manual foi necessária.`,
      metadata: {
        auto_created: true,
        source: params.source || "whatsapp",
        conversation_id: params.conversationId,
      },
    });

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

async function handleStatusUpdate(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string },
  status: MetaWebhookStatus
) {
  const validStatuses = ["sent", "delivered", "read", "failed"];
  if (!validStatuses.includes(status.status)) return;

  const timestamp = new Date(parseInt(status.timestamp) * 1000).toISOString();

  // Use RPC for atomic, idempotent status update
  // This prevents duplicate updates and ensures status only advances
  const errorCode = status.status === "failed" && status.errors?.[0]
    ? String(status.errors[0].code)
    : null;
  const errorMessage = status.status === "failed" && status.errors?.[0]
    ? (status.errors[0].title || status.errors[0].message)
    : null;

  const { data: result, error } = await supabase.rpc("update_message_status_if_newer", {
    p_external_id: status.id,
    p_new_status: status.status,
    p_timestamp: timestamp,
    p_error_code: errorCode,
    p_error_message: errorMessage,
  });

  if (error) {
    console.error("[Webhook] Status update RPC error:", error);
    return;
  }

  // Log result for debugging
  if (result?.updated) {
    console.log(`[Webhook] Status updated: ${status.id} → ${status.status}`);
  } else {
    console.log(`[Webhook] Status skipped (${result?.reason}): ${status.id} → ${status.status}`);
  }

  // Update window expiration if conversation info is present
  if (status.conversation?.expiration_timestamp && result?.message_id) {
    const expirationTime = new Date(parseInt(status.conversation.expiration_timestamp) * 1000);

    // Find conversation by message and update window
    const { data: msg } = await supabase
      .from("messaging_messages")
      .select("conversation_id")
      .eq("id", result.message_id)
      .maybeSingle();

    if (msg?.conversation_id) {
      await supabase
        .from("messaging_conversations")
        .update({ window_expires_at: expirationTime.toISOString() })
        .eq("id", msg.conversation_id);
    }
  }
}

// =============================================================================
// INSTAGRAM HANDLERS
// =============================================================================

/**
 * Handle the full Instagram webhook flow: dedup, process events, mark processed.
 */
async function handleInstagramWebhookFlow(
  supabase: ReturnType<typeof createClient>,
  channel: {
    id: string;
    organization_id: string;
    business_unit_id: string;
    external_identifier: string;
    business_unit?: {
      id: string;
      name: string;
      auto_create_deal: boolean;
      default_board_id: string | null;
    } | null;
  },
  channelId: string,
  payload: MetaCloudWebhookPayload
): Promise<Response> {
  const entry = payload.entry?.[0];
  if (!entry?.messaging?.[0]) {
    return json(200, { ok: true, ignored: true });
  }

  const messagingEvent = entry.messaging[0];

  // Generate stable event ID for deduplication
  const externalEventId = generateInstagramEventId(messagingEvent);

  const { error: eventInsertErr } = await supabase
    .from("messaging_webhook_events")
    .insert({
      channel_id: channelId,
      event_type: determineInstagramEventType(messagingEvent),
      external_event_id: externalEventId,
      payload: payload as unknown as Record<string, unknown>,
      processed: false,
    });

  if (eventInsertErr?.message?.toLowerCase().includes("duplicate")) {
    console.log(`[Webhook/IG] Duplicate event ignored: ${externalEventId}`);
    return json(200, { ok: true, duplicate: true, event_id: externalEventId });
  }

  if (eventInsertErr) {
    console.error("[Webhook/IG] Error logging webhook event:", eventInsertErr);
  }

  try {
    // Skip echo messages (our own outbound messages echoed back)
    if (messagingEvent.message?.is_echo) {
      console.log(`[Webhook/IG] Echo message ignored: ${messagingEvent.message.mid}`);
    }
    // Handle delivery confirmations
    else if (messagingEvent.delivery) {
      for (const mid of messagingEvent.delivery.mids || []) {
        await handleInstagramStatusUpdate(supabase, mid, "delivered", messagingEvent.timestamp);
      }
    }
    // Handle read receipts
    else if (messagingEvent.read) {
      // Instagram read receipts don't include specific message IDs,
      // they use a watermark timestamp (all messages before this are read)
      console.log(`[Webhook/IG] Read receipt watermark: ${messagingEvent.read.watermark}`);
    }
    // Handle incoming messages
    else if (messagingEvent.message && !messagingEvent.message.is_echo) {
      await handleInstagramInboundMessage(supabase, channel, messagingEvent);
    }

    // Mark event as processed
    await supabase
      .from("messaging_webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("external_event_id", externalEventId);

    return json(200, { ok: true, event_type: determineInstagramEventType(messagingEvent) });
  } catch (error) {
    console.error("[Webhook/IG] Processing error:", error);

    await supabase
      .from("messaging_webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("channel_id", channelId)
      .eq("external_event_id", externalEventId);

    // Return 200 to prevent Meta from retrying
    return json(200, {
      ok: false,
      error: "Processing error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function generateInstagramEventId(event: InstagramMessagingEvent): string {
  if (event.message) {
    return `ig_msg_${event.message.mid}`;
  }
  if (event.delivery) {
    return `ig_delivery_${event.delivery.watermark}_${event.sender.id}`;
  }
  if (event.read) {
    return `ig_read_${event.read.watermark}_${event.sender.id}`;
  }
  return `ig_unknown_${event.sender.id}_${event.timestamp}`;
}

function determineInstagramEventType(event: InstagramMessagingEvent): string {
  if (event.message?.is_echo) return "echo";
  if (event.message) return "message_received";
  if (event.delivery) return "delivery";
  if (event.read) return "read";
  return "unknown";
}

function extractInstagramContent(message: InstagramMessage): MessageContent {
  // Text-only message
  if (message.text && !message.attachments?.length) {
    return { type: "text", text: message.text };
  }

  // Attachment message
  if (message.attachments?.[0]) {
    const attachment = message.attachments[0];
    // ig_post uses payload.media_url; share/others use payload.url
    const url = attachment.payload?.media_url || attachment.payload?.url || "";

    switch (attachment.type) {
      case "image":
        return {
          type: "image",
          mediaUrl: url,
          mimeType: "image/jpeg",
          caption: message.text,
        };
      case "video":
        return {
          type: "video",
          mediaUrl: url,
          mimeType: "video/mp4",
          caption: message.text,
        };
      case "audio":
        return {
          type: "audio",
          mediaUrl: url,
          mimeType: "audio/mp4",
        };
      case "ig_post": // New in Oct 2025 — replaces "share" from Feb 1, 2026
      case "share":   // Deprecated Feb 1, 2026 — keep for backward compat
        // Instagram shared post/reel/story
        return {
          type: "text",
          text: message.text || `[Compartilhamento: ${url}]`,
        };
      default:
        return {
          type: "text",
          text: message.text || `[${attachment.type}]`,
        };
    }
  }

  return { type: "text", text: message.text || "[Mensagem]" };
}

function getInstagramMessagePreview(content: MessageContent): string {
  switch (content.type) {
    case "text":
      return (content.text || "").slice(0, 100);
    case "image":
      return content.caption || "[Imagem]";
    case "video":
      return content.caption || "[Vídeo]";
    case "audio":
      return "[Áudio]";
    default:
      return "[Mensagem]";
  }
}

async function handleInstagramInboundMessage(
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
  event: InstagramMessagingEvent
) {
  const message = event.message!;
  const senderId = event.sender.id; // IGSID (Instagram Scoped ID)
  const externalMessageId = message.mid;
  const content = extractInstagramContent(message);
  const timestamp = new Date(event.timestamp);

  // Find or create conversation using IGSID as external_contact_id
  const { data: existingConv, error: convFindErr } = await supabase
    .from("messaging_conversations")
    .select("id, contact_id, unread_count, message_count")
    .eq("channel_id", channel.id)
    .eq("external_contact_id", senderId)
    .maybeSingle();

  if (convFindErr) throw convFindErr;

  let conversationId: string;
  let contactId: string | null = null;

  if (existingConv) {
    conversationId = existingConv.id;
    contactId = existingConv.contact_id;
  } else {
    // Instagram doesn't expose phone/email — lookup by IGSID in metadata (order+limit to handle duplicates)
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", channel.organization_id)
      .contains("metadata", { instagram_id: senderId })
      .is("deleted_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // Auto-create contact with IGSID
      const contactName = `Instagram ${senderId.slice(-6)}`;

      const { data: newContact, error: contactCreateErr } = await supabase
        .from("contacts")
        .insert({
          organization_id: channel.organization_id,
          name: contactName,
          source: "instagram",
          metadata: {
            auto_created: true,
            created_from: "messaging_webhook",
            instagram_id: senderId,
            business_unit_id: channel.business_unit_id,
          },
        })
        .select("id")
        .single();

      if (contactCreateErr) {
        console.error("[Webhook/IG] Error auto-creating contact:", contactCreateErr);
      } else {
        contactId = newContact.id;
        console.log(`[Webhook/IG] Auto-created contact: ${contactId} for IGSID ${senderId}`);
      }
    }

    // Create new conversation
    const { data: newConv, error: convCreateErr } = await supabase
      .from("messaging_conversations")
      .insert({
        organization_id: channel.organization_id,
        channel_id: channel.id,
        business_unit_id: channel.business_unit_id,
        external_contact_id: senderId,
        external_contact_name: `Instagram ${senderId.slice(-6)}`,
        contact_id: contactId,
        status: "open",
        priority: "normal",
        // Instagram has a 24h window but no templates to reopen, so this is informative
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (convCreateErr) throw convCreateErr;
    conversationId = newConv.id;

    // Auto-create deal if lead routing rule exists for this channel
    if (contactId) {
      const routingRule = await getLeadRoutingRule(supabase, channel.id);
      if (routingRule) {
        await autoCreateDeal(supabase, {
          organizationId: channel.organization_id,
          contactId,
          boardId: routingRule.boardId,
          stageId: routingRule.stageId,
          conversationId,
          contactName: `Instagram ${senderId.slice(-6)}`,
          businessUnitName: channel.business_unit?.name || "Sem unidade",
          source: "instagram",
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
    status: "delivered",
    delivered_at: timestamp.toISOString(),
    metadata: {
      instagram_mid: message.mid,
      timestamp: event.timestamp,
    },
  });

  if (msgErr) {
    if (!msgErr.message.toLowerCase().includes("duplicate")) {
      throw msgErr;
    }
  }

  // Update conversation
  await supabase
    .from("messaging_conversations")
    .update({
      last_message_at: timestamp.toISOString(),
      last_message_preview: getInstagramMessagePreview(content),
      last_message_direction: "inbound",
      window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "open",
    })
    .eq("id", conversationId);

  // Trigger AI processing for text messages (fire-and-forget)
  if (content.type === "text" && content.text) {
    triggerAIProcessing({
      conversationId,
      organizationId: channel.organization_id,
      messageText: content.text,
      messageId: externalMessageId,
    }).catch((err) => {
      // Log but don't fail the webhook
      console.error("[Webhook/IG] AI processing trigger error:", err);
    });
  }
}

async function handleInstagramStatusUpdate(
  supabase: ReturnType<typeof createClient>,
  externalMessageId: string,
  status: "delivered" | "read",
  timestamp: number
) {
  const ts = new Date(timestamp).toISOString();

  const { data: result, error } = await supabase.rpc("update_message_status_if_newer", {
    p_external_id: externalMessageId,
    p_new_status: status,
    p_timestamp: ts,
    p_error_code: null,
    p_error_message: null,
  });

  if (error) {
    console.error("[Webhook/IG] Status update RPC error:", error);
    return;
  }

  if (result?.updated) {
    console.log(`[Webhook/IG] Status updated: ${externalMessageId} → ${status}`);
  }
}

async function findMessageByExternalId(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  externalId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("messaging_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("external_id", externalId)
    .maybeSingle();

  return data?.id || null;
}

// =============================================================================
// WHATSAPP CALLING HANDLERS
// =============================================================================


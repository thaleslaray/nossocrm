/**
 * Resend Webhook Handler
 *
 * Recebe eventos do Resend API e processa:
 * - email.sent → status 'sent'
 * - email.delivered → status 'delivered'
 * - email.opened → status 'read'
 * - email.bounced → status 'failed'
 * - email.complained → status 'failed'
 *
 * Rotas:
 * - `POST /functions/v1/messaging-webhook-resend/<channel_id>` → Eventos do webhook
 *
 * Autenticação:
 * - Svix headers: svix-id, svix-timestamp, svix-signature
 * - HMAC-SHA256 verification against channel webhookSecret
 *
 * @see https://resend.com/docs/webhooks
 */
import { createClient } from "npm:@supabase/supabase-js@2";

// =============================================================================
// TYPES
// =============================================================================

interface ResendWebhookPayload {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.delivery_delayed"
    | "email.complained"
    | "email.bounced"
    | "email.opened"
    | "email.clicked";
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    bounce?: {
      message: string;
    };
    click?: {
      link: string;
      timestamp: string;
      userAgent: string;
    };
  };
}

// =============================================================================
// HELPERS
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, svix-id, svix-timestamp, svix-signature",
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
  const idx = parts.findIndex((p) => p === "messaging-webhook-resend");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

/**
 * Map Resend event type to our internal message status.
 */
function mapEventToStatus(eventType: string): "sent" | "delivered" | "read" | "failed" | null {
  switch (eventType) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.opened":
    case "email.clicked":
      return "read";
    case "email.bounced":
    case "email.complained":
      return "failed";
    case "email.delivery_delayed":
      return null; // Don't change status, just log
    default:
      return null;
  }
}

/**
 * Generate stable event ID for deduplication.
 */
function generateStableEventId(payload: ResendWebhookPayload): string {
  return `resend_${payload.data.email_id}_${payload.type}`;
}

// =============================================================================
// SVIX SIGNATURE VERIFICATION
// =============================================================================

/** Maximum allowed age for webhook timestamps (5 minutes). */
const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Decode a Svix webhook signing secret.
 * Svix secrets are base64-encoded and prefixed with "whsec_".
 */
function decodeSvixSecret(secret: string): Uint8Array {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  // Deno has atob built-in; convert base64 → Uint8Array
  const binaryStr = atob(raw);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Timing-safe comparison of two Uint8Arrays.
 * Uses crypto.subtle.timingSafeEqual when available (Deno 1.38+),
 * otherwise falls back to a constant-time XOR loop.
 */
async function timingSafeEqual(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  if (a.length !== b.length) return false;
  // Deno exposes crypto.subtle.timingSafeEqual since 1.38
  if (typeof (crypto.subtle as Record<string, unknown>).timingSafeEqual === "function") {
    return (crypto.subtle as unknown as { timingSafeEqual: (a: BufferSource, b: BufferSource) => boolean }).timingSafeEqual(a, b);
  }
  // Fallback: constant-time XOR comparison
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Verify Svix webhook signature.
 *
 * @param rawBody - The raw request body as a string
 * @param headers - Object with svix-id, svix-timestamp, svix-signature
 * @param secret - The webhook signing secret from channel credentials
 * @returns true if signature is valid, false otherwise
 */
async function verifySvixSignature(
  rawBody: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string },
  secret: string
): Promise<boolean> {
  const { svixId, svixTimestamp, svixSignature } = headers;

  // 1. Validate timestamp is not too old (replay attack prevention)
  const timestampSeconds = parseInt(svixTimestamp, 10);
  if (isNaN(timestampSeconds)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > SVIX_TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  // 2. Compute expected signature: HMAC-SHA256(secret, "${svixId}.${svixTimestamp}.${rawBody}")
  const secretBytes = decodeSvixSecret(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(signPayload))
  );

  // 3. Encode expected signature as base64
  const expectedB64 = btoa(String.fromCharCode(...signatureBytes));

  // 4. Parse provided signatures (format: "v1,<base64>" — may contain multiple)
  const providedSignatures = svixSignature.split(" ");
  for (const sig of providedSignatures) {
    const parts = sig.split(",");
    // Only support v1 signatures
    if (parts[0] !== "v1" || !parts[1]) continue;

    const providedB64 = parts[1];

    // Decode both to Uint8Array for timing-safe comparison
    const expectedBytes = encoder.encode(expectedB64);
    const providedBytes = encoder.encode(providedB64);

    if (await timingSafeEqual(expectedBytes, providedBytes)) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return json(405, { error: "Método não permitido" });
  }

  const channelId = getChannelIdFromPath(req);
  if (!channelId) {
    return json(404, { error: "channel_id ausente na URL" });
  }

  // Read raw body BEFORE parsing JSON — needed for signature verification
  const rawBody = await req.text();

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

  // Fetch channel to verify it exists
  const { data: channel, error: channelErr } = await supabase
    .from("messaging_channels")
    .select("id, organization_id, credentials")
    .eq("id", channelId)
    .eq("channel_type", "email")
    .is("deleted_at", null)
    .maybeSingle();

  if (channelErr) {
    return json(500, { error: "Erro ao buscar canal", details: channelErr.message });
  }

  if (!channel) {
    return json(404, { error: "Canal não encontrado" });
  }

  // =========================================================================
  // SVIX SIGNATURE VERIFICATION
  // =========================================================================
  const webhookSecret = (channel.credentials as Record<string, string>)?.webhookSecret;
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (webhookSecret) {
    // If the channel has a webhookSecret configured, enforce Svix verification
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn(`[Webhook/Resend] Missing Svix headers for channel ${channelId}`);
      return json(401, { error: "Svix headers ausentes" });
    }

    const isValid = await verifySvixSignature(rawBody, { svixId, svixTimestamp, svixSignature }, webhookSecret);
    if (!isValid) {
      console.warn(`[Webhook/Resend] Invalid Svix signature for channel ${channelId}`);
      return json(401, { error: "Assinatura Svix inválida" });
    }
  } else {
    // Default-deny: reject unauthenticated requests when no secret is configured.
    // Consistent with messaging-webhook-zapi and messaging-webhook-evolution.
    console.warn(`[Webhook/Resend] No webhookSecret configured for channel ${channelId} — rejecting request`);
    return json(401, { error: "Webhook secret não configurado para este canal" });
  }

  // Parse payload from raw body
  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  // Validate payload structure
  if (!payload.type || !payload.data?.email_id) {
    return json(400, { error: "Payload inválido: type ou data.email_id ausente" });
  }

  // Generate stable event ID for deduplication
  const externalEventId = generateStableEventId(payload);

  // Log webhook event for audit and deduplication
  const { error: eventInsertErr } = await supabase
    .from("messaging_webhook_events")
    .insert({
      channel_id: channelId,
      event_type: payload.type,
      external_event_id: externalEventId,
      payload: payload as unknown as Record<string, unknown>,
      processed: false,
    });

  // If duplicate (already processed), return early with success
  if (eventInsertErr?.message?.toLowerCase().includes("duplicate")) {
    console.log(`[Webhook/Resend] Duplicate event ignored: ${externalEventId}`);
    return json(200, { ok: true, duplicate: true, event_id: externalEventId });
  }

  if (eventInsertErr) {
    console.error("[Webhook/Resend] Error logging webhook event:", eventInsertErr);
  }

  try {
    const emailId = payload.data.email_id;
    const timestamp = new Date(payload.created_at).toISOString();
    const newStatus = mapEventToStatus(payload.type);

    if (newStatus) {
      // Get error info for failed status
      const errorCode = newStatus === "failed" ? payload.type.replace("email.", "").toUpperCase() : null;
      const errorMessage = newStatus === "failed"
        ? (payload.data.bounce?.message || (payload.type === "email.complained" ? "Recipient marked email as spam" : "Email failed"))
        : null;

      // Use RPC for atomic, idempotent status update
      const { data: result, error } = await supabase.rpc("update_message_status_if_newer", {
        p_external_id: emailId,
        p_new_status: newStatus,
        p_timestamp: timestamp,
        p_error_code: errorCode,
        p_error_message: errorMessage,
      });

      if (error) {
        console.error("[Webhook/Resend] Status update RPC error:", error);
      } else if (result?.updated) {
        console.log(`[Webhook/Resend] Status updated: ${emailId} → ${newStatus}`);
      } else {
        console.log(`[Webhook/Resend] Status skipped (${result?.reason}): ${emailId} → ${newStatus}`);
      }
    } else {
      // Just log informational events
      console.log(`[Webhook/Resend] Informational event: ${payload.type} for ${emailId}`);
    }

    // Log click events for analytics
    if (payload.type === "email.clicked" && payload.data.click) {
      console.log(`[Webhook/Resend] Link clicked: ${payload.data.click.link}`);
    }

    // Mark event as processed
    await supabase
      .from("messaging_webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("external_event_id", externalEventId);

    return json(200, { ok: true, event_type: payload.type });
  } catch (error) {
    console.error("[Webhook/Resend] Processing error:", error);

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

    // Return 200 to prevent Resend from retrying
    return json(200, {
      ok: false,
      error: "Processing error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

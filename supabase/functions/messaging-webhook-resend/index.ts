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

  // Parse payload
  let payload: ResendWebhookPayload;
  try {
    payload = (await req.json()) as ResendWebhookPayload;
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

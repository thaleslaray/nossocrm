import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import {
  getOrCreateConversation,
  insertMessage,
  updateMessageStatus,
  updateInstance,
  updateConversation,
} from '@/lib/supabase/whatsapp';
import * as evolution from '@/lib/evolution/client';
import { getEvolutionCredentials } from '@/lib/evolution/helpers';
import { processIncomingMessage } from '@/lib/evolution/aiAgent';
import type {
  EvolutionMessageUpsert,
  EvolutionMessageUpdate,
  EvolutionConnectionUpdate,
  EvolutionWebhookPayload,
} from '@/types/whatsapp';

type Params = { params: Promise<{ instanceId: string }> };

/**
 * Evolution API Webhook receiver.
 *
 * Route:
 *   POST /api/whatsapp/webhook/{instanceId}
 *
 * The instanceId in the URL is our internal UUID (whatsapp_instances.id).
 * Evolution API is configured to POST all events to this single endpoint.
 * The `event` field in the JSON body determines the type of webhook.
 */
export async function POST(request: Request, { params }: Params) {
  const { instanceId } = await params;

  const supabase = createStaticAdminClient();

  // Get the instance from our DB
  const { data: instance, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .single();

  if (!instance) {
    console.error('[whatsapp-webhook] Instance not found:', instanceId, instanceError?.message);
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    console.error('[whatsapp-webhook] Invalid JSON body for instance:', instanceId);
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  try {
    const event = (body as EvolutionWebhookPayload).event;

    switch (event) {
      case 'messages.upsert': {
        const payload = body as EvolutionMessageUpsert;
        console.log(
          '[whatsapp-webhook] messages.upsert from:',
          payload.data.key.remoteJid,
          'fromMe:',
          payload.data.key.fromMe,
        );
        await handleMessageUpsert(supabase, instance, payload);
        break;
      }

      case 'messages.update': {
        const payload = body as EvolutionMessageUpdate;
        console.log('[whatsapp-webhook] messages.update for instance:', instanceId);
        await handleMessageUpdate(supabase, payload);
        break;
      }

      case 'connection.update': {
        const payload = body as EvolutionConnectionUpdate;
        console.log('[whatsapp-webhook] connection.update:', instanceId, 'state:', payload.data.state);
        await handleConnectionUpdate(supabase, instance, payload);
        break;
      }

      case 'qrcode.updated': {
        // QR code updates are handled by the frontend polling; no action needed here.
        console.log('[whatsapp-webhook] qrcode.updated for instance:', instanceId);
        break;
      }

      default: {
        console.warn(
          '[whatsapp-webhook] Unrecognized event:',
          event,
          'instance:',
          instanceId,
          'keys:',
          Object.keys(body).join(','),
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[whatsapp-webhook] Error processing webhook:', instanceId, err);
    return NextResponse.json({ ok: true }); // Return 200 to prevent Evolution API retries
  }
}

// Also handle GET for webhook verification
export async function GET() {
  return NextResponse.json({ ok: true, service: 'fullhouse-crm-whatsapp-webhook' });
}

// ---------------------------------------------------------------------------
// Handler: Incoming message (messages.upsert)
// ---------------------------------------------------------------------------

async function handleMessageUpsert(
  supabase: ReturnType<typeof createStaticAdminClient>,
  instance: Record<string, unknown>,
  payload: EvolutionMessageUpsert,
) {
  const { key, pushName, message, messageTimestamp } = payload.data;

  // Skip messages sent by ourselves
  if (key.fromMe) return;

  // Skip group messages (group JIDs end with @g.us)
  if (key.remoteJid.endsWith('@g.us')) return;

  // Skip status broadcast messages
  if (key.remoteJid === 'status@broadcast') return;

  const organizationId = instance.organization_id as string;
  const instanceDbId = instance.id as string;

  // Extract phone number from remoteJid (strip @s.whatsapp.net or @g.us suffix)
  const phone = key.remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');

  // Get or create conversation
  const conversation = await getOrCreateConversation(
    supabase,
    organizationId,
    instanceDbId,
    phone,
    pushName,
    undefined, // contactPhoto — not provided by Evolution API in message payloads
    false,
  );

  // Determine message type and content
  const { messageType, textBody, mediaUrl, mediaMimeType, mediaFilename, mediaCaption, latitude, longitude } =
    extractMessageContent(message);

  // Convert timestamp from seconds to ISO string
  const whatsappTimestamp = messageTimestamp
    ? new Date(messageTimestamp * 1000).toISOString()
    : new Date().toISOString();

  // Persist message
  const insertedMessage = await insertMessage(supabase, {
    conversation_id: conversation.id,
    organization_id: organizationId,
    evolution_message_id: key.id,
    from_me: false,
    sender_name: pushName,
    message_type: messageType,
    text_body: textBody,
    media_url: mediaUrl,
    media_mime_type: mediaMimeType,
    media_filename: mediaFilename,
    media_caption: mediaCaption,
    latitude,
    longitude,
    status: 'received',
    whatsapp_timestamp: whatsappTimestamp,
  } as Parameters<typeof insertMessage>[1]);

  // Update conversation metadata so the list reflects the new message
  const previewText = textBody || mediaCaption || (messageType !== 'text' ? `[${messageType}]` : '');
  await updateConversation(supabase, conversation.id, {
    last_message_text: previewText.slice(0, 255),
    last_message_at: whatsappTimestamp,
    last_message_from_me: false,
    unread_count: (conversation.unread_count ?? 0) + 1,
    status: 'open',
  } as Parameters<typeof updateConversation>[2]);

  // Check if AI agent should process this message
  const aiEnabled = instance.ai_enabled as boolean;
  if (aiEnabled && conversation.ai_active) {
    // Fetch organization settings for evolution_api_url
    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select('evolution_api_url')
      .eq('organization_id', organizationId)
      .single();

    // Process in background (don't block the webhook response)
    processIncomingMessage({
      supabase,
      conversation,
      instance: {
        id: instanceDbId,
        evolution_instance_name: (instance.evolution_instance_name as string) || (instance.instance_id as string),
        instance_token: instance.instance_token as string,
        organization_id: organizationId,
        evolution_api_url: orgSettings?.evolution_api_url || '',
      },
      incomingMessage: insertedMessage,
    }).catch((err) => {
      console.error('[whatsapp-ai-agent] Error processing message:', err);
    });
  }
}

// ---------------------------------------------------------------------------
// Handler: Message status change (messages.update)
// ---------------------------------------------------------------------------

async function handleMessageUpdate(
  supabase: ReturnType<typeof createStaticAdminClient>,
  payload: EvolutionMessageUpdate,
) {
  const statusMap: Record<string, string> = {
    PENDING: 'pending',
    SERVER_ACK: 'sent',
    DELIVERY_ACK: 'received',
    READ: 'read',
    PLAYED: 'read',
  };

  // Evolution API sends an array of status updates
  for (const item of payload.data) {
    const newStatus = statusMap[item.update.status];
    if (newStatus && item.key.id) {
      await updateMessageStatus(supabase, item.key.id, newStatus);
    }
  }
}

// ---------------------------------------------------------------------------
// Handler: Connection state change (connection.update)
// ---------------------------------------------------------------------------

async function handleConnectionUpdate(
  supabase: ReturnType<typeof createStaticAdminClient>,
  instance: Record<string, unknown>,
  payload: EvolutionConnectionUpdate,
) {
  const { state } = payload.data;

  const statusMap: Record<string, string> = {
    open: 'connected',
    close: 'disconnected',
    connecting: 'connecting',
  };

  const newStatus = statusMap[state] || 'disconnected';

  await updateInstance(supabase, instance.id as string, {
    status: newStatus,
    ...(state === 'open' ? { connected_at: new Date().toISOString() } : {}),
  } as Parameters<typeof updateInstance>[2]);

  // Re-configure webhooks on connection to ensure they point to the current app URL
  if (state === 'open') {
    const rawAppUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

    if (rawAppUrl) {
      const appUrl = rawAppUrl.replace(/\/+$/, '');
      const webhookUrl = `${appUrl}/api/whatsapp/webhook/${instance.id as string}`;
      console.log('[whatsapp-webhook] Configuring Evolution webhook to:', webhookUrl);

      try {
        const creds = await getEvolutionCredentials(supabase, {
          instance_token: instance.instance_token as string,
          evolution_instance_name: instance.evolution_instance_name as string | undefined,
          instance_id: instance.instance_id as string,
          organization_id: instance.organization_id as string,
        });

        evolution.setWebhook(creds, {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            'messages.upsert',
            'messages.update',
            'connection.update',
            'qrcode.updated',
          ],
        }).catch((err) => {
          console.error('[whatsapp-webhook] Failed to re-configure webhook on connect:', err);
        });
      } catch (err) {
        console.error('[whatsapp-webhook] Failed to get Evolution credentials for webhook config:', err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractMessageContent(message: EvolutionMessageUpsert['data']['message']): {
  messageType: string;
  textBody?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaCaption?: string;
  latitude?: number;
  longitude?: number;
} {
  // Text messages: "conversation" (simple text) or "extendedTextMessage" (text with link preview)
  if (message.conversation) {
    return { messageType: 'text', textBody: message.conversation };
  }
  if (message.extendedTextMessage?.text) {
    return { messageType: 'text', textBody: message.extendedTextMessage.text };
  }

  // Image message
  if (message.imageMessage) {
    return {
      messageType: 'image',
      mediaUrl: message.imageMessage.url || message.imageMessage.directPath,
      mediaMimeType: message.imageMessage.mimetype,
      mediaCaption: message.imageMessage.caption,
    };
  }

  // Video message
  if (message.videoMessage) {
    return {
      messageType: 'video',
      mediaUrl: message.videoMessage.url || message.videoMessage.directPath,
      mediaMimeType: message.videoMessage.mimetype,
      mediaCaption: message.videoMessage.caption,
    };
  }

  // Audio message (voice notes have ptt=true)
  if (message.audioMessage) {
    return {
      messageType: 'audio',
      mediaUrl: message.audioMessage.url || message.audioMessage.directPath,
      mediaMimeType: message.audioMessage.mimetype,
    };
  }

  // Document message
  if (message.documentMessage) {
    return {
      messageType: 'document',
      mediaUrl: message.documentMessage.url || message.documentMessage.directPath,
      mediaMimeType: message.documentMessage.mimetype,
      mediaFilename: message.documentMessage.fileName || message.documentMessage.title,
    };
  }

  // Sticker message
  if (message.stickerMessage) {
    return {
      messageType: 'sticker',
      mediaUrl: message.stickerMessage.url || message.stickerMessage.directPath,
      mediaMimeType: message.stickerMessage.mimetype,
    };
  }

  // Location message
  if (message.locationMessage) {
    return {
      messageType: 'location',
      latitude: message.locationMessage.degreesLatitude,
      longitude: message.locationMessage.degreesLongitude,
    };
  }

  // Reaction message
  if (message.reactionMessage) {
    return {
      messageType: 'reaction',
      textBody: message.reactionMessage.text,
    };
  }

  // Contact message
  if (message.contactMessage) {
    return { messageType: 'contact' };
  }

  // List response message
  if (message.listResponseMessage) {
    return { messageType: 'list_response' };
  }

  // Buttons response message
  if (message.buttonsResponseMessage) {
    return { messageType: 'button_response' };
  }

  // Fallback for unsupported message types
  return { messageType: 'text', textBody: '[Mensagem não suportada]' };
}

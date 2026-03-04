import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { getEvolutionCredentials } from '@/lib/evolution/helpers';
import * as evolution from '@/lib/evolution/client';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/whatsapp/instances/[id]/sync-chats
 *
 * Fetches existing chats from Evolution API and imports them as conversations
 * with their message history. Useful when the webhook missed messages
 * or when the instance was connected before webhooks were configured.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // Get the instance
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const creds = await getEvolutionCredentials(supabase, instance);

  try {
    // Fetch chats from Evolution API
    const chats = await evolution.findChats(creds);
    if (!chats || !Array.isArray(chats)) {
      return NextResponse.json({ data: { synced: 0, messages: 0 }, message: 'Nenhum chat encontrado na Evolution API.' });
    }

    // Use admin client for writing (bypass RLS)
    const adminSupabase = createStaticAdminClient();
    let synced = 0;
    let totalMessages = 0;

    for (const chat of chats) {
      const chatObj = chat as Record<string, unknown>;

      // Extract JID from the chat object
      const jid = (chatObj.id as string) || '';

      // Skip groups (group JIDs end with @g.us)
      if (jid.endsWith('@g.us')) continue;
      // Skip if not a valid user JID
      if (!jid.endsWith('@s.whatsapp.net')) continue;

      // Clean phone number: strip @s.whatsapp.net suffix
      const phone = jid.replace(/@s\.whatsapp\.net$/, '');
      if (!phone) continue;

      // Extract contact name from chat object
      const contactName = (chatObj.name as string) || (chatObj.pushName as string) || undefined;

      // Check if conversation already exists
      const { data: existing } = await adminSupabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('instance_id', instance.id)
        .eq('phone', phone)
        .single();

      if (existing) {
        // Even for existing conversations, sync messages that might be missing
        const msgCount = await syncMessagesForConversation(
          adminSupabase, creds, existing.id, profile.organization_id, jid,
        );
        totalMessages += msgCount;
        if (msgCount > 0) synced++; // Count as synced if new messages were imported
        continue;
      }

      // Create the conversation
      const { data: newConv, error: insertError } = await adminSupabase
        .from('whatsapp_conversations')
        .insert({
          instance_id: instance.id,
          organization_id: profile.organization_id,
          phone,
          contact_name: contactName,
          is_group: false,
          unread_count: 0,
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError || !newConv) {
        console.error('[sync-chats] Error inserting conversation for phone:', phone, insertError?.message);
        continue;
      }

      // Fetch and import messages for this conversation
      const msgCount = await syncMessagesForConversation(
        adminSupabase, creds, newConv.id, profile.organization_id, jid,
      );
      totalMessages += msgCount;
      synced++;
    }

    return NextResponse.json({
      data: { synced, total: chats.length, messages: totalMessages },
      message: synced > 0
        ? `${synced} conversa(s) sincronizada(s) com ${totalMessages} mensagem(ns)!`
        : 'Todas as conversas já estão sincronizadas.',
    });
  } catch (err) {
    console.error('[sync-chats] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Falha ao sincronizar chats' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch messages from Evolution API for a chat and import them into the DB. */
async function syncMessagesForConversation(
  supabase: ReturnType<typeof createStaticAdminClient>,
  creds: evolution.EvolutionCredentials,
  conversationId: string,
  organizationId: string,
  remoteJid: string,
): Promise<number> {
  let rawMessages: unknown[];
  try {
    rawMessages = await evolution.findMessages(creds, remoteJid);
  } catch (err) {
    console.error('[sync-chats] Error fetching messages for JID:', remoteJid, err);
    return 0;
  }

  if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) return 0;

  const messages = rawMessages as Array<Record<string, unknown>>;

  // Get existing message IDs to avoid duplicates
  const { data: existingMsgs } = await supabase
    .from('whatsapp_messages')
    .select('evolution_message_id')
    .eq('conversation_id', conversationId)
    .not('evolution_message_id', 'is', null);

  const existingIds = new Set((existingMsgs ?? []).map((m) => m.evolution_message_id));

  // Filter out already-imported messages and extract message IDs
  const newMessages = messages.filter((m) => {
    const key = m.key as Record<string, unknown> | undefined;
    const msgId = key?.id as string | undefined;
    return msgId && !existingIds.has(msgId);
  });

  if (newMessages.length === 0) return 0;

  // Sort by timestamp ascending
  newMessages.sort((a, b) => {
    const tsA = Number(a.messageTimestamp) || 0;
    const tsB = Number(b.messageTimestamp) || 0;
    return tsA - tsB;
  });

  // Build insert rows
  const rows = newMessages.map((m) => {
    const key = m.key as Record<string, unknown> | undefined;
    const messageId = key?.id as string | undefined;
    const fromMe = (key?.fromMe as boolean) ?? false;
    const senderName = (m.pushName as string) || undefined;
    const rawTimestamp = Number(m.messageTimestamp) || 0;
    // Evolution API timestamps may be in seconds — convert to milliseconds if needed
    const timestampMs = rawTimestamp > 1e12 ? rawTimestamp : rawTimestamp * 1000;
    const whatsappTimestamp = rawTimestamp ? new Date(timestampMs).toISOString() : new Date().toISOString();

    const { messageType, textBody, mediaUrl, mediaMimeType, mediaFilename, mediaCaption, latitude, longitude } = extractEvolutionMessageContent(m);

    return {
      conversation_id: conversationId,
      organization_id: organizationId,
      evolution_message_id: messageId,
      from_me: fromMe,
      sender_name: senderName,
      message_type: messageType,
      text_body: textBody,
      media_url: mediaUrl,
      media_mime_type: mediaMimeType,
      media_filename: mediaFilename,
      media_caption: mediaCaption,
      latitude,
      longitude,
      status: fromMe ? 'sent' : 'received',
      whatsapp_timestamp: whatsappTimestamp,
    };
  });

  // Batch insert (Supabase supports bulk insert)
  const { error: batchError } = await supabase
    .from('whatsapp_messages')
    .insert(rows);

  if (batchError) {
    console.error('[sync-chats] Error batch inserting messages for conversation:', conversationId, batchError.message);
    return 0;
  }

  // Update conversation with last message info
  const lastMsg = rows[rows.length - 1];
  const previewText = lastMsg.text_body || lastMsg.media_caption || (lastMsg.message_type !== 'text' ? `[${lastMsg.message_type}]` : '');
  await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_text: previewText.slice(0, 255),
      last_message_at: lastMsg.whatsapp_timestamp,
      last_message_from_me: lastMsg.from_me,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  return rows.length;
}

/**
 * Extract content from an Evolution API message object.
 *
 * Evolution API message structure:
 *   message.message.conversation → text
 *   message.message.extendedTextMessage.text → text (with link preview etc.)
 *   message.message.imageMessage → image
 *   message.message.videoMessage → video
 *   message.message.audioMessage → audio
 *   message.message.documentMessage → document
 *   message.message.stickerMessage → sticker
 *   message.message.locationMessage → location
 *   message.message.reactionMessage → reaction
 */
function extractEvolutionMessageContent(msg: Record<string, unknown>): {
  messageType: string;
  textBody?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaCaption?: string;
  latitude?: number;
  longitude?: number;
} {
  const messageObj = msg.message as Record<string, unknown> | undefined;
  if (!messageObj) {
    return { messageType: 'text', textBody: '[Mensagem não suportada]' };
  }

  // Plain text conversation
  if (typeof messageObj.conversation === 'string') {
    return { messageType: 'text', textBody: messageObj.conversation };
  }

  // Extended text message (with link previews, mentions, etc.)
  const extendedText = messageObj.extendedTextMessage as Record<string, unknown> | undefined;
  if (extendedText?.text) {
    return { messageType: 'text', textBody: extendedText.text as string };
  }

  // Image message
  const imageMsg = messageObj.imageMessage as Record<string, unknown> | undefined;
  if (imageMsg) {
    return {
      messageType: 'image',
      mediaUrl: imageMsg.url as string | undefined,
      mediaMimeType: imageMsg.mimetype as string | undefined,
      mediaCaption: imageMsg.caption as string | undefined,
    };
  }

  // Video message
  const videoMsg = messageObj.videoMessage as Record<string, unknown> | undefined;
  if (videoMsg) {
    return {
      messageType: 'video',
      mediaUrl: videoMsg.url as string | undefined,
      mediaMimeType: videoMsg.mimetype as string | undefined,
      mediaCaption: videoMsg.caption as string | undefined,
    };
  }

  // Audio message
  const audioMsg = messageObj.audioMessage as Record<string, unknown> | undefined;
  if (audioMsg) {
    return {
      messageType: 'audio',
      mediaUrl: audioMsg.url as string | undefined,
      mediaMimeType: audioMsg.mimetype as string | undefined,
    };
  }

  // Document message
  const documentMsg = messageObj.documentMessage as Record<string, unknown> | undefined;
  if (documentMsg) {
    return {
      messageType: 'document',
      mediaUrl: documentMsg.url as string | undefined,
      mediaMimeType: documentMsg.mimetype as string | undefined,
      mediaFilename: (documentMsg.fileName as string | undefined) || (documentMsg.title as string | undefined),
      mediaCaption: documentMsg.caption as string | undefined,
    };
  }

  // Sticker message
  const stickerMsg = messageObj.stickerMessage as Record<string, unknown> | undefined;
  if (stickerMsg) {
    return {
      messageType: 'sticker',
      mediaUrl: stickerMsg.url as string | undefined,
      mediaMimeType: stickerMsg.mimetype as string | undefined,
    };
  }

  // Location message
  const locationMsg = messageObj.locationMessage as Record<string, unknown> | undefined;
  if (locationMsg) {
    return {
      messageType: 'location',
      latitude: locationMsg.degreesLatitude as number | undefined,
      longitude: locationMsg.degreesLongitude as number | undefined,
    };
  }

  // Reaction message
  const reactionMsg = messageObj.reactionMessage as Record<string, unknown> | undefined;
  if (reactionMsg) {
    return { messageType: 'reaction', textBody: reactionMsg.text as string | undefined };
  }

  return { messageType: 'text', textBody: '[Mensagem não suportada]' };
}

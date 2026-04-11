import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
// Import from main module to ensure providers are registered
import { getChannelRouter, transformMessage } from '@/lib/messaging';
import type { SendMessageInput, MessageContent, DbMessagingMessage } from '@/lib/messaging';
import {
  getConversationCache,
  setConversationCache,
} from '@/lib/messaging/conversation-cache';

type ChannelInfo = { id: string; channel_type: string; provider: string };

export async function POST(request: NextRequest) {
  try {
    // Parallelize auth check and body parsing — no dependency between them
    const [supabase, body] = await Promise.all([
      createClient(),
      request.json() as Promise<SendMessageInput>,
    ]);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, content, replyToMessageId } = body;

    if (!conversationId || !content) {
      return NextResponse.json(
        { message: 'conversationId and content are required' },
        { status: 400 }
      );
    }

    // Read org_id from JWT app_metadata (injected by custom_access_token_hook at login).
    // Eliminates the profiles round-trip (~150ms) on every message send.
    // Falls back to a profiles query during the transition period before the hook is active.
    const orgId: string | undefined =
      (user.app_metadata?.organization_id as string | undefined) ??
      await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => data?.organization_id as string | undefined);

    if (!orgId) {
      return NextResponse.json({ message: 'Profile not found' }, { status: 404 });
    }

    // Fetch conversation to get channel info and recipient — cache hit skips the DB round-trip.
    // Cache is scoped to org to prevent IDOR on cache hits.
    let channel: ChannelInfo;
    let externalContactId: string;

    const cached = getConversationCache(conversationId, orgId);

    if (cached) {
      channel = cached.channel;
      externalContactId = cached.external_contact_id;
    } else {
      const { data: conversation, error: convError } = await supabase
        .from('messaging_conversations')
        .select(`
          id,
          organization_id,
          external_contact_id,
          channel:messaging_channels!channel_id (
            id,
            channel_type,
            provider
          )
        `)
        .eq('id', conversationId)
        .eq('organization_id', orgId)
        .single();

      if (convError || !conversation) {
        return NextResponse.json(
          { message: 'Conversation not found' },
          { status: 404 }
        );
      }

      channel = conversation.channel as unknown as ChannelInfo;
      externalContactId = conversation.external_contact_id;

      setConversationCache({
        id: conversation.id,
        organization_id: conversation.organization_id,
        external_contact_id: externalContactId,
        channel,
      });
    }

    // Create message record in database (pending state)
    const messageData = {
      conversation_id: conversationId,
      direction: 'outbound' as const,
      content_type: content.type,
      content: content as unknown as Record<string, unknown>,
      reply_to_message_id: replyToMessageId || null,
      status: 'pending' as const,
      sender_user_id: user.id,
      sender_type: 'user' as const,
      metadata: {},
    };

    const { data: dbMessage, error: insertError } = await supabase
      .from('messaging_messages')
      .insert(messageData)
      .select()
      .single();

    if (insertError || !dbMessage) {
      return NextResponse.json(
        { message: 'Failed to create message' },
        { status: 500 }
      );
    }

    // Fire-and-forget: send to provider without blocking the response.
    // Uses createStaticAdminClient (service role, no request context needed)
    // because the standard createClient depends on next/headers which is
    // unavailable after the response has been sent.
    const router = getChannelRouter();
    const messageId = dbMessage.id;
    const channelId = channel.id;

    void (async () => {
      const supabaseAdmin = createStaticAdminClient();
      try {
        await supabaseAdmin
          .from('messaging_messages')
          .update({ status: 'queued' })
          .eq('id', messageId);

        // Resolve internal replyToMessageId → provider's external_id (e.g. WhatsApp wamid).
        // Providers expect the platform message ID for threaded replies, not our DB UUID.
        // Z-API requires its own internal zapiMessageId (stored in metadata.zapi_message_id),
        // NOT the WhatsApp messageId stored in external_id.
        let replyToExternalId: string | undefined;
        if (replyToMessageId) {
          const { data: replyMsg } = await supabaseAdmin
            .from('messaging_messages')
            .select('external_id, metadata')
            .eq('id', replyToMessageId)
            .maybeSingle();

          if (replyMsg) {
            const zapiId = (replyMsg.metadata as Record<string, unknown> | null)?.zapi_message_id as string | undefined;
            // Z-API needs its internal zapiMessageId; other providers use external_id (WhatsApp ID)
            replyToExternalId = (channel.provider === 'z-api' ? zapiId : undefined) ?? replyMsg.external_id ?? undefined;
          }
        }

        console.log('[messaging/messages] sending to provider:', { messageId, channelId, provider: channel.provider, contentType: (content as MessageContent).type, to: externalContactId, replyToExternalId });

        const result = await router.sendMessage(channelId, {
          conversationId,
          to: externalContactId,
          content: content as MessageContent,
          replyToExternalId,
        });

        console.log('[messaging/messages] provider result:', JSON.stringify(result));

        if (result.success) {
          await supabaseAdmin
            .from('messaging_messages')
            .update({
              status: 'sent',
              external_id: result.externalMessageId,
              sent_at: new Date().toISOString(),
            })
            .eq('id', messageId);
        } else {
          console.error('[messaging/messages] provider failure:', result.error);
          await supabaseAdmin
            .from('messaging_messages')
            .update({
              status: 'failed',
              error_code: result.error?.code,
              error_message: result.error?.message,
              failed_at: new Date().toISOString(),
            })
            .eq('id', messageId);
        }
      } catch (err: unknown) {
        console.error('[messaging/messages] background send failed:', err instanceof Error ? err.message : err, err instanceof Error ? err.stack : '');
      }
    })();

    // Respond immediately with pending message — UI updates via realtime
    return NextResponse.json(transformMessage(dbMessage as DbMessagingMessage));
  } catch (error) {
    console.error('[messaging/messages]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

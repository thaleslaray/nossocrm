/**
 * POST /api/messaging/messages/[messageId]/retry
 *
 * Retry sending a failed message via its original channel/provider.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getChannelRouter, transformMessage } from '@/lib/messaging';
import type { MessageContent, DbMessagingMessage } from '@/lib/messaging';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const supabase = await createClient();

    // Auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the failed message with conversation + channel info
    const { data: message, error: msgError } = await supabase
      .from('messaging_messages')
      .select(
        `
        *,
        conversation:messaging_conversations!conversation_id (
          id,
          external_contact_id,
          channel_id,
          channel:messaging_channels!channel_id (
            id,
            channel_type,
            provider,
            organization_id
          )
        )
      `
      )
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      return NextResponse.json(
        { message: 'Message not found' },
        { status: 404 }
      );
    }

    // Validate status — only retry failed messages
    if (message.status !== 'failed') {
      return NextResponse.json(
        { message: 'Only failed messages can be retried' },
        { status: 400 }
      );
    }

    const conversation = message.conversation as {
      id: string;
      external_contact_id: string;
      channel_id: string;
      channel: {
        id: string;
        channel_type: string;
        provider: string;
        organization_id: string;
      };
    };

    if (!conversation?.channel) {
      return NextResponse.json(
        { message: 'Message conversation or channel not found' },
        { status: 404 }
      );
    }

    // Validate org ownership
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile || profile.organization_id !== conversation.channel.organization_id) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Atomic reset to queued (only if still failed — prevents race condition)
    const { data: resetResult } = await supabase
      .from('messaging_messages')
      .update({
        status: 'queued',
        error_code: null,
        error_message: null,
        failed_at: null,
      })
      .eq('id', messageId)
      .eq('status', 'failed')
      .select('id')
      .single();

    if (!resetResult) {
      return NextResponse.json(
        { message: 'Message is no longer in failed state (possibly already retried)' },
        { status: 409 }
      );
    }

    // Retry via channel router
    const router = getChannelRouter();
    const content = message.content as unknown as MessageContent;

    const result = await router.sendMessage(conversation.channel_id, {
      conversationId: conversation.id,
      to: conversation.external_contact_id,
      content,
      replyToMessageId: message.reply_to_message_id || undefined,
    });

    // Update status based on result
    if (result.success) {
      await supabase
        .from('messaging_messages')
        .update({
          status: 'sent',
          external_id: result.externalMessageId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', messageId);
    } else {
      await supabase
        .from('messaging_messages')
        .update({
          status: 'failed',
          error_code: result.error?.code,
          error_message: result.error?.message,
          failed_at: new Date().toISOString(),
        })
        .eq('id', messageId);
    }

    // Return updated message
    const { data: updatedMessage } = await supabase
      .from('messaging_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (!updatedMessage) {
      return NextResponse.json(
        { message: 'Failed to fetch updated message' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      transformMessage(updatedMessage as DbMessagingMessage)
    );
  } catch (error) {
    console.error(
      '[messaging/messages/retry]',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getConversation, getInstance, insertMessage, updateConversation, insertAILog } from '@/lib/supabase/whatsapp';
import { getEvolutionCredentials } from '@/lib/evolution/helpers';
import * as evolution from '@/lib/evolution/client';

type Params = { params: Promise<{ id: string }> };

const SendMessageSchema = z.object({
  text: z.string().min(1).max(10000),
  quotedMessageId: z.string().optional(),
});

/** Send a message in a conversation (manual / human reply) */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversation = await getConversation(supabase, id);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const instance = await getInstance(supabase, conversation.instance_id);
  if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = SendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { text, quotedMessageId } = parsed.data;

  // Send via Evolution API
  const creds = await getEvolutionCredentials(supabase, instance);

  const evoPayload: evolution.SendTextPayload = {
    number: conversation.phone,
    text,
    ...(quotedMessageId ? { quoted: { key: { id: quotedMessageId } } } : {}),
  };

  let evoResponse: evolution.SendMessageResponse;
  try {
    evoResponse = await evolution.sendText(creds, evoPayload);
  } catch (err) {
    return NextResponse.json(
      { error: 'Falha ao enviar mensagem via Evolution API.' },
      { status: 502 },
    );
  }

  // Persist message in DB
  const message = await insertMessage(supabase, {
    conversation_id: id,
    organization_id: conversation.organization_id,
    evolution_message_id: evoResponse.key?.id || undefined,
    from_me: true,
    message_type: 'text',
    text_body: text,
    quoted_message_id: quotedMessageId ?? undefined,
    status: 'sent',
    sent_by: `user:${user.id}`,
    whatsapp_timestamp: new Date().toISOString(),
  } as Parameters<typeof insertMessage>[1]);

  // Update conversation metadata so the list reflects the sent message
  await updateConversation(supabase, id, {
    last_message_text: text.slice(0, 255),
    last_message_at: new Date().toISOString(),
    last_message_from_me: true,
    unread_count: 0, // Reset unread when user sends a message
  } as Parameters<typeof updateConversation>[2]);

  // If AI was active, pause it (human took over)
  if (conversation.ai_active) {
    await updateConversation(supabase, id, {
      ai_active: false,
      ai_paused_by: user.id,
      ai_paused_at: new Date().toISOString(),
      ai_pause_reason: 'manual_takeover',
    } as Parameters<typeof updateConversation>[2]);

    await insertAILog(supabase, {
      conversation_id: id,
      organization_id: conversation.organization_id,
      action: 'paused',
      details: { reason: 'manual_takeover', paused_by: user.id },
      triggered_by: `user:${user.id}`,
    });
  }

  return NextResponse.json({ data: message }, { status: 201 });
}

/**
 * API de Envio de Mensagens WhatsApp via SmartZap
 *
 * O CRM usa o SmartZap como provedor WhatsApp.
 * Este endpoint envia mensagens chamando a API do SmartZap
 * e armazena a mensagem enviada no banco do CRM.
 *
 * POST /api/whatsapp/send
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { normalizePhoneE164 } from '@/lib/phone'
import { createSmartZapClient } from '@/lib/smartzap/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// Schema de validação
// ---------------------------------------------------------------------------

const SendMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    to: z.string().min(1),
    text: z.string().min(1).max(4096),
    previewUrl: z.boolean().optional(),
    replyToMessageId: z.string().optional(),
    conversationId: z.string().uuid().optional(), // ID da conversa CRM (opcional)
  }),
  z.object({
    type: z.literal('template'),
    to: z.string().min(1),
    templateName: z.string().min(1),
    templateParams: z.record(z.array(z.string())).optional(),
    conversationId: z.string().uuid().optional(),
  }),
])

// ---------------------------------------------------------------------------
// POST — envia mensagem via SmartZap
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = SendMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', issues: parsed.error.issues }, { status: 422 })
  }

  const data = parsed.data
  const phone = normalizePhoneE164(data.to)
  if (!phone) {
    return NextResponse.json({ error: `Telefone inválido: ${data.to}` }, { status: 422 })
  }

  // 1. Cria o cliente SmartZap
  const client = createSmartZapClient()
  if (!client) {
    return NextResponse.json(
      { error: 'SmartZap não configurado. Configure SMARTZAP_URL e SMARTZAP_API_KEY.' },
      { status: 503 }
    )
  }

  // 2. Envia via SmartZap (reutiliza o módulo de envio do SmartZap via API)
  const sendResult = await client.sendMessage(
    data.type === 'text'
      ? { to: phone, type: 'text', text: data.text, previewUrl: data.previewUrl, replyToMessageId: data.replyToMessageId }
      : { to: phone, type: 'template', templateName: data.templateName, templateParams: data.templateParams }
  )

  if (!sendResult.success) {
    return NextResponse.json(
      { error: sendResult.error || 'Falha ao enviar mensagem', details: sendResult.details },
      { status: 502 }
    )
  }

  // 3. Persiste a mensagem no banco do CRM
  const supabase = getSupabaseAdmin()

  // Garante que existe uma conversa para este número
  const conversationId = data.conversationId || (await ensureConversation(phone, supabase))

  if (conversationId) {
    const content = data.type === 'text' ? data.text : `[Template: ${data.templateName}]`

    await supabase.from('whatsapp_messages').insert({
      conversation_id: conversationId,
      external_message_id: sendResult.messageId || null,
      direction: 'outbound',
      message_type: data.type === 'text' ? 'text' : 'template',
      content,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })

    // Atualiza preview da conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 200),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
  }

  return NextResponse.json({
    success: true,
    messageId: sendResult.messageId,
    conversationId,
  })
}

// ---------------------------------------------------------------------------
// Helper: garante que existe uma conversa para o número
// ---------------------------------------------------------------------------

async function ensureConversation(
  phone: string,
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  // Procura conversa existente
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('contact_phone', phone)
    .maybeSingle()

  if (existing?.id) return existing.id

  // Busca contato CRM pelo telefone
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('phone', phone)
    .maybeSingle()

  // Busca canal ativo
  const { data: channel } = await supabase
    .from('whatsapp_channels')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  // Cria nova conversa
  const { data: created } = await supabase
    .from('whatsapp_conversations')
    .insert({
      contact_phone: phone,
      contact_id: contact?.id || null,
      contact_name: contact?.name || null,
      channel_id: channel?.id || null,
      status: 'open',
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  return created?.id ?? null
}

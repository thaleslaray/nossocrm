/**
 * Webhook de Recebimento de Mensagens WhatsApp (SmartZap → CRM)
 *
 * O SmartZap chama este endpoint quando:
 * 1. Uma nova mensagem WhatsApp é recebida pelo SmartZap
 * 2. O status de entrega de uma mensagem muda
 *
 * Responsabilidades:
 * - Validar o webhook secret (segurança)
 * - Armazenar a mensagem no banco do CRM
 * - Criar/atualizar a conversa associada
 * - Linkar ao contato CRM pelo telefone (criando se necessário)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { normalizePhoneE164 } from '@/lib/phone'
import { findOrCreateCRMContactByPhone } from '@/lib/smartzap/contact-sync'
import type {
  SmartZapInboundWebhookPayload,
  SmartZapStatusWebhookPayload,
  SmartZapWebhookPayload,
} from '@/lib/smartzap/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// Verificação de segurança
// ---------------------------------------------------------------------------

function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SMARTZAP_WEBHOOK_SECRET?.trim()

  // Se não há segredo configurado, aceita (modo dev/setup)
  if (!secret) {
    console.warn('[SmartZap Webhook] SMARTZAP_WEBHOOK_SECRET não configurado — aceitando sem validação')
    return true
  }

  if (!signature) return false

  // Suporta formato "sha256=<hex>" (padrão Meta/SmartZap)
  const raw = signature.startsWith('sha256=') ? signature.slice(7) : signature
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  try {
    const a = Buffer.from(raw)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// GET — verificação de conectividade (health check do SmartZap)
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({ status: 'ok', provider: 'smartzap' })
}

// ---------------------------------------------------------------------------
// POST — recebe eventos do SmartZap
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const rawBody = await request.text().catch(() => '')
  if (!rawBody) {
    return NextResponse.json({ error: 'Body vazio' }, { status: 400 })
  }

  // Verifica assinatura
  const signature =
    request.headers.get('x-smartzap-signature') ||
    request.headers.get('x-webhook-signature') ||
    request.headers.get('x-hub-signature-256')

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: SmartZapWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Despacha pelo tipo de evento
  if (payload.event === 'message.received') {
    await handleInboundMessage(payload as SmartZapInboundWebhookPayload, supabase)
  } else if (payload.event === 'message.status') {
    await handleStatusUpdate(payload as SmartZapStatusWebhookPayload, supabase)
  } else {
    console.log(`[SmartZap Webhook] Evento ignorado: ${(payload as any).event}`)
  }

  return NextResponse.json({ status: 'ok' })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleInboundMessage(
  payload: SmartZapInboundWebhookPayload,
  supabase: ReturnType<typeof createClient>
) {
  const phone = normalizePhoneE164(payload.from)
  if (!phone) {
    console.warn('[SmartZap Webhook] Telefone inválido:', payload.from)
    return
  }

  // 1. Garante que o contato CRM existe
  const contactId = await findOrCreateCRMContactByPhone({
    phone,
    name: payload.contactName,
  })

  // 2. Busca canal SmartZap ativo
  const { data: channel } = await supabase
    .from('whatsapp_channels')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  // 3. Upsert da conversa (unique por phone em status open)
  const { data: conversation, error: convError } = await supabase
    .from('whatsapp_conversations')
    .upsert(
      {
        contact_phone: phone,
        contact_name: payload.contactName || null,
        contact_id: contactId || null,
        channel_id: channel?.id || null,
        external_conversation_id: payload.conversationId || null,
        status: 'open',
        last_message_at: payload.timestamp || new Date().toISOString(),
        last_message_preview: payload.text?.slice(0, 200) || null,
        unread_count: 1,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'contact_phone',
        ignoreDuplicates: false,
      }
    )
    .select('id, unread_count')
    .single()

  if (convError || !conversation) {
    // Tenta buscar a conversa existente
    const { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('id, unread_count')
      .eq('contact_phone', phone)
      .maybeSingle()

    if (!existing) {
      console.error('[SmartZap Webhook] Erro ao upsert conversa:', convError)
      return
    }

    // Atualiza conversa existente
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: payload.timestamp || new Date().toISOString(),
        last_message_preview: payload.text?.slice(0, 200) || null,
        unread_count: (existing.unread_count || 0) + 1,
        contact_name: payload.contactName || null,
        contact_id: contactId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    // Insere mensagem na conversa existente
    await insertMessage(existing.id, payload, supabase)
    return
  }

  // Atualiza unread_count se a conversa já existia
  if (conversation.unread_count > 0) {
    await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: conversation.unread_count + 1 })
      .eq('id', conversation.id)
  }

  // 4. Insere a mensagem
  await insertMessage(conversation.id, payload, supabase)

  console.log(`[SmartZap Webhook] Mensagem armazenada: phone=${phone}, conversation=${conversation.id}`)
}

async function insertMessage(
  conversationId: string,
  payload: SmartZapInboundWebhookPayload,
  supabase: ReturnType<typeof createClient>
) {
  // Idempotência: não duplicar se o mesmo messageId chegar duas vezes
  if (payload.messageId) {
    const { data: existing } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('external_message_id', payload.messageId)
      .maybeSingle()

    if (existing) return
  }

  const { error } = await supabase.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    external_message_id: payload.messageId || null,
    direction: 'inbound',
    message_type: payload.type || 'text',
    content: payload.text || null,
    media_url: payload.mediaUrl || null,
    media_mime_type: payload.mediaMimeType || null,
    status: 'delivered',
    sent_at: payload.timestamp || new Date().toISOString(),
    delivered_at: payload.timestamp || new Date().toISOString(),
    metadata: payload.phoneNumberId ? { phoneNumberId: payload.phoneNumberId } : null,
  })

  if (error) {
    console.error('[SmartZap Webhook] Erro ao inserir mensagem:', error)
  }
}

async function handleStatusUpdate(
  payload: SmartZapStatusWebhookPayload,
  supabase: ReturnType<typeof createClient>
) {
  if (!payload.messageId) return

  const update: Record<string, unknown> = { status: payload.status }

  if (payload.status === 'delivered') {
    update.delivered_at = payload.timestamp || new Date().toISOString()
  } else if (payload.status === 'read') {
    update.read_at = payload.timestamp || new Date().toISOString()
    update.delivered_at = payload.timestamp || new Date().toISOString()
  } else if (payload.status === 'failed') {
    update.error_message = payload.errorMessage || 'Falha no envio'
  }

  await supabase
    .from('whatsapp_messages')
    .update(update)
    .eq('external_message_id', payload.messageId)
}

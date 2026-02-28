/**
 * API de Mensagens de uma Conversa WhatsApp
 *
 * GET /api/whatsapp/conversations/[id]/messages
 *   Lista mensagens de uma conversa específica, ordenadas cronologicamente.
 *   Marca a conversa como lida ao buscar.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

interface RouteContext {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// GET — lista mensagens da conversa
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: conversationId } = await context.params

  if (!conversationId) {
    return NextResponse.json({ error: 'ID da conversa obrigatório' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
  const before = searchParams.get('before') // cursor de paginação (created_at)

  const supabase = getSupabaseAdmin()

  // Verifica que a conversa existe
  const { data: conversation, error: convError } = await supabase
    .from('whatsapp_conversations')
    .select('id, contact_phone, contact_name, status, unread_count')
    .eq('id', conversationId)
    .maybeSingle()

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  // Busca mensagens
  let query = supabase
    .from('whatsapp_messages')
    .select('*', { count: 'exact' })
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data: messages, error: msgError, count } = await query

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  // Zera unread_count (marcar como lido)
  if (conversation.unread_count > 0) {
    await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
  }

  return NextResponse.json({
    conversation,
    messages: messages ?? [],
    total: count ?? 0,
  })
}

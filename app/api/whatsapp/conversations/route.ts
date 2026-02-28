/**
 * API de Listagem de Conversas WhatsApp
 *
 * GET /api/whatsapp/conversations
 *   Lista conversas armazenadas no CRM, ordenadas pela última mensagem.
 *   Inclui dados do contato CRM vinculado.
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

// ---------------------------------------------------------------------------
// GET — lista conversas
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'open'
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const search = searchParams.get('search')?.trim() || ''

  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('whatsapp_conversations')
    .select(
      `
      id,
      contact_phone,
      contact_name,
      contact_id,
      channel_id,
      external_conversation_id,
      status,
      unread_count,
      last_message_at,
      last_message_preview,
      created_at,
      updated_at,
      contacts (
        id,
        name,
        email,
        avatar
      )
    `,
      { count: 'exact' }
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(
      `contact_phone.ilike.%${search}%,contact_name.ilike.%${search}%,last_message_preview.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    conversations: data ?? [],
    total: count ?? 0,
    page,
    limit,
    hasMore: (count ?? 0) > (page + 1) * limit,
  })
}

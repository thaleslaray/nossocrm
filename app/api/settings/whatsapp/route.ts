/**
 * API de Configuração do Canal WhatsApp (SmartZap)
 *
 * GET  /api/settings/whatsapp — retorna configuração atual
 * PUT  /api/settings/whatsapp — atualiza configuração
 * POST /api/settings/whatsapp/test — testa conectividade com SmartZap
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createSmartZapClient } from '@/lib/smartzap/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

const UpdateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  smartzapUrl: z.string().url().optional(),
  smartzapApiKey: z.string().min(1).optional(),
  webhookSecret: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// GET — lê configuração atual
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('whatsapp_channels')
    .select('id, name, provider, smartzap_url, is_active, created_at, updated_at')
    .eq('provider', 'smartzap')
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    channel: data
      ? {
          id: data.id,
          name: data.name,
          provider: data.provider,
          smartzapUrl: data.smartzap_url || null,
          // Nunca expõe a API key — retorna apenas se está configurada
          smartzapApiKeyConfigured: !!(process.env.SMARTZAP_API_KEY || false),
          webhookSecretConfigured: !!(process.env.SMARTZAP_WEBHOOK_SECRET || false),
          isActive: data.is_active,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }
      : null,
    // Endpoint do webhook para configurar no SmartZap
    webhookEndpoint: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/smartzap`,
  })
}

// ---------------------------------------------------------------------------
// PUT — atualiza configuração do canal
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = UpdateChannelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', issues: parsed.error.issues }, { status: 422 })
  }

  const supabase = getSupabaseAdmin()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.smartzapUrl !== undefined) updates.smartzap_url = parsed.data.smartzapUrl
  if (parsed.data.smartzapApiKey !== undefined) updates.smartzap_api_key = parsed.data.smartzapApiKey
  if (parsed.data.webhookSecret !== undefined) updates.webhook_secret = parsed.data.webhookSecret
  if (parsed.data.isActive !== undefined) updates.is_active = parsed.data.isActive

  const { data: existing } = await supabase
    .from('whatsapp_channels')
    .select('id')
    .eq('provider', 'smartzap')
    .limit(1)
    .maybeSingle()

  let result
  if (existing) {
    result = await supabase
      .from('whatsapp_channels')
      .update(updates)
      .eq('id', existing.id)
      .select('id')
      .single()
  } else {
    result = await supabase
      .from('whatsapp_channels')
      .insert({ ...updates, provider: 'smartzap', name: parsed.data.name || 'SmartZap' })
      .select('id')
      .single()
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: result.data?.id })
}

// ---------------------------------------------------------------------------
// POST — testa conectividade com SmartZap
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  if (!url.pathname.endsWith('/test')) {
    return NextResponse.json({ error: 'Use PUT para atualizar configurações' }, { status: 405 })
  }

  const client = createSmartZapClient()
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'SmartZap não configurado (SMARTZAP_URL / SMARTZAP_API_KEY ausentes)' },
      { status: 503 }
    )
  }

  const ok = await client.ping()
  return NextResponse.json({
    success: ok,
    message: ok ? 'SmartZap acessível e credenciais válidas' : 'Falha ao conectar com SmartZap',
  })
}

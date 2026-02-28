/**
 * SmartZap Contact Sync
 *
 * Sincronização de contatos entre o CRM e o SmartZap:
 * - CRM → SmartZap: ao criar/atualizar contato com telefone, upsert no SmartZap
 * - SmartZap → CRM: ao receber mensagem de número desconhecido, cria contato no CRM
 */

import { createClient } from '@supabase/supabase-js'
import { normalizePhoneE164 } from '@/lib/phone'
import { createSmartZapClient } from './client'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// CRM → SmartZap: sincroniza contato do CRM para o SmartZap
// ---------------------------------------------------------------------------

/**
 * Envia um contato CRM para o SmartZap.
 * Chamada de forma best-effort (erros não devem bloquear o fluxo principal).
 */
export async function syncCRMContactToSmartZap(contact: {
  phone?: string | null
  name?: string | null
  email?: string | null
}): Promise<void> {
  const phone = normalizePhoneE164(contact.phone)
  if (!phone) return

  const client = createSmartZapClient()
  if (!client) return

  try {
    await client.upsertContact({
      phone,
      name: contact.name || undefined,
      email: contact.email || undefined,
    })
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// SmartZap → CRM: encontra ou cria contato pelo telefone
// ---------------------------------------------------------------------------

/**
 * Dado um telefone de uma mensagem inbound do SmartZap,
 * retorna o ID do contato CRM correspondente (criando se necessário).
 */
export async function findOrCreateCRMContactByPhone(input: {
  phone: string           // Telefone recebido do webhook (qualquer formato)
  name?: string           // Nome exibido no WhatsApp (opcional)
}): Promise<string | null> {
  const phone = normalizePhoneE164(input.phone)
  if (!phone) return null

  const supabase = getSupabaseAdmin()

  // 1. Procura contato existente pelo telefone (E.164)
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  if (existing?.id) return existing.id

  // 2. Cria novo contato automaticamente
  const name = input.name?.trim() || `WhatsApp ${phone}`

  const { data: lifecycleStage } = await supabase
    .from('lifecycle_stages')
    .select('id')
    .order('order', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      name,
      phone,
      email: `wa_${phone.replace('+', '')}@whatsapp.placeholder`,
      status: 'ACTIVE',
      stage: lifecycleStage?.id || 'LEAD',
      source: 'MANUAL',
      notes: 'Contato criado automaticamente via mensagem WhatsApp (SmartZap)',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[SmartZap] Erro ao criar contato CRM:', error)
    return null
  }

  return created?.id ?? null
}

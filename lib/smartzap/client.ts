/**
 * SmartZap API Client
 *
 * Cliente HTTP para o SmartZap (provedor WhatsApp).
 * Reutiliza os padrões e tipos do módulo de integração WhatsApp do SmartZap.
 *
 * Endpoints utilizados (espelho do SmartZap):
 *   POST /api/messages          — enviar mensagem
 *   GET  /api/inbox/conversations — listar conversas
 *   GET  /api/contacts           — listar contatos
 */

import type {
  SmartZapSendPayload,
  SmartZapSendResult,
  WhatsAppConversation,
} from './types'

export interface SmartZapClientConfig {
  baseUrl: string
  apiKey: string
}

export class SmartZapClient {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(config: SmartZapClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.headers = {
      'Content-Type': 'application/json',
      'X-Api-Key': config.apiKey,
    }
  }

  // -------------------------------------------------------------------------
  // Envio de Mensagens
  // -------------------------------------------------------------------------

  /**
   * Envia uma mensagem WhatsApp via SmartZap.
   * Reutiliza a interface SendWhatsAppMessageOptions do SmartZap.
   */
  async sendMessage(payload: SmartZapSendPayload): Promise<SmartZapSendResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/messages`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const errMsg =
          typeof data?.error === 'string'
            ? data.error
            : `SmartZap API error: ${response.status}`
        return { success: false, error: errMsg, details: data }
      }

      return {
        success: true,
        messageId: data?.messageId || data?.messages?.[0]?.id,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'SmartZap send failed',
      }
    }
  }

  // -------------------------------------------------------------------------
  // Conversas
  // -------------------------------------------------------------------------

  /**
   * Lista conversas do inbox do SmartZap.
   */
  async getConversations(params?: {
    page?: number
    limit?: number
    status?: 'open' | 'resolved'
  }): Promise<{ conversations: unknown[]; total: number }> {
    const qs = new URLSearchParams()
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.status) qs.set('status', params.status)

    try {
      const response = await fetch(
        `${this.baseUrl}/api/inbox/conversations?${qs}`,
        { headers: this.headers, signal: AbortSignal.timeout(8_000) }
      )
      const data = await response.json().catch(() => ({ conversations: [], total: 0 }))
      return {
        conversations: Array.isArray(data?.conversations)
          ? data.conversations
          : Array.isArray(data)
            ? data
            : [],
        total: data?.total ?? 0,
      }
    } catch {
      return { conversations: [], total: 0 }
    }
  }

  /**
   * Lista mensagens de uma conversa no SmartZap.
   */
  async getMessages(conversationId: string): Promise<unknown[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/inbox/conversations/${conversationId}/messages`,
        { headers: this.headers, signal: AbortSignal.timeout(8_000) }
      )
      const data = await response.json().catch(() => [])
      return Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  // -------------------------------------------------------------------------
  // Contatos
  // -------------------------------------------------------------------------

  /**
   * Upsert de contato no SmartZap (sincronização CRM → SmartZap).
   */
  async upsertContact(contact: {
    phone: string
    name?: string
    email?: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/contacts`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          phone: contact.phone,
          name: contact.name,
          email: contact.email,
        }),
        signal: AbortSignal.timeout(8_000),
      })
      return { success: response.ok }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'SmartZap contact upsert failed',
      }
    }
  }

  // -------------------------------------------------------------------------
  // Health / Configuração
  // -------------------------------------------------------------------------

  /**
   * Verifica se as credenciais SmartZap são válidas.
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        headers: this.headers,
        signal: AbortSignal.timeout(5_000),
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// ---------------------------------------------------------------------------
// Factory: cria cliente a partir das variáveis de ambiente
// ---------------------------------------------------------------------------

export function createSmartZapClient(config?: Partial<SmartZapClientConfig>): SmartZapClient | null {
  const baseUrl = config?.baseUrl || process.env.SMARTZAP_URL || ''
  const apiKey = config?.apiKey || process.env.SMARTZAP_API_KEY || ''

  if (!baseUrl || !apiKey) return null

  return new SmartZapClient({ baseUrl, apiKey })
}

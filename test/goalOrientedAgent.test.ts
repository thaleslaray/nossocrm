/**
 * Testes do Goal-Oriented Agent.
 *
 * Valida:
 * - Circuit breaker: skip quando erros consecutivos >= threshold
 * - Dry-run mode: processa mas não envia quando agent_mode === 'observe'
 * - RAG: usa generateWithFileSearch quando knowledge_store_id configurado
 * - Fallback: sem board_ai_config → comportamento legado (stage_ai_config)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORG_ID   = 'org-001'
const BOARD_ID = 'board-001'
const DEAL_ID  = 'deal-001'
const CONV_ID  = 'conv-001'
const CHANNEL_ID = 'channel-001'
const CONTACT_ID = 'contact-001'

const STAGE_NOVO = { id: 'stage-novo', order: 0 }

const ORG_SETTINGS = {
  ai_enabled: true,
  ai_provider: 'google',
  ai_model: 'gemini-2.0-flash',
  ai_google_key: 'key-test',
  ai_openai_key: null,
  ai_anthropic_key: null,
  ai_hitl_threshold: 0.85,
  ai_hitl_min_confidence: 0.70,
  ai_hitl_expiration_hours: 24,
  ai_config_mode: 'zero_config',
  ai_learned_patterns: null,
  ai_template_id: null,
  ai_takeover_enabled: false,
  ai_takeover_minutes: null,
  ai_base_system_prompt: null,
  timezone: 'America/Sao_Paulo',
}

const STAGE_AI_CONFIG = {
  id: 'sac-001',
  organization_id: ORG_ID,
  board_id: BOARD_ID,
  stage_id: STAGE_NOVO.id,
  enabled: true,
  system_prompt: 'Você é um assistente de vendas.',
  stage_goal: null,
  advancement_criteria: [],
  notify_team: false,
  ai_model: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  settings: {
    max_messages_per_conversation: 20,
    response_delay_seconds: 0,
    handoff_keywords: [],
    business_hours_only: false,
  },
}

// Helpers para o Supabase mock
function makeQB(returnData: unknown) {
  const qb: Record<string, unknown> = {}
  const chain = () => qb
  qb.select = vi.fn(chain)
  qb.eq     = vi.fn(chain)
  qb.gte    = vi.fn(chain)
  qb.lte    = vi.fn(chain)
  qb.order  = vi.fn(chain)
  qb.limit  = vi.fn(chain)
  qb.insert = vi.fn(chain)
  qb.update = vi.fn(chain)
  qb.single      = vi.fn(async () => ({ data: returnData, error: null }))
  qb.maybeSingle = vi.fn(async () => ({ data: returnData, error: null }))
  return qb as ReturnType<typeof makeQB>
}

function buildSupabaseMock({
  consecutiveErrors = 0,
  boardAIConfig = null as unknown,
  agentMode = 'respond' as 'observe' | 'respond',
  knowledgeStoreId = null as string | null,
} = {}) {
  const resolvedBoardAIConfig = boardAIConfig ?? {
    id: 'bac-001',
    board_id: BOARD_ID,
    organization_id: ORG_ID,
    agent_name: 'Assistente',
    business_context: 'Empresa de SaaS',
    agent_goal: 'Qualificar leads',
    persona_prompt: null,
    knowledge_store_id: knowledgeStoreId,
    knowledge_store_name: null,
    agent_mode: agentMode,
    circuit_breaker_threshold: 3,
    hitl_threshold: 0.85,
    hitl_min_confidence: 0.70,
    hitl_expiration_hours: 24,
    handoff_keywords: [],
    max_messages_before_handoff: 10,
    response_delay_seconds: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const conversationQB = makeQB({
    id: CONV_ID,
    organization_id: ORG_ID,
    contact_id: CONTACT_ID,
    channel_id: CHANNEL_ID,
    external_contact_id: 'ext-contact-001',
    business_unit_id: 'bu-001',
    status: 'open',
    metadata: { deal_id: DEAL_ID },
    message_count: 1,
    consecutive_ai_errors: consecutiveErrors,
    assigned_user_id: null,
    assigned_at: null,
  })

  return {
    from: vi.fn((table: string) => {
      switch (table) {
        case 'messaging_conversations':
          return conversationQB

        case 'contacts':
          return makeQB({ ai_paused: false })

        case 'deals':
          return makeQB({ id: DEAL_ID, stage_id: STAGE_NOVO.id, board_id: BOARD_ID })

        case 'board_ai_config':
          if (boardAIConfig === false) return makeQB(null)  // sem config
          return makeQB(resolvedBoardAIConfig)

        case 'stage_ai_config':
          return makeQB(STAGE_AI_CONFIG)

        case 'boards':
          return makeQB({ agent_goal_stage_id: null })

        case 'board_stages':
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { order: 0 }, error: null })),
              maybeSingle: vi.fn(async () => ({ data: { order: 0 }, error: null })),
            })),
          }

        case 'organization_settings':
          return makeQB(ORG_SETTINGS)

        case 'ai_token_usage_monthly':
          return makeQB({ tokens_used: 0 })

        case 'messaging_messages':
          return makeQB({ id: 'msg-001' })

        default:
          return makeQB(null)
      }
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }
}

vi.mock('@/lib/ai/agent/provider-failover', () => ({
  generateWithFailover: vi.fn(async () => ({
    text: 'Olá! Como posso ajudar?',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    modelUsed: 'gemini-2.0-flash',
    provider: 'google',
  })),
  buildProviderList: vi.fn(() => [{ provider: 'google', model: 'gemini-2.0-flash', apiKey: 'key-test' }]),
}))

vi.mock('@/lib/ai/agent/stage-evaluator', () => ({
  evaluateStageAdvancement: vi.fn(async () => null),
}))

vi.mock('@/lib/notifications/telegram', () => ({
  sendTelegramMessage: vi.fn(async () => {}),
  formatHandoffMessage: vi.fn(() => 'Handoff message'),
}))

vi.mock('@/lib/ai/messaging/file-search', () => ({
  generateWithFileSearch: vi.fn(async () => ({
    text: 'Resposta RAG: produto X resolve seu problema.',
  })),
}))

vi.mock('@/lib/messaging/channel-router.service', () => ({
  getChannelRouter: vi.fn(() => ({
    sendMessage: vi.fn(async () => ({ success: true, messageId: 'msg-ext-001' })),
  })),
}))

vi.mock('@/lib/ai/extraction/extraction.service', () => ({
  extractAndUpdateBANT: vi.fn(async () => {}),
}))

import { processIncomingMessage } from '@/lib/ai/agent/agent.service'
import { generateWithFileSearch } from '@/lib/ai/messaging/file-search'

describe('Goal-Oriented Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('circuit breaker', () => {
    it('processa normalmente quando erros < threshold', async () => {
      const supabase = buildSupabaseMock({ consecutiveErrors: 2 })
      const result = await processIncomingMessage({
        supabase,
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        incomingMessage: 'Olá',
      })
      expect(result.decision.action).not.toBe('skipped')
    })

    it('skipa quando erros consecutivos >= threshold (circuit breaker aberto)', async () => {
      const supabase = buildSupabaseMock({ consecutiveErrors: 3 })
      const result = await processIncomingMessage({
        supabase,
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        incomingMessage: 'Olá',
      })
      expect(result.success).toBe(true)
      expect(result.decision.action).toBe('skipped')
      expect(result.decision.reason).toMatch(/circuit breaker/i)
    })

    it('skipa com limiar customizado (threshold = 5)', async () => {
      // threshold 5: com 5 erros deve abrir
      const supabase = buildSupabaseMock({ consecutiveErrors: 5 })
      // Sobrescreve o board_ai_config com threshold 5
      const originalFrom = supabase.from.bind(supabase)
      supabase.from = vi.fn((table: string) => {
        if (table === 'board_ai_config') {
          return makeQB({
            id: 'bac-001', board_id: BOARD_ID, organization_id: ORG_ID,
            agent_name: 'A', business_context: null, agent_goal: null,
            persona_prompt: null, knowledge_store_id: null, knowledge_store_name: null,
            agent_mode: 'respond', circuit_breaker_threshold: 5,
            hitl_threshold: 0.85, hitl_min_confidence: 0.70, hitl_expiration_hours: 24,
            handoff_keywords: [], max_messages_before_handoff: 10, response_delay_seconds: 0,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          })
        }
        return originalFrom(table)
      })
      const result = await processIncomingMessage({
        supabase,
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        incomingMessage: 'Olá',
      })
      expect(result.decision.action).toBe('skipped')
      expect(result.decision.reason).toMatch(/circuit breaker/i)
    })
  })

  describe('dry-run mode (observe)', () => {
    it('processa mas não envia quando agent_mode === observe', async () => {
      const supabase = buildSupabaseMock({ agentMode: 'observe' })
      const result = await processIncomingMessage({
        supabase,
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        incomingMessage: 'Quero saber mais sobre o produto',
      })
      expect(result.success).toBe(true)
      expect(result.decision.reason).toMatch(/dry-run/i)
      // Não deve ter message_sent
      expect(result.message_sent).toBeUndefined()
    })
  })

  describe('RAG (File Search Store)', () => {
    it('usa generateWithFileSearch quando knowledge_store_id configurado', async () => {
      const supabase = buildSupabaseMock({
        knowledgeStoreId: 'fileSearchStores/store-123',
        agentMode: 'respond',
        consecutiveErrors: 0,
      })
      const result = await processIncomingMessage({
        supabase,
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        incomingMessage: 'O produto tem garantia?',
        simulationMode: true,
      })
      expect(generateWithFileSearch).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: 'fileSearchStores/store-123' })
      )
      expect(result.decision.action).toBe('responded')
      expect(result.decision.reason).toMatch(/RAG/i)
    })

    it('usa provider-failover quando sem knowledge_store_id', async () => {
      const { generateWithFailover } = await import('@/lib/ai/agent/provider-failover')
      const supabase = buildSupabaseMock({ knowledgeStoreId: null, agentMode: 'respond' })
      await processIncomingMessage({
        supabase,
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        incomingMessage: 'Olá',
        simulationMode: true,
      })
      expect(generateWithFileSearch).not.toHaveBeenCalled()
      expect(generateWithFailover).toHaveBeenCalled()
    })
  })

  describe('fallback sem board_ai_config', () => {
    it('funciona no modo legado quando não há board_ai_config', async () => {
      // boardAIConfig = false → retorna null do mock
      const supabase = buildSupabaseMock({ boardAIConfig: false as unknown })
      const result = await processIncomingMessage({
        supabase,
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        incomingMessage: 'Olá',
        simulationMode: true,
      })
      expect(result.success).toBe(true)
      expect(result.decision.action).toBe('responded')
    })
  })
})

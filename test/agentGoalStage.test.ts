/**
 * Testes do escopo do agente AI (agent_goal_stage_id).
 *
 * Valida que o agente retorna 'skipped' quando o deal está num estágio
 * além do limite configurado no board, e processa normalmente quando
 * o deal está dentro do escopo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// IDs fixos de teste
const ORG_ID = 'org-001'
const BOARD_ID = 'board-001'
const DEAL_ID = 'deal-001'
const CONTACT_ID = 'contact-001'
const CONV_ID = 'conv-001'
const CHANNEL_ID = 'channel-001'

// Estágios: order 0 → 1 → 2 → 3
const STAGE_NOVO = { id: 'stage-novo', order: 0 }      // NOVO CONTATO
const STAGE_INT  = { id: 'stage-int',  order: 1 }      // INTERESSADO  (goal limit)
const STAGE_COMP = { id: 'stage-comp', order: 2 }      // QUER COMPRAR

const AI_CONFIG = {
  enabled: true,
  provider: 'google',
  model: 'gemini-2.0-flash',
  ai_google_key: 'key-test',
  ai_openai_key: null,
  ai_anthropic_key: null,
  hitl_threshold: 0.85,
  config_mode: 'zero_config',
}

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

// Base do mock — cada teste personaliza o que precisa
function buildSupabaseMock({
  stageId = STAGE_NOVO.id,
  goalStageId = STAGE_INT.id,        // board limit = INTERESSADO
  currentOrder = STAGE_NOVO.order,   // deal está em NOVO CONTATO
  goalOrder = STAGE_INT.order,
  aiEnabled = true,
  hasStageConfig = true,
}: {
  stageId?: string
  goalStageId?: string | null
  currentOrder?: number
  goalOrder?: number
  aiEnabled?: boolean
  hasStageConfig?: boolean
} = {}) {
  // QB genérico com todos os métodos comuns do Supabase
  const makeQB = (returnData: unknown) => {
    const qb: Record<string, unknown> = {}
    const chain = () => qb
    qb.select = vi.fn(chain)
    qb.eq     = vi.fn(chain)
    qb.gte    = vi.fn(chain)
    qb.lte    = vi.fn(chain)
    qb.order  = vi.fn(chain)
    qb.limit  = vi.fn(chain)
    qb.single      = vi.fn(async () => ({ data: returnData, error: null }))
    qb.maybeSingle = vi.fn(async () => ({ data: returnData, error: null }))
    return qb as ReturnType<typeof makeQB>
  }

  return {
    from: vi.fn((table: string) => {
      switch (table) {
        case 'messaging_conversations':
          return makeQB({
            id: CONV_ID,
            organization_id: ORG_ID,
            contact_id: CONTACT_ID,
            channel_id: CHANNEL_ID,
            business_unit_id: 'bu-001',
            status: 'open',
            metadata: { deal_id: DEAL_ID },
            message_count: 1,
          })

        case 'contacts':
          return makeQB({ ai_paused: false })

        case 'deals':
          return makeQB({
            id: DEAL_ID,
            stage_id: stageId,
            board_id: BOARD_ID,
          })

        case 'stage_ai_config': {
          const stageConfigQB: Record<string, unknown> = {}
          const chain = () => stageConfigQB
          stageConfigQB.select = vi.fn(chain)
          stageConfigQB.eq     = vi.fn(chain)
          stageConfigQB.single = vi.fn(async () => ({
            data: hasStageConfig ? {
              id: 'sac-001',
              organization_id: ORG_ID,
              board_id: BOARD_ID,
              stage_id: stageId,
              enabled: aiEnabled,
              system_prompt: 'Você é um assistente de vendas.',
              stage_goal: null,
              advancement_criteria: [],
              notify_team: false,
              ai_model: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              settings: {
                max_messages_per_conversation: 20,
                response_delay_seconds: 2,
                handoff_keywords: ['humano', 'atendente'],
                business_hours_only: false,
              },
            } : null,
            error: null,
          }))
          return stageConfigQB
        }

        case 'boards':
          return makeQB({ agent_goal_stage_id: goalStageId })

        case 'board_stages': {
          // Retorna a order correta dependendo de qual stage está sendo buscado
          const orderQB = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string, val: string) => {
              const order = val === stageId ? currentOrder : goalOrder
              const resolver = vi.fn(async () => ({ data: { order }, error: null }))
              return {
                single: resolver,
                maybeSingle: resolver,
              }
            }),
          }
          return orderQB
        }

        case 'organization_settings':
          return makeQB(ORG_SETTINGS)

        case 'ai_token_usage_monthly':
          return makeQB({ tokens_used: 0 })

        default:
          return makeQB(null)
      }
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }
}

// Mock dos módulos que fazem I/O real
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

import { processIncomingMessage } from '@/lib/ai/agent/agent.service'

// ---------------------------------------------------------------------------

describe('agent_goal_stage_id — escopo do agente', () => {
  it('processa normalmente quando deal está dentro do escopo (order < goal)', async () => {
    const supabase = buildSupabaseMock({
      stageId: STAGE_NOVO.id,
      goalStageId: STAGE_INT.id,
      currentOrder: STAGE_NOVO.order, // 0
      goalOrder: STAGE_INT.order,     // 1  → 0 <= 1 ✓
    })

    const result = await processIncomingMessage({ supabase, conversationId: CONV_ID, organizationId: ORG_ID, incomingMessage: 'Oi' })

    expect(result.decision.action).not.toBe('skipped')
  })

  it('processa normalmente quando deal está no próprio estágio limite (order === goal)', async () => {
    const supabase = buildSupabaseMock({
      stageId: STAGE_INT.id,
      goalStageId: STAGE_INT.id,
      currentOrder: STAGE_INT.order, // 1
      goalOrder: STAGE_INT.order,    // 1  → 1 <= 1 ✓ (limite inclusivo)
    })

    const result = await processIncomingMessage({ supabase, conversationId: CONV_ID, organizationId: ORG_ID, incomingMessage: 'Oi' })

    expect(result.decision.action).not.toBe('skipped')
  })

  it('skipa quando deal está além do escopo (order > goal)', async () => {
    const supabase = buildSupabaseMock({
      stageId: STAGE_COMP.id,
      goalStageId: STAGE_INT.id,
      currentOrder: STAGE_COMP.order, // 2
      goalOrder: STAGE_INT.order,     // 1  → 2 > 1 → skip
    })

    const result = await processIncomingMessage({ supabase, conversationId: CONV_ID, organizationId: ORG_ID, incomingMessage: 'Oi' })

    expect(result.success).toBe(true)
    expect(result.decision.action).toBe('skipped')
    expect(result.decision.reason).toMatch(/escopo/i)
  })

  it('processa normalmente quando agent_goal_stage_id é null (sem limite)', async () => {
    const supabase = buildSupabaseMock({
      stageId: STAGE_COMP.id,
      goalStageId: null,              // sem limite configurado
      currentOrder: STAGE_COMP.order,
      goalOrder: STAGE_INT.order,
    })

    const result = await processIncomingMessage({ supabase, conversationId: CONV_ID, organizationId: ORG_ID, incomingMessage: 'Oi' })

    expect(result.decision.action).not.toBe('skipped')
  })
})

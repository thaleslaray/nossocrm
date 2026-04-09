/**
 * Testes para a API de briefing de reuniões.
 *
 * GET /api/ai/briefing/[dealId]
 *
 * Verifica autenticação, autorização (multi-tenant), validação de UUID,
 * geração do briefing e tratamento de erros de configuração de AI.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Constantes de teste
// ---------------------------------------------------------------------------
// UUIDs v4 válidos (versão 4, variante 8 na posição 19)
const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
const ORG_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6'
const DEAL_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-a1b2c3d4e5f6'

const BRIEFING_FIXTURE = {
  dealId: DEAL_ID,
  dealTitle: 'Projeto X',
  contactName: 'João Silva',
  currentStage: 'Proposta',
  bantStatus: {
    budget: 'confirmed',
    authority: 'unknown',
    need: 'confirmed',
    timeline: 'near',
  },
  keyInsights: ['Cliente tem orçamento confirmado', 'Decisão até fim do mês'],
  suggestedTopics: ['Apresentar proposta final', 'Confirmar prazo'],
  recentActivities: [],
  generatedAt: '2026-04-09T10:00:00Z',
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/briefing/briefing.service', () => ({
  generateMeetingBriefing: vi.fn(async () => BRIEFING_FIXTURE),
}))

// Builders do Supabase (auth-based createClient)
let profileQueryBuilder: Record<string, unknown>
let dealQueryBuilder: Record<string, unknown>
let authMock: Record<string, unknown>
let supabaseClientMock: Record<string, unknown>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}))

// ---------------------------------------------------------------------------
// Imports (após mocks)
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/ai/briefing/[dealId]/route'
import { generateMeetingBriefing } from '@/lib/ai/briefing/briefing.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildProfileQB(orgId: string | null = ORG_ID) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({
      data: orgId ? { organization_id: orgId } : null,
      error: null,
    })),
  }
}

function buildDealQB(found = true) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({
      data: found ? { id: DEAL_ID, organization_id: ORG_ID } : null,
      error: found ? null : { message: 'not found' },
    })),
  }
}

function buildAuthMock(userId: string | null = USER_ID) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : { message: 'not authenticated' },
      })),
    },
  }
}

async function callGet(dealId: string): Promise<Response> {
  const req = new Request(`http://localhost/api/ai/briefing/${dealId}`)
  const context = { params: Promise.resolve({ dealId }) }
  return GET(req as any, context as any)
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe('GET /api/ai/briefing/[dealId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    profileQueryBuilder = buildProfileQB()
    dealQueryBuilder = buildDealQB(true)
    authMock = buildAuthMock()
    supabaseClientMock = {
      ...authMock,
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profileQueryBuilder
        if (table === 'deals') return dealQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
  })

  // ── Validação de UUID ─────────────────────────────────────────────────────

  it('retorna 400 quando dealId não é UUID válido', async () => {
    // Act
    const res = await callGet('nao-e-uuid')
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/dealId/i)
  })

  it('retorna 400 quando dealId está vazio', async () => {
    // Act
    const res = await callGet('')
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/dealId/i)
  })

  // ── Autenticação ──────────────────────────────────────────────────────────

  it('retorna 401 quando usuário não autenticado', async () => {
    // Arrange
    supabaseClientMock = {
      ...buildAuthMock(null),
      from: vi.fn(),
    }

    // Act
    const res = await callGet(DEAL_ID)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('retorna 404 quando profile não encontrado', async () => {
    // Arrange
    profileQueryBuilder = buildProfileQB(null)
    supabaseClientMock = {
      ...buildAuthMock(),
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profileQueryBuilder
        if (table === 'deals') return dealQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    // Act
    const res = await callGet(DEAL_ID)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(404)
    expect(body.error).toBe('Profile not found')
  })

  // ── Autorização (multi-tenant) ────────────────────────────────────────────

  it('retorna 404 quando deal não pertence à organização do usuário', async () => {
    // Arrange — deal não encontrado para essa org (isolamento multi-tenant via eq+eq)
    dealQueryBuilder = buildDealQB(false)
    supabaseClientMock = {
      ...authMock,
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profileQueryBuilder
        if (table === 'deals') return dealQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    // Act
    const res = await callGet(DEAL_ID)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(404)
    expect(body.error).toMatch(/not found|access denied/i)
  })

  it('verifica deal por organization_id (defense-in-depth)', async () => {
    // Act
    await callGet(DEAL_ID)

    // Assert — a query de deals deve filtrar por organization_id
    expect(dealQueryBuilder.eq).toHaveBeenCalledWith('id', DEAL_ID)
    expect(dealQueryBuilder.eq).toHaveBeenCalledWith('organization_id', ORG_ID)
  })

  // ── Happy path ────────────────────────────────────────────────────────────

  it('retorna briefing gerado com sucesso', async () => {
    // Act
    const res = await callGet(DEAL_ID)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      dealId: DEAL_ID,
      dealTitle: 'Projeto X',
      contactName: 'João Silva',
      currentStage: 'Proposta',
    })
    expect(body).toHaveProperty('keyInsights')
    expect(body).toHaveProperty('suggestedTopics')
    expect(body).toHaveProperty('bantStatus')
  })

  it('chama generateMeetingBriefing com dealId e supabase corretos', async () => {
    // Act
    await callGet(DEAL_ID)

    // Assert
    expect(generateMeetingBriefing).toHaveBeenCalledWith(DEAL_ID, supabaseClientMock)
  })

  // ── Erros de AI / configuração ────────────────────────────────────────────

  it('retorna 400 quando AI não configurada', async () => {
    // Arrange — erro de configuração ("not configured")
    vi.mocked(generateMeetingBriefing).mockRejectedValueOnce(
      new Error('AI provider not configured')
    )

    // Act
    const res = await callGet(DEAL_ID)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/not configured/i)
  })

  it('retorna 400 quando feature está desabilitada', async () => {
    // Arrange
    vi.mocked(generateMeetingBriefing).mockRejectedValueOnce(
      new Error('Briefing feature is disabled')
    )

    // Act
    const res = await callGet(DEAL_ID)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/disabled/i)
  })

  it('retorna 500 para erros genéricos', async () => {
    // Arrange
    vi.mocked(generateMeetingBriefing).mockRejectedValueOnce(
      new Error('Unexpected database error')
    )

    // Act
    const res = await callGet(DEAL_ID)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(500)
    expect(body.error).toBe('Unexpected database error')
  })

  it('retorna 500 com mensagem genérica para erros não-Error', async () => {
    // Arrange — lança um não-Error (string)
    vi.mocked(generateMeetingBriefing).mockRejectedValueOnce('string error')

    // Act
    const res = await callGet(DEAL_ID)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(500)
    expect(body.error).toBe('Failed to generate briefing')
  })
})

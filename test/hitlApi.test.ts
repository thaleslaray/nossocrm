/**
 * Testes para os endpoints HITL (Human-in-the-Loop).
 *
 * GET  /api/ai/hitl         — listar pending advances
 * POST /api/ai/hitl/[id]   — resolver (aprovar/rejeitar) um pending advance
 *
 * Estratégia: vi.mock para createClient (Supabase) e funções HITL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Constantes de teste
// ---------------------------------------------------------------------------
// UUIDs v4 válidos (versão 4, variante 8 na posição 19)
const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
const ORG_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6'
const DEAL_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-a1b2c3d4e5f6'
const PENDING_ID = 'd4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7'
const STAGE_FROM = 'e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8'
const STAGE_TO = 'f6a7b8c9-d0e1-4f2a-8b3c-d4e5f6a7b8c9'

const PENDING_ADVANCE_FIXTURE = {
  id: PENDING_ID,
  organization_id: ORG_ID,
  deal_id: DEAL_ID,
  conversation_id: null,
  current_stage_id: STAGE_FROM,
  suggested_stage_id: STAGE_TO,
  confidence: 0.75,
  reason: 'Cliente demonstrou interesse claro',
  status: 'pending',
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock das funções HITL (lógica de negócio)
vi.mock('@/lib/ai/agent/hitl-stage-advance', () => ({
  getPendingAdvances: vi.fn(async () => [PENDING_ADVANCE_FIXTURE]),
  resolvePendingAdvance: vi.fn(async () => ({
    success: true,
    newStageId: STAGE_TO,
  })),
  UserEditsSchema: {
    safeParse: vi.fn((data: unknown) => {
      // Schema real simplificado para os testes
      if (typeof data !== 'object' || data === null) {
        return { success: false, error: 'Invalid' }
      }
      const d = data as Record<string, unknown>
      if (typeof d.approved !== 'boolean') {
        return { success: false, error: 'approved must be boolean' }
      }
      return { success: true, data: d }
    }),
  },
}))

// Builders do Supabase para o createClient (auth-based, não admin)
let profileQueryBuilder: Record<string, unknown>
let pendingAdvanceQueryBuilder: Record<string, unknown>
let authMock: Record<string, unknown>
let supabaseClientMock: Record<string, unknown>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseClientMock),
}))

// ---------------------------------------------------------------------------
// Imports (após mocks)
// ---------------------------------------------------------------------------
import { GET } from '@/app/api/ai/hitl/route'
import { POST } from '@/app/api/ai/hitl/[id]/route'
import { getPendingAdvances, resolvePendingAdvance } from '@/lib/ai/agent/hitl-stage-advance'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGetRequest(url: string): Request {
  return new Request(url)
}

function makePostRequest(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/ai/hitl/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function buildProfileQB(orgId: string | null = ORG_ID) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({
      data: orgId ? { organization_id: orgId } : null,
      error: orgId ? null : { message: 'not found' },
    })),
  }
}

function buildPendingAdvanceQB(data: unknown = PENDING_ADVANCE_FIXTURE) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({
      data,
      error: data ? null : { message: 'not found' },
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

// ---------------------------------------------------------------------------
// Testes GET /api/ai/hitl
// ---------------------------------------------------------------------------
describe('GET /api/ai/hitl', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    profileQueryBuilder = buildProfileQB()
    authMock = buildAuthMock()
    supabaseClientMock = {
      ...authMock,
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profileQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
  })

  it('retorna 401 quando usuário não autenticado', async () => {
    // Arrange
    supabaseClientMock = {
      ...buildAuthMock(null),
      from: vi.fn(),
    }

    // Act
    const res = await GET(makeGetRequest('http://localhost/api/ai/hitl') as any)
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
      from: vi.fn(() => profileQueryBuilder),
    }

    // Act
    const res = await GET(makeGetRequest('http://localhost/api/ai/hitl') as any)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(404)
    expect(body.error).toBe('Profile not found')
  })

  it('retorna lista de pending advances (happy path)', async () => {
    // Act
    const res = await GET(makeGetRequest('http://localhost/api/ai/hitl') as any)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body).toHaveProperty('pendingAdvances')
    expect(Array.isArray(body.pendingAdvances)).toBe(true)
    expect(body.pendingAdvances[0]).toMatchObject({
      id: PENDING_ID,
      organization_id: ORG_ID,
      confidence: 0.75,
      status: 'pending',
    })
  })

  it('chama getPendingAdvances com organizationId do profile', async () => {
    // Act
    await GET(makeGetRequest('http://localhost/api/ai/hitl') as any)

    // Assert
    expect(getPendingAdvances).toHaveBeenCalledWith(
      supabaseClientMock,
      ORG_ID,
      expect.objectContaining({ status: 'pending' })
    )
  })

  it('filtra por dealId quando query param dealId fornecido', async () => {
    // Act
    await GET(makeGetRequest(`http://localhost/api/ai/hitl?dealId=${DEAL_ID}`) as any)

    // Assert
    expect(getPendingAdvances).toHaveBeenCalledWith(
      supabaseClientMock,
      ORG_ID,
      expect.objectContaining({ dealId: DEAL_ID })
    )
  })

  it('usa status=all quando query param status=all fornecido', async () => {
    // Act
    await GET(makeGetRequest('http://localhost/api/ai/hitl?status=all') as any)

    // Assert
    expect(getPendingAdvances).toHaveBeenCalledWith(
      supabaseClientMock,
      ORG_ID,
      expect.objectContaining({ status: 'all' })
    )
  })

  it('retorna 500 quando getPendingAdvances lança erro', async () => {
    // Arrange
    vi.mocked(getPendingAdvances).mockRejectedValueOnce(new Error('db failure'))

    // Act
    const res = await GET(makeGetRequest('http://localhost/api/ai/hitl') as any)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

// ---------------------------------------------------------------------------
// Testes POST /api/ai/hitl/[id]
// ---------------------------------------------------------------------------
describe('POST /api/ai/hitl/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    profileQueryBuilder = buildProfileQB()
    pendingAdvanceQueryBuilder = buildPendingAdvanceQB()
    authMock = buildAuthMock()
    supabaseClientMock = {
      ...authMock,
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profileQueryBuilder
        if (table === 'ai_pending_stage_advances') return pendingAdvanceQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
  })

  async function callPost(id: string, body: unknown): Promise<Response> {
    const req = makePostRequest(id, body)
    const context = { params: Promise.resolve({ id }) }
    return POST(req as any, context as any)
  }

  it('retorna 400 quando ID não é UUID válido', async () => {
    // Act
    const res = await callPost('nao-e-uuid', { approved: true })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/pending advance ID/i)
  })

  it('retorna 401 quando usuário não autenticado', async () => {
    // Arrange
    supabaseClientMock = {
      ...buildAuthMock(null),
      from: vi.fn(),
    }

    // Act
    const res = await callPost(PENDING_ID, { approved: true })
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
        if (table === 'ai_pending_stage_advances') return pendingAdvanceQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    // Act
    const res = await callPost(PENDING_ID, { approved: true })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(404)
    expect(body.error).toBe('Profile not found')
  })

  it('retorna 400 quando body inválido (approved ausente)', async () => {
    // Act
    const res = await callPost(PENDING_ID, { targetStageId: STAGE_TO })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toBe('Invalid request body')
  })

  it('retorna 404 quando pending advance não encontrado', async () => {
    // Arrange
    pendingAdvanceQueryBuilder = buildPendingAdvanceQB(null)
    supabaseClientMock = {
      ...authMock,
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profileQueryBuilder
        if (table === 'ai_pending_stage_advances') return pendingAdvanceQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    // Act
    const res = await callPost(PENDING_ID, { approved: true })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(404)
    expect(body.error).toBe('Pending advance not found')
  })

  it('retorna 403 quando pending advance pertence a outra organização', async () => {
    // Arrange — pending advance de outro org
    const otherOrgPending = { ...PENDING_ADVANCE_FIXTURE, organization_id: 'other-org-id' }
    pendingAdvanceQueryBuilder = buildPendingAdvanceQB(otherOrgPending)
    supabaseClientMock = {
      ...authMock,
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profileQueryBuilder
        if (table === 'ai_pending_stage_advances') return pendingAdvanceQueryBuilder
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    // Act
    const res = await callPost(PENDING_ID, { approved: true })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(403)
    expect(body.error).toBe('Forbidden')
  })

  it('aprova pending advance com sucesso (happy path)', async () => {
    // Act
    const res = await callPost(PENDING_ID, { approved: true })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.approved).toBe(true)
    expect(body.newStageId).toBe(STAGE_TO)
  })

  it('rejeita pending advance com approved=false', async () => {
    // Arrange
    vi.mocked(resolvePendingAdvance).mockResolvedValueOnce({
      success: true,
      newStageId: null,
    } as any)

    // Act
    const res = await callPost(PENDING_ID, { approved: false, reason: 'Não está pronto' })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.approved).toBe(false)
  })

  it('chama resolvePendingAdvance com userId e pendingAdvanceId corretos', async () => {
    // Act
    await callPost(PENDING_ID, { approved: true, targetStageId: STAGE_TO })

    // Assert
    expect(resolvePendingAdvance).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingAdvanceId: PENDING_ID,
        userId: USER_ID,
      })
    )
  })

  it('retorna 400 quando resolvePendingAdvance retorna success=false', async () => {
    // Arrange
    vi.mocked(resolvePendingAdvance).mockResolvedValueOnce({
      success: false,
      error: 'Pending advance already resolved',
      newStageId: null,
    })

    // Act
    const res = await callPost(PENDING_ID, { approved: true })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toBe('Pending advance already resolved')
  })

  it('retorna 500 quando resolvePendingAdvance lança exceção', async () => {
    // Arrange
    vi.mocked(resolvePendingAdvance).mockRejectedValueOnce(new Error('db crash'))

    // Act
    const res = await callPost(PENDING_ID, { approved: true })
    const body = await res.json()

    // Assert
    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

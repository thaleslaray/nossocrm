/**
 * Testes para a API pública de deals.
 *
 * GET  /api/public/v1/deals — listagem com filtros e paginação
 * POST /api/public/v1/deals — criação de deal
 *
 * Estratégia de mock: vi.mock para Supabase (banco) e authPublicApi.
 * Não há chamadas reais ao banco nem à rede.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Constantes de teste
// ---------------------------------------------------------------------------
// UUIDs v4 válidos (versão 4, variante 8/9/a/b na posição 19)
const ORG_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
const BOARD_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6'
const STAGE_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-a1b2c3d4e5f6'
const CONTACT_ID = 'd4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7'
const DEAL_ID = 'e5f6a7b8-c9d0-4e1f-8a2b-c3d4e5f6a7b8'

const AUTH_OK = {
  ok: true as const,
  organizationId: ORG_ID,
  organizationName: 'Org Test',
  apiKeyId: 'key-id-1',
  apiKeyPrefix: 'test_',
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/public-api/auth', () => ({
  authPublicApi: vi.fn(),
}))

vi.mock('@/lib/public-api/resolve', () => ({
  resolveBoardIdFromKey: vi.fn(async () => BOARD_ID),
  resolveFirstStageId: vi.fn(async () => STAGE_ID),
}))

// Mock centralizado do Supabase admin — cada teste reconfigura os builders
const dealQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  range: vi.fn(async () => ({
    data: [
      {
        id: DEAL_ID,
        title: 'Deal Teste',
        value: '5000',
        board_id: BOARD_ID,
        stage_id: STAGE_ID,
        contact_id: CONTACT_ID,
        client_company_id: null,
        is_won: false,
        is_lost: false,
        loss_reason: null,
        closed_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    count: 1,
    error: null,
  })),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({
    data: {
      id: DEAL_ID,
      title: 'Novo Deal',
      value: '1000',
      board_id: BOARD_ID,
      stage_id: STAGE_ID,
      contact_id: CONTACT_ID,
      client_company_id: null,
      is_won: false,
      is_lost: false,
      loss_reason: null,
      closed_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    error: null,
  })),
}

const contactQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({
    data: { id: CONTACT_ID },
    error: null,
  })),
}

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'deals') return dealQueryBuilder
    if (table === 'contacts') return contactQueryBuilder
    throw new Error(`Unexpected table: ${table}`)
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: vi.fn(() => supabaseMock),
}))

// ---------------------------------------------------------------------------
// Imports (após mocks)
// ---------------------------------------------------------------------------
import { GET, POST } from '@/app/api/public/v1/deals/route'
import { authPublicApi } from '@/lib/public-api/auth'
import { resolveBoardIdFromKey, resolveFirstStageId } from '@/lib/public-api/resolve'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeRequest(url: string, opts: RequestInit = {}): Request {
  return new Request(url, opts)
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe('GET /api/public/v1/deals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authPublicApi).mockResolvedValue(AUTH_OK)
  })

  it('retorna 401 quando API key ausente', async () => {
    // Arrange
    vi.mocked(authPublicApi).mockResolvedValue({
      ok: false,
      status: 401,
      body: { error: 'Missing X-Api-Key', code: 'AUTH_MISSING' },
    })

    // Act
    const res = await GET(makeRequest('http://localhost/api/public/v1/deals'))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toBe('Missing X-Api-Key')
    expect(body.code).toBe('AUTH_MISSING')
  })

  it('retorna 401 quando API key inválida', async () => {
    // Arrange
    vi.mocked(authPublicApi).mockResolvedValue({
      ok: false,
      status: 401,
      body: { error: 'Invalid API key', code: 'AUTH_INVALID' },
    })

    // Act
    const res = await GET(makeRequest('http://localhost/api/public/v1/deals'))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.code).toBe('AUTH_INVALID')
  })

  it('retorna lista de deals com shape correta (happy path)', async () => {
    // Act
    const res = await GET(makeRequest('http://localhost/api/public/v1/deals'))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('nextCursor')
    expect(Array.isArray(body.data)).toBe(true)

    const deal = body.data[0]
    expect(deal).toMatchObject({
      id: DEAL_ID,
      title: 'Deal Teste',
      value: 5000,
      board_id: BOARD_ID,
      stage_id: STAGE_ID,
      contact_id: CONTACT_ID,
      is_won: false,
      is_lost: false,
    })
    // Garantir que campos nullable existem
    expect(deal).toHaveProperty('client_company_id', null)
    expect(deal).toHaveProperty('loss_reason', null)
    expect(deal).toHaveProperty('closed_at', null)
  })

  it('retorna nextCursor null quando todos os itens cabem na página', async () => {
    // Arrange — count === 1, só 1 item, não há próxima página
    dealQueryBuilder.range.mockResolvedValueOnce({
      data: [{ id: DEAL_ID, title: 'D', value: 0, board_id: BOARD_ID, stage_id: STAGE_ID, contact_id: CONTACT_ID, client_company_id: null, is_won: false, is_lost: false, loss_reason: null, closed_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      count: 1,
      error: null,
    })

    // Act
    const res = await GET(makeRequest('http://localhost/api/public/v1/deals?limit=50'))
    const body = await res.json()

    // Assert
    expect(body.nextCursor).toBeNull()
  })

  it('retorna nextCursor quando há mais itens', async () => {
    // Arrange — 100 itens no total, page de 50 → há próxima página
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `deal-${i}`,
      title: `Deal ${i}`,
      value: 0,
      board_id: BOARD_ID,
      stage_id: STAGE_ID,
      contact_id: CONTACT_ID,
      client_company_id: null,
      is_won: false,
      is_lost: false,
      loss_reason: null,
      closed_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }))
    dealQueryBuilder.range.mockResolvedValueOnce({ data: items, count: 100, error: null })

    // Act
    const res = await GET(makeRequest('http://localhost/api/public/v1/deals'))
    const body = await res.json()

    // Assert
    expect(body.nextCursor).not.toBeNull()
    expect(typeof body.nextCursor).toBe('string')
  })

  it('filtra por board_key resolvendo o id correto', async () => {
    // Act
    await GET(makeRequest('http://localhost/api/public/v1/deals?board_key=vendas'))

    // Assert
    expect(resolveBoardIdFromKey).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      boardKey: 'vendas',
    })
    expect(dealQueryBuilder.eq).toHaveBeenCalledWith('board_id', BOARD_ID)
  })

  it('retorna 500 quando banco retorna erro', async () => {
    // Arrange
    dealQueryBuilder.range.mockResolvedValueOnce({
      data: null,
      count: null,
      error: { message: 'connection timeout' },
    })

    // Act
    const res = await GET(makeRequest('http://localhost/api/public/v1/deals'))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
    expect(body.code).toBe('DB_ERROR')
  })

  it('filtra por status=won aplicando eq(is_won, true)', async () => {
    // Act
    await GET(makeRequest('http://localhost/api/public/v1/deals?status=won'))

    // Assert
    expect(dealQueryBuilder.eq).toHaveBeenCalledWith('is_won', true)
  })

  it('filtra por status=lost aplicando eq(is_lost, true)', async () => {
    // Act
    await GET(makeRequest('http://localhost/api/public/v1/deals?status=lost'))

    // Assert
    expect(dealQueryBuilder.eq).toHaveBeenCalledWith('is_lost', true)
  })

  it('sempre filtra por organization_id (isolamento multi-tenant)', async () => {
    // Act
    await GET(makeRequest('http://localhost/api/public/v1/deals'))

    // Assert
    expect(dealQueryBuilder.eq).toHaveBeenCalledWith('organization_id', ORG_ID)
  })
})

// ---------------------------------------------------------------------------

describe('POST /api/public/v1/deals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authPublicApi).mockResolvedValue(AUTH_OK)
    // Reset contact lookup para "não encontrado" (cria novo)
    contactQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null })
  })

  function makePostRequest(body: unknown): Request {
    return new Request('http://localhost/api/public/v1/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('cria deal com contact_id direto (happy path)', async () => {
    // Arrange
    const payload = {
      title: 'Novo Deal',
      board_id: BOARD_ID,
      stage_id: STAGE_ID,
      contact_id: CONTACT_ID,
      value: 1000,
    }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(201)
    expect(body.action).toBe('created')
    expect(body.data).toMatchObject({
      title: 'Novo Deal',
      board_id: BOARD_ID,
    })
  })

  it('cria deal resolvendo board_key quando board_id ausente', async () => {
    // Arrange
    const payload = {
      title: 'Deal via board_key',
      board_key: 'vendas',
      contact_id: CONTACT_ID,
    }

    // Act
    const res = await POST(makePostRequest(payload))

    // Assert
    expect(resolveBoardIdFromKey).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      boardKey: 'vendas',
    })
    expect(res.status).toBe(201)
  })

  it('cria deal com stage_id automático quando stage_id não fornecido', async () => {
    // Arrange
    const payload = {
      title: 'Deal auto-stage',
      board_id: BOARD_ID,
      contact_id: CONTACT_ID,
    }

    // Act
    const res = await POST(makePostRequest(payload))

    // Assert
    expect(resolveFirstStageId).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      boardId: BOARD_ID,
    })
    expect(res.status).toBe(201)
  })

  it('retorna 422 quando title ausente', async () => {
    // Arrange
    const payload = { board_id: BOARD_ID, contact_id: CONTACT_ID }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('retorna 422 quando nem board_id nem board_key fornecidos', async () => {
    // Arrange
    const payload = { title: 'Deal sem board', contact_id: CONTACT_ID }
    // resolveBoardIdFromKey não será chamado, mas mesmo se fosse, sem board_id ou board_key a rota rejeita antes
    vi.mocked(resolveBoardIdFromKey).mockResolvedValueOnce(null as any)

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('retorna 422 quando nem contact_id nem contact fornecidos', async () => {
    // Arrange
    const payload = { title: 'Deal sem contato', board_id: BOARD_ID, stage_id: STAGE_ID }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('retorna 422 quando JSON inválido no body', async () => {
    // Arrange
    const req = new Request('http://localhost/api/public/v1/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    })

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('retorna 401 quando API key inválida na criação', async () => {
    // Arrange
    vi.mocked(authPublicApi).mockResolvedValue({
      ok: false,
      status: 401,
      body: { error: 'Invalid API key', code: 'AUTH_INVALID' },
    })

    // Act
    const res = await POST(makePostRequest({ title: 'X', board_id: BOARD_ID, contact_id: CONTACT_ID }))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.code).toBe('AUTH_INVALID')
  })

  it('retorna 422 ao criar contato inline sem email/phone', async () => {
    // Arrange — contact inline sem identificador obrigatório
    const payload = {
      title: 'Deal com contato inválido',
      board_id: BOARD_ID,
      stage_id: STAGE_ID,
      contact: { name: 'Sem Contato' },  // sem email nem phone
    }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('retorna 500 quando banco retorna erro no insert', async () => {
    // Arrange
    dealQueryBuilder.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'unique constraint violation' },
    })

    // Act
    const res = await POST(makePostRequest({
      title: 'Deal que falha',
      board_id: BOARD_ID,
      stage_id: STAGE_ID,
      contact_id: CONTACT_ID,
    }))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(500)
    expect(body.code).toBe('DB_ERROR')
  })

  it('garante que organization_id do auth é injetado no insert (isolamento multi-tenant)', async () => {
    // Act
    await POST(makePostRequest({
      title: 'Deal multi-tenant',
      board_id: BOARD_ID,
      stage_id: STAGE_ID,
      contact_id: CONTACT_ID,
    }))

    // Assert — o insert deve ter sido chamado com is_won e is_lost iniciais como false
    expect(dealQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        is_won: false,
        is_lost: false,
      })
    )
  })
})

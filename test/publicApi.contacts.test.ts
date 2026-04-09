/**
 * Testes para a API pública de contacts.
 *
 * GET  /api/public/v1/contacts — listagem com filtros e paginação
 * POST /api/public/v1/contacts — upsert de contato (cria ou atualiza)
 *
 * Estratégia: vi.mock para authPublicApi e Supabase. Sem I/O real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Constantes de teste
// ---------------------------------------------------------------------------
// UUIDs v4 válidos (versão 4, variante 8 na posição 19)
const ORG_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
const CONTACT_ID = 'd4e5f6a7-b8c9-4d0e-8f1a-b2c3d4e5f6a7'

const AUTH_OK = {
  ok: true as const,
  organizationId: ORG_ID,
  organizationName: 'Org Test',
  apiKeyId: 'key-id-1',
  apiKeyPrefix: 'test_',
}

const CONTACT_FIXTURE = {
  id: CONTACT_ID,
  name: 'Maria Silva',
  email: 'maria@exemplo.com',
  phone: '+5511999990000',
  role: null,
  company_name: null,
  client_company_id: null,
  avatar: null,
  notes: null,
  status: 'ACTIVE',
  stage: 'LEAD',
  source: null,
  birth_date: null,
  last_interaction: null,
  last_purchase_date: null,
  total_value: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/public-api/auth', () => ({
  authPublicApi: vi.fn(),
}))

const contactQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  range: vi.fn(async () => ({
    data: [CONTACT_FIXTURE],
    count: 1,
    error: null,
  })),
  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({
    data: CONTACT_FIXTURE,
    error: null,
  })),
}

const companyQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({
    data: { id: 'company-001' },
    error: null,
  })),
}

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'contacts') return contactQueryBuilder
    if (table === 'crm_companies') return companyQueryBuilder
    throw new Error(`Unexpected table: ${table}`)
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: vi.fn(() => supabaseMock),
}))

// ---------------------------------------------------------------------------
// Imports (após mocks)
// ---------------------------------------------------------------------------
import { GET, POST } from '@/app/api/public/v1/contacts/route'
import { authPublicApi } from '@/lib/public-api/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeGetRequest(url: string): Request {
  return new Request(url)
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/public/v1/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Testes GET
// ---------------------------------------------------------------------------
describe('GET /api/public/v1/contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authPublicApi).mockResolvedValue(AUTH_OK)
    contactQueryBuilder.range.mockResolvedValue({
      data: [CONTACT_FIXTURE],
      count: 1,
      error: null,
    })
  })

  it('retorna 401 quando API key ausente', async () => {
    // Arrange
    vi.mocked(authPublicApi).mockResolvedValue({
      ok: false,
      status: 401,
      body: { error: 'Missing X-Api-Key', code: 'AUTH_MISSING' },
    })

    // Act
    const res = await GET(makeGetRequest('http://localhost/api/public/v1/contacts'))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.code).toBe('AUTH_MISSING')
  })

  it('retorna lista de contatos com shape correta', async () => {
    // Act
    const res = await GET(makeGetRequest('http://localhost/api/public/v1/contacts'))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty('nextCursor')

    const c = body.data[0]
    expect(c).toMatchObject({
      id: CONTACT_ID,
      name: 'Maria Silva',
      email: 'maria@exemplo.com',
      phone: '+5511999990000',
    })
    // Campos nullable devem existir como null
    expect(c).toHaveProperty('role', null)
    expect(c).toHaveProperty('birth_date', null)
    expect(c).toHaveProperty('total_value', null)
  })

  it('normaliza total_value para number quando presente', async () => {
    // Arrange
    contactQueryBuilder.range.mockResolvedValueOnce({
      data: [{ ...CONTACT_FIXTURE, total_value: '5000.50' }],
      count: 1,
      error: null,
    })

    // Act
    const res = await GET(makeGetRequest('http://localhost/api/public/v1/contacts'))
    const body = await res.json()

    // Assert
    expect(typeof body.data[0].total_value).toBe('number')
    expect(body.data[0].total_value).toBe(5000.5)
  })

  it('filtra por email passando eq na query', async () => {
    // Act
    await GET(makeGetRequest('http://localhost/api/public/v1/contacts?email=maria@exemplo.com'))

    // Assert
    expect(contactQueryBuilder.eq).toHaveBeenCalledWith('email', expect.stringContaining('maria'))
  })

  it('sempre filtra por organization_id (isolamento multi-tenant)', async () => {
    // Act
    await GET(makeGetRequest('http://localhost/api/public/v1/contacts'))

    // Assert
    expect(contactQueryBuilder.eq).toHaveBeenCalledWith('organization_id', ORG_ID)
  })

  it('retorna nextCursor quando há mais itens que o limit', async () => {
    // Arrange — 100 itens, page de 50
    const items = Array.from({ length: 50 }, (_, i) => ({ ...CONTACT_FIXTURE, id: `c-${i}` }))
    contactQueryBuilder.range.mockResolvedValueOnce({ data: items, count: 100, error: null })

    // Act
    const res = await GET(makeGetRequest('http://localhost/api/public/v1/contacts'))
    const body = await res.json()

    // Assert
    expect(body.nextCursor).not.toBeNull()
  })

  it('retorna 500 quando banco retorna erro', async () => {
    // Arrange
    contactQueryBuilder.range.mockResolvedValueOnce({
      data: null,
      count: null,
      error: { message: 'db error' },
    })

    // Act
    const res = await GET(makeGetRequest('http://localhost/api/public/v1/contacts'))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(500)
    expect(body.code).toBe('DB_ERROR')
  })
})

// ---------------------------------------------------------------------------
// Testes POST (upsert)
// ---------------------------------------------------------------------------
describe('POST /api/public/v1/contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authPublicApi).mockResolvedValue(AUTH_OK)
    // Default: contato não existe → cria novo
    contactQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null })
    contactQueryBuilder.single.mockResolvedValue({ data: CONTACT_FIXTURE, error: null })
  })

  it('cria contato novo quando email não existe (happy path)', async () => {
    // Arrange
    const payload = {
      name: 'João Novo',
      email: 'joao@exemplo.com',
    }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(201)
    expect(body.action).toBe('created')
    expect(body.data).toBeDefined()
  })

  it('atualiza contato existente (upsert)', async () => {
    // Arrange — contato já existe
    contactQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: CONTACT_ID },
      error: null,
    })
    contactQueryBuilder.single.mockResolvedValueOnce({
      data: { ...CONTACT_FIXTURE, name: 'Maria Atualizada' },
      error: null,
    })
    const payload = { email: 'maria@exemplo.com', name: 'Maria Atualizada' }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.action).toBe('updated')
    expect(contactQueryBuilder.update).toHaveBeenCalled()
  })

  it('retorna 422 quando nem email nem phone fornecidos', async () => {
    // Arrange
    const payload = { name: 'Sem Contato' }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.error).toMatch(/email|phone/i)
  })

  it('retorna 422 ao criar contato novo sem nome', async () => {
    // Arrange — contato não existe, nome não fornecido
    const payload = { email: 'sem-nome@exemplo.com' }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('retorna 422 com birth_date inválido', async () => {
    // Arrange
    const payload = {
      name: 'Test',
      email: 'test@example.com',
      birth_date: 'nao-e-uma-data',
    }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.error).toMatch(/birth_date/i)
  })

  it('retorna 422 com last_interaction inválido', async () => {
    // Arrange
    const payload = {
      name: 'Test',
      email: 'test@example.com',
      last_interaction: 'data-invalida',
    }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.error).toMatch(/last_interaction/i)
  })

  it('aceita birth_date no formato YYYY-MM-DD sem rejeitar', async () => {
    // Arrange
    const payload = {
      name: 'Test',
      email: 'test@example.com',
      birth_date: '1990-05-15',
    }

    // Act
    const res = await POST(makePostRequest(payload))

    // Assert
    expect(res.status).toBe(201)
  })

  it('resolve company_name para client_company_id automaticamente', async () => {
    // Arrange — company não existe, será criada
    companyQueryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const payload = {
      name: 'Test',
      email: 'test@example.com',
      company_name: 'Empresa Nova LTDA',
    }

    // Act
    await POST(makePostRequest(payload))

    // Assert
    expect(supabaseMock.from).toHaveBeenCalledWith('crm_companies')
    expect(companyQueryBuilder.insert).toHaveBeenCalled()
  })

  it('retorna 401 quando auth falha', async () => {
    // Arrange
    vi.mocked(authPublicApi).mockResolvedValue({
      ok: false,
      status: 401,
      body: { error: 'Invalid API key', code: 'AUTH_INVALID' },
    })

    // Act
    const res = await POST(makePostRequest({ name: 'X', email: 'x@example.com' }))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.code).toBe('AUTH_INVALID')
  })

  it('garante que organization_id é injetado no insert (multi-tenant)', async () => {
    // Act
    await POST(makePostRequest({ name: 'Multi', email: 'multi@example.com' }))

    // Assert
    expect(contactQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
      })
    )
  })

  it('retorna 422 com payload que tem campo extra (strict schema)', async () => {
    // Arrange
    const payload = {
      name: 'Test',
      email: 'test@example.com',
      campo_nao_permitido: 'valor',
    }

    // Act
    const res = await POST(makePostRequest(payload))
    const body = await res.json()

    // Assert
    expect(res.status).toBe(422)
    expect(body.code).toBe('VALIDATION_ERROR')
  })
})

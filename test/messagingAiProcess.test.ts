/**
 * Testes para o endpoint interno de processamento AI.
 *
 * POST /api/messaging/ai/process
 *
 * Esta rota é interna: autenticada por INTERNAL_API_SECRET.
 * Chama processIncomingMessage em background (waitUntil em prod, await em dev).
 *
 * Estratégia de env: vi.hoisted + process.env direto (antes do import do módulo).
 * O módulo lê INTERNAL_API_SECRET como const em nível de módulo, então a env
 * precisa estar configurada antes de qualquer import da rota.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Constantes de teste
// ---------------------------------------------------------------------------
const VALID_SECRET = 'test-internal-secret-abc123'
// UUIDs v4 válidos (versão 4, variante 8 na posição 19)
const CONV_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'
const ORG_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6'
const MSG_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-a1b2c3d4e5f6'

// ---------------------------------------------------------------------------
// vi.hoisted — executa ANTES de qualquer import, inclusive transformações ESM
// ---------------------------------------------------------------------------
const { envSetup } = vi.hoisted(() => {
  // Definir envs antes do módulo ser carregado
  process.env.INTERNAL_API_SECRET = 'test-internal-secret-abc123'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-test'
  process.env.NODE_ENV = 'development'
  return { envSetup: true }
})

// ---------------------------------------------------------------------------
// Mocks — devem vir antes dos imports do módulo
// ---------------------------------------------------------------------------

// Mock do processIncomingMessage para evitar I/O real
vi.mock('@/lib/ai/agent', () => ({
  processIncomingMessage: vi.fn(async () => ({
    success: true,
    decision: { action: 'responded', reason: 'ok' },
  })),
}))

// Mock do @vercel/functions para evitar dependência de ambiente Vercel
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((p: Promise<unknown>) => p),
}))

// Mock do createClient do Supabase (chamado direto nesta rota, não via helper)
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

// ---------------------------------------------------------------------------
// Imports (após mocks e setup de env)
// ---------------------------------------------------------------------------
import { POST } from '@/app/api/messaging/ai/process/route'
import { processIncomingMessage } from '@/lib/ai/agent'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/messaging/ai/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function withSecret(extraHeaders: Record<string, string> = {}): Record<string, string> {
  return { 'X-Internal-Secret': VALID_SECRET, ...extraHeaders }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe('POST /api/messaging/ai/process', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Autenticação ──────────────────────────────────────────────────────────

  it('retorna 401 quando header de autenticação está ausente', async () => {
    // Arrange
    const req = makeRequest({
      conversationId: CONV_ID,
      organizationId: ORG_ID,
      messageText: 'Olá',
    })

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('retorna 401 quando secret é inválido', async () => {
    // Arrange
    const req = makeRequest(
      { conversationId: CONV_ID, organizationId: ORG_ID, messageText: 'Olá' },
      { 'X-Internal-Secret': 'wrong-secret' }
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('aceita autenticação via Authorization: Bearer', async () => {
    // Arrange
    const req = makeRequest(
      { conversationId: CONV_ID, organizationId: ORG_ID, messageText: 'Oi' },
      { Authorization: `Bearer ${VALID_SECRET}` }
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.received).toBe(true)
  })

  it('aceita autenticação via X-Internal-Secret header', async () => {
    // Arrange
    const req = makeRequest(
      { conversationId: CONV_ID, organizationId: ORG_ID, messageText: 'Oi' },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.received).toBe(true)
  })

  // ── Validação de campos ───────────────────────────────────────────────────

  it('retorna 400 quando conversationId está ausente', async () => {
    // Arrange
    const req = makeRequest(
      { organizationId: ORG_ID, messageText: 'Oi' },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/conversationId/)
  })

  it('retorna 400 quando organizationId está ausente', async () => {
    // Arrange
    const req = makeRequest(
      { conversationId: CONV_ID, messageText: 'Oi' },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/organizationId/)
  })

  it('retorna 400 quando messageText está ausente', async () => {
    // Arrange
    const req = makeRequest(
      { conversationId: CONV_ID, organizationId: ORG_ID },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/messageText/)
  })

  it('retorna 400 quando conversationId não é UUID válido', async () => {
    // Arrange
    const req = makeRequest(
      { conversationId: 'nao-e-uuid', organizationId: ORG_ID, messageText: 'Oi' },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/UUID/i)
  })

  it('retorna 400 quando organizationId não é UUID válido', async () => {
    // Arrange
    const req = makeRequest(
      { conversationId: CONV_ID, organizationId: 'org-invalido', messageText: 'Oi' },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/UUID/i)
  })

  it('retorna 400 quando messageId é fornecido mas não é UUID válido', async () => {
    // Arrange
    const req = makeRequest(
      {
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        messageText: 'Oi',
        messageId: 'not-a-uuid',
      },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/UUID/i)
  })

  it('retorna 400 quando body é JSON inválido', async () => {
    // Arrange
    const req = new Request('http://localhost/api/messaging/ai/process', {
      method: 'POST',
      headers: { 'X-Internal-Secret': VALID_SECRET, 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    })

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/JSON|body/i)
  })

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('chama processIncomingMessage com parâmetros corretos (happy path)', async () => {
    // Arrange
    const req = makeRequest(
      {
        conversationId: CONV_ID,
        organizationId: ORG_ID,
        messageText: 'Preciso de ajuda',
        messageId: MSG_ID,
      },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert
    expect(res.status).toBe(200)
    expect(body.received).toBe(true)
    expect(processIncomingMessage).toHaveBeenCalledWith({
      supabase: expect.anything(),
      conversationId: CONV_ID,
      organizationId: ORG_ID,
      incomingMessage: 'Preciso de ajuda',
      messageId: MSG_ID,
    })
  })

  it('retorna 200 mesmo quando processIncomingMessage lança erro (fire-and-forget)', async () => {
    // Arrange — simula erro no processamento
    vi.mocked(processIncomingMessage).mockRejectedValueOnce(new Error('AI timeout'))
    const req = makeRequest(
      { conversationId: CONV_ID, organizationId: ORG_ID, messageText: 'Oi' },
      withSecret()
    )

    // Act
    const res = await POST(req)
    const body = await res.json()

    // Assert — resposta é 200 (webhook pattern: nunca retornar erro ao caller)
    expect(res.status).toBe(200)
    expect(body.received).toBe(true)
  })

  it('aceita messageId opcional ausente sem erro', async () => {
    // Arrange — sem messageId
    const req = makeRequest(
      { conversationId: CONV_ID, organizationId: ORG_ID, messageText: 'Sem ID' },
      withSecret()
    )

    // Act
    const res = await POST(req)

    // Assert
    expect(res.status).toBe(200)
    expect(processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: undefined })
    )
  })
})

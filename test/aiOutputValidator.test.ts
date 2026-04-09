/**
 * Testes para lib/ai/agent/output-validator.ts
 *
 * Verifica que respostas do LLM são validadas antes de serem enviadas ao lead:
 * - Vazamento de system prompt / identidade de IA
 * - Vazamento de PII do contexto
 * - Limite de tamanho (WhatsApp 4096 chars)
 * - Resposta vazia
 */
import { describe, expect, it, vi } from 'vitest'
import { validateAIOutput } from '@/lib/ai/agent/output-validator'
import type { LeadContext } from '@/lib/ai/agent/types'

vi.mock('@/lib/ai/agent/structured-logger', () => ({
  logStructured: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Fixture de contexto mínimo
// ---------------------------------------------------------------------------
const EMPTY_CONTEXT: LeadContext = {
  deal: null,
  contact: null,
  stage: null,
  recentMessages: [],
  organization: null,
}

const CONTEXT_WITH_PII: LeadContext = {
  ...EMPTY_CONTEXT,
  contact: {
    id: 'c1',
    name: 'João Silva',
    email: 'joao@empresa.com.br',
    phone: '+5511999887766',
  } as any,
  deal: {
    id: 'd1',
    title: 'Proposta',
    value: 15000,
  } as any,
}

const FALLBACK = 'Obrigado pelo contato! Nossa equipe retornará em breve.'

// ---------------------------------------------------------------------------
// Respostas seguras — devem passar
// ---------------------------------------------------------------------------
describe('validateAIOutput — respostas seguras', () => {
  it('aprova resposta normal sem PII', () => {
    const result = validateAIOutput(
      'Olá! Posso ajudar com mais informações sobre nosso produto.',
      EMPTY_CONTEXT
    )
    expect(result.safe).toBe(true)
    expect(result.response).toBe('Olá! Posso ajudar com mais informações sobre nosso produto.')
    expect(result.issues).toHaveLength(0)
  })

  it('aprova resposta com nome genérico não PII', () => {
    const result = validateAIOutput(
      'Obrigado pelo interesse! Nossa equipe entrará em contato.',
      CONTEXT_WITH_PII
    )
    expect(result.safe).toBe(true)
  })

  it('aprova resposta longa mas dentro do limite de 4096', () => {
    const longResponse = 'A '.repeat(2000) // ~4000 chars
    const result = validateAIOutput(longResponse, EMPTY_CONTEXT)
    expect(result.safe).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Resposta vazia — deve usar fallback
// ---------------------------------------------------------------------------
describe('validateAIOutput — resposta vazia', () => {
  it('rejeita string vazia', () => {
    const result = validateAIOutput('', EMPTY_CONTEXT)
    expect(result.safe).toBe(false)
    expect(result.response).toBe(FALLBACK)
    expect(result.issues).toContain('empty_response')
  })

  it('rejeita string com apenas espaços', () => {
    const result = validateAIOutput('   ', EMPTY_CONTEXT)
    expect(result.safe).toBe(false)
    expect(result.issues).toContain('empty_response')
  })
})

// ---------------------------------------------------------------------------
// Limite de tamanho — deve usar fallback
// ---------------------------------------------------------------------------
describe('validateAIOutput — limite de tamanho', () => {
  it('rejeita resposta com mais de 4096 caracteres', () => {
    const tooLong = 'x'.repeat(4097)
    const result = validateAIOutput(tooLong, EMPTY_CONTEXT)
    expect(result.safe).toBe(false)
    expect(result.response).toBe(FALLBACK)
    expect(result.issues.some(i => i.startsWith('length_exceeded'))).toBe(true)
  })

  it('aprova resposta exatamente em 4096', () => {
    const exact = 'x'.repeat(4096)
    const result = validateAIOutput(exact, EMPTY_CONTEXT)
    expect(result.safe).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Vazamento de system prompt / identidade de IA
// ---------------------------------------------------------------------------
describe('validateAIOutput — vazamento de system prompt', () => {
  it('rejeita quando LLM revela identidade como IA (PT)', () => {
    const result = validateAIOutput(
      'Como uma IA, posso te ajudar com isso!',
      EMPTY_CONTEXT
    )
    expect(result.safe).toBe(false)
    expect(result.issues.some(i => i.includes('revealed_ai_identity_pt'))).toBe(true)
    expect(result.response).toBe(FALLBACK)
  })

  it('rejeita quando LLM declara ser IA (PT)', () => {
    const result = validateAIOutput('Sou um robô projetado para ajudar vendas.', EMPTY_CONTEXT)
    expect(result.safe).toBe(false)
    expect(result.issues.some(i => i.includes('declared_ai_pt'))).toBe(true)
  })

  it('rejeita quando LLM revela que foi programado', () => {
    const result = validateAIOutput(
      'Fui programado para responder apenas sobre nossos produtos.',
      EMPTY_CONTEXT
    )
    expect(result.safe).toBe(false)
    expect(result.issues.some(i => i.includes('revealed_programming_pt'))).toBe(true)
  })

  it('rejeita quando LLM vaza as regras do sistema', () => {
    const result = validateAIOutput(
      'REGRAS IMPORTANTES: nunca mencione preços.',
      EMPTY_CONTEXT
    )
    expect(result.safe).toBe(false)
    expect(result.issues.some(i => i.includes('rules_dump_pt'))).toBe(true)
  })

  it('rejeita quando LLM revela identidade como AI (EN)', () => {
    const result = validateAIOutput(
      'As an AI assistant, I can help you with that!',
      EMPTY_CONTEXT
    )
    expect(result.safe).toBe(false)
    expect(result.issues.some(i => i.includes('revealed_ai_identity_en'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Vazamento de PII
// ---------------------------------------------------------------------------
describe('validateAIOutput — vazamento de PII', () => {
  it('rejeita quando email do lead aparece na resposta', () => {
    const result = validateAIOutput(
      'Enviaremos a proposta para joao@empresa.com.br assim que possível.',
      CONTEXT_WITH_PII
    )
    expect(result.safe).toBe(false)
    expect(result.issues.some(i => i.startsWith('pii_leak:email'))).toBe(true)
  })

  it('rejeita quando número de telefone completo aparece na resposta', () => {
    const result = validateAIOutput(
      'Ligaremos para +5511999887766 em breve.',
      CONTEXT_WITH_PII
    )
    expect(result.safe).toBe(false)
    expect(result.issues.some(i => i.startsWith('pii_leak:phone'))).toBe(true)
  })

  it('rejeita quando valor do deal aparece verbatim', () => {
    const result = validateAIOutput(
      'Nossa proposta de 15000 reais inclui suporte.',
      CONTEXT_WITH_PII
    )
    expect(result.safe).toBe(false)
    expect(result.issues.some(i => i.startsWith('pii_leak:deal_value'))).toBe(true)
  })

  it('não rejeita quando PII não está no contexto', () => {
    const result = validateAIOutput(
      'Enviaremos a proposta para joao@empresa.com.br assim que possível.',
      EMPTY_CONTEXT // sem contact no contexto
    )
    expect(result.safe).toBe(true)
  })

  it('não rejeita número muito curto como PII (evita falso positivo)', () => {
    // deal.value = 150 (2 dígitos < 3) não deve triggar
    const ctx: LeadContext = {
      ...EMPTY_CONTEXT,
      deal: { id: 'd1', title: 'Proposta', value: 15 } as any,
    }
    const result = validateAIOutput('Temos 15 opções disponíveis.', ctx)
    expect(result.safe).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Estrutura do retorno
// ---------------------------------------------------------------------------
describe('validateAIOutput — estrutura do ValidationResult', () => {
  it('retorna campos corretos quando seguro', () => {
    const result = validateAIOutput('Olá!', EMPTY_CONTEXT)
    expect(result).toHaveProperty('safe', true)
    expect(result).toHaveProperty('response', 'Olá!')
    expect(result).toHaveProperty('issues')
    expect(Array.isArray(result.issues)).toBe(true)
  })

  it('retorna campos corretos quando não seguro', () => {
    const result = validateAIOutput('', EMPTY_CONTEXT)
    expect(result).toHaveProperty('safe', false)
    expect(result).toHaveProperty('response', FALLBACK)
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

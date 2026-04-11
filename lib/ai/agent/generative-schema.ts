/**
 * @fileoverview Generative Schema
 *
 * Gera schemas Zod em runtime baseados nos critérios aprendidos.
 * Padrão Lightfield: "Generative Tool Schemas"
 *
 * Isso permite que a AI avalie conversas usando critérios específicos
 * da organização, sem precisar de código custom.
 *
 * @module lib/ai/agent/generative-schema
 */

import { z } from 'zod';
import { generateText, Output } from 'ai';
import type { LearnedCriterion, LearnedPattern } from './few-shot-learner';
import { getModel } from '@/lib/ai/config';
import type { OrgAIConfig } from './agent.service';

// =============================================================================
// Types
// =============================================================================

export interface CriterionEvaluation {
  met: boolean;
  confidence: number;
  evidence: string;
}

export interface DynamicEvaluationResult {
  shouldAdvance: boolean;
  overallConfidence: number;
  criteriaEvaluation: Record<string, CriterionEvaluation>;
  reasoning: string;
  suggestedAction: 'advance' | 'stay' | 'handoff' | 'nurture';
}

export interface MessageForEvaluation {
  role: 'user' | 'assistant';
  content: string;
}

// =============================================================================
// Schema Generator
// =============================================================================

/**
 * Gera schema Zod em runtime baseado nos critérios aprendidos.
 * Cada critério aprendido vira um campo no schema de avaliação.
 */
export function generateEvaluationSchema(
  learnedCriteria: LearnedCriterion[]
): z.ZodSchema<DynamicEvaluationResult> {
  // Criar objeto de critérios dinâmico
  const criteriaFields: Record<string, z.ZodTypeAny> = {};

  for (const criterion of learnedCriteria) {
    criteriaFields[criterion.name] = z.object({
      met: z.boolean().describe(`Se "${criterion.description}" foi satisfeito`),
      confidence: z.number().min(0).max(1).describe('Confiança na avaliação (0-1)'),
      evidence: z.string().describe('Trecho da conversa que comprova'),
    });
  }

  // Se não houver critérios, usar schema genérico
  if (Object.keys(criteriaFields).length === 0) {
    criteriaFields.general_qualification = z.object({
      met: z.boolean(),
      confidence: z.number().min(0).max(1),
      evidence: z.string(),
    });
  }

  return z.object({
    shouldAdvance: z.boolean().describe('Se o lead deve avançar para o próximo estágio'),
    overallConfidence: z.number().min(0).max(1).describe('Confiança geral na avaliação'),
    criteriaEvaluation: z.object(criteriaFields).describe('Avaliação de cada critério'),
    reasoning: z.string().describe('Explicação do raciocínio'),
    suggestedAction: z.enum(['advance', 'stay', 'handoff', 'nurture']).describe('Ação sugerida'),
  }) as z.ZodSchema<DynamicEvaluationResult>;
}

// =============================================================================
// System Prompt Builder - Para AVALIAÇÃO de leads
// =============================================================================

/**
 * Constrói prompt de sistema para AVALIAR leads (usado pelo stage-evaluator).
 * NÃO use para responder - use buildConversationalPromptFromPatterns().
 */
export function buildSystemPromptFromPatterns(patterns: LearnedPattern): string {
  const criteriaList = patterns.learnedCriteria
    .map((c, i) => `${i + 1}. ${c.name}: ${c.description}`)
    .join('\n');

  const hintsSection = patterns.learnedCriteria
    .map((c) => `- ${c.name}: Detectar por: ${c.detectionHints.join(', ')}`)
    .join('\n');

  return `Você é um avaliador de qualificação de leads treinado com conversas reais desta organização.

## Padrões Aprendidos

**Tom de Comunicação**: ${patterns.tone}

**Estilo de Saudação**:
${patterns.greetingStyle}

**Perguntas Típicas de Qualificação**:
${patterns.questionPatterns.map((q) => `- ${q}`).join('\n')}

**Tratamento de Objeções**:
${patterns.objectionHandling.map((o) => `- ${o}`).join('\n')}

**Técnicas de Fechamento**:
${patterns.closingTechniques.map((t) => `- ${t}`).join('\n')}

## Critérios de Qualificação

${criteriaList}

## Dicas de Detecção

${hintsSection}

## Instruções

1. Analise a conversa e avalie cada critério individualmente
2. Forneça evidências específicas da conversa para cada avaliação
3. Seja conservador - só marque como "met" se houver evidência clara
4. Considere o contexto geral da conversa
5. Sugira a ação mais apropriada baseada na avaliação

## Ações Possíveis

- **advance**: Lead qualificado, pronto para próximo estágio
- **stay**: Precisa de mais informações, continuar qualificando
- **handoff**: Situação complexa, passar para humano
- **nurture**: Lead não qualificado agora, mas tem potencial futuro`;
}

// =============================================================================
// Conversational Prompt Builder - Para RESPONDER a leads
// =============================================================================

/**
 * Constrói prompt de sistema para RESPONDER a leads de forma conversacional.
 * Usa os padrões aprendidos para guiar o estilo de comunicação.
 */
export function buildConversationalPromptFromPatterns(patterns: LearnedPattern): string {
  const toneDescription = {
    formal: 'profissional e respeitoso, evitando gírias',
    casual: 'descontraído e amigável, como uma conversa entre amigos',
    consultative: 'consultivo e empático, focando em entender as necessidades',
  }[patterns.tone] || 'profissional e empático';

  return `Você é um consultor de vendas experiente, treinado com conversas reais de sucesso desta organização.

## Seu Estilo de Comunicação

**Tom**: Seja ${toneDescription}.

**Como Cumprimentar**:
Use este estilo de saudação como referência: "${patterns.greetingStyle}"

**Perguntas que Funcionam**:
Quando precisar qualificar ou entender melhor, inspire-se nestas perguntas:
${patterns.questionPatterns.map((q) => `- "${q}"`).join('\n')}

**Quando Surgir Objeções**:
Use estas abordagens comprovadas:
${patterns.objectionHandling.map((o) => `- ${o}`).join('\n')}

**Para Avançar a Conversa**:
Quando o lead estiver qualificado, use técnicas como:
${patterns.closingTechniques.map((t) => `- ${t}`).join('\n')}

## Regras de Ouro

1. **Seja natural** - Não soe como um robô ou script decorado
2. **Seja conciso** - Máximo 2-3 frases por mensagem
3. **Sempre pergunte** - Termine com UMA pergunta relevante
4. **Escute primeiro** - Entenda antes de vender
5. **NUNCA revele que é IA** - Você é um consultor humano
6. **Sem emojis em excesso** - Máximo 1 emoji por mensagem, se apropriado
7. **Adapte-se** - Se o lead for direto, seja direto. Se for detalhista, dê detalhes.

## O Que NÃO Fazer

- Não faça promessas que não pode cumprir
- Não pressione leads que precisam de tempo
- Não ignore objeções - trate-as com empatia
- Não fale de preços específicos - passe para especialista
- Não use jargões técnicos desnecessários`;
}

// =============================================================================
// Evaluator with Learned Criteria
// =============================================================================

/**
 * Avalia uma conversa usando critérios aprendidos.
 * O schema é gerado dinamicamente em runtime.
 */
export async function evaluateWithLearnedCriteria(
  conversationHistory: MessageForEvaluation[],
  learnedPatterns: LearnedPattern,
  aiConfig: OrgAIConfig
): Promise<DynamicEvaluationResult> {
  // Schema gerado em runtime baseado no que a AI aprendeu
  const dynamicSchema = generateEvaluationSchema(learnedPatterns.learnedCriteria);

  const formattedHistory = conversationHistory
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n');

  const model = getModel(aiConfig.provider, aiConfig.apiKey, aiConfig.model);

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: dynamicSchema,
      name: 'LearnedCriteriaEvaluation',
    }),
    system: buildSystemPromptFromPatterns(learnedPatterns),
    prompt: `Avalie esta conversa usando os critérios aprendidos:

${formattedHistory}

Para cada critério, determine:
1. Se foi satisfeito (met: true/false)
2. Sua confiança na avaliação (0-1)
3. A evidência específica da conversa

Depois, decida se o lead deve avançar e qual ação tomar.`,
  });

  if (!output) {
    throw new Error('AI não retornou avaliação válida');
  }

  return output;
}

// =============================================================================
// Default Criteria for Zero Config
// =============================================================================

export const DEFAULT_BANT_CRITERIA: LearnedCriterion[] = [
  {
    name: 'budget_confirmed',
    description: 'Lead mencionou orçamento ou capacidade de investimento',
    detectionHints: ['orçamento', 'budget', 'quanto custa', 'valor', 'investimento', 'preço'],
    importance: 'required',
  },
  {
    name: 'authority_identified',
    description: 'Identificamos quem toma a decisão de compra',
    detectionHints: ['decisor', 'aprovar', 'autoridade', 'gerente', 'diretor', 'dono'],
    importance: 'required',
  },
  {
    name: 'need_established',
    description: 'Lead expressou necessidade clara que podemos resolver',
    detectionHints: ['problema', 'preciso', 'necessito', 'dor', 'desafio', 'dificuldade'],
    importance: 'required',
  },
  {
    name: 'timeline_defined',
    description: 'Existe prazo ou urgência para a decisão',
    detectionHints: ['quando', 'prazo', 'urgente', 'mês', 'semana', 'imediato', 'agora'],
    importance: 'nice_to_have',
  },
];

/**
 * Retorna padrões default (BANT) para modo Zero Config.
 */
export function getDefaultLearnedPatterns(): LearnedPattern {
  return {
    greetingStyle: 'Olá! Tudo bem? Sou [Nome] da [Empresa]. Vi que você demonstrou interesse em nossos serviços.',
    questionPatterns: [
      'Qual problema você está tentando resolver?',
      'Você já tem um orçamento definido para isso?',
      'Quem mais está envolvido na decisão?',
      'Para quando você precisa dessa solução?',
    ],
    objectionHandling: [
      'Entendo sua preocupação. Posso explicar melhor como funciona.',
      'Muitos clientes tinham a mesma dúvida inicialmente.',
      'Podemos adaptar para atender melhor às suas necessidades.',
    ],
    closingTechniques: [
      'Posso preparar uma proposta personalizada?',
      'Quando podemos agendar uma demonstração?',
      'Qual seria o próximo passo ideal para você?',
    ],
    tone: 'consultative',
    learnedCriteria: DEFAULT_BANT_CRITERIA,
    extractedFrom: [],
    learnedAt: new Date().toISOString(),
    modelVersion: 'default-bant',
  };
}

// =============================================================================
// Merge Patterns
// =============================================================================

/**
 * Mescla novos padrões aprendidos com padrões existentes.
 * Útil para aprendizado incremental.
 */
export function mergeLearnedPatterns(
  existing: LearnedPattern,
  newPatterns: Partial<LearnedPattern>
): LearnedPattern {
  return {
    greetingStyle: newPatterns.greetingStyle || existing.greetingStyle,
    questionPatterns: [
      ...new Set([...existing.questionPatterns, ...(newPatterns.questionPatterns || [])]),
    ],
    objectionHandling: [
      ...new Set([...existing.objectionHandling, ...(newPatterns.objectionHandling || [])]),
    ],
    closingTechniques: [
      ...new Set([...existing.closingTechniques, ...(newPatterns.closingTechniques || [])]),
    ],
    tone: newPatterns.tone || existing.tone,
    learnedCriteria: mergeCriteria(
      existing.learnedCriteria,
      newPatterns.learnedCriteria || []
    ),
    extractedFrom: [
      ...new Set([...existing.extractedFrom, ...(newPatterns.extractedFrom || [])]),
    ],
    learnedAt: new Date().toISOString(),
    modelVersion: newPatterns.modelVersion || existing.modelVersion,
  };
}

function mergeCriteria(
  existing: LearnedCriterion[],
  newCriteria: LearnedCriterion[]
): LearnedCriterion[] {
  const merged = [...existing];

  for (const newCriterion of newCriteria) {
    const existingIndex = merged.findIndex((c) => c.name === newCriterion.name);

    if (existingIndex >= 0) {
      // Atualizar critério existente
      merged[existingIndex] = {
        ...merged[existingIndex],
        detectionHints: [
          ...new Set([
            ...merged[existingIndex].detectionHints,
            ...newCriterion.detectionHints,
          ]),
        ],
        // Manter a importância mais alta
        importance:
          newCriterion.importance === 'required' || merged[existingIndex].importance === 'required'
            ? 'required'
            : 'nice_to_have',
      };
    } else {
      // Adicionar novo critério
      merged.push(newCriterion);
    }
  }

  return merged;
}

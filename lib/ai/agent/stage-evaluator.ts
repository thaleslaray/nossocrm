/**
 * @fileoverview Stage Advancement Evaluator
 *
 * Avalia se um lead deve avançar para o próximo estágio
 * baseado nos critérios BANT e configuração do estágio.
 *
 * Patterns utilizados (baseado em research de SalesGPT, Vercel AI SDK, Salesforce):
 * - Structured Output com Zod schema
 * - Confidence scoring (0 a 1) para cada critério
 * - Human-in-the-Loop (HITL) com thresholds configuráveis:
 *   - ≥ hitlThreshold (default 0.85): Avança automaticamente
 *   - 0.70 - hitlThreshold: Requer confirmação humana
 *   - < 0.70: Não sugere avanço
 *
 * @module lib/ai/agent/stage-evaluator
 */

import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getModel, type AIProvider } from '../config';
import type { LeadContext, StageAIConfig } from './types';
import {
  determineHITLDecision,
  createPendingAdvance,
  type HITLConfig,
  type StageAdvanceSuggestion,
} from './hitl-stage-advance';

// =============================================================================
// Schemas
// =============================================================================

/**
 * Schema para avaliação de um critério individual
 * Usando array ao invés de record para compatibilidade com Gemini
 */
const CriterionEvaluationSchema = z.object({
  criterion: z.string().describe('Nome do critério avaliado'),
  met: z.boolean().describe('Se o critério foi satisfeito'),
  confidence: z.number().min(0).max(1).describe('Nível de confiança de 0 a 1'),
  evidence: z.string().describe('Evidência extraída da conversa que suporta a avaliação'),
});

/**
 * Schema completo para avaliação de avanço de estágio
 * Inspirado no BANT mas adaptável aos critérios definidos no stage_ai_config
 */
export const StageAdvancementSchema = z.object({
  shouldAdvance: z.boolean().describe('Se o lead deve avançar para o próximo estágio'),
  overallConfidence: z.number().min(0).max(1).describe('Confiança geral na decisão'),
  criteriaEvaluation: z.array(CriterionEvaluationSchema).describe(
    'Lista de avaliações de cada critério definido para o estágio'
  ),
  reasoning: z.string().describe('Explicação concisa do motivo da decisão'),
  suggestedAction: z
    .enum(['advance', 'stay', 'handoff', 'nurture'])
    .describe('Ação recomendada para o lead'),
});

export type StageAdvancementEvaluation = z.infer<typeof StageAdvancementSchema>;

// =============================================================================
// Evaluator Function
// =============================================================================

export interface EvaluateAdvancementParams {
  supabase: SupabaseClient;
  context: LeadContext;
  stageConfig: StageAIConfig;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  aiConfig: {
    provider: AIProvider;
    apiKey: string;
    model: string;
  };
  /** ID da organização para criar pending advances */
  organizationId: string;
  /** Threshold de HITL da organização (default: 0.85). DB: ai_hitl_threshold. */
  hitlThreshold?: number;
  /** Min confidence para sugerir avanço (default: 0.70). DB: ai_hitl_min_confidence. */
  hitlMinConfidence?: number;
  /** Horas até expirar pending advance (default: 24). DB: ai_hitl_expiration_hours. */
  hitlExpirationHours?: number;
  /** ID da conversa para vincular ao pending advance */
  conversationId?: string;
}

export interface EvaluationResult {
  success: boolean;
  evaluation?: StageAdvancementEvaluation;
  advanced?: boolean;
  newStageId?: string;
  error?: string;
  /** Se requer confirmação humana (HITL) */
  requiresConfirmation?: boolean;
  /** ID do pending advance criado (se requiresConfirmation) */
  pendingAdvanceId?: string;
  /** Sugestão formatada para UI (se requiresConfirmation) */
  suggestion?: StageAdvanceSuggestion;
  /** Total de tokens consumidos nesta avaliação */
  tokensUsed?: number;
}

/**
 * Avalia se o lead deve avançar para o próximo estágio.
 *
 * Fluxo:
 * 1. Monta prompt com critérios do estágio
 * 2. Chama AI com Output.object para estruturar resposta
 * 3. Avalia thresholds de confiança
 * 4. Se shouldAdvance && confidence >= 0.7, atualiza deal
 */
export async function evaluateStageAdvancement(
  params: EvaluateAdvancementParams
): Promise<EvaluationResult> {
  const { supabase, context, stageConfig, conversationHistory, aiConfig, organizationId } = params;

  // Se não tem critérios de avanço, não avalia
  if (!stageConfig.advancement_criteria || stageConfig.advancement_criteria.length === 0) {
    console.log('[StageEvaluator] No advancement criteria defined, skipping');
    return { success: true, advanced: false };
  }

  // Se não tem deal, não pode avançar
  if (!context.deal?.id || !context.deal.stage_id) {
    console.log('[StageEvaluator] No deal or stage, skipping');
    return { success: true, advanced: false };
  }

  try {
    const model = getModel(aiConfig.provider, aiConfig.apiKey, aiConfig.model);

    // Montar histórico formatado
    const historyText = conversationHistory
      .map((m) => `${m.role === 'user' ? 'LEAD' : 'VENDEDOR'}: ${m.content}`)
      .join('\n\n');

    // Montar critérios como lista
    const criteriaList = stageConfig.advancement_criteria
      .map((c, i) => `${i + 1}. ${c}`)
      .join('\n');

    const systemPrompt = `Você é um especialista em qualificação de leads de vendas.

Analise o histórico da conversa e avalie se os critérios de avanço foram satisfeitos.

REGRAS DE AVALIAÇÃO:
- "met: true" APENAS se há evidência EXPLÍCITA na conversa
- "confidence" deve refletir a clareza da evidência:
  - 0.9-1.0: Afirmação explícita e clara do lead
  - 0.7-0.8: Evidência forte mas indireta
  - 0.5-0.6: Evidência fraca ou implícita
  - 0.0-0.4: Sem evidência ou especulação
- "evidence" deve citar trechos reais da conversa
- "shouldAdvance" = true APENAS se TODOS os critérios têm met=true com confidence >= 0.6
- Seja conservador - é melhor pedir mais informações do que avançar prematuramente

CRITÉRIOS PARA ESTE ESTÁGIO:
${criteriaList}

${stageConfig.stage_goal ? `OBJETIVO DO ESTÁGIO: ${stageConfig.stage_goal}` : ''}`;

    const userPrompt = `
CONTEXTO DO LEAD:
- Nome: ${context.contact?.name || 'Desconhecido'}
- Empresa: ${context.contact?.company || 'Não informada'}
- Estágio atual: ${context.deal?.stage_name || 'Desconhecido'}

HISTÓRICO DA CONVERSA:
${historyText}

Avalie cada critério de avanço e decida se o lead deve avançar para o próximo estágio.`;

    const result = await generateText({
      model,
      output: Output.object({
        schema: StageAdvancementSchema,
        name: 'StageAdvancementEvaluation',
        description: 'Avaliação estruturada dos critérios de avanço de estágio',
      }),
      system: systemPrompt,
      prompt: userPrompt,
      maxRetries: 2,
    });

    const tokensUsed = result.usage?.totalTokens ?? 0;

    // Log tokens to ai_conversation_log fire-and-forget so budget enforcement counts them
    if (tokensUsed > 0) {
      supabase.from('ai_conversation_log').insert({
        organization_id: organizationId,
        conversation_id: params.conversationId ?? null,
        tokens_used: tokensUsed,
        model_used: aiConfig.model,
        action_taken: 'stage_evaluation',
        action_reason: 'Stage advancement evaluation',
        ai_response: '',
      }).then(({ error }) => {
        if (error) console.error('[StageEvaluator] Failed to log tokens (non-fatal):', error.message);
      });
    }

    const evaluation = result.output;

    if (!evaluation) {
      console.warn('[StageEvaluator] AI returned no structured output');
      return { success: false, error: 'AI não retornou avaliação estruturada', tokensUsed };
    }

    console.log('[StageEvaluator] Evaluation result:', {
      shouldAdvance: evaluation.shouldAdvance,
      confidence: evaluation.overallConfidence,
      suggestedAction: evaluation.suggestedAction,
    });

    // Buscar próximo estágio para decisão
    const nextStageResult = await getNextStage(supabase, context.deal.stage_id);

    if (!nextStageResult.nextStageId) {
      console.log('[StageEvaluator] No next stage available');
      return { success: true, evaluation, advanced: false, tokensUsed };
    }

    // Usar HITL config para decidir — valores vêm do banco via agent.service
    const hitlConfig: HITLConfig = {
      hitlThreshold: params.hitlThreshold ?? 0.85,
      minConfidenceToSuggest: params.hitlMinConfidence ?? 0.70,
      expirationHours: params.hitlExpirationHours ?? 24,
    };

    const hitlDecision = determineHITLDecision(
      evaluation.overallConfidence,
      evaluation.shouldAdvance,
      hitlConfig
    );

    console.log('[StageEvaluator] HITL decision:', hitlDecision);

    // Caso 1: Não sugere avanço (confidence < 0.70 ou AI disse para não avançar)
    if (hitlDecision.skipSuggestion) {
      return { success: true, evaluation, advanced: false, tokensUsed };
    }

    // Caso 2: Avanço automático (confidence >= hitlThreshold)
    if (hitlDecision.autoAdvance) {
      const { error: updateError } = await supabase
        .from('deals')
        .update({
          stage_id: nextStageResult.nextStageId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', context.deal.id);

      if (updateError) {
        console.error('[StageEvaluator] Error advancing deal:', updateError);
        return {
          success: false,
          evaluation,
          error: `Falha ao avançar deal: ${updateError.message}`,
          tokensUsed,
        };
      }

      console.log('[StageEvaluator] Deal auto-advanced to stage:', nextStageResult.nextStageId);

      await logStageAdvancement(supabase, {
        dealId: context.deal.id,
        organizationId: params.organizationId,
        fromStageId: context.deal.stage_id,
        toStageId: nextStageResult.nextStageId,
        evaluation,
        triggeredBy: 'ai_agent_auto',
      });

      return {
        success: true,
        evaluation,
        advanced: true,
        newStageId: nextStageResult.nextStageId,
        tokensUsed,
      };
    }

    // Caso 3: Requer confirmação humana (0.70 <= confidence < hitlThreshold)
    if (hitlDecision.requiresConfirmation) {
      // Montar sugestão para UI
      const suggestion: StageAdvanceSuggestion = {
        dealId: context.deal.id,
        dealTitle: context.deal.title || 'Deal sem título',
        currentStageId: context.deal.stage_id,
        currentStageName: context.deal.stage_name || 'Estágio atual',
        targetStageId: nextStageResult.nextStageId,
        targetStageName: nextStageResult.nextStageName || 'Próximo estágio',
        confidence: evaluation.overallConfidence,
        reason: evaluation.reasoning,
        criteriaEvaluation: evaluation.criteriaEvaluation.map((c) => ({
          criterion: c.criterion,
          met: c.met,
          confidence: c.confidence,
          evidence: c.evidence || null,
        })),
        conversationId: params.conversationId,
      };

      // Criar pending advance no banco
      const pendingResult = await createPendingAdvance({
        supabase,
        organizationId: params.organizationId,
        suggestion,
        evaluation,
      });

      if (!pendingResult) {
        console.error('[StageEvaluator] Failed to create pending advance');
        return {
          success: false,
          evaluation,
          error: 'Falha ao criar solicitação de aprovação',
          tokensUsed,
        };
      }

      console.log('[StageEvaluator] Created pending advance:', pendingResult.id);

      return {
        success: true,
        evaluation,
        advanced: false,
        requiresConfirmation: true,
        pendingAdvanceId: pendingResult.id,
        suggestion,
        tokensUsed,
      };
    }

    // Fallback (não deveria chegar aqui)
    return { success: true, evaluation, advanced: false, tokensUsed };
  } catch (error) {
    console.error('[StageEvaluator] Evaluation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

async function getNextStage(
  supabase: SupabaseClient,
  currentStageId: string
): Promise<{ nextStageId: string | null; nextStageName: string | null }> {
  // Buscar estágio atual para pegar board_id e order
  const { data: currentStage } = await supabase
    .from('board_stages')
    .select('board_id, "order"')
    .eq('id', currentStageId)
    .maybeSingle();

  if (!currentStage) {
    return { nextStageId: null, nextStageName: null };
  }

  // Buscar próximo estágio (order maior que atual, ordenado crescente)
  const { data: nextStage } = await supabase
    .from('board_stages')
    .select('id, name')
    .eq('board_id', currentStage.board_id)
    .gt('"order"', currentStage.order)
    .order('"order"', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextStage) {
    return { nextStageId: null, nextStageName: null };
  }

  return { nextStageId: nextStage.id, nextStageName: nextStage.name };
}

async function logStageAdvancement(
  supabase: SupabaseClient,
  params: {
    dealId: string;
    organizationId: string;
    fromStageId: string;
    toStageId: string;
    evaluation: StageAdvancementEvaluation;
    triggeredBy: string;
  }
): Promise<void> {
  const { dealId, organizationId, fromStageId, toStageId, evaluation, triggeredBy } = params;

  await supabase.from('deal_activities').insert({
    deal_id: dealId,
    organization_id: organizationId,
    type: 'stage_change',
    description: `Estágio avançado automaticamente pelo AI Agent`,
    metadata: {
      from_stage_id: fromStageId,
      to_stage_id: toStageId,
      triggered_by: triggeredBy,
      evaluation_confidence: evaluation.overallConfidence,
      evaluation_reasoning: evaluation.reasoning,
      criteria_met: evaluation.criteriaEvaluation
        .filter((c) => c.met)
        .map((c) => c.criterion),
    },
  });
}

/**
 * @fileoverview Human-in-the-Loop Stage Advancement
 *
 * Implementa o padrão Lightfield de HITL para avanço de estágio:
 * 1. Forward: AI sugere avanço, se confidence < threshold, forward para client
 * 2. Edit: Usuário pode editar estágio destino, motivo, adicionar notas
 * 3. Intercept: Backend executa com parâmetros editados pelo usuário
 *
 * Thresholds:
 * - >= hitlThreshold (default 0.85): Avança automaticamente
 * - 0.70 - hitlThreshold: Forward to client para aprovação
 * - < 0.70: Não sugere avanço
 *
 * @module lib/ai/agent/hitl-stage-advance
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StageAdvancementEvaluation } from './stage-evaluator';

// =============================================================================
// Schemas
// =============================================================================

/**
 * Schema para sugestão de avanço de estágio.
 * Estes são os dados que a AI produz e que serão mostrados ao usuário.
 */
export const StageAdvanceSuggestionSchema = z.object({
  dealId: z.string().uuid(),
  dealTitle: z.string(),
  currentStageId: z.string().uuid(),
  currentStageName: z.string(),
  targetStageId: z.string().uuid(),
  targetStageName: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  criteriaEvaluation: z.array(
    z.object({
      criterion: z.string(),
      met: z.boolean(),
      confidence: z.number().min(0).max(1),
      evidence: z.string().nullable(),
    })
  ),
  conversationId: z.string().uuid().optional(),
});

export type StageAdvanceSuggestion = z.infer<typeof StageAdvanceSuggestionSchema>;

/**
 * Schema para edições do usuário na sugestão.
 * O usuário pode modificar o estágio destino, o motivo, ou adicionar notas.
 */
export const UserEditsSchema = z.object({
  approved: z.boolean(),
  targetStageId: z.string().uuid().optional(),
  reason: z.string().optional(),
  additionalNotes: z.string().optional(),
});

export type UserEdits = z.infer<typeof UserEditsSchema>;

/**
 * Schema para registro de pending advance no banco.
 */
export const PendingAdvanceSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  deal_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  current_stage_id: z.string().uuid(),
  suggested_stage_id: z.string().uuid(),
  confidence: z.number(),
  reason: z.string(),
  criteria_evaluation: z.array(z.unknown()),
  status: z.enum(['pending', 'approved', 'rejected', 'expired', 'auto_approved']),
  resolved_by: z.string().uuid().nullable(),
  resolved_at: z.string().nullable(),
  resolution_notes: z.string().nullable(),
  user_edits: z.unknown().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
});

export type PendingAdvance = z.infer<typeof PendingAdvanceSchema>;

// =============================================================================
// Types
// =============================================================================

export interface HITLConfig {
  /** Threshold de confiança para HITL (abaixo disso requer aprovação) */
  hitlThreshold: number;
  /** Threshold mínimo para sugerir avanço (abaixo disso não sugere) */
  minConfidenceToSuggest: number;
  /** Tempo de expiração em horas */
  expirationHours: number;
}

export const DEFAULT_HITL_CONFIG: HITLConfig = {
  hitlThreshold: 0.85,
  minConfidenceToSuggest: 0.70,
  expirationHours: 24,
};

export interface CreatePendingAdvanceParams {
  supabase: SupabaseClient;
  organizationId: string;
  suggestion: StageAdvanceSuggestion;
  evaluation: StageAdvancementEvaluation;
}

export interface ResolvePendingAdvanceParams {
  supabase: SupabaseClient;
  pendingAdvanceId: string;
  userId: string;
  userEdits: UserEdits;
}

export interface HITLDecision {
  /** Se deve avançar automaticamente (confidence >= threshold) */
  autoAdvance: boolean;
  /** Se deve criar pending advance (confidence entre min e threshold) */
  requiresConfirmation: boolean;
  /** Se não deve sugerir avanço (confidence < min) */
  skipSuggestion: boolean;
  /** ID do pending advance criado (se requiresConfirmation) */
  pendingAdvanceId?: string;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Determina a decisão de HITL baseado na confiança da avaliação.
 */
export function determineHITLDecision(
  confidence: number,
  shouldAdvance: boolean,
  config: HITLConfig = DEFAULT_HITL_CONFIG
): HITLDecision {
  // Se AI não recomenda avanço, não faz nada
  if (!shouldAdvance) {
    return {
      autoAdvance: false,
      requiresConfirmation: false,
      skipSuggestion: true,
    };
  }

  // Confiança muito baixa - não sugere
  if (confidence < config.minConfidenceToSuggest) {
    return {
      autoAdvance: false,
      requiresConfirmation: false,
      skipSuggestion: true,
    };
  }

  // Confiança alta - avança automaticamente
  if (confidence >= config.hitlThreshold) {
    return {
      autoAdvance: true,
      requiresConfirmation: false,
      skipSuggestion: false,
    };
  }

  // Confiança média - requer confirmação
  return {
    autoAdvance: false,
    requiresConfirmation: true,
    skipSuggestion: false,
  };
}

/**
 * Cria um registro de pending advance para aprovação humana.
 */
export async function createPendingAdvance(
  params: CreatePendingAdvanceParams
): Promise<{ id: string } | null> {
  const { supabase, organizationId, suggestion, evaluation } = params;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DEFAULT_HITL_CONFIG.expirationHours);

  const { data, error } = await supabase
    .from('ai_pending_stage_advances')
    .insert({
      organization_id: organizationId,
      deal_id: suggestion.dealId,
      conversation_id: suggestion.conversationId || null,
      current_stage_id: suggestion.currentStageId,
      suggested_stage_id: suggestion.targetStageId,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
      criteria_evaluation: evaluation.criteriaEvaluation,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[HITL] Error creating pending advance:', error);
    return null;
  }

  return { id: data.id };
}

/**
 * Resolve um pending advance (aprovar, rejeitar, ou aprovar com edições).
 */
export async function resolvePendingAdvance(
  params: ResolvePendingAdvanceParams
): Promise<{ success: boolean; error?: string; newStageId?: string }> {
  const { supabase, pendingAdvanceId, userId, userEdits } = params;

  // 1. Buscar pending advance
  const { data: pending, error: fetchError } = await supabase
    .from('ai_pending_stage_advances')
    .select(`
      *,
      deals!inner (id, title, stage_id),
      current_stage:board_stages!ai_pending_stage_advances_current_stage_id_fkey (id, name),
      suggested_stage:board_stages!ai_pending_stage_advances_suggested_stage_id_fkey (id, name)
    `)
    .eq('id', pendingAdvanceId)
    .eq('status', 'pending')
    .single();

  if (fetchError || !pending) {
    return { success: false, error: 'Sugestão não encontrada ou já resolvida' };
  }

  // 2. Verificar se não expirou
  if (new Date(pending.expires_at) < new Date()) {
    await supabase
      .from('ai_pending_stage_advances')
      .update({ status: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', pendingAdvanceId);

    return { success: false, error: 'Sugestão expirada' };
  }

  // 3. Se rejeitado, apenas atualizar status
  if (!userEdits.approved) {
    await supabase
      .from('ai_pending_stage_advances')
      .update({
        status: 'rejected',
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        resolution_notes: userEdits.additionalNotes || null,
      })
      .eq('id', pendingAdvanceId);

    return { success: true };
  }

  // 4. Determinar estágio final (original ou editado)
  const finalStageId = userEdits.targetStageId || pending.suggested_stage_id;
  const finalReason = userEdits.reason || pending.reason;
  const wasEdited = userEdits.targetStageId !== undefined || userEdits.reason !== undefined;

  // 5. Atualizar deal para novo estágio (defense-in-depth: org_id filter)
  const { error: updateError } = await supabase
    .from('deals')
    .update({
      stage_id: finalStageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pending.deal_id)
    .eq('organization_id', pending.organization_id);

  if (updateError) {
    return { success: false, error: `Falha ao atualizar deal: ${updateError.message}` };
  }

  // 6. Atualizar pending advance como aprovado
  await supabase
    .from('ai_pending_stage_advances')
    .update({
      status: 'approved',
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
      resolution_notes: userEdits.additionalNotes || null,
      user_edits: wasEdited
        ? {
            original_stage_id: pending.suggested_stage_id,
            edited_stage_id: finalStageId,
            original_reason: pending.reason,
            edited_reason: finalReason,
            additional_notes: userEdits.additionalNotes,
          }
        : null,
    })
    .eq('id', pendingAdvanceId);

  // 7. Registrar atividade no deal
  await supabase.from('deal_activities').insert({
    deal_id: pending.deal_id,
    organization_id: pending.organization_id,
    type: 'stage_change',
    description: wasEdited
      ? `Estágio avançado (aprovado com edições): ${finalReason}`
      : `Estágio avançado (aprovado): ${finalReason}`,
    metadata: {
      from_stage_id: pending.current_stage_id,
      to_stage_id: finalStageId,
      triggered_by: 'user_approved_hitl',
      original_suggestion: {
        stage_id: pending.suggested_stage_id,
        confidence: pending.confidence,
        reason: pending.reason,
      },
      was_edited: wasEdited,
      user_edits: wasEdited ? userEdits : null,
      pending_advance_id: pendingAdvanceId,
    },
  });

  return { success: true, newStageId: finalStageId };
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Busca pending advances de uma organização.
 */
export async function getPendingAdvances(
  supabase: SupabaseClient,
  organizationId: string,
  options?: { dealId?: string; status?: 'pending' | 'all' }
): Promise<PendingAdvance[]> {
  let query = supabase
    .from('ai_pending_stage_advances')
    .select(`
      *,
      deals!inner (id, title),
      current_stage:board_stages!ai_pending_stage_advances_current_stage_id_fkey (id, name),
      suggested_stage:board_stages!ai_pending_stage_advances_suggested_stage_id_fkey (id, name)
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (options?.dealId) {
    query = query.eq('deal_id', options.dealId);
  }

  if (options?.status === 'pending') {
    query = query
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
  }

  const { data, error } = await query;

  if (error) {
    console.error('[HITL] Error fetching pending advances:', error);
    return [];
  }

  return data || [];
}

/**
 * Conta pending advances não resolvidos de uma organização.
 */
export async function countPendingAdvances(
  supabase: SupabaseClient,
  organizationId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('ai_pending_stage_advances')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.error('[HITL] Error counting pending advances:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Expira pending advances antigos (para uso em cron job ou cleanup).
 */
export async function expireOldPendingAdvances(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('expire_old_pending_advances');

  if (error) {
    console.error('[HITL] Error expiring old pending advances:', error);
    return 0;
  }

  return data || 0;
}

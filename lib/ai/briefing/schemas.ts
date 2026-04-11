/**
 * @fileoverview Zod Schemas for Meeting Briefing
 *
 * Defines structured output schemas for AI-generated meeting prep briefings.
 * Uses BANT framework for lead qualification status.
 * All descriptions are in Portuguese to guide AI generation.
 *
 * @module lib/ai/briefing/schemas
 */

import { z } from 'zod';

// =============================================================================
// BANT Status Schema
// =============================================================================

/**
 * Budget qualification status.
 * Tracks financial capacity and budget discussions.
 */
const BudgetStatusSchema = z.object({
  status: z.enum(['unknown', 'mentioned', 'confirmed', 'negotiating']),
  value: z.string().nullable().describe('Valor do orçamento se mencionado (ex: "R$ 50.000")'),
  notes: z.string().describe('Contexto sobre discussões de orçamento em português'),
});

/**
 * Authority qualification status.
 * Tracks decision-maker identification.
 */
const AuthorityStatusSchema = z.object({
  status: z.enum(['unknown', 'identified', 'confirmed']),
  decisionMaker: z.string().nullable().describe('Nome ou cargo do decisor'),
  notes: z.string().describe('Contexto sobre autoridade de decisão em português'),
});

/**
 * Need qualification status.
 * Tracks pain points and expressed needs.
 */
const NeedStatusSchema = z.object({
  status: z.enum(['unknown', 'expressed', 'validated']),
  painPoints: z.array(z.string()).describe('Lista de dores identificadas em português'),
  notes: z.string().describe('Contexto sobre as necessidades em português'),
});

/**
 * Timeline qualification status.
 * Tracks urgency and deadline information.
 */
const TimelineStatusSchema = z.object({
  status: z.enum(['unknown', 'mentioned', 'urgent', 'flexible']),
  deadline: z.string().nullable().describe('Prazo ou cronograma mencionado'),
  notes: z.string().describe('Contexto sobre prazos em português'),
});

/**
 * Full BANT qualification status.
 */
export const BantStatusSchema = z.object({
  budget: BudgetStatusSchema,
  authority: AuthorityStatusSchema,
  need: NeedStatusSchema,
  timeline: TimelineStatusSchema,
});

export type BantStatus = z.infer<typeof BantStatusSchema>;

// =============================================================================
// Meeting Briefing Schema
// =============================================================================

/**
 * Pending point from previous conversations.
 */
const PendingPointSchema = z.object({
  point: z.string().describe('O ponto pendente ou questão em aberto em português'),
  context: z.string().describe('Breve contexto sobre este ponto em português'),
  priority: z.enum(['high', 'medium', 'low']),
});

/**
 * Alert about the deal.
 */
const AlertSchema = z.object({
  type: z.enum(['warning', 'opportunity', 'risk']),
  message: z.string().describe('Mensagem de alerta clara e acionável em português'),
});

/**
 * Recommended approach for the next conversation.
 */
const RecommendedApproachSchema = z.object({
  opening: z.string().describe('Sugestão de abertura ou abordagem inicial em português'),
  keyQuestions: z.array(z.string()).describe('Perguntas-chave para fazer em português'),
  objectionsToAnticipate: z.array(z.string()).describe('Objeções potenciais para se preparar em português'),
  suggestedNextStep: z.string().describe('Próximo passo recomendado para este deal em português'),
});

/**
 * Complete meeting briefing schema.
 * This is what the AI generates for pre-meeting preparation.
 */
export const MeetingBriefingSchema = z.object({
  /** Executive summary (3-5 sentences) */
  executiveSummary: z.string().describe('Resumo executivo conciso do status do deal em português brasileiro'),

  /** Current BANT qualification status */
  bantStatus: BantStatusSchema,

  /** Pending points from previous conversations */
  pendingPoints: z.array(PendingPointSchema).describe('Itens que precisam de follow-up em português'),

  /** Recommended approach for next conversation */
  recommendedApproach: RecommendedApproachSchema,

  /** Important alerts */
  alerts: z.array(AlertSchema).describe('Alertas importantes: avisos, oportunidades ou riscos em português'),

  /** Confidence score for this briefing (0-1) */
  confidence: z.number().min(0).max(1).describe('Confiança da IA nesta análise (0 a 1)'),
});

export type MeetingBriefing = z.infer<typeof MeetingBriefingSchema>;

/**
 * Full briefing response including metadata.
 * This is what the API returns.
 */
export interface BriefingResponse extends MeetingBriefing {
  /** ISO timestamp when briefing was generated */
  generatedAt: string;
  /** Number of messages used to generate this briefing */
  basedOnMessages: number;
  /** Deal ID this briefing is for */
  dealId: string;
}

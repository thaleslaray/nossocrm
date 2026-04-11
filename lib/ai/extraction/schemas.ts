/**
 * @fileoverview AI Extraction Schemas
 *
 * Zod schemas for AI-extracted BANT fields.
 * Used for structured output when extracting data from conversations.
 *
 * @module lib/ai/extraction/schemas
 */

import { z } from 'zod';

// =============================================================================
// Extracted Field Schema
// =============================================================================

/**
 * Single extracted field with metadata.
 */
const ExtractedFieldSchema = z.object({
  /** Extracted value in Portuguese */
  value: z.string().nullable().describe('Valor extraído em português, ou null se não encontrado'),
  /** Confidence score 0-1 */
  confidence: z.number().min(0).max(1).describe('Confiança na extração (0 a 1)'),
  /** Brief reasoning for the extraction */
  reasoning: z.string().describe('Breve explicação de onde/como extraiu essa informação'),
});

// =============================================================================
// BANT Extraction Schema
// =============================================================================

/**
 * BANT extraction schema for structured output.
 */
export const BANTExtractionSchema = z.object({
  /** Budget: Financial capacity */
  budget: ExtractedFieldSchema.describe('Orçamento ou valor disponível mencionado pelo lead'),

  /** Authority: Decision maker */
  authority: ExtractedFieldSchema.describe('Quem é o decisor ou quem influencia a decisão'),

  /** Need: Pain points and requirements */
  need: ExtractedFieldSchema.describe('Necessidades, dores ou problemas que o lead quer resolver'),

  /** Timeline: Urgency and deadlines */
  timeline: ExtractedFieldSchema.describe('Prazo, urgência ou quando precisa resolver'),

  /** Overall extraction quality */
  overallConfidence: z.number().min(0).max(1).describe('Confiança geral da extração'),
});

export type BANTExtraction = z.infer<typeof BANTExtractionSchema>;

// =============================================================================
// Stored Format (in database)
// =============================================================================

/**
 * Format stored in deals.ai_extracted
 */
export interface AIExtractedField {
  value: string | null;
  confidence: number;
  reasoning: string;
  extractedAt: string;
  sourceMessageId?: string;
}

export interface AIExtractedData {
  budget?: AIExtractedField;
  authority?: AIExtractedField;
  need?: AIExtractedField;
  timeline?: AIExtractedField;
  lastExtractedAt?: string;
}

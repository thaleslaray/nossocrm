/**
 * @fileoverview Schema para geração de prompts por estágio via LLM
 *
 * Schema propositalmente permissivo — Gemini (controlled generation / JSON mode)
 * rejeita schemas com minItems/maxItems em arrays ou minimum/maximum em números.
 * Validação e clamping são feitos no serviço após receber a resposta.
 *
 * @module lib/ai/agent/generate-prompts-schema
 */

import { z } from 'zod';

/**
 * Schema de um prompt por estágio — sem constraints numéricas ou de array.
 * Gemini com JSON mode não suporta minItems/maxItems de forma confiável.
 */
const GeneratedStagePromptSchema = z.object({
  stageName: z
    .string()
    .describe('Nome exato do estágio como recebido'),
  stageOrder: z
    .number()
    .describe('Posição do estágio no funil (0-based)'),
  systemPrompt: z
    .string()
    .describe(
      'Prompt do sistema para o AI agent neste estágio. 200-400 palavras com técnicas de venda, regras de comportamento e tom adequado.'
    ),
  stageGoal: z
    .string()
    .describe('Objetivo principal do estágio em 1-2 frases curtas'),
  advancementCriteria: z
    .array(z.string())
    .describe('Lista de 3 a 5 critérios objetivos para avançar o lead ao próximo estágio'),
  suggestedMaxMessages: z
    .number()
    .optional()
    .describe('Número máximo sugerido de mensagens do AI neste estágio antes de handoff (entre 3 e 20)'),
  handoffKeywords: z
    .array(z.string())
    .describe('Palavras-chave que indicam que o lead quer falar com um humano (2 a 6 itens)'),
});

/**
 * Schema completo: array de prompts para todos os estágios
 */
export const GeneratedStagePromptsSchema = z.object({
  stages: z
    .array(GeneratedStagePromptSchema)
    .describe('Array de prompts gerados, um para cada estágio do funil'),
});

export type GeneratedStagePrompt = z.infer<typeof GeneratedStagePromptSchema>;
export type GeneratedStagePrompts = z.infer<typeof GeneratedStagePromptsSchema>;

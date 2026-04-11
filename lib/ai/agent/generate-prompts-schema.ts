/**
 * @fileoverview Schema para geração de prompts por estágio via LLM
 *
 * Define o schema Zod usado com Output.object() para garantir
 * que a LLM retorne structured output no formato esperado.
 *
 * @module lib/ai/agent/generate-prompts-schema
 */

import { z } from 'zod';

/**
 * Schema para um prompt gerado por estágio
 */
const GeneratedStagePromptSchema = z.object({
  stageName: z.string().describe('Nome exato do estágio como recebido'),
  stageOrder: z.number().describe('Posição do estágio no funil (0-based)'),
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
    .min(3)
    .max(5)
    .describe('Lista de 3-5 critérios objetivos para avançar o lead ao próximo estágio'),
  suggestedMaxMessages: z
    .number()
    .min(3)
    .max(20)
    .describe('Número máximo sugerido de mensagens do AI neste estágio antes de handoff'),
  handoffKeywords: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe('Palavras-chave que indicam que o lead quer falar com um humano'),
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

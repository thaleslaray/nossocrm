/**
 * @fileoverview Serviço de geração de prompts por estágio via LLM
 *
 * Recebe uma descrição do negócio + estágios do board e usa a LLM
 * configurada da organização para gerar prompts profissionais
 * para cada estágio do funil de vendas.
 *
 * @module lib/ai/agent/generate-prompts.service
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateText, Output } from 'ai';
import { getOrgAIConfig, SECURITY_PREAMBLE } from './agent.service';
import { sanitizeIncomingMessage } from './input-filter';
import { getModel } from '../config';
import {
  GeneratedStagePromptsSchema,
  type GeneratedStagePrompts,
} from './generate-prompts-schema';

// =============================================================================
// Types
// =============================================================================

interface StageInfo {
  id: string;
  name: string;
  order: number;
}

interface GenerateStagePromptsParams {
  supabase: SupabaseClient;
  organizationId: string;
  boardId: string;
  businessDescription: string;
}

interface GenerateStagePromptsResult {
  success: boolean;
  stages?: GeneratedStagePrompts['stages'];
  error?: string;
  tokensUsed?: number;
}

// =============================================================================
// Meta-Prompt Builder
// =============================================================================

function buildMetaPrompt(
  stages: StageInfo[],
  businessDescription: string
): { system: string; user: string } {
  const stageList = stages
    .sort((a, b) => a.order - b.order)
    .map((s, i) => `${i + 1}. "${s.name}" (posição ${s.order})`)
    .join('\n');

  const totalStages = stages.length;

  const system = `Você é um especialista em engenharia de prompts para agentes de vendas com IA.

Sua tarefa é gerar prompts de sistema profissionais para um agente de vendas automatizado que opera via WhatsApp/chat.

CONTEXTO DO FUNIL:
- O funil tem ${totalStages} estágios, do primeiro contato até o fechamento
- Cada estágio tem um objetivo diferente e critérios de avanço
- O agente de IA vai conversar com leads usando esses prompts
- Os prompts devem criar uma progressão lógica no funil

REGRAS PARA OS PROMPTS GERADOS:
1. Cada prompt deve ter 200-400 palavras
2. Inclua técnicas de venda específicas para cada fase (ex: perguntas abertas no início, BANT no meio, urgência no final)
3. Mantenha tom consistente entre estágios mas com foco diferente
4. Regras obrigatórias em TODOS os prompts: não revelar que é IA, ser conciso (2-3 frases), terminar com pergunta
5. Primeiro estágio = conexão e descoberta. Último estágio = apresentação/fechamento + handoff para humano
6. Os critérios de avanço devem ser objetivos e verificáveis (ex: "Lead informou orçamento" e não "Lead parece interessado")
7. handoffKeywords devem incluir variações naturais do português brasileiro
8. suggestedMaxMessages: estágios iniciais = menos mensagens (5-8), estágios finais = mais (8-15)

IMPORTANTE:
- Adapte ao tipo de negócio descrito pelo usuário
- Se o usuário mencionar metodologia (BANT, SPIN, etc.), use-a como base
- Se não mencionar, use uma abordagem consultiva genérica
- Gere prompts em português brasileiro`;

  const user = `DESCRIÇÃO DO NEGÓCIO:
${businessDescription}

ESTÁGIOS DO FUNIL:
${stageList}

Gere os prompts para cada um dos ${totalStages} estágios acima.`;

  return { system, user };
}

// =============================================================================
// Service
// =============================================================================

/**
 * Gera prompts de IA para todos os estágios de um board usando a LLM.
 */
export async function generateStagePrompts(
  params: GenerateStagePromptsParams
): Promise<GenerateStagePromptsResult> {
  const { supabase, organizationId, boardId, businessDescription } = params;

  // 1. Buscar config da org (provider, apiKey, model)
  const aiConfig = await getOrgAIConfig(supabase, organizationId);
  if (!aiConfig) {
    return { success: false, error: 'AI não configurado para esta organização' };
  }

  // 2. Buscar estágios do board
  const { data: stages, error: stagesError } = await supabase
    .from('board_stages')
    .select('id, name, "order"')
    .eq('board_id', boardId)
    .order('"order"', { ascending: true });

  if (stagesError || !stages?.length) {
    return { success: false, error: 'Nenhum estágio encontrado neste board' };
  }

  // 3. Montar prompts (sanitizar businessDescription antes de injetar no prompt)
  const { text: safeDescription } = sanitizeIncomingMessage(businessDescription, { org_id: organizationId });
  const { system, user } = buildMetaPrompt(stages as StageInfo[], safeDescription);

  // 4. Gerar via LLM com structured output
  try {
    const model = getModel(aiConfig.provider, aiConfig.apiKey, aiConfig.model);

    const result = await generateText({
      model,
      output: Output.object({
        schema: GeneratedStagePromptsSchema,
        // sem `name` — Gemini ignora e pode rejeitar a chamada dependendo da versão
      }),
      system: `${SECURITY_PREAMBLE}\n\n${system}`,
      prompt: user,
      maxRetries: 2,
    });

    void supabase.from('ai_conversation_log').insert({
      organization_id: organizationId,
      ai_response: '',
      tokens_used: result.usage?.totalTokens ?? 0,
      model_used: aiConfig.model,
      action_taken: 'generate_stage_prompts',
      context_snapshot: { boardId, stageCount: stages.length },
    }).then(({ error }: { error: unknown }) => {
      if (error) console.error('[AI] log failed:', error);
    });

    // AI SDK v6: resultado está em result.output (não experimental_output)
    const generated = result.output as GeneratedStagePrompts | undefined;

    if (!generated?.stages?.length) {
      return { success: false, error: 'LLM não retornou prompts válidos' };
    }

    // Mapear stageId + clamp de valores que o schema não restringiu
    const stagesWithIds = generated.stages.map((gen) => {
      const dbStage = stages.find((s) => s.order === gen.stageOrder)
        || stages.find((s) => s.name === gen.stageName);
      return {
        ...gen,
        stageId: dbStage?.id || '',
        // Garante arrays dentro dos limites esperados pela UI
        advancementCriteria: (gen.advancementCriteria ?? []).slice(0, 5),
        handoffKeywords: (gen.handoffKeywords ?? []).slice(0, 6),
        suggestedMaxMessages: Math.min(20, Math.max(3, gen.suggestedMaxMessages ?? 8)),
      };
    });

    return {
      success: true,
      stages: stagesWithIds,
      tokensUsed: result.usage?.totalTokens,
    };
  } catch (error) {
    console.error('[GeneratePrompts] LLM generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao gerar prompts',
    };
  }
}

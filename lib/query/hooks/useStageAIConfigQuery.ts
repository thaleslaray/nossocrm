/**
 * @fileoverview Stage AI Config Query Hooks
 *
 * Hooks para gerenciar configuração de AI por estágio.
 *
 * @module lib/query/hooks/useStageAIConfigQuery
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '../queryKeys';
import type { StageAIConfig, StageAISettings } from '@/lib/ai/agent/types';

// =============================================================================
// Types
// =============================================================================

export interface StageAIConfigInput {
  board_id: string;
  stage_id: string;
  enabled: boolean;
  system_prompt: string;
  stage_goal?: string;
  advancement_criteria?: string[];
  settings?: Partial<StageAISettings>;
  ai_model?: string;
  notify_team?: boolean;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Hook para buscar configurações de AI de um board.
 */
export function useStageAIConfigsQuery(boardId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.ai.stageConfigs(boardId),
    queryFn: async () => {
      if (!boardId || !profile?.organization_id) return [];

      const { data, error } = await supabase
        .from('stage_ai_config')
        .select(`
          *,
          stage:board_stages(id, name, "order")
        `)
        .eq('organization_id', profile.organization_id)
        .eq('board_id', boardId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as (StageAIConfig & { stage: { id: string; name: string; order: number } })[];
    },
    enabled: !!boardId && !!profile?.organization_id,
  });
}

/**
 * Hook para buscar configuração de AI de um estágio específico.
 */
export function useStageAIConfigQuery(stageId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.ai.stageConfig(stageId),
    queryFn: async () => {
      if (!stageId || !profile?.organization_id) return null;

      const { data, error } = await supabase
        .from('stage_ai_config')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('stage_id', stageId)
        .maybeSingle();

      if (error) throw error;
      return data as StageAIConfig | null;
    },
    enabled: !!stageId && !!profile?.organization_id,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Hook para criar/atualizar configuração de AI de um estágio.
 */
export function useUpsertStageAIConfigMutation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: StageAIConfigInput) => {
      if (!profile?.organization_id) {
        throw new Error('Usuário não autenticado');
      }

      // Check if config already exists
      const { data: existing } = await supabase
        .from('stage_ai_config')
        .select('id')
        .eq('stage_id', input.stage_id)
        .maybeSingle();

      const configData = {
        organization_id: profile.organization_id,
        board_id: input.board_id,
        stage_id: input.stage_id,
        enabled: input.enabled,
        system_prompt: input.system_prompt,
        stage_goal: input.stage_goal || null,
        advancement_criteria: input.advancement_criteria || [],
        settings: {
          max_messages_per_conversation: 10,
          response_delay_seconds: 5,
          handoff_keywords: ['falar com humano', 'atendente', 'pessoa real'],
          business_hours_only: false,
          ...input.settings,
        },
        ai_model: input.ai_model || null,
        notify_team: input.notify_team ?? false,
      };

      if (existing) {
        // Update
        const { data, error } = await supabase
          .from('stage_ai_config')
          .update(configData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data as StageAIConfig;
      } else {
        // Insert
        const { data, error } = await supabase
          .from('stage_ai_config')
          .insert(configData)
          .select()
          .single();

        if (error) throw error;
        return data as StageAIConfig;
      }
    },
    onSettled: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.stageConfigs(data.board_id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.stageConfig(data.stage_id) });
      }
    },
  });
}

/**
 * Hook para deletar configuração de AI de um estágio.
 */
export function useDeleteStageAIConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ configId, boardId }: { configId: string; boardId: string }) => {
      const { error } = await supabase
        .from('stage_ai_config')
        .delete()
        .eq('id', configId);

      if (error) throw error;
      return { configId, boardId };
    },
    onSettled: (_, _err, { boardId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.stageConfigs(boardId) });
    },
  });
}

/**
 * Hook para toggle rápido de AI em um estágio.
 */
/**
 * Hook para gerar prompts de AI via LLM para todos os estágios de um board.
 * Retorna os prompts gerados sem salvar — o save é feito pelo componente.
 */
export function useGenerateStagePromptsMutation() {
  return useMutation({
    mutationFn: async (input: { boardId: string; businessDescription: string }) => {
      const response = await fetch('/api/ai/generate-stage-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar prompts');
      }

      return data as {
        success: boolean;
        stages: Array<{
          stageId?: string;
          stageName: string;
          stageOrder: number;
          systemPrompt: string;
          stageGoal: string;
          advancementCriteria: string[];
          suggestedMaxMessages: number;
          handoffKeywords: string[];
        }>;
        tokensUsed?: number;
      };
    },
  });
}

export function useToggleStageAIMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ configId, enabled }: { configId: string; enabled: boolean }) => {
      const { data, error } = await supabase
        .from('stage_ai_config')
        .update({ enabled })
        .eq('id', configId)
        .select('id, board_id, stage_id')
        .single();

      if (error) throw error;
      return data;
    },
    onSettled: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.stageConfigs(data.board_id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.stageConfig(data.stage_id) });
      }
    },
  });
}

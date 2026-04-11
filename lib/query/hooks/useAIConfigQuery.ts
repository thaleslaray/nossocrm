/**
 * @fileoverview AI Config Query Hooks
 *
 * Hooks para gerenciamento de configuração do AI Agent:
 * - useAIConfigQuery: Busca configuração da organização
 * - useUpdateAIConfigMutation: Atualiza configuração
 * - useAITemplatesQuery: Lista templates disponíveis
 *
 * @module lib/query/hooks/useAIConfigQuery
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '../queryKeys';

// =============================================================================
// Types
// =============================================================================

export interface OrgAIConfig {
  organization_id: string;
  ai_provider: 'google';
  ai_model: string;
  ai_enabled: boolean;
  ai_config_mode: 'zero_config' | 'template' | 'auto_learn' | 'advanced';
  ai_template_id: string | null;
  ai_learned_patterns: Record<string, unknown>;
  ai_hitl_threshold: number;
  ai_takeover_enabled: boolean;
  ai_takeover_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface AITemplate {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  stages: TemplateStage[];
  is_system: boolean;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateStage {
  name: string;
  order: number;
  goal?: string;
  criteria: string[];
  prompt_template: string;
}

// =============================================================================
// Query: Organization AI Config
// =============================================================================

export function useAIConfigQuery() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.ai.orgConfig(),
    queryFn: async (): Promise<OrgAIConfig | null> => {
      if (!profile?.organization_id) return null;

      const supabase = getClient();
      const { data, error } = await supabase
        .from('organization_settings')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .single();

      if (error) {
        console.error('[useAIConfigQuery] Error:', error);
        throw error;
      }

      return data as OrgAIConfig;
    },
    enabled: !!profile?.organization_id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =============================================================================
// Mutation: Update AI Config
// =============================================================================

interface UpdateAIConfigParams {
  ai_config_mode?: string;
  ai_template_id?: string | null;
  ai_learned_patterns?: Record<string, unknown>;
  ai_hitl_threshold?: number;
  ai_takeover_enabled?: boolean;
  ai_takeover_minutes?: number;
}

export function useUpdateAIConfigMutation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateAIConfigParams) => {
      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      const supabase = getClient();
      const { data, error } = await supabase
        .from('organization_settings')
        .update({
          ...params,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', profile.organization_id)
        .select()
        .single();

      if (error) {
        console.error('[useUpdateAIConfigMutation] Error:', error);
        throw error;
      }

      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.orgConfig() });
    },
  });
}

// =============================================================================
// Query: AI Templates
// =============================================================================

export function useAITemplatesQuery() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.aiTemplates.all,
    queryFn: async (): Promise<{
      templates: AITemplate[];
      systemTemplates: AITemplate[];
      customTemplates: AITemplate[];
    }> => {
      const response = await fetch('/api/ai/templates');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch templates');
      }

      return response.json();
    },
    enabled: !!profile?.organization_id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// =============================================================================
// Mutation: Provision Stage Configs (Zero Config Mode)
// =============================================================================

interface ProvisionResult {
  success: boolean;
  message: string;
  created: number;
  updated: number;
  errors?: string[];
}

export function useProvisionStagesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<ProvisionResult> => {
      const response = await fetch('/api/ai/provision-stages', {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to provision stages');
      }

      return response.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.all });
    },
  });
}

// =============================================================================
// Query: Single AI Template
// =============================================================================

export function useAITemplateQuery(templateId: string | null) {
  return useQuery({
    queryKey: queryKeys.aiTemplates.detail(templateId || ''),
    queryFn: async (): Promise<{ template: AITemplate }> => {
      if (!templateId) throw new Error('Template ID required');

      const response = await fetch(`/api/ai/templates/${templateId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch template');
      }

      return response.json();
    },
    enabled: !!templateId,
  });
}

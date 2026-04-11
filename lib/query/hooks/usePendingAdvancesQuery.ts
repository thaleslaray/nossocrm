/**
 * @fileoverview Pending Stage Advances Query Hooks
 *
 * Hooks para gerenciamento de pending advances (HITL):
 * - usePendingAdvancesQuery: Lista pending advances da organização
 * - usePendingAdvanceCountQuery: Conta pending advances não resolvidos
 * - useResolvePendingAdvanceMutation: Resolve (aprovar/rejeitar) pending advance
 *
 * @module lib/query/hooks/usePendingAdvancesQuery
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '../queryKeys';
import type { UserEdits } from '@/lib/ai/agent/hitl-stage-advance';

// =============================================================================
// Types
// =============================================================================

export interface PendingAdvanceListItem {
  id: string;
  deal_id: string;
  conversation_id: string | null;
  current_stage_id: string;
  suggested_stage_id: string;
  confidence: number;
  reason: string;
  criteria_evaluation: Array<{
    criterion: string;
    met: boolean;
    confidence: number;
    evidence: string | null;
  }>;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved';
  created_at: string;
  expires_at: string;
  // Joins
  deals: {
    id: string;
    title: string;
  };
  current_stage: {
    id: string;
    name: string;
  };
  suggested_stage: {
    id: string;
    name: string;
  };
}

export interface ResolvePendingAdvanceParams {
  pendingAdvanceId: string;
  userEdits: UserEdits;
}

// =============================================================================
// Query: List Pending Advances
// =============================================================================

interface UsePendingAdvancesOptions {
  dealId?: string;
  status?: 'pending' | 'all';
}

export function usePendingAdvancesQuery(options?: UsePendingAdvancesOptions) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.ai.pendingAdvances(options?.dealId),
    queryFn: async (): Promise<PendingAdvanceListItem[]> => {
      const params = new URLSearchParams();
      if (options?.dealId) params.set('dealId', options.dealId);
      if (options?.status) params.set('status', options.status);

      const response = await fetch(`/api/ai/hitl?${params.toString()}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch pending advances');
      }

      const data = await response.json();
      return data.pendingAdvances;
    },
    enabled: !!profile?.organization_id,
    staleTime: 30 * 1000, // 30 seconds - refresh frequently
    refetchInterval: 60 * 1000, // Refresh every minute
  });
}

// =============================================================================
// Query: Count Pending Advances
// =============================================================================

export function usePendingAdvanceCountQuery() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.ai.pendingAdvanceCount(),
    queryFn: async (): Promise<number> => {
      const response = await fetch('/api/ai/hitl/count');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to count pending advances');
      }

      const data = await response.json();
      return data.count;
    },
    enabled: !!profile?.organization_id,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// =============================================================================
// Mutation: Resolve Pending Advance
// =============================================================================

export function useResolvePendingAdvanceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pendingAdvanceId, userEdits }: ResolvePendingAdvanceParams) => {
      const response = await fetch(`/api/ai/hitl/${pendingAdvanceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userEdits),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resolve pending advance');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Se foi aprovado, invalidar deals também
      if (data?.newStageId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
      }
    },
    onSettled: () => {
      // Invalidar lista de pending advances (runs on both success and error)
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.pendingAdvances() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.pendingAdvanceCount() });
    },
  });
}

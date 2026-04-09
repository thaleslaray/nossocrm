/**
 * @fileoverview Duplicate Contacts Query & Merge Mutation
 *
 * Hooks para detecção e resolução de contatos duplicados.
 *
 * @module lib/query/hooks/useDuplicateContactsQuery
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys, DEALS_VIEW_KEY } from '../queryKeys';
import { supabase } from '@/lib/supabase';

// =============================================================================
// Types
// =============================================================================

export interface DuplicateGroup {
  match_type: 'phone' | 'email';
  match_value: string;
  contact_ids: string[];
  contact_names: string[];
  group_size: number;
}

export interface MergeResult {
  success: boolean;
  targetId: string;
  sourceId: string;
  recordsMoved: Record<string, number>;
}

// =============================================================================
// Hooks
// =============================================================================

export function useDuplicateContactsQuery() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: queryKeys.contactDuplicates.list(orgId ?? ''),
    queryFn: async (): Promise<DuplicateGroup[]> => {
      const { data, error } = await supabase.rpc('find_duplicate_contacts', {
        p_org_id: orgId!,
      });

      if (error) throw error;
      return (data as DuplicateGroup[]) ?? [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000, // 5 min — duplicatas mudam raramente
    gcTime: 30 * 60_000,
  });
}

export function useMergeContactsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceId,
      targetId,
    }: {
      sourceId: string;
      targetId: string;
    }): Promise<MergeResult> => {
      const response = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || 'Merge failed');
      }

      return response.json();
    },
    onSettled: () => {
      // Full invalidation list — merge touches 8+ tables
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.lists() });
      // Use DEALS_VIEW_KEY — é a única source of truth para deals (SSOT)
      // queryKeys.deals.all e deals.lists() são redundantes quando DEALS_VIEW_KEY já está presente
      queryClient.invalidateQueries({ queryKey: DEALS_VIEW_KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingConversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.contactDuplicates.all });
    },
  });
}

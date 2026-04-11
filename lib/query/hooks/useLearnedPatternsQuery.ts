/**
 * @fileoverview Learned Patterns Query Hooks
 *
 * Hooks para gerenciamento de padrões aprendidos via Few-Shot Learning.
 *
 * @module lib/query/hooks/useLearnedPatternsQuery
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import type { LearnedPattern } from '@/lib/ai/agent/few-shot-learner';

// =============================================================================
// Types
// =============================================================================

interface LearnedPatternsResponse {
  patterns: LearnedPattern | null;
}

interface LearnResult {
  success: boolean;
  patterns: {
    criteriaCount: number;
    questionPatternsCount: number;
    conversationsUsed: number;
    tone: string;
    learnedAt: string;
  };
}

// =============================================================================
// Query: Get Learned Patterns
// =============================================================================

export function useLearnedPatternsQuery() {
  return useQuery({
    queryKey: queryKeys.ai.learnedPatterns,
    queryFn: async (): Promise<LearnedPattern | null> => {
      const response = await fetch('/api/ai/learn');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch patterns');
      }

      const data: LearnedPatternsResponse = await response.json();
      return data.patterns as LearnedPattern | null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =============================================================================
// Mutation: Learn from Conversations
// =============================================================================

export function useLearnMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationIds: string[]): Promise<LearnResult> => {
      const response = await fetch('/api/ai/learn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversationIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to learn from conversations');
      }

      return response.json();
    },
    onSettled: () => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.learnedPatterns });
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.orgConfig() });
    },
  });
}

// =============================================================================
// Mutation: Clear Learned Patterns
// =============================================================================

export function useClearPatternsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ success: boolean }> => {
      const response = await fetch('/api/ai/learn', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to clear patterns');
      }

      return response.json();
    },
    onSettled: () => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.learnedPatterns });
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.orgConfig() });
    },
  });
}

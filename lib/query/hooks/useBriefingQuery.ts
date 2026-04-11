/**
 * @fileoverview React Query hooks for Meeting Briefing
 *
 * Provides hooks for fetching and caching AI-generated meeting briefings.
 *
 * @module lib/query/hooks/useBriefingQuery
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import type { BriefingResponse } from '@/lib/ai/briefing/schemas';

// =============================================================================
// API Functions
// =============================================================================

async function fetchBriefing(dealId: string): Promise<BriefingResponse> {
  const response = await fetch(`/api/ai/briefing/${dealId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch briefing');
  }

  return response.json();
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch a briefing for a deal.
 *
 * The briefing is cached for 5 minutes and garbage collected after 30 minutes.
 * Use this when you want to show a briefing but don't want to auto-generate.
 *
 * @param dealId - Deal ID to fetch briefing for
 * @param options - Additional options
 * @param options.enabled - Whether to enable the query (default: true when dealId is provided)
 */
export function useBriefingQuery(
  dealId: string | null | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.ai.briefing(dealId!),
    queryFn: () => fetchBriefing(dealId!),
    enabled: options?.enabled !== false && !!dealId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    retry: 1, // Only retry once since this is an expensive operation
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
}

/**
 * Generate a briefing on-demand.
 *
 * Use this when you want to explicitly trigger briefing generation,
 * e.g., when user clicks "Prepare for Meeting" button.
 *
 * The generated briefing is automatically cached.
 */
export function useGenerateBriefing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fetchBriefing,
    onSuccess: (data, dealId) => {
      // Cache the generated briefing
      queryClient.setQueryData(queryKeys.ai.briefing(dealId), data);
    },
    onSettled: (_data, _error, dealId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.briefing(dealId) });
    },
  });
}

/**
 * Invalidate a cached briefing.
 *
 * Use this when deal data has changed significantly and you want
 * to force a fresh briefing generation.
 */
export function useInvalidateBriefing() {
  const queryClient = useQueryClient();

  return (dealId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ai.briefing(dealId) });
  };
}

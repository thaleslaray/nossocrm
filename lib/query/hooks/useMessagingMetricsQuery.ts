/**
 * @fileoverview Messaging Metrics Query Hook
 *
 * Chama a RPC `get_messaging_metrics()` para obter métricas
 * agregadas de mensagens, contatos, FRT e taxa de resposta.
 *
 * @module lib/query/hooks/useMessagingMetricsQuery
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '../queryKeys';
import { supabase } from '@/lib/supabase';
import type { PeriodFilter } from '@/features/dashboard/hooks/useDashboardMetrics';
import { periodToDateRange } from '@/lib/utils/periodToDateRange';

// =============================================================================
// Types
// =============================================================================

export interface MessagingMetrics {
  messagesSent: {
    total: number;
    byUser: Array<{ user_id: string | null; name: string; count: number }>;
    byType: Record<string, number>;
  };
  contacts: {
    new: number;
    followUp: number;
  };
  sla: {
    avgFirstResponseSeconds: number;
    conversationsWithFRT: number;
  };
  responseRate: {
    rate: number;
    responded: number;
    total: number;
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useMessagingMetricsQuery(period: PeriodFilter, userId?: string) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: queryKeys.messagingMetrics.byPeriod(orgId ?? '', period, userId),
    queryFn: async (): Promise<MessagingMetrics> => {
      const { start, end } = periodToDateRange(period);

      const { data, error } = await supabase.rpc('get_messaging_metrics', {
        p_org_id: orgId!,
        p_start_date: start,
        p_end_date: end,
        p_user_id: userId ?? null,
      });

      if (error) throw error;
      return data as MessagingMetrics;
    },
    enabled: !!orgId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

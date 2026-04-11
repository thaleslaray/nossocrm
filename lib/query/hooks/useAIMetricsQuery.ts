/**
 * @fileoverview AI Metrics Query Hook
 *
 * Queries para métricas do AI Agent no dashboard.
 * Inclui estatísticas de conversas, avanços de estágio e HITL.
 *
 * @module lib/query/hooks/useAIMetricsQuery
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '../queryKeys';
import { supabase } from '@/lib/supabase';

// =============================================================================
// Types
// =============================================================================

export interface AIConversationStats {
  total: number;
  responded: number;
  advancedStage: number;
  handoff: number;
  skipped: number;
}

export interface AIHITLStats {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  autoApproved: number;
  approvalRate: number; // approved / (approved + rejected)
  avgConfidence: number;
}

export interface AIMetrics {
  // Conversas
  conversations: {
    today: AIConversationStats;
    thisWeek: AIConversationStats;
    thisMonth: AIConversationStats;
    total: AIConversationStats;
  };

  // HITL
  hitl: AIHITLStats;

  // Tokens
  tokensUsed: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };

  // Modelos usados
  modelBreakdown: Record<string, number>;
}

// =============================================================================
// Date Helpers
// =============================================================================

function getStartOfDay(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function getStartOfWeek(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  now.setDate(diff);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function getStartOfMonth(): string {
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

// =============================================================================
// Stats Calculator
// =============================================================================

interface AILogRow {
  action_taken: string;
  tokens_used: number | null;
  model_used: string | null;
  created_at: string;
}

function calculateStats(logs: AILogRow[], since?: string): AIConversationStats {
  const filtered = since
    ? logs.filter(l => l.created_at >= since)
    : logs;

  return {
    total: filtered.length,
    responded: filtered.filter(l => l.action_taken === 'responded').length,
    advancedStage: filtered.filter(l => l.action_taken === 'advanced_stage').length,
    handoff: filtered.filter(l => l.action_taken === 'handoff').length,
    skipped: filtered.filter(l => l.action_taken === 'skipped').length,
  };
}

function calculateTokens(logs: AILogRow[], since: string): number {
  return logs
    .filter(l => l.created_at >= since)
    .reduce((sum, l) => sum + (l.tokens_used || 0), 0);
}

function calculateModelBreakdown(logs: AILogRow[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const log of logs) {
    const model = log.model_used || 'unknown';
    breakdown[model] = (breakdown[model] || 0) + 1;
  }
  return breakdown;
}

// =============================================================================
// Hook
// =============================================================================

export function useAIMetricsQuery() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: queryKeys.ai.metrics(orgId ?? ''),
    queryFn: async (): Promise<AIMetrics> => {
      if (!orgId) {
        throw new Error('No organization');
      }

      // Buscar logs do mês (para calcular todas as métricas)
      const startOfMonth = getStartOfMonth();
      const startOfWeek = getStartOfWeek();
      const startOfDay = getStartOfDay();

      const [logsResult, hitlResult] = await Promise.all([
        // AI Conversation Logs
        supabase
          .from('ai_conversation_log')
          .select('action_taken, tokens_used, model_used, created_at')
          .eq('organization_id', orgId)
          .gte('created_at', startOfMonth)
          .order('created_at', { ascending: false }),

        // HITL Pending Advances (all time stats)
        supabase
          .from('ai_pending_stage_advances')
          .select('status, confidence')
          .eq('organization_id', orgId),
      ]);

      if (logsResult.error) {
        console.error('[useAIMetricsQuery] Logs error:', logsResult.error);
      }
      if (hitlResult.error) {
        console.error('[useAIMetricsQuery] HITL error:', hitlResult.error);
      }

      const logs = (logsResult.data || []) as AILogRow[];
      const hitlData = hitlResult.data || [];

      // Calculate conversation stats
      const conversations = {
        today: calculateStats(logs, startOfDay),
        thisWeek: calculateStats(logs, startOfWeek),
        thisMonth: calculateStats(logs, startOfMonth),
        total: calculateStats(logs),
      };

      // Calculate HITL stats
      const pending = hitlData.filter(h => h.status === 'pending').length;
      const approved = hitlData.filter(h => h.status === 'approved').length;
      const rejected = hitlData.filter(h => h.status === 'rejected').length;
      const expired = hitlData.filter(h => h.status === 'expired').length;
      const autoApproved = hitlData.filter(h => h.status === 'auto_approved').length;

      const totalDecided = approved + rejected;
      const approvalRate = totalDecided > 0 ? (approved / totalDecided) * 100 : 0;

      const confidences = hitlData
        .filter(h => h.confidence != null)
        .map(h => Number(h.confidence));
      const avgConfidence = confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

      const hitl: AIHITLStats = {
        pending,
        approved,
        rejected,
        expired,
        autoApproved,
        approvalRate,
        avgConfidence,
      };

      // Calculate tokens
      const tokensUsed = {
        today: calculateTokens(logs, startOfDay),
        thisWeek: calculateTokens(logs, startOfWeek),
        thisMonth: calculateTokens(logs, startOfMonth),
      };

      // Model breakdown
      const modelBreakdown = calculateModelBreakdown(logs);

      return {
        conversations,
        hitl,
        tokensUsed,
        modelBreakdown,
      };
    },
    enabled: !!orgId,
    staleTime: 60 * 1000, // 1 minuto
    gcTime: 5 * 60 * 1000, // 5 minutos
  });
}

/**
 * Hook simplificado para métricas resumidas (usado em cards)
 */
export function useAIQuickStats() {
  const { data, isLoading, error } = useAIMetricsQuery();

  if (!data) {
    return {
      isLoading,
      error,
      todayConversations: 0,
      pendingHITL: 0,
      autoAdvanceRate: 0,
      handoffRate: 0,
    };
  }

  const todayTotal = data.conversations.today.total;
  const autoAdvances = data.conversations.thisMonth.advancedStage;
  const handoffs = data.conversations.thisMonth.handoff;
  const monthTotal = data.conversations.thisMonth.total;

  return {
    isLoading,
    error,
    todayConversations: todayTotal,
    pendingHITL: data.hitl.pending,
    autoAdvanceRate: monthTotal > 0 ? (autoAdvances / monthTotal) * 100 : 0,
    handoffRate: monthTotal > 0 ? (handoffs / monthTotal) * 100 : 0,
  };
}

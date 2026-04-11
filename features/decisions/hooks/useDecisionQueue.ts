/**
 * useDecisionQueue Hook
 * Hook principal para gerenciar a fila de decisões
 */

import { useState, useCallback, useMemo } from 'react';
import {
  useDealsView,
  useActivities,
  useUpdateDeal,
  useCreateActivity,
  useUpdateActivity,
} from '@/lib/query/hooks';
import { Decision, DecisionStats, SuggestedAction, ActionPayload } from '../types';
import decisionQueueService from '../services/decisionQueueService';
import { runAllAnalyzers } from '../analyzers';

/**
 * Hook React `useDecisionQueue` que encapsula uma lógica reutilizável.
 * @returns {{ decisions: Decision[]; stats: DecisionStats; lastAnalyzedAt: string | undefined; isAnalyzing: boolean; executingIds: Set<string>; runAnalyzers: () => Promise<{ ...; }>; ... 5 more ...; refreshDecisions: () => void; }} Retorna um valor do tipo `{ decisions: Decision[]; stats: DecisionStats; lastAnalyzedAt: string | undefined; isAnalyzing: boolean; executingIds: Set<string>; runAnalyzers: () => Promise<{ ...; }>; ... 5 more ...; refreshDecisions: () => void; }`.
 */
export function useDecisionQueue() {
  const { data: deals = [] } = useDealsView();
  const { data: activities = [] } = useActivities();
  const updateDealMutation = useUpdateDeal();
  const createActivityMutation = useCreateActivity();
  const updateActivityMutation = useUpdateActivity();
  const updateDeal = (id: string, updates: Parameters<typeof updateDealMutation.mutateAsync>[0]['updates']) => updateDealMutation.mutateAsync({ id, updates });
  const addActivity = (activity: Parameters<typeof createActivityMutation.mutateAsync>[0]['activity']) => createActivityMutation.mutateAsync({ activity });
  const updateActivity = (id: string, updates: Parameters<typeof updateActivityMutation.mutateAsync>[0]['updates']) => updateActivityMutation.mutateAsync({ id, updates });

  const [decisions, setDecisions] = useState<Decision[]>(() =>
    decisionQueueService.getPendingDecisions()
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set());
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | undefined>(
    decisionQueueService.getLastAnalyzedAt()
  );

  // Refresh decisions from storage
  const refreshDecisions = useCallback(() => {
    setDecisions(decisionQueueService.getPendingDecisions());
    setLastAnalyzedAt(decisionQueueService.getLastAnalyzedAt());
  }, []);

  // Calculate stats
  const stats: DecisionStats = useMemo(() => {
    /**
     * Performance: compute stats from in-memory state (avoids re-reading localStorage + sorting).
     * `decisions` already comes from `getPendingDecisions()`.
     */
    const out: DecisionStats = {
      total: decisions.length,
      pending: decisions.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      byCategory: {
        follow_up: 0,
        deadline: 0,
        opportunity: 0,
        risk: 0,
        routine: 0,
      },
      byType: {} as Record<string, number>,
    };

    for (const d of decisions) {
      out[d.priority] += 1;
      out.byCategory[d.category] += 1;
      out.byType[d.type] = (out.byType[d.type] || 0) + 1;
    }

    return out;
  }, [decisions]);

  // Run all analyzers
  const runAnalyzers = useCallback(async () => {
    setIsAnalyzing(true);

    try {
      const result = await runAllAnalyzers(deals, activities);
      refreshDecisions();
      return result;
    } finally {
      setIsAnalyzing(false);
    }
  }, [deals, activities, refreshDecisions]);

  // Execute action based on type
  const executeAction = useCallback(async (
    action: SuggestedAction,
    decision: Decision
  ): Promise<boolean> => {
    const { type, payload } = action;

    try {
      switch (type) {
        case 'create_activity':
        case 'schedule_call':
        case 'schedule_meeting': {
          if (payload.activityTitle && payload.activityDate) {
            const newActivity = {
              id: crypto.randomUUID(),
              dealId: payload.dealId || decision.dealId || '',
              dealTitle: '',  // Will be filled by context
              type: payload.activityType || 'TASK',
              title: payload.activityTitle,
              description: payload.activityDescription,
              date: payload.activityDate,
              user: { name: 'Você', avatar: '' },
              completed: false,
            };
            addActivity(newActivity);
            return true;
          }
          break;
        }

        case 'move_deal': {
          if (decision.dealId && payload.newStage) {
            updateDeal(decision.dealId, { status: payload.newStage as any });
            return true;
          }
          break;
        }

        case 'dismiss': {
          // "Marcar como Feita" - marca a atividade original como concluída
          if (decision.activityId) {
            updateActivity(decision.activityId, { completed: true });
          }
          return true;
        }

        case 'send_message': {
          // Abre WhatsApp Web com a mensagem pré-preenchida
          if (payload.channel === 'whatsapp' && payload.messageTemplate) {
            const message = encodeURIComponent(payload.messageTemplate);
            // Se tiver número de telefone, usa; senão abre só com a mensagem
            const phone = payload.recipient?.replace(/\D/g, '') || '';
            const url = phone
              ? `https://wa.me/${phone}?text=${message}`
              : `https://wa.me/?text=${message}`;
            window.open(url, '_blank');
            return true;
          }

          // Para email, abre o cliente de email
          if (payload.channel === 'email' && payload.recipient) {
            const subject = encodeURIComponent(`Follow-up`);
            const body = encodeURIComponent(payload.messageTemplate || '');
            const url = `mailto:${payload.recipient}?subject=${subject}&body=${body}`;
            window.open(url, '_blank');
            return true;
          }

          return true;
        }

        default:
          console.warn(`Unknown action type: ${type}`);
          return false;
      }
    } catch (error) {
      console.error('Error executing action:', error);
      return false;
    }

    return false;
  }, [addActivity, updateDeal, updateActivity]);

  // Approve a decision
  const approveDecision = useCallback(async (
    id: string,
    action?: SuggestedAction
  ) => {
    const decision = decisions.find(d => d.id === id);
    if (!decision) {
      console.error('[DecisionQueue] Decision not found:', id);
      return;
    }

    setExecutingIds(prev => new Set(prev).add(id));

    try {
      const actionToExecute = action || decision.suggestedAction;

      const success = await executeAction(actionToExecute, decision);

      if (success) {
        decisionQueueService.updateDecisionStatus(id, 'approved');
        refreshDecisions();
      }
    } catch (error) {
      console.error('[DecisionQueue] Error approving decision:', error);
    } finally {
      setExecutingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [decisions, executeAction, refreshDecisions]);

  // Reject a decision
  const rejectDecision = useCallback((id: string) => {
    decisionQueueService.rejectDecision(id);
    refreshDecisions();
  }, [refreshDecisions]);

  // Snooze a decision (default: 1 day)
  const snoozeDecision = useCallback((id: string, hours: number = 24) => {
    const until = new Date();
    until.setHours(until.getHours() + hours);
    decisionQueueService.snoozeDecision(id, until);
    refreshDecisions();
  }, [refreshDecisions]);

  // Approve all pending decisions
  const approveAll = useCallback(async () => {
    const pendingIds = decisions.map(d => d.id);

    for (const id of pendingIds) {
      await approveDecision(id);
    }
  }, [decisions, approveDecision]);

  // Clear all decisions
  const clearAll = useCallback(() => {
    decisionQueueService.clearAll();
    refreshDecisions();
  }, [refreshDecisions]);

  return {
    // Data
    decisions,
    stats,
    lastAnalyzedAt,

    // State
    isAnalyzing,
    executingIds,

    // Actions
    runAnalyzers,
    approveDecision,
    rejectDecision,
    snoozeDecision,
    approveAll,
    clearAll,
    refreshDecisions,
  };
}

export default useDecisionQueue;

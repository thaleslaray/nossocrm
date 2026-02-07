'use client';

/**
 * @fileoverview Pending Advances Section
 *
 * Seção do inbox para mostrar pending stage advances (HITL).
 * Mostra lista compacta com opção de abrir sheet para resolver.
 *
 * @module features/inbox/components/PendingAdvancesSection
 */

import { useState } from 'react';
import { Brain, ArrowRight, Loader2, X } from 'lucide-react';
import {
  usePendingAdvancesQuery,
  useResolvePendingAdvanceMutation,
  type PendingAdvanceListItem,
} from '@/lib/query/hooks';
import { useBoards } from '@/lib/query/hooks';
import { Sheet } from '@/components/ui/Sheet';
import { Badge } from '@/components/ui/badge';
import { StageAdvanceSuggestion } from '@/features/messaging/components/StageAdvanceSuggestion';
import type { StageAdvanceSuggestion as SuggestionType, UserEdits } from '@/lib/ai/agent/hitl-stage-advance';

// =============================================================================
// Helper: Convert DB record to UI type
// =============================================================================

function mapToSuggestion(item: PendingAdvanceListItem): SuggestionType {
  return {
    dealId: item.deal_id,
    dealTitle: item.deals?.title || 'Deal',
    currentStageId: item.current_stage_id,
    currentStageName: item.current_stage?.name || 'Estágio atual',
    targetStageId: item.suggested_stage_id,
    targetStageName: item.suggested_stage?.name || 'Próximo estágio',
    confidence: item.confidence,
    reason: item.reason,
    criteriaEvaluation: item.criteria_evaluation.map((c) => ({
      criterion: c.criterion,
      met: c.met,
      confidence: c.confidence,
      evidence: c.evidence,
    })),
    conversationId: item.conversation_id || undefined,
  };
}

// =============================================================================
// Compact Row Component
// =============================================================================

interface PendingAdvanceRowProps {
  item: PendingAdvanceListItem;
  onClick: () => void;
}

function PendingAdvanceRow({ item, onClick }: PendingAdvanceRowProps) {
  const confidencePercent = Math.round(item.confidence * 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors text-left"
    >
      <div className="shrink-0">
        <Brain size={16} className="text-amber-600 dark:text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-800 dark:text-slate-100 truncate">
          {item.deals?.title || 'Deal'}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {item.current_stage?.name} → {item.suggested_stage?.name}
        </div>
      </div>
      <div className="shrink-0">
        <Badge variant="outline" className="text-xs">
          {confidencePercent}%
        </Badge>
      </div>
    </button>
  );
}

// =============================================================================
// Main Section Component
// =============================================================================

interface PendingAdvancesSectionProps {
  /** Limite de itens a mostrar (default: 5) */
  limit?: number;
  /** Callback quando resolver um item */
  onResolved?: () => void;
}

export function PendingAdvancesSection({ limit = 5, onResolved }: PendingAdvancesSectionProps) {
  const { data: pendingAdvances = [], isLoading } = usePendingAdvancesQuery({ status: 'pending' });
  const { data: boards = [] } = useBoards();
  const resolveMutation = useResolvePendingAdvanceMutation();

  const [selectedItem, setSelectedItem] = useState<PendingAdvanceListItem | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Get stages for the selected item's board
  const selectedStages = selectedItem
    ? boards.find((b) => b.stages?.some((s) => s.id === selectedItem.current_stage_id))?.stages || []
    : [];

  const handleOpenItem = (item: PendingAdvanceListItem) => {
    setSelectedItem(item);
    setIsSheetOpen(true);
  };

  const handleResolve = async (edits: UserEdits) => {
    if (!selectedItem) return;

    await resolveMutation.mutateAsync({
      pendingAdvanceId: selectedItem.id,
      userEdits: edits,
    });

    setIsSheetOpen(false);
    setSelectedItem(null);
    onResolved?.();
  };

  const handleDismiss = () => {
    setIsSheetOpen(false);
    setSelectedItem(null);
  };

  // Don't render if no pending advances
  if (!isLoading && pendingAdvances.length === 0) {
    return null;
  }

  const displayItems = pendingAdvances.slice(0, limit);
  const hasMore = pendingAdvances.length > limit;

  return (
    <>
      <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-amber-600 dark:text-amber-400" />
            <h3 className="font-bold text-slate-900 dark:text-white">
              Avanços Pendentes
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium">
              {pendingAdvances.length}
            </span>
          </div>
          {hasMore && (
            <button
              onClick={() => {/* TODO: Navigate to full list */}}
              className="text-sm font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
            >
              Ver todos
              <ArrowRight size={14} />
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          </div>
        ) : (
          <div className="space-y-1">
            {displayItems.map((item) => (
              <PendingAdvanceRow
                key={item.id}
                item={item}
                onClick={() => handleOpenItem(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Resolution Sheet */}
      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} ariaLabel="Confirmar Avanço de Estágio">
        <div className="max-h-[85vh] overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Confirmar Avanço de Estágio
            </h2>
            <button
              type="button"
              onClick={() => setIsSheetOpen(false)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
          {selectedItem && (
            <StageAdvanceSuggestion
              suggestion={mapToSuggestion(selectedItem)}
              stages={selectedStages.map((s) => ({
                id: s.id,
                name: s.label,
              }))}
              onSubmit={handleResolve}
              onDismiss={handleDismiss}
              isLoading={resolveMutation.isPending}
            />
          )}
        </div>
      </Sheet>
    </>
  );
}

// =============================================================================
// Stat Card for Overview
// =============================================================================

interface PendingAdvancesStatCardProps {
  count: number;
  onClick?: () => void;
}

export function PendingAdvancesStatCard({ count, onClick }: PendingAdvancesStatCardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-colors ${
        count > 0
          ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/10'
          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
      } ${onClick ? 'hover:bg-amber-100 dark:hover:bg-amber-500/20' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Aprovações IA
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {count > 0 ? 'Aguardando sua decisão' : 'Nenhuma pendência'}
          </div>
        </div>
        <div className={`text-2xl font-bold ${count > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>
          {count}
        </div>
      </div>
    </Component>
  );
}

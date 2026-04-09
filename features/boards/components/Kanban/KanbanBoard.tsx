import React, { useCallback, useMemo, useState } from 'react';
import { DealView, BoardStage } from '@/types';
import { DealCard } from './DealCard';
import { isDealRotting, getActivityStatus } from '@/features/boards/hooks/useBoardsController';
import { MoveToStageModal } from '../Modals/MoveToStageModal';
import { SkeletonDealCard } from '@/components/ui/Skeleton';
import { useLifecycleStages } from '@/lib/query/hooks/useLifecycleStagesQuery';

/**
 * UI: Drop highlight should follow the stage color.
 *
 * Note on Tailwind: stage colors come from persisted values like `bg-blue-500`.
 * Tailwind only generates classes it can “see” in source, so we map to a finite set
 * of explicit `border-<color>-500`, `bg-<color>-100/20`, and `shadow-<color>-500/30` classes here.
 */
function dropHighlightClasses(stageBgClass?: string): string {
  const c = (stageBgClass ?? '').toLowerCase();

  if (c.includes('blue') || c.includes('sky') || c.includes('cyan')) {
    return 'border-blue-500 bg-blue-100/20 dark:bg-blue-900/30 shadow-xl shadow-blue-500/30';
  }
  if (c.includes('green') || c.includes('emerald')) {
    return 'border-emerald-500 bg-emerald-100/20 dark:bg-emerald-900/30 shadow-xl shadow-emerald-500/30';
  }
  if (c.includes('yellow') || c.includes('amber')) {
    return 'border-amber-500 bg-amber-100/20 dark:bg-amber-900/30 shadow-xl shadow-amber-500/30';
  }
  if (c.includes('orange')) {
    return 'border-orange-500 bg-orange-100/20 dark:bg-orange-900/30 shadow-xl shadow-orange-500/30';
  }
  if (c.includes('red')) {
    return 'border-red-500 bg-red-100/20 dark:bg-red-900/30 shadow-xl shadow-red-500/30';
  }
  if (c.includes('violet') || c.includes('purple')) {
    return 'border-violet-500 bg-violet-100/20 dark:bg-violet-900/30 shadow-xl shadow-violet-500/30';
  }
  if (c.includes('pink') || c.includes('rose')) {
    return 'border-pink-500 bg-pink-100/20 dark:bg-pink-900/30 shadow-xl shadow-pink-500/30';
  }
  if (c.includes('indigo')) {
    return 'border-indigo-500 bg-indigo-100/20 dark:bg-indigo-900/30 shadow-xl shadow-indigo-500/30';
  }
  if (c.includes('teal')) {
    return 'border-teal-500 bg-teal-100/20 dark:bg-teal-900/30 shadow-xl shadow-teal-500/30';
  }

  // Fallback: keep existing behavior-ish (green).
  return 'border-emerald-500 bg-emerald-100/20 dark:bg-emerald-900/30 shadow-xl shadow-emerald-500/30';
}

interface KanbanBoardProps {
  stages: BoardStage[];
  filteredDeals: DealView[];
  draggingId: string | null;
  handleDragStart: (e: React.DragEvent, id: string, title: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, stageId: string) => void;
  setSelectedDealId: (id: string | null) => void;
  openActivityMenuId: string | null;
  setOpenActivityMenuId: (id: string | null) => void;
  handleQuickAddActivity: (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => void;
  setLastMouseDownDealId: (id: string | null) => void;
  /** Callback to move a deal to a new stage (for keyboard accessibility) */
  onMoveDealToStage?: (dealId: string, newStageId: string) => void;
  /** Exibe skeleton cards enquanto os dados carregam */
  isLoading?: boolean;
}
/**
 * Componente React `KanbanBoard`.
 *
 * @param {KanbanBoardProps} {
  stages,
  filteredDeals,
  draggingId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  setSelectedDealId,
  openActivityMenuId,
  setOpenActivityMenuId,
  handleQuickAddActivity,
  setLastMouseDownDealId,
  onMoveDealToStage,
} - Parâmetro `{
  stages,
  filteredDeals,
  draggingId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  setSelectedDealId,
  openActivityMenuId,
  setOpenActivityMenuId,
  handleQuickAddActivity,
  setLastMouseDownDealId,
  onMoveDealToStage,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  stages,
  filteredDeals,
  draggingId,
  handleDragStart,
  handleDragOver,
  handleDrop,
  setSelectedDealId,
  openActivityMenuId,
  setOpenActivityMenuId,
  handleQuickAddActivity,
  setLastMouseDownDealId,
  onMoveDealToStage,
  isLoading = false,
}) => {
  const { data: lifecycleStages = [] } = useLifecycleStages();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  
  // State for move-to-stage modal (keyboard accessibility alternative to drag-and-drop)
  const [moveToStageModal, setMoveToStageModal] = useState<{
    isOpen: boolean;
    deal: DealView;
    currentStageId: string;
  } | null>(null);

  /**
   * Performance: o Kanban renderiza listas grandes. Evitamos padrões O(S*N) no render:
   * - Antes: para cada stage, fazia `filteredDeals.filter(...)` + `reduce(...)`.
   * - Agora: agrupamos 1 vez (O(N)) e só lemos por stage (O(S)).
   */
  const dealsByStageId = useMemo(() => {
    const map = new Map<string, DealView[]>();
    const totals = new Map<string, number>();
    for (const deal of filteredDeals) {
      const list = map.get(deal.status);
      if (list) list.push(deal);
      else map.set(deal.status, [deal]);

      totals.set(deal.status, (totals.get(deal.status) ?? 0) + (deal.value ?? 0));
    }
    return { map, totals };
  }, [filteredDeals]);

  // Performance: evita `find` por stage (O(S*L)). Map é O(1) por lookup.
  const lifecycleStageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ls of lifecycleStages ?? []) {
      if (ls?.id && ls?.name) map.set(ls.id, ls.name);
    }
    return map;
  }, [lifecycleStages]);

  // Performance: index deals by id once so callbacks can stay stable across menu toggles.
  const dealsById = useMemo(() => new Map(filteredDeals.map((d) => [d.id, d])), [filteredDeals]);

  // Performance: keep selection callback stable so DealCard can be memoized.
  const handleSelectDeal = useCallback(
    (dealId: string) => {
      setSelectedDealId(dealId);
    },
    [setSelectedDealId]
  );

  // Handler to open move-to-stage modal (stable across re-renders when only menu state changes)
  const handleOpenMoveToStage = useCallback(
    (dealId: string) => {
      const deal = dealsById.get(dealId);
      if (deal) {
        setMoveToStageModal({
          isOpen: true,
          deal,
          currentStageId: deal.status,
        });
      }
    },
    [dealsById]
  );

  // Handler to confirm move to a new stage
  const handleConfirmMoveToStage = useCallback((dealId: string, newStageId: string) => {
    if (onMoveDealToStage) {
      onMoveDealToStage(dealId, newStageId);
    }
    setMoveToStageModal(null);
  }, [onMoveDealToStage]);

  return (
    <div role="list" aria-label="Colunas do pipeline" className="flex gap-4 h-full overflow-x-auto pb-2 w-full">
      {stages.map(stage => {
        const stageDeals = dealsByStageId.map.get(stage.id) ?? [];
        const stageValue = dealsByStageId.totals.get(stage.id) ?? 0;
        const isOver = dragOverStage === stage.id && draggingId !== null;

        // Resolve linked stage name
        const linkedStageName =
          stage.linkedLifecycleStage
            ? lifecycleStageNameById.get(stage.linkedLifecycleStage) ?? null
            : null;

        return (
          <div
            key={stage.id}
            role="listitem"
            aria-label={`Coluna ${stage.label}: ${stageDeals.length} negócio${stageDeals.length !== 1 ? 's' : ''}`}
            onDragOver={(e) => {
              handleDragOver(e);
              setDragOverStage(stage.id);
            }}
            onDrop={(e) => {
              handleDrop(e, stage.id);
              setDragOverStage(null);
            }}
            onDragEnter={() => setDragOverStage(stage.id)}
            onDragLeave={() => setDragOverStage(null)}
            className={`min-w-[20rem] flex-1 flex flex-col rounded-xl border-2 overflow-visible h-full max-h-full transition-all duration-200
                            ${isOver
                ? `${dropHighlightClasses(stage.color)} scale-[1.02]`
                : 'border-slate-200/50 dark:border-white/10 glass'
              }
                        `}
          >
            <div className={`h-1.5 w-full ${stage.color}`}></div>

            <div
              className={`p-3 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 shrink-0`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-200 font-display text-sm tracking-wide uppercase">
                  {stage.label}
                </span>
                <span className="text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                  {stageDeals.length}
                </span>
              </div>

              {/* Automation Indicator - Always rendered for consistent height */}
              <div className="mb-2 flex items-center gap-1.5 min-h-[22px]">
                {linkedStageName ? (
                  <span className="text-[10px] uppercase font-bold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-1.5 py-0.5 rounded border border-primary-100 dark:border-primary-800/50 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-primary-500 animate-pulse"></span>
                    Promove para: {linkedStageName}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 opacity-0 select-none">
                    Placeholder
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium text-right">
                Total:{' '}
                <span className="text-slate-900 dark:text-white font-mono">
                  ${stageValue.toLocaleString()}
                </span>
              </div>
            </div>

            <div
              role="list"
              aria-label={`Negócios em ${stage.label}`}
              className={`flex-1 p-2 overflow-y-auto space-y-2 bg-slate-100/50 dark:bg-black/20 scrollbar-thin min-h-[100px]`}
            >
              {/* Skeleton: exibido durante carregamento inicial */}
              {isLoading && (
                <>
                  <SkeletonDealCard />
                  <SkeletonDealCard />
                </>
              )}

              {/* Empty column state */}
              {!isLoading && stageDeals.length === 0 && !isOver && (
                <div className="flex flex-col items-center justify-center py-8 px-3 select-none">
                  <div className="w-10 h-10 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/10 flex items-center justify-center mb-2 text-slate-300 dark:text-white/20">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 3.5a.5.5 0 0 1 .5.5v3.5H12a.5.5 0 0 1 0 1H8.5V12a.5.5 0 0 1-1 0V8.5H4a.5.5 0 0 1 0-1h3.5V4a.5.5 0 0 1 .5-.5z"/>
                    </svg>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-600 text-center">
                    Arraste um negócio aqui
                  </p>
                </div>
              )}

              {/* Drop target indicator */}
              {isOver && stageDeals.length === 0 && (
                <div className="h-full flex items-center justify-center text-emerald-500 dark:text-emerald-400 text-sm py-8 font-bold animate-pulse pointer-events-none">
                  ✓ Solte aqui!
                </div>
              )}

              {!isLoading && stageDeals.map(deal => (
                <div key={deal.id} role="listitem">
                  <DealCard
                    deal={deal}
                    isRotting={
                      isDealRotting(deal) &&
                      !deal.isWon &&
                      !deal.isLost
                    }
                    activityStatus={getActivityStatus(deal)}
                    isDragging={draggingId === deal.id}
                    onDragStart={handleDragStart}
                    onSelect={handleSelectDeal}
                    // Performance: avoid passing openMenuId (string) to all cards.
                    // Only 1–2 cards will flip `isMenuOpen` when the menu is toggled.
                    isMenuOpen={openActivityMenuId === deal.id}
                    setOpenMenuId={setOpenActivityMenuId}
                    onQuickAddActivity={handleQuickAddActivity}
                    setLastMouseDownDealId={setLastMouseDownDealId}
                    onMoveToStage={onMoveDealToStage ? handleOpenMoveToStage : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      
      {/* Keyboard-accessible modal for moving deals between stages */}
      {moveToStageModal && (
        <MoveToStageModal
          isOpen={moveToStageModal.isOpen}
          onClose={() => setMoveToStageModal(null)}
          onMove={handleConfirmMoveToStage}
          deal={moveToStageModal.deal}
          stages={stages}
          currentStageId={moveToStageModal.currentStageId}
        />
      )}
    </div>
  );
};

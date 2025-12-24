import React, { useState, useMemo, useCallback } from 'react';
import { DealView, BoardStage } from '@/types';
import { DealCard } from './DealCard';
import { isDealRotting, getActivityStatus } from '@/features/boards/hooks/useBoardsController';
import { MoveToStageModal } from '../Modals/MoveToStageModal';

import { useCRM } from '@/context/CRMContext';

interface KanbanBoardProps {
  stages: BoardStage[];
  filteredDeals: DealView[];
  draggingId: string | null;
  handleDragStart: (e: React.DragEvent, id: string) => void;
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
}
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
}) => {
  const { lifecycleStages } = useCRM();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  
  // State for move-to-stage modal (keyboard accessibility alternative to drag-and-drop)
  const [moveToStageModal, setMoveToStageModal] = useState<{
    isOpen: boolean;
    deal: DealView;
    currentStageId: string;
  } | null>(null);

  // Handler to open move-to-stage modal
  const handleOpenMoveToStage = useCallback((dealId: string) => {
    const deal = filteredDeals.find(d => d.id === dealId);
    if (deal) {
      setMoveToStageModal({
        isOpen: true,
        deal,
        currentStageId: deal.status,
      });
    }
  }, [filteredDeals]);

  // Pre-group deals by stage to avoid O(N*M) filtering in render loop
  const dealsByStage = useMemo(() => {
    const map: Record<string, DealView[]> = {};
    // Initialize arrays for all stages
    stages.forEach(s => {
      map[s.id] = [];
    });

    // Distribute deals
    filteredDeals.forEach(deal => {
      if (map[deal.status]) {
        map[deal.status].push(deal);
      }
    });

    return map;
  }, [filteredDeals, stages]);

  // Handler to confirm move to a new stage
  const handleConfirmMoveToStage = (dealId: string, newStageId: string) => {
    if (onMoveDealToStage) {
      onMoveDealToStage(dealId, newStageId);
    }
    setMoveToStageModal(null);
  };

  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-2 w-full">
      {stages.map(stage => {
        const stageDeals = dealsByStage[stage.id] || [];
        const stageValue = stageDeals.reduce((sum, l) => sum + l.value, 0);
        const isOver = dragOverStage === stage.id && draggingId !== null;

        // Resolve linked stage name
        const linkedStageName =
          stage.linkedLifecycleStage && lifecycleStages
            ? lifecycleStages.find(ls => ls.id === stage.linkedLifecycleStage)?.name
            : null;

        return (
          <div
            key={stage.id}
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
                ? 'border-green-500 bg-green-100/20 dark:bg-green-900/30 scale-[1.02] shadow-xl shadow-green-500/30'
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
              className={`flex-1 p-2 overflow-y-auto space-y-2 bg-slate-100/50 dark:bg-black/20 scrollbar-thin min-h-[100px]`}
            >
              {stageDeals.length === 0 && !draggingId && (
                <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm py-8">
                  Sem negócios
                </div>
              )}
              {isOver && stageDeals.length === 0 && (
                <div className="h-full flex items-center justify-center text-green-500 dark:text-green-400 text-sm py-8 font-bold animate-pulse pointer-events-none">
                  ✓ Solte aqui!
                </div>
              )}
              {stageDeals.map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  isRotting={
                    isDealRotting(deal) &&
                    !deal.isWon &&
                    !deal.isLost
                  }
                  activityStatus={getActivityStatus(deal)}
                  isDragging={draggingId === deal.id}
                  onDragStart={handleDragStart}
                  onSelectDeal={setSelectedDealId}
                  openMenuId={openActivityMenuId}
                  setOpenMenuId={setOpenActivityMenuId}
                  onQuickAddActivity={handleQuickAddActivity}
                  setLastMouseDownDealId={setLastMouseDownDealId}
                  onMoveToStage={onMoveDealToStage ? handleOpenMoveToStage : undefined}
                />
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

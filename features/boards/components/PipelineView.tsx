import React from 'react';
import { DealDetailModal } from './Modals/DealDetailModal';
import { CreateDealModal } from './Modals/CreateDealModal';
import { CreateBoardModal } from './Modals/CreateBoardModal';
import { BoardCreationWizard } from './BoardCreationWizard';
import { KanbanHeader } from './Kanban/KanbanHeader';
import { BoardStrategyHeader } from './Kanban/BoardStrategyHeader';
import { KanbanBoard } from './Kanban/KanbanBoard';
import { KanbanList } from './Kanban/KanbanList';
import { DeleteBoardModal } from './Modals/DeleteBoardModal';
import { LossReasonModal } from '@/components/ui/LossReasonModal';
import { DealView, CustomFieldDefinition, Board, BoardStage } from '@/types';
import { ExportTemplateModal } from './Modals/ExportTemplateModal';
import { useAuth } from '@/context/AuthContext';
import PageLoader from '@/components/PageLoader';

interface PipelineViewProps {
  // Boards
  boards: Board[];
  activeBoard: Board | null;
  activeBoardId: string | null;
  handleSelectBoard: (id: string) => void;
  handleCreateBoard: (board: Omit<Board, 'id' | 'createdAt'>, order?: number) => void;
  createBoardAsync?: (board: Omit<Board, 'id' | 'createdAt'>, order?: number) => Promise<Board>;
  updateBoardAsync?: (id: string, updates: Partial<Board>) => Promise<void>;
  handleEditBoard: (board: Board) => void;
  handleUpdateBoard: (board: Omit<Board, 'id' | 'createdAt'>) => void;
  handleDeleteBoard: (id: string) => void;
  confirmDeleteBoard: () => void;
  boardToDelete: { id: string; name: string; dealCount: number; targetBoardId?: string } | null;
  setBoardToDelete: (board: { id: string; name: string; dealCount: number; targetBoardId?: string } | null) => void;
  setTargetBoardForDelete: (targetBoardId: string) => void;
  availableBoardsForMove: Board[];
  isCreateBoardModalOpen: boolean;
  setIsCreateBoardModalOpen: (isOpen: boolean) => void;
  isWizardOpen: boolean;
  setIsWizardOpen: (isOpen: boolean) => void;
  editingBoard: Board | null;
  setEditingBoard: (board: Board | null) => void;
  // View
  viewMode: 'kanban' | 'list';
  setViewMode: (mode: 'kanban' | 'list') => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  ownerFilter: 'all' | 'mine';
  setOwnerFilter: (filter: 'all' | 'mine') => void;
  statusFilter: 'open' | 'won' | 'lost' | 'all';
  setStatusFilter: (filter: 'open' | 'won' | 'lost' | 'all') => void;
  draggingId: string | null;
  selectedDealId: string | null;
  setSelectedDealId: (id: string | null) => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (isOpen: boolean) => void;
  openActivityMenuId: string | null;
  setOpenActivityMenuId: (id: string | null) => void;
  filteredDeals: DealView[];
  customFieldDefinitions: CustomFieldDefinition[];
  isLoading: boolean;
  handleDragStart: (e: React.DragEvent, id: string, title: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, stageId: string) => void;
  /** Keyboard-accessible handler to move a deal to a new stage */
  handleMoveDealToStage: (dealId: string, newStageId: string) => void;
  handleQuickAddActivity: (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => void;
  setLastMouseDownDealId: (id: string | null) => void;
  // Loss Reason Modal
  lossReasonModal: {
    isOpen: boolean;
    dealId: string;
    dealTitle: string;
    stageId: string;
  } | null;
  handleLossReasonConfirm: (reason: string) => void;
  handleLossReasonClose: () => void;
  boardCreateOverlay?: { title: string; subtitle?: string } | null;
}

/**
 * Componente React `PipelineView`.
 *
 * @param {PipelineViewProps} {
  // Boards
  boards,
  activeBoard,
  activeBoardId,
  handleSelectBoard,
  handleCreateBoard,
  createBoardAsync,
  updateBoardAsync,
  handleEditBoard,
  handleUpdateBoard,
  handleDeleteBoard,
  confirmDeleteBoard,
  boardToDelete,
  setBoardToDelete,
  setTargetBoardForDelete,
  availableBoardsForMove,
  isCreateBoardModalOpen,
  setIsCreateBoardModalOpen,
  isWizardOpen,
  setIsWizardOpen,
  editingBoard,
  setEditingBoard,
  // View
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm,
  ownerFilter,
  setOwnerFilter,
  statusFilter,
  setStatusFilter,
  draggingId,
  selectedDealId,
  setSelectedDealId,
  isCreateModalOpen,
  setIsCreateModalOpen,
  openActivityMenuId,
  setOpenActivityMenuId,
  filteredDeals,
  customFieldDefinitions,
  isLoading,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleMoveDealToStage,
  handleQuickAddActivity,
  setLastMouseDownDealId,
  // Loss Reason Modal
  lossReasonModal,
  handleLossReasonConfirm,
  handleLossReasonClose,
} - Parâmetro `{
  // Boards
  boards,
  activeBoard,
  activeBoardId,
  handleSelectBoard,
  handleCreateBoard,
  createBoardAsync,
  updateBoardAsync,
  handleEditBoard,
  handleUpdateBoard,
  handleDeleteBoard,
  confirmDeleteBoard,
  boardToDelete,
  setBoardToDelete,
  setTargetBoardForDelete,
  availableBoardsForMove,
  isCreateBoardModalOpen,
  setIsCreateBoardModalOpen,
  isWizardOpen,
  setIsWizardOpen,
  editingBoard,
  setEditingBoard,
  // View
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm,
  ownerFilter,
  setOwnerFilter,
  statusFilter,
  setStatusFilter,
  draggingId,
  selectedDealId,
  setSelectedDealId,
  isCreateModalOpen,
  setIsCreateModalOpen,
  openActivityMenuId,
  setOpenActivityMenuId,
  filteredDeals,
  customFieldDefinitions,
  isLoading,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleMoveDealToStage,
  handleQuickAddActivity,
  setLastMouseDownDealId,
  // Loss Reason Modal
  lossReasonModal,
  handleLossReasonConfirm,
  handleLossReasonClose,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const PipelineView: React.FC<PipelineViewProps> = ({
  // Boards
  boards,
  activeBoard,
  activeBoardId,
  handleSelectBoard,
  handleCreateBoard,
  createBoardAsync,
  updateBoardAsync,
  handleEditBoard,
  handleUpdateBoard,
  handleDeleteBoard,
  confirmDeleteBoard,
  boardToDelete,
  setBoardToDelete,
  setTargetBoardForDelete,
  availableBoardsForMove,
  isCreateBoardModalOpen,
  setIsCreateBoardModalOpen,
  isWizardOpen,
  setIsWizardOpen,
  editingBoard,
  setEditingBoard,
  // View
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm,
  ownerFilter,
  setOwnerFilter,
  statusFilter,
  setStatusFilter,
  draggingId,
  selectedDealId,
  setSelectedDealId,
  isCreateModalOpen,
  setIsCreateModalOpen,
  openActivityMenuId,
  setOpenActivityMenuId,
  filteredDeals,
  customFieldDefinitions,
  isLoading,
  handleDragStart,
  handleDragOver,
  handleDrop,
  handleMoveDealToStage,
  handleQuickAddActivity,
  setLastMouseDownDealId,
  // Loss Reason Modal
  lossReasonModal,
  handleLossReasonConfirm,
  handleLossReasonClose,
  boardCreateOverlay,
}) => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);

  const handleUpdateStage = (updatedStage: BoardStage) => {
    if (!activeBoard) return;
    const newStages = activeBoard.stages.map(s => (s.id === updatedStage.id ? updatedStage : s));
    handleUpdateBoard({ ...activeBoard, stages: newStages });
  };

  if (isLoading) {
    return (
      <div className="h-full">
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {boardCreateOverlay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          <div className="relative z-10 w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-900 dark:text-white">
                  {boardCreateOverlay.title}
                </div>
                {boardCreateOverlay.subtitle && (
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {boardCreateOverlay.subtitle}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div className="h-full w-1/2 bg-primary-500/80 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      )}
      {!activeBoard ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-24 h-24 bg-primary-50 dark:bg-primary-900/20 rounded-full flex items-center justify-center mb-6">
            <span className="text-4xl">🚀</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Bem-vindo ao seu CRM
          </h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mb-8">
            Você ainda não tem nenhum board criado. Comece criando seu primeiro fluxo de trabalho
            para organizar seus negócios.
          </p>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-primary-600/20"
          >
            ✨ Criar meu primeiro Board
          </button>
        </div>
      ) : (
        <>
          <KanbanHeader
            boards={boards}
            activeBoard={activeBoard}
            onSelectBoard={handleSelectBoard}
            onCreateBoard={() => setIsWizardOpen(true)}
            onEditBoard={handleEditBoard}
            onDeleteBoard={handleDeleteBoard}
            onExportTemplates={isAdmin ? () => setIsExportModalOpen(true) : undefined}
            viewMode={viewMode}
            setViewMode={setViewMode}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            ownerFilter={ownerFilter}
            setOwnerFilter={setOwnerFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onNewDeal={() => setIsCreateModalOpen(true)}
          />

          <BoardStrategyHeader board={activeBoard} />

          <div className="flex-1 overflow-hidden">
            {viewMode === 'kanban' ? (
              <KanbanBoard
                stages={activeBoard.stages}
                filteredDeals={filteredDeals}
                draggingId={draggingId}
                handleDragStart={handleDragStart}
                handleDragOver={handleDragOver}
                handleDrop={handleDrop}
                setSelectedDealId={setSelectedDealId}
                openActivityMenuId={openActivityMenuId}
                setOpenActivityMenuId={setOpenActivityMenuId}
                handleQuickAddActivity={handleQuickAddActivity}
                setLastMouseDownDealId={setLastMouseDownDealId}
                onMoveDealToStage={handleMoveDealToStage}
              />
            ) : (
              <KanbanList
                stages={activeBoard.stages}
                filteredDeals={filteredDeals}
                customFieldDefinitions={customFieldDefinitions}
                setSelectedDealId={setSelectedDealId}
                openActivityMenuId={openActivityMenuId}
                setOpenActivityMenuId={setOpenActivityMenuId}
                handleQuickAddActivity={handleQuickAddActivity}
                onMoveDealToStage={handleMoveDealToStage}
              />
            )}
          </div>
        </>
      )}

      <CreateDealModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        activeBoard={activeBoard}
        activeBoardId={activeBoardId ?? undefined}
      />

      <DealDetailModal
        dealId={selectedDealId}
        isOpen={!!selectedDealId}
        onClose={() => setSelectedDealId(null)}
      />

      <CreateBoardModal
        isOpen={isCreateBoardModalOpen}
        onClose={() => {
          setIsCreateBoardModalOpen(false);
          setEditingBoard(null);
        }}
        onSave={editingBoard ? handleUpdateBoard : handleCreateBoard}
        editingBoard={editingBoard || undefined}
        availableBoards={boards}
        onSwitchEditingBoard={handleEditBoard}
      />

      <BoardCreationWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onCreate={handleCreateBoard}
        onCreateBoardAsync={createBoardAsync}
        onUpdateBoardAsync={updateBoardAsync}
        onOpenCustomModal={() => setIsCreateBoardModalOpen(true)}
      />

      <DeleteBoardModal
        isOpen={!!boardToDelete}
        onClose={() => setBoardToDelete(null)}
        onConfirm={confirmDeleteBoard}
        boardName={boardToDelete?.name || ''}
        dealCount={boardToDelete?.dealCount || 0}
        availableBoards={availableBoardsForMove}
        selectedTargetBoardId={boardToDelete?.targetBoardId}
        onSelectTargetBoard={setTargetBoardForDelete}
      />

      <LossReasonModal
        isOpen={lossReasonModal?.isOpen ?? false}
        onClose={handleLossReasonClose}
        onConfirm={handleLossReasonConfirm}
        dealTitle={lossReasonModal?.dealTitle}
      />

      {activeBoard && (
        <ExportTemplateModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          boards={boards}
          activeBoard={activeBoard}
          onCreateBoardAsync={createBoardAsync}
        />
      )}
    </div>
  );
};

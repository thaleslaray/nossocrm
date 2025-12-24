import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DealView, Board, CustomFieldDefinition } from '@/types';
import {
  useBoards,
  useDefaultBoard,
  useCreateBoard,
  useUpdateBoard,
  useDeleteBoard,
  useDeleteBoardWithMove,
  useCanDeleteBoard,
} from '@/lib/query/hooks/useBoardsQuery';
import {
  useDealsByBoard,
} from '@/lib/query/hooks/useDealsQuery';
import { useMoveDeal } from '@/lib/query/hooks/useMoveDeal';
import { useCreateActivity } from '@/lib/query/hooks/useActivitiesQuery';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useRealtimeSyncKanban } from '@/lib/realtime/useRealtimeSync';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { useCRM } from '@/context/CRMContext';
import { useAI } from '@/context/AIContext';

export const isDealRotting = (deal: DealView) => {
  const dateToCheck = deal.lastStageChangeDate || deal.updatedAt;
  const diff = new Date().getTime() - new Date(dateToCheck).getTime();
  const days = diff / (1000 * 3600 * 24);
  return days > 10;
};

export const getActivityStatus = (deal: DealView) => {
  if (!deal.nextActivity) return 'yellow';
  if (deal.nextActivity.isOverdue) return 'red';
  const activityDate = new Date(deal.nextActivity.date);
  const today = new Date();
  if (activityDate.toDateString() === today.toDateString()) return 'green';
  return 'gray';
};

export const useBoardsController = () => {
  // Toast for feedback
  const { addToast } = useToast();
  const { profile, organizationId } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // AI Context
  const { setContext, clearContext } = useAI();

  // TanStack Query hooks
  const { data: boards = [], isLoading: boardsLoading, isFetched: boardsFetched } = useBoards();
  const { data: defaultBoard } = useDefaultBoard();
  const createBoardMutation = useCreateBoard();
  const updateBoardMutation = useUpdateBoard();
  const deleteBoardMutation = useDeleteBoard();
  const deleteBoardWithMoveMutation = useDeleteBoardWithMove();

  // Active board state (persisted)
  const [activeBoardId, setActiveBoardId] = usePersistedState<string | null>(
    'crm_active_board_id',
    null
  );

  // Set default board when boards load OR when active board doesn't exist anymore
  useEffect(() => {
    // Se não há activeBoardId, usa o default
    if (!activeBoardId && defaultBoard) {
      setActiveBoardId(defaultBoard.id);
      return;
    }

    // Se o activeBoardId não existe mais nos boards carregados, limpa e usa default
    if (activeBoardId && boards.length > 0) {
      const boardExists = boards.some(b => b.id === activeBoardId);
      if (!boardExists) {
        const newActiveId = defaultBoard?.id || boards[0]?.id || null;
        setActiveBoardId(newActiveId);
      }
    }
  }, [activeBoardId, defaultBoard, boards, setActiveBoardId]);

  // Get active board - SEMPRE sincronizado com activeBoardId válido
  const activeBoard = useMemo(() => {
    const found = boards.find(b => b.id === activeBoardId);
    // Se não encontrou, retorna o default (mas o useEffect acima vai corrigir o ID)
    return found || defaultBoard || null;
  }, [boards, activeBoardId, defaultBoard]);

  // ID efetivo - garante que é sempre do board que está sendo exibido
  const effectiveActiveBoardId = activeBoard?.id || null;

  // Deals for active board - usa o ID efetivo
  const { data: deals = [], isLoading: dealsLoading } = useDealsByBoard(effectiveActiveBoardId || '');
  const moveDealMutation = useMoveDeal();
  const createActivityMutation = useCreateActivity();

  // Filter State (declared before AI context useEffect that uses them)
  const [searchTerm, setSearchTerm] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'won' | 'lost' | 'all'>('open');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Set AI Context for Board (FULL CONTEXT)
  useEffect(() => {
    // Performance: noisy logging and object allocation isn't useful in production.
    if (process.env.NODE_ENV !== 'production') {
      console.log('[BoardsController] useEffect running:', {
        hasActiveBoard: !!activeBoard,
        activeBoardId: activeBoard?.id,
        activeBoardName: activeBoard?.name,
        dealsCount: deals.length,
      });
    }

    if (activeBoard) {
      // Performance: avoid O(S*N) by indexing stages once and scanning deals once.
      const stageIdToLabel = new Map<string, string>();
      const dealsPerStage: Record<string, number> = {};
      for (const stage of activeBoard.stages) {
        stageIdToLabel.set(stage.id, stage.label);
        dealsPerStage[stage.label] = 0;
      }

      let pipelineValue = 0;
      let stagnantDeals = 0;
      let overdueDeals = 0;

      for (const d of deals) {
        pipelineValue += d.value ?? 0;
        if (isDealRotting(d)) stagnantDeals += 1;
        if (d.nextActivity?.isOverdue) overdueDeals += 1;

        const label = stageIdToLabel.get(d.status);
        if (label) dealsPerStage[label] = (dealsPerStage[label] ?? 0) + 1;
      }

      // Performance: avoid `find` for won/lost labels.
      const wonStageLabel = activeBoard.wonStageId ? stageIdToLabel.get(activeBoard.wonStageId) : undefined;
      const lostStageLabel = activeBoard.lostStageId ? stageIdToLabel.get(activeBoard.lostStageId) : undefined;

      if (process.env.NODE_ENV !== 'production') {
        console.log('[BoardsController] 🎯 Setting AI Context for board:', activeBoard.id, activeBoard.name);
      }

      setContext({
        view: { type: 'kanban', name: activeBoard.name, url: `/boards/${activeBoard.id}` },
        activeObject: {
          type: 'board',
          id: activeBoard.id,
          name: activeBoard.name,
          metadata: {
            // Basic Info - Include boardId explicitly for tool usage
            boardId: activeBoard.id, // <-- Explicit for AI to use in tool calls
            description: activeBoard.description,
            goal: activeBoard.goal,
            columns: activeBoard.stages.map(s => s.label).join(', '),

            // Full stage info for AI to use in tool calls
            stages: activeBoard.stages.map(s => ({
              id: s.id,
              name: s.label,
            })),

            // Metrics
            dealCount: deals.length,
            pipelineValue,
            dealsPerStage,
            stagnantDeals,
            overdueDeals,

            // Board Config
            wonStage: wonStageLabel,
            lostStage: lostStageLabel,
            linkedLifecycleStage: activeBoard.linkedLifecycleStage,

            // AI Strategy
            agentPersona: activeBoard.agentPersona,
            entryTrigger: activeBoard.entryTrigger,
            automationSuggestions: activeBoard.automationSuggestions,
          }
        },
        // Active Filters
        filters: {
          status: statusFilter,
          owner: ownerFilter,
          search: searchTerm || undefined,
          dateRange: (dateRange.start || dateRange.end) ? dateRange : undefined,
        }
      });
    }
    // Note: Removed clearContext cleanup to prevent infinite loop with AIContext default setter
  }, [activeBoard, deals, statusFilter, ownerFilter, searchTerm, dateRange, setContext]);

  // Get lifecycle stages from CRM context for automations
  const { lifecycleStages } = useCRM();

  // Enable realtime sync for Kanban
  useRealtimeSyncKanban();

  // Custom field definitions (TODO: migrate to query)
  const customFieldDefinitions: CustomFieldDefinition[] = [];

  //View State
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<{
    id: string;
    name: string;
    dealCount: number;
    targetBoardId?: string;
  } | null>(null);



  // Initialize filters from URL
  useEffect(() => {
    if (!searchParams) return;
    const viewParam = searchParams.get('view');
    if (viewParam === 'list' || viewParam === 'kanban') {
      setViewMode(viewParam);
    }

    const statusParam = searchParams.get('status');
    if (statusParam === 'open' || statusParam === 'won' || statusParam === 'lost' || statusParam === 'all') {
      setStatusFilter(statusParam);
    }
  }, [searchParams]);

  // Interaction State
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [openActivityMenuId, setOpenActivityMenuId] = useState<string | null>(null);

  // Loss Reason Modal State
  const [lossReasonModal, setLossReasonModal] = useState<{
    isOpen: boolean;
    dealId: string;
    dealTitle: string;
    stageId: string;
  } | null>(null);

  // Open deal from URL param (e.g., /boards?deal=xxx)
  useEffect(() => {
    if (!searchParams) return;
    const dealIdFromUrl = searchParams.get('deal');
    if (dealIdFromUrl && !selectedDealId) {
      setSelectedDealId(dealIdFromUrl);
      // Clear the param from URL using router
      const params = new URLSearchParams(searchParams.toString());
      params.delete('deal');
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, selectedDealId, router]);

  // Fallback for drag issues
  const lastMouseDownDealId = React.useRef<string | null>(null);
  const setLastMouseDownDealId = (id: string | null) => {
    lastMouseDownDealId.current = id;
  };

  // Combined loading state
  const isLoading = boardsLoading || dealsLoading;

  useEffect(() => {
    const handleClickOutside = () => setOpenActivityMenuId(null);
    if (openActivityMenuId) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openActivityMenuId]);

  // Filtering Logic
  const filteredDeals = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    return deals.filter(l => {
      const matchesSearch =
        (l.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.companyName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesOwner =
        ownerFilter === 'all' || l.ownerId === profile?.id;

      let matchesDate = true;
      if (dateRange.start) {
        matchesDate = matchesDate && new Date(l.createdAt) >= new Date(dateRange.start);
      }
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && new Date(l.createdAt) <= endDate;
      }

      // Status Filter Logic
      let matchesStatus = true;
      if (statusFilter === 'open') {
        matchesStatus = !l.isWon && !l.isLost;
      } else if (statusFilter === 'won') {
        matchesStatus = l.isWon;
      } else if (statusFilter === 'lost') {
        matchesStatus = l.isLost;
      }

      let matchesRecent = true;
      if (statusFilter === 'open' || statusFilter === 'all') {
        if (l.isWon || l.isLost) {
          const lastUpdate = new Date(l.updatedAt);
          if (lastUpdate < cutoffDate) {
            matchesRecent = false;
          }
        }
      }

      return matchesSearch && matchesOwner && matchesDate && matchesStatus && matchesRecent;
    }).map(deal => {
      // Enrich owner info if it matches current user
      if (deal.ownerId === profile?.id || deal.ownerId === (profile as any)?.user_id) { // Fallback for some profile types
        return {
          ...deal,
          owner: {
            name: profile?.nickname || profile?.first_name || 'Eu',
            avatar: profile?.avatar_url || ''
          }
        };
      }
      return deal;
    });
  }, [deals, searchTerm, ownerFilter, dateRange, statusFilter, profile]);

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.setData('dealId', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId') || lastMouseDownDealId.current;
    if (dealId && activeBoard) {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) {
        setDraggingId(null);
        return;
      }

      // Find the target stage to check if it's a won/lost stage
      const targetStage = activeBoard.stages.find(s => s.id === stageId);

      // Check linkedLifecycleStage to determine won/lost status
      if (targetStage?.linkedLifecycleStage === 'OTHER') {
        // Dropping into LOST stage - open modal to ask for reason
        setLossReasonModal({
          isOpen: true,
          dealId,
          dealTitle: deal.title,
          stageId,
        });
      } else {
        // Use unified moveDeal for all other cases (WON or regular stages)
        moveDealMutation.mutate({
          dealId,
          targetStageId: stageId,
          deal,
          board: activeBoard,
          lifecycleStages,
        });
      }
    }
    setDraggingId(null);
  };

  // Handler for loss reason modal confirmation
  const handleLossReasonConfirm = (reason: string) => {
    if (lossReasonModal && activeBoard) {
      const deal = deals.find(d => d.id === lossReasonModal.dealId);
      if (deal) {
        moveDealMutation.mutate({
          dealId: lossReasonModal.dealId,
          targetStageId: lossReasonModal.stageId,
          lossReason: reason,
          deal,
          board: activeBoard,
          lifecycleStages,
        });
      }
      setLossReasonModal(null);
    }
  };

  const handleLossReasonClose = () => {
    // User cancelled - don't move the deal
    setLossReasonModal(null);
  };

  /**
   * Keyboard-accessible handler to move a deal to a new stage.
   * This is the accessibility alternative to drag-and-drop.
   */
  const handleMoveDealToStage = (dealId: string, newStageId: string) => {
    if (!activeBoard) return;

    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;

    // Find the target stage to check if it's a lost stage
    const targetStage = activeBoard.stages.find(s => s.id === newStageId);

    // Check linkedLifecycleStage to determine if this is a loss stage
    if (targetStage?.linkedLifecycleStage === 'OTHER') {
      // Opening a lost stage - need to ask for reason via modal
      setLossReasonModal({
        isOpen: true,
        dealId,
        dealTitle: deal.title,
        stageId: newStageId,
      });
    } else {
      // Regular move or WON stage
      moveDealMutation.mutate({
        dealId,
        targetStageId: newStageId,
        deal,
        board: activeBoard,
        lifecycleStages,
      });
    }
  };

  const handleQuickAddActivity = (
    dealId: string,
    type: 'CALL' | 'MEETING' | 'EMAIL',
    dealTitle: string
  ) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const titles = {
      CALL: 'Ligar para Cliente',
      MEETING: 'Reunião de Acompanhamento',
      EMAIL: 'Enviar Email de Follow-up',
    };

    createActivityMutation.mutate({
      activity: {
        dealId,
        dealTitle,
        type,
        title: titles[type],
        description: 'Agendado via Acesso Rápido',
        date: tomorrow.toISOString(),
        completed: false,
        user: { name: 'Eu', avatar: '' },
      },
    });
    setOpenActivityMenuId(null);
  };

  // Board Management Handlers
  const handleSelectBoard = (boardId: string) => {
    setActiveBoardId(boardId);
  };

  const handleCreateBoard = async (boardData: Omit<Board, 'id' | 'createdAt'>, order?: number) => {
    createBoardMutation.mutate({ board: boardData, order }, {
      onSuccess: newBoard => {
        if (newBoard) {
          setActiveBoardId(newBoard.id);
        }
        setIsCreateBoardModalOpen(false);
        setIsWizardOpen(false);
      },
      onError: (error) => {
        console.error('[handleCreateBoard] Error:', error);
        addToast(error.message || 'Erro ao criar board', 'error');
      },
    });
  };

  const handleEditBoard = (board: Board) => {
    setEditingBoard(board);
    setIsCreateBoardModalOpen(true);
  };

  const handleUpdateBoard = (boardData: Omit<Board, 'id' | 'createdAt'>) => {
    if (editingBoard) {
      updateBoardMutation.mutate(
        {
          id: editingBoard.id,
          updates: {
            name: boardData.name,
            description: boardData.description,
            nextBoardId: boardData.nextBoardId,
            linkedLifecycleStage: boardData.linkedLifecycleStage,
            wonStageId: boardData.wonStageId,
            lostStageId: boardData.lostStageId,
            stages: boardData.stages,
          },
        },
        {
          onSuccess: () => {
            setEditingBoard(null);
            setIsCreateBoardModalOpen(false);
          },
        }
      );
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    const board = boards.find(b => b.id === boardId);
    if (!board) return;

    // Verifica quantos deals tem
    const result = await import('@/lib/supabase/boards').then(m =>
      m.boardsService.canDelete(boardId)
    );

    setBoardToDelete({
      id: boardId,
      name: board.name,
      dealCount: result.dealCount ?? 0
    });
  };

  const confirmDeleteBoard = async () => {
    if (!boardToDelete) return;

    const { targetBoardId } = boardToDelete;

    // Caso 1: Usuário quer deletar os deals junto
    if (targetBoardId === '__DELETE__') {
      try {
        // Deleta todos os deals do board primeiro
        const { dealsService } = await import('@/lib/supabase/deals');
        const { error: deleteDealsError } = await dealsService.deleteByBoardId(boardToDelete.id);

        if (deleteDealsError) {
          addToast('Erro ao excluir negócios: ' + deleteDealsError.message, 'error');
          return;
        }

        // Agora deleta o board
        deleteBoardMutation.mutate(boardToDelete.id, {
          onSuccess: () => {
            addToast(`Board "${boardToDelete.name}" e seus negócios foram excluídos`, 'success');
            if (boardToDelete.id === activeBoardId && defaultBoard && defaultBoard.id !== boardToDelete.id) {
              setActiveBoardId(defaultBoard.id);
            }
            setBoardToDelete(null);
          },
          onError: (error: Error) => {
            addToast(error.message || 'Erro ao excluir board', 'error');
            setBoardToDelete(null);
          },
        });
      } catch (e) {
        addToast('Erro inesperado ao excluir', 'error');
        setBoardToDelete(null);
      }
      return;
    }

    // Caso 2: Mover deals pra outro board
    if (boardToDelete.dealCount > 0 && targetBoardId) {
      deleteBoardWithMoveMutation.mutate(
        { boardId: boardToDelete.id, targetBoardId },
        {
          onSuccess: () => {
            addToast(`Board "${boardToDelete.name}" excluído! Negócios movidos com sucesso.`, 'success');
            if (boardToDelete.id === activeBoardId) {
              setActiveBoardId(targetBoardId);
            }
            setBoardToDelete(null);
          },
          onError: (error: Error) => {
            addToast(error.message || 'Erro ao excluir board', 'error');
            setBoardToDelete(null);
          },
        }
      );
      return;
    }

    // Caso 3: Board sem deals - delete normal
    deleteBoardMutation.mutate(boardToDelete.id, {
      onSuccess: () => {
        addToast(`Board "${boardToDelete.name}" excluído com sucesso`, 'success');
        if (boardToDelete.id === activeBoardId && defaultBoard) {
          setActiveBoardId(defaultBoard.id);
        }
        setBoardToDelete(null);
      },
      onError: (error: Error) => {
        addToast(error.message || 'Erro ao excluir board', 'error');
        setBoardToDelete(null);
      },
    });
  };

  const setTargetBoardForDelete = (targetBoardId: string) => {
    if (boardToDelete) {
      setBoardToDelete({ ...boardToDelete, targetBoardId });
    }
  };

  // Boards disponíveis para mover deals (exclui o board sendo deletado)
  const availableBoardsForMove = useMemo(() => {
    if (!boardToDelete) return [];
    return boards.filter(b => b.id !== boardToDelete.id);
  }, [boards, boardToDelete]);

  return {
    // Boards
    boards,
    boardsLoading, // Specific loading state for boards
    boardsFetched, // True after first successful fetch
    activeBoard,
    activeBoardId: effectiveActiveBoardId, // Sempre retorna o ID válido
    handleSelectBoard,
    handleCreateBoard,
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
    dateRange,
    setDateRange,

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
  };
};

// @deprecated - Use useBoardsController
export const usePipelineController = useBoardsController;

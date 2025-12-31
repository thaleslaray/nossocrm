import React, { useState, useEffect, useMemo, useRef } from 'react';
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

/**
 * Função pública `isDealRotting` do projeto.
 *
 * @param {DealView} deal - Parâmetro `deal`.
 * @returns {boolean} Retorna um valor do tipo `boolean`.
 */
export const isDealRotting = (deal: DealView) => {
  const dateToCheck = deal.lastStageChangeDate || deal.updatedAt;
  const diff = new Date().getTime() - new Date(dateToCheck).getTime();
  const days = diff / (1000 * 3600 * 24);
  return days > 10;
};

/**
 * Função pública `getActivityStatus` do projeto.
 *
 * @param {DealView} deal - Parâmetro `deal`.
 * @returns {"yellow" | "red" | "green" | "gray"} Retorna um valor do tipo `"yellow" | "red" | "green" | "gray"`.
 */
export const getActivityStatus = (deal: DealView) => {
  if (!deal.nextActivity) return 'yellow';
  if (deal.nextActivity.isOverdue) return 'red';
  const activityDate = new Date(deal.nextActivity.date);
  const today = new Date();
  if (activityDate.toDateString() === today.toDateString()) return 'green';
  return 'gray';
};

/**
 * Hook React `useBoardsController` que encapsula uma lógica reutilizável.
 * @returns {{ boards: Board[]; boardsLoading: boolean; boardsFetched: boolean; activeBoard: Board | null; activeBoardId: string | null; handleSelectBoard: (boardId: string) => void; ... 45 more ...; handleLossReasonClose: () => void; }} Retorna um valor do tipo `{ boards: Board[]; boardsLoading: boolean; boardsFetched: boolean; activeBoard: Board | null; activeBoardId: string | null; handleSelectBoard: (boardId: string) => void; ... 45 more ...; handleLossReasonClose: () => void; }`.
 */
export const useBoardsController = () => {
  // #region agent log
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      const isCursorBrowser = navigator.userAgent.includes('Cursor') || window.location.hostname === 'localhost';
      const logData = {sessionId:'debug-session',runId:'boards-controller-init',hypothesisId:'BC1',location:'features/boards/hooks/useBoardsController.ts:useBoardsController',message:'useBoardsController initialized',data:{isCursorBrowser,userAgent:navigator.userAgent.slice(0,50),hostname:window.location.hostname},timestamp:Date.now()};
      fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData)}).catch(()=>{
        // Fallback: log to console if fetch fails (CORS, server down, etc.)
        console.log('[DEBUG]', logData);
      });
    }
  }, []);
  // #endregion

  // Toast for feedback
  const { addToast } = useToast();
  const { profile, organizationId } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // AI Context
  const { setContext, clearContext } = useAI();

  // TanStack Query hooks
  const {
    data: boards = [],
    isLoading: boardsLoading,
    isFetched: boardsFetched,
    isFetching: boardsFetching,
    dataUpdatedAt: boardsUpdatedAt,
  } = useBoards();
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

  // Deals for active board
  // Perf-first: use the persisted activeBoardId to start fetching deals immediately on hard refresh,
  // without waiting for boards list to resolve `activeBoard`.
  // Safety: if the ID is stale (board deleted), the boards effect below will correct activeBoardId
  // and we'll naturally refetch deals for the corrected board.
  const dealsBoardId = activeBoardId || '';
  const { data: deals = [], isLoading: dealsLoading } = useDealsByBoard(dealsBoardId);
  const moveDealMutation = useMoveDeal();
  const createActivityMutation = useCreateActivity();

  // Filter State (declared before AI context useEffect that uses them)
  const [searchTerm, setSearchTerm] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'won' | 'lost' | 'all'>('open');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Track last context signature to avoid unnecessary setContext calls
  const lastContextSignatureRef = useRef<string | null>(null);

  // Set AI Context for Board (FULL CONTEXT)
  useEffect(() => {
    // Performance: noisy logging and object allocation isn't useful in production.
    if (process.env.NODE_ENV !== 'production') {
      console.log('[BoardsController] useEffect running:', {
        hasActiveBoard: !!activeBoard,
        activeBoardId: activeBoard?.id,
        activeBoardName: activeBoard?.name,
        dealsCount: deals.length,
        isTempId: activeBoard?.id?.startsWith('temp-'),
      });
    }

    // Guard: don't set context for temp boards (they'll be replaced soon)
    if (!activeBoard || activeBoard.id.startsWith('temp-')) {
      // #region agent log
      if (process.env.NODE_ENV !== 'production') {
        fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'boards-context-skip',hypothesisId:'CTX1',location:'features/boards/hooks/useBoardsController.ts:useEffect',message:'Skipping context for temp board',data:{hasActiveBoard:!!activeBoard,boardId8:activeBoard?.id?.slice(0,8)},timestamp:Date.now()})}).catch(()=>{});
      }
      // #endregion
      return;
    }

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

    // Compute signature BEFORE calling setContext to avoid unnecessary calls
    // This matches the signature logic in AIContext.tsx
    const contextSignature = [
      activeBoard.id,
      statusFilter,
      ownerFilter,
      searchTerm || '',
      dateRange.start || '',
      dateRange.end || '',
      String(deals.length),
      String(pipelineValue),
      String(stagnantDeals),
      String(overdueDeals),
    ].join('|');

    // Guard: only call setContext if signature actually changed
    if (lastContextSignatureRef.current === contextSignature) {
      // #region agent log
      if (process.env.NODE_ENV !== 'production') {
        fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'boards-context-skip-duplicate',hypothesisId:'CTX2',location:'features/boards/hooks/useBoardsController.ts:useEffect',message:'Skipping setContext - signature unchanged',data:{boardId8:activeBoard.id?.slice(0,8),signature:contextSignature.slice(0,50)},timestamp:Date.now()})}).catch(()=>{});
      }
      // #endregion
      return;
    }

    lastContextSignatureRef.current = contextSignature;

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
    // Note: Removed setContext from dependencies - it has internal guards to prevent loops
    // Note: Removed clearContext cleanup to prevent infinite loop with AIContext default setter
  }, [activeBoard, deals, statusFilter, ownerFilter, searchTerm, dateRange]);

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
  const [boardCreateOverlay, setBoardCreateOverlay] = useState<{
    title: string;
    subtitle?: string;
  } | null>(null);
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
  // Avoid full-page "blink": dealsLoading can briefly flip to true when switching
  // from temp board id -> real board id. Keep the page rendered and let deals load in-place.
  // Also avoid the "empty state flash" on hard refresh: hold the loader until the FIRST successful
  // boards fetch happened (dataUpdatedAt>0). This is more robust than relying solely on `isFetched`,
  // which can be true via cache/hydration even when the live fetch hasn't run yet.
  const hasEverLoadedBoards = boardsUpdatedAt > 0;
  const isLoading = (boardsLoading || boardsFetching || !hasEverLoadedBoards) && boards.length === 0;

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
  const handleDragStart = (e: React.DragEvent, id: string, title: string) => {
    setDraggingId(id);
    e.dataTransfer.setData('dealId', id);
    // Fallback when optimistic temp id gets replaced mid-drag (avoid logging title).
    e.dataTransfer.setData('dealTitle', title || '');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId') || lastMouseDownDealId.current;
    const dealTitle = e.dataTransfer.getData('dealTitle') || '';
    if (dealId && activeBoard) {
      let deal = deals.find(d => d.id === dealId);
      // If the optimistic temp deal ID was replaced by a refetch during drag, try resolving by title.
      if (!deal && dealTitle) {
        const candidates = deals.filter(d => (d.title || '') === dealTitle);
        if (candidates.length === 1) {
          deal = candidates[0];
        } else {
          if (candidates.length > 1) {
            addToast('Não foi possível mover: existem múltiplos negócios com o mesmo título. Aguarde salvar e tente novamente.', 'info');
          }
        }
      }
      if (!deal) {
        setDraggingId(null);
        return;
      }

      // Guard: never send temp-* ids to the backend. This happens when user drags immediately after creating a deal.
      if (deal.id.startsWith('temp-')) {
        addToast('Aguarde o negócio salvar para mover (1s) e tente novamente.', 'info');
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
    if (!deal) {
      return;
    }
    if (deal.id.startsWith('temp-')) {
      addToast('Aguarde o negócio salvar para mover (1s) e tente novamente.', 'info');
      return;
    }

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

    createActivityMutation.mutate(
      {
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
      },
      {}
    );
    setOpenActivityMenuId(null);
  };

  // Board Management Handlers
  const handleSelectBoard = (boardId: string) => {
    setActiveBoardId(boardId);
  };

  const makeTempId = () => {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `temp-${crypto.randomUUID()}`;
      }
    } catch {
      // ignore
    }
    return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  const handleCreateBoard = async (boardData: Omit<Board, 'id' | 'createdAt'>, order?: number) => {
    const previousActiveBoardId = activeBoard?.id || activeBoardId || null;
    const tempId = makeTempId();
    // Make the board feel instant: select the optimistic temp board immediately.
    setActiveBoardId(tempId);
    setBoardCreateOverlay({
      title: 'Criando board…',
      subtitle: boardData?.name ? `— ${boardData.name}` : undefined,
    });

    createBoardMutation.mutate({ board: boardData, order, clientTempId: tempId }, {
      onSuccess: newBoard => {
        try {
          sessionStorage.removeItem('createBoardDraft.v1');
        } catch {
          // noop
        }
        if (newBoard) {
          setActiveBoardId(newBoard.id);
        }
        setBoardCreateOverlay(null);
        setIsCreateBoardModalOpen(false);
        setIsWizardOpen(false);
      },
      onError: (error) => {
        console.error('[handleCreateBoard] Error:', error);
        addToast(error.message || 'Erro ao criar board', 'error');
        setBoardCreateOverlay(null);
        // Restore previous selection if create fails.
        if (previousActiveBoardId) {
          setActiveBoardId(previousActiveBoardId);
        }
        // Re-open modal so user can retry (draft is restored from sessionStorage)
        setIsCreateBoardModalOpen(true);
      },
    });
  };

  /**
   * Async variant used for flows that must preserve order (ex.: importing a Journey JSON).
   * Uses mutateAsync to allow sequential creation without race conditions.
   */
  const createBoardAsync = async (boardData: Omit<Board, 'id' | 'createdAt'>, order?: number) => {
    const previousActiveBoardId = activeBoard?.id || activeBoardId || null;
    try {
      // Mirror the "instant" UX of handleCreateBoard (optimistic temp selection) for async flows too.
      const tempId = makeTempId();
      setActiveBoardId(tempId);
      const newBoard = await createBoardMutation.mutateAsync({ board: boardData, order, clientTempId: tempId });
      setActiveBoardId(newBoard.id);
      return newBoard;
    } catch (error) {
      const err = error as Error;
      console.error('[createBoardAsync] Error:', err);
      addToast(err.message || 'Erro ao criar board', 'error');
      // If we failed after selecting a temp board, try to restore selection.
      if (previousActiveBoardId) setActiveBoardId(previousActiveBoardId);
      throw err;
    }
  };

  /**
   * Async variant used for flows that must update boards after creation
   * (ex.: installing an official Journey and linking boards via nextBoardId).
   */
  const updateBoardAsync = async (id: string, updates: Partial<Board>) => {
    try {
      await updateBoardMutation.mutateAsync({ id, updates });
    } catch (error) {
      const err = error as Error;
      console.error('[updateBoardAsync] Error:', err);
      addToast(err.message || 'Erro ao atualizar board', 'error');
      throw err;
    }
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
    activeBoardId, // Persisted selection (best for perf-first refresh)
    effectiveActiveBoardId, // Actually resolved board id (null until boards arrive)
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
    // UX: global overlay while creating board (start-from-zero flow)
    boardCreateOverlay,
  };
};

// @deprecated - Use useBoardsController
export const usePipelineController = useBoardsController;

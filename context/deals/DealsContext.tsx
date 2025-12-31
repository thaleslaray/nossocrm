import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Deal, DealView, DealItem, Company, Contact, Board } from '@/types';
import { dealsService } from '@/lib/supabase';
import { useAuth } from '../AuthContext';
import { queryKeys, DEALS_VIEW_KEY } from '@/lib/query';
import { useDeals as useTanStackDealsQuery } from '@/lib/query/hooks/useDealsQuery';

interface DealsContextType {
  // Raw data (agora vem direto do TanStack Query)
  rawDeals: Deal[];
  loading: boolean;
  error: string | null;

  // CRUD Operations
  addDeal: (deal: Omit<Deal, 'id' | 'createdAt'>) => Promise<Deal | null>;
  updateDeal: (id: string, updates: Partial<Deal>) => Promise<void>;
  updateDealStatus: (id: string, newStatus: string, lossReason?: string) => Promise<void>;
  deleteDeal: (id: string) => Promise<void>;

  // Items
  addItemToDeal: (dealId: string, item: Omit<DealItem, 'id'>) => Promise<DealItem | null>;
  removeItemFromDeal: (dealId: string, itemId: string) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

const DealsContext = createContext<DealsContextType | undefined>(undefined);

/**
 * Componente React `DealsProvider`.
 *
 * @param {{ children: ReactNode; }} { children } - Parâmetro `{ children }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const DealsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // ============================================
  // TanStack Query como fonte única de verdade
  // ============================================
  const {
    data: rawDeals = [],
    isLoading: loading,
    error: queryError,
  } = useTanStackDealsQuery();

  // Converte erro do TanStack Query para string
  const error = queryError ? (queryError as Error).message : null;

  // Refresh = invalidar cache do TanStack Query
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
  }, [queryClient]);

  // ============================================
  // CRUD Operations - Usam service + invalidam cache
  // ============================================
  const addDeal = useCallback(
    async (deal: Omit<Deal, 'id' | 'createdAt'>): Promise<Deal | null> => {
      if (!profile) {
        console.error('Usuário não autenticado');
        return null;
      }
      const { data, error: addError } = await dealsService.create(deal);

      if (addError) {
        console.error('Erro ao criar deal:', addError.message);
        return null;
      }

      // NÃO invalidar deals aqui! O CRMContext já fez insert otimista e o Realtime
      // também adiciona ao cache. invalidateQueries causaria um refetch que poderia
      // sobrescrever o cache otimista com dados desatualizados (eventual consistency).
      // #region agent log
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DealsContext.addDeal] ✅ Skipping invalidateQueries (cache managed by optimistic+Realtime)`, { dealId: data?.id?.slice(0,8) });
        fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DealsContext.tsx:82',message:'Skipping invalidateQueries',data:{dealId:data?.id?.slice(0,8)},timestamp:Date.now(),sessionId:'debug-session',runId:'crm-create-deal','hypothesisId':'H4'})}).catch(()=>{});
      }
      // #endregion
      // Apenas dashboard stats pode ser invalidado (não afeta deals cache)
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });

      return data;
    },
    [profile, queryClient]
  );

  const updateDeal = useCallback(async (id: string, updates: Partial<Deal>) => {
    // Optimistic update - atualiza a UI imediatamente
    queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) =>
      old.map(deal =>
        deal.id === id ? { ...deal, ...updates, updatedAt: new Date().toISOString() } : deal
      )
    );

    const { error: updateError } = await dealsService.update(id, updates);

    if (updateError) {
      console.error('Erro ao atualizar deal:', updateError.message);
      // Rollback: invalida para refetch em caso de erro
      await queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
      return;
    }

    // Sucesso: Realtime vai sincronizar. Não precisa de invalidateQueries.
  }, [queryClient]);

  const updateDealStatus = useCallback(
    async (id: string, newStatus: string, lossReason?: string) => {
      const updates: Partial<Deal> = {
        status: newStatus as Deal['status'],
        lastStageChangeDate: new Date().toISOString(),
        ...(lossReason && { lossReason }),
        ...(newStatus === 'WON' && { closedAt: new Date().toISOString(), isWon: true }),
        ...(newStatus === 'LOST' && { closedAt: new Date().toISOString(), isLost: true }),
      };

      await updateDeal(id, updates);
    },
    [updateDeal]
  );

  const deleteDeal = useCallback(async (id: string) => {
    // Optimistic update - remove da UI imediatamente
    queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) =>
      old.filter(deal => deal.id !== id)
    );

    const { error: deleteError } = await dealsService.delete(id);

    if (deleteError) {
      console.error('Erro ao deletar deal:', deleteError.message);
      // Rollback: invalida para refetch em caso de erro
      await queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
      return;
    }

    // Sucesso: atualiza stats do dashboard
    await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
  }, [queryClient]);

  // ============================================
  // Items Operations
  // ============================================
  const addItemToDeal = useCallback(
    async (dealId: string, item: Omit<DealItem, 'id'>): Promise<DealItem | null> => {
      const { data, error: addError } = await dealsService.addItem(dealId, item);

      if (addError) {
        console.error('Erro ao adicionar item:', addError.message);
        return null;
      }

      // Invalida cache para TanStack Query atualizar
      await queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });

      return data;
    },
    [queryClient]
  );

  const removeItemFromDeal = useCallback(async (dealId: string, itemId: string) => {
    const { error: removeError } = await dealsService.removeItem(dealId, itemId);

    if (removeError) {
      console.error('Erro ao remover item:', removeError.message);
      return;
    }

    // Invalida cache para TanStack Query atualizar
    await queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
  }, [queryClient]);

  const value = useMemo(
    () => ({
      rawDeals,
      loading,
      error,
      addDeal,
      updateDeal,
      updateDealStatus,
      deleteDeal,
      addItemToDeal,
      removeItemFromDeal,
      refresh,
    }),
    [
      rawDeals,
      loading,
      error,
      addDeal,
      updateDeal,
      updateDealStatus,
      deleteDeal,
      addItemToDeal,
      removeItemFromDeal,
      refresh,
    ]
  );

  return <DealsContext.Provider value={value}>{children}</DealsContext.Provider>;
};

/**
 * Hook React `useDeals` que encapsula uma lógica reutilizável.
 * @returns {DealsContextType} Retorna um valor do tipo `DealsContextType`.
 */
export const useDeals = () => {
  const context = useContext(DealsContext);
  if (context === undefined) {
    throw new Error('useDeals must be used within a DealsProvider');
  }
  return context;
};

// Hook para deals com view projection (desnormalizado)
/**
 * Hook React `useDealsView` que encapsula uma lógica reutilizável.
 *
 * @param {Record<string, Organization>} companyMap - Parâmetro `companyMap`.
 * @param {Record<string, Contact>} contactMap - Parâmetro `contactMap`.
 * @param {Board[]} boards - Parâmetro `boards`.
 * @returns {DealView[]} Retorna um valor do tipo `DealView[]`.
 */
export const useDealsView = (
  companyMap: Record<string, Company>,
  contactMap: Record<string, Contact>,
  boards: Board[] = []
): DealView[] => {
  const { rawDeals } = useDeals();

  return useMemo(() => {
    return rawDeals.map(deal => {
      // Find the stage label from the board stages
      const board = boards.find(b => b.id === deal.boardId);
      const stage = board?.stages?.find(s => s.id === deal.status);

      return {
        ...deal,
        companyName: deal.companyId ? companyMap[deal.companyId]?.name : undefined,
        clientCompanyName: (deal.clientCompanyId || deal.companyId)
          ? companyMap[(deal.clientCompanyId || deal.companyId) as string]?.name
          : undefined,
        contactName: deal.contactId ? (contactMap[deal.contactId]?.name || 'Sem Contato') : 'Sem Contato',
        contactEmail: deal.contactId ? (contactMap[deal.contactId]?.email || '') : '',
        stageLabel: stage?.label || 'Desconhecido',
      };
    });
  }, [rawDeals, companyMap, contactMap, boards]);
};

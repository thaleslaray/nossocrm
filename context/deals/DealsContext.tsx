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
import { queryKeys } from '@/lib/query';
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

      // Invalida cache para TanStack Query atualizar
      // Important: don't await invalidations. Awaiting can block UI flows until heavy refetches finish.
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });

      return data;
    },
    [profile, queryClient]
  );

  const updateDeal = useCallback(async (id: string, updates: Partial<Deal>) => {
    const { error: updateError } = await dealsService.update(id, updates);

    if (updateError) {
      console.error('Erro ao atualizar deal:', updateError.message);
      return;
    }

    // Invalida TODO o cache de deals (all + lists + details)
    // queryKeys.deals.all = ['deals'] - isso invalida TODAS as queries que começam com 'deals'
    await queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
    // Invalida também as listas explicitamente para garantir que o Kanban seja atualizado
    await queryClient.invalidateQueries({ queryKey: queryKeys.deals.lists() });
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
    const { error: deleteError } = await dealsService.delete(id);

    if (deleteError) {
      console.error('Erro ao deletar deal:', deleteError.message);
      return;
    }

    // Invalida cache para TanStack Query atualizar
    await queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
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

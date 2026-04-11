/**
 * TanStack Query hooks for Deals - Supabase Edition
 *
 * Features:
 * - Real Supabase API calls
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 * - Ready for Realtime integration
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, DEALS_VIEW_KEY } from '../index';
import { dealsService, contactsService, companiesService, boardStagesService } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Deal, DealView, DealItem, Contact } from '@/types';

// ============ QUERY HOOKS ============

// Stable selector factory — must be at module level to avoid new reference per render
const makeSelectByBoard = (boardId: string) => (data: DealView[]) => {
  if (!boardId || boardId.startsWith('temp-')) return [];
  return data.filter(d => d.boardId === boardId);
};

/**
 * Base queryFn para DEALS_VIEW_KEY.
 *
 * Extraída ao nível de módulo para ser reutilizada em:
 * - useDealsView (sem filtros)
 * - useDealsByBoard (filtra via select)
 * - usePrefetchRoute (prefetch antecipado na navegação)
 *
 * Sempre produz DealView[] completo; filtragem é responsabilidade do caller.
 */
export const dealsViewQueryFn = async (
  { signal }: { signal?: AbortSignal } = {}
): Promise<DealView[]> => {
  const [dealsResult, stagesResult] = await Promise.all([
    dealsService.getAll({ signal }),
    boardStagesService.getAll({ signal }),
  ]);

  if (dealsResult.error) throw dealsResult.error;

  const deals = dealsResult.data || [];
  const stages = stagesResult.data || [];

  const contactIds = deals.map(d => d.contactId).filter(Boolean);
  const companyIds = deals.map(d => d.clientCompanyId).filter(Boolean) as string[];

  const [contactsResult, companiesResult] = await Promise.all([
    contactsService.getByIds(contactIds, { signal }),
    companiesService.getByIds(companyIds, { signal }),
  ]);

  const contactMap = new Map((contactsResult.data || []).map(c => [c.id, c]));
  const companyMap = new Map((companiesResult.data || []).map(c => [c.id, c]));
  const stageMap = new Map(stages.map(s => [s.id, s.label || s.name]));

  return deals.map(deal => {
    const contact = contactMap.get(deal.contactId);
    const company = deal.clientCompanyId ? companyMap.get(deal.clientCompanyId) : undefined;
    return {
      ...deal,
      companyName: company?.name || 'Sem empresa',
      contactName: contact?.name || 'Sem contato',
      contactEmail: contact?.email || '',
      stageLabel: stageMap.get(deal.status) || 'Estágio não identificado',
    };
  });
};

export interface DealsFilters {
  boardId?: string;
  /** Stage id (UUID) do board_stages */
  status?: string;
  search?: string;
  minValue?: number;
  maxValue?: number;
}

/**
 * Hook to fetch all deals with optional filters
 * Waits for auth to be ready before fetching to ensure RLS works correctly
 */
export const useDeals = (filters?: DealsFilters, options?: { enabled?: boolean }) => {
  const { user, loading: authLoading } = useAuth();
  const externalEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: filters
      ? queryKeys.deals.list(filters as Record<string, unknown>)
      : queryKeys.deals.lists(),
    queryFn: async ({ signal }) => {
      const { data, error } = await dealsService.getAll({ signal });
      if (error) throw error;

      let deals = data || [];

      // Apply client-side filters
      if (filters) {
        deals = deals.filter(deal => {
          if (filters.boardId && deal.boardId !== filters.boardId) return false;
          if (filters.status && deal.status !== filters.status) return false;
          if (filters.minValue && deal.value < filters.minValue) return false;
          if (filters.maxValue && deal.value > filters.maxValue) return false;
          if (filters.search) {
            const search = filters.search.toLowerCase();
            if (!(deal.title || '').toLowerCase().includes(search)) return false;
          }
          return true;
        });
      }

      return deals;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !authLoading && !!user && externalEnabled,
  });
};

/**
 * Hook to fetch all deals with enriched company/contact data (DealView)
 * Waits for auth to be ready before fetching to ensure RLS works correctly
 */
export const useDealsView = (filters?: DealsFilters) => {
  const { user, loading: authLoading } = useAuth();

  return useQuery<DealView[]>({
    queryKey: filters
      ? [...queryKeys.deals.list(filters as Record<string, unknown>), 'view']
      : [...queryKeys.deals.lists(), 'view'],
    queryFn: async ({ signal }) => {
      const deals = await dealsViewQueryFn({ signal });
      if (!filters) return deals;

      return deals.filter(deal => {
        if (filters.boardId && deal.boardId !== filters.boardId) return false;
        if (filters.status && deal.status !== filters.status) return false;
        if (filters.minValue && deal.value < filters.minValue) return false;
        if (filters.maxValue && deal.value > filters.maxValue) return false;
        if (filters.search) {
          const search = filters.search.toLowerCase();
          if (
            !(deal.title || '').toLowerCase().includes(search) &&
            !(deal.companyName || '').toLowerCase().includes(search)
          )
            return false;
        }
        return true;
      });
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !authLoading && !!user, // Only fetch when auth is ready
  });
};

/**
 * Hook to fetch a single deal by ID
 */
export const useDeal = (id: string | undefined) => {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.deals.detail(id || ''),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await dealsService.getById(id);
      if (error) throw error;
      return data;
    },
    enabled: !authLoading && !!user && !!id,
  });
};

/**
 * Hook to fetch deals by board (for Kanban view) - Returns DealView[]
 * 
 * IMPORTANTE: Este hook usa a MESMA query key que useDealsView para garantir
 * que todos os componentes compartilhem o mesmo cache (Single Source of Truth).
 * A filtragem por boardId é feita via `select` no cliente.
 */
export const useDealsByBoard = (boardId: string) => {
  const { user, loading: authLoading } = useAuth();
  const selectForBoard = useMemo(() => makeSelectByBoard(boardId), [boardId]);
  return useQuery<DealView[], Error, DealView[]>({
    // CRÍTICO: Usar a mesma query key que useDealsView para compartilhar cache
    queryKey: [...queryKeys.deals.lists(), 'view'],
    queryFn: ({ signal }) => dealsViewQueryFn({ signal }),
    // Filtrar por boardId no cliente (compartilha cache mas retorna só os deals do board)
    select: selectForBoard,
    staleTime: 2 * 60 * 1000, // 2 minutes (same as useDealsView)
    enabled: !authLoading && !!user && !!boardId && !boardId.startsWith('temp-'),
  });
};

// ============ MUTATION HOOKS ============

// Input type for creating a deal (without auto-generated fields)
// isWon and isLost are optional and default to false
export type CreateDealInput = Omit<Deal, 'id' | 'createdAt' | 'updatedAt' | 'isWon' | 'isLost'> & {
  isWon?: boolean;
  isLost?: boolean;
};

/**
 * Hook to create a new deal
 */
export const useCreateDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deal: CreateDealInput) => {
      // organization_id will be auto-set by trigger on server
      const fullDeal = {
        ...deal,
        isWon: deal.isWon ?? false,
        isLost: deal.isLost ?? false,
        updatedAt: new Date().toISOString(),
      };

      // #region agent log
      if (process.env.NODE_ENV !== 'production') {
        const logData = { title: deal.title, status: deal.status?.slice(0, 8) || 'null' };
        console.log(`[useCreateDeal] 📤 Sending create to server`, logData);
      }
      // #endregion

      // Passa null ao invés de '' - o trigger vai preencher automaticamente
      const { data, error } = await dealsService.create(fullDeal);

      if (error) throw error;
      
      // #region agent log
      if (process.env.NODE_ENV !== 'production') {
        const logData = { dealId: data?.id?.slice(0, 8) || 'null', title: data?.title };
        console.log(`[useCreateDeal] ✅ Server confirmed creation`, logData);
      }
      // #endregion
      
      return data!;
    },
    onMutate: async newDeal => {
      await queryClient.cancelQueries({ queryKey: queryKeys.deals.all });

      // Usa DEALS_VIEW_KEY - a única fonte de verdade
      const previousDeals = queryClient.getQueryData<DealView[]>(DEALS_VIEW_KEY);

      // Optimistic update with temp ID - cria DealView parcial
      const tempId = `temp-${Date.now()}`;
      const tempDealView: DealView = {
        ...newDeal,
        id: tempId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isWon: newDeal.isWon ?? false,
        isLost: newDeal.isLost ?? false,
        // Campos enriquecidos ficam vazios até Realtime atualizar
        companyName: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        stageLabel: '',
      } as DealView;

      // #region agent log
      if (process.env.NODE_ENV !== 'production') {
        const logData = { tempId: tempId.slice(0, 15), title: newDeal.title, status: newDeal.status?.slice(0, 8) || 'null' };
        console.log(`[useCreateDeal] 🔄 Optimistic insert with temp ID`, logData);
      }
      // #endregion

      queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) => [tempDealView, ...old]);

      return { previousDeals, tempId };
    },
    onSuccess: (data, _variables, context) => {
      // Replace temp deal with real one from server
      // This ensures immediate UI update while Realtime syncs in background
      const tempId = context?.tempId;
      
      // #region agent log
      if (process.env.NODE_ENV !== 'production') {
        const logData = { tempId: tempId?.slice(0, 15) || 'null', realId: data.id?.slice(0, 8) || 'null', title: data.title };
        console.log(`[useCreateDeal] 🔄 Replacing temp deal with real one`, logData);
      }
      // #endregion
      
      // Usa DEALS_VIEW_KEY - a única fonte de verdade
      // Converte Deal para DealView parcial (Realtime vai enriquecer depois)
      const dealAsView: DealView = {
        ...data,
        companyName: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        stageLabel: '',
      } as DealView;
      
      queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) => {
        if (!old) return [dealAsView];
        
        // Check if deal already exists (race condition: Realtime may have already added it)
        const existingIndex = old.findIndex(d => d.id === data.id);
        if (existingIndex !== -1) {
          // Deal already exists (Realtime beat us), keep the existing one (it has enriched data)
          // #region agent log
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[useCreateDeal] ⚠️ Deal already exists in cache (Realtime beat us)`, { dealId: data.id?.slice(0, 8) });
          }
          // #endregion
          return old; // Não sobrescreve - Realtime já tem dados enriquecidos
        }
        
        if (tempId) {
          // Remove temp deal, add real one
          const withoutTemp = old.filter(d => d.id !== tempId);
          // #region agent log
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[useCreateDeal] ✅ Swapped temp for real deal`, { tempId: tempId.slice(0, 15), realId: data.id?.slice(0, 8), cacheSize: withoutTemp.length + 1 });
          }
          // #endregion
          return [dealAsView, ...withoutTemp];
        }
        
        // If temp not found, just add the new one
        return [dealAsView, ...old];
      });
    },
    onError: (_error, _newDeal, context) => {
      if (context?.previousDeals) {
        // Restaura o estado anterior usando DEALS_VIEW_KEY
        queryClient.setQueryData(DEALS_VIEW_KEY, context.previousDeals);
      }
    },
    onSettled: () => {
      // NÃO fazer invalidateQueries para deals - Realtime gerencia a sincronização
      // Isso evita race conditions onde o refetch sobrescreve o cache otimista
      // Apenas atualiza stats do dashboard
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
};

/**
 * Hook to update a deal
 * Usa DEALS_VIEW_KEY como única fonte de verdade
 */
export const useUpdateDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Deal> }) => {
      const { error } = await dealsService.update(id, updates);
      if (error) throw error;
      return { id, updates };
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.deals.all });

      // Usa DEALS_VIEW_KEY - a única fonte de verdade
      const previousDeals = queryClient.getQueryData<DealView[]>(DEALS_VIEW_KEY);

      queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) =>
        old.map(deal =>
          deal.id === id ? { ...deal, ...updates, updatedAt: new Date().toISOString() } : deal
        )
      );

      // Also update detail cache
      queryClient.setQueryData<Deal>(queryKeys.deals.detail(id), old =>
        old ? { ...old, ...updates, updatedAt: new Date().toISOString() } : old
      );

      return { previousDeals };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousDeals) {
        queryClient.setQueryData(DEALS_VIEW_KEY, context.previousDeals);
      }
    },
    onSettled: (_data, _error, { id }) => {
      // NÃO fazer invalidateQueries para deals - Realtime gerencia a sincronização
      // Apenas invalidar o detalhe específico se necessário
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(id) });
    },
  });
};

/**
 * Hook to update deal status (for drag & drop in Kanban)
 * @deprecated Use useMoveDeal instead - this hook is not used anywhere
 * Usa DEALS_VIEW_KEY como única fonte de verdade
 */
export const useUpdateDealStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      lossReason,
      isWon,
      isLost,
    }: {
      id: string;
      status: string;
      lossReason?: string;
      isWon?: boolean;
      isLost?: boolean;
    }) => {
      const updates: Partial<Deal> = {
        status,
        lastStageChangeDate: new Date().toISOString(),
        ...(lossReason && { lossReason }),
      };

      if (isWon !== undefined) {
        updates.isWon = isWon;
        if (isWon) updates.closedAt = new Date().toISOString();
      }
      if (isLost !== undefined) {
        updates.isLost = isLost;
        if (isLost) updates.closedAt = new Date().toISOString();
      }
      if (isWon === false && isLost === false) {
        updates.closedAt = null as unknown as string;
      }

      const { error } = await dealsService.update(id, updates);
      if (error) throw error;
      return { id, status, lossReason, isWon, isLost };
    },
    onMutate: async ({ id, status, lossReason, isWon, isLost }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.deals.all });

      // Usa DEALS_VIEW_KEY - única fonte de verdade
      const previousDeals = queryClient.getQueryData<DealView[]>(DEALS_VIEW_KEY);

      queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) =>
        old.map(deal =>
          deal.id === id
            ? {
              ...deal,
              status,
              lastStageChangeDate: new Date().toISOString(),
              ...(lossReason && { lossReason }),
              ...(isWon !== undefined && { isWon }),
              ...(isLost !== undefined && { isLost }),
            }
            : deal
        )
      );

      return { previousDeals };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousDeals) {
        queryClient.setQueryData(DEALS_VIEW_KEY, context.previousDeals);
      }
    },
    onSettled: () => {
      // NÃO fazer invalidateQueries - Realtime gerencia a sincronização
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
};

/**
 * Hook to delete a deal
 * Usa DEALS_VIEW_KEY como única fonte de verdade
 */
export const useDeleteDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dealsService.delete(id);
      if (error) throw error;
      return id;
    },
    onMutate: async id => {
      await queryClient.cancelQueries({ queryKey: queryKeys.deals.all });

      // Usa DEALS_VIEW_KEY - a única fonte de verdade
      const previousDeals = queryClient.getQueryData<DealView[]>(DEALS_VIEW_KEY);

      queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) =>
        old.filter(deal => deal.id !== id)
      );

      return { previousDeals };
    },
    onError: (_error, _id, context) => {
      if (context?.previousDeals) {
        queryClient.setQueryData(DEALS_VIEW_KEY, context.previousDeals);
      }
    },
    onSettled: () => {
      // NÃO fazer invalidateQueries para deals - Realtime gerencia a sincronização
      // Apenas atualiza stats do dashboard
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
};

// ============ DEAL ITEMS MUTATIONS ============

/**
 * Hook to add an item to a deal
 */
export const useAddDealItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, item }: { dealId: string; item: Omit<DealItem, 'id'> }) => {
      const { data, error } = await dealsService.addItem(dealId, item);
      if (error) throw error;
      return { dealId, item: data! };
    },
    onSettled: (_data, _error, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.lists() });
    },
  });
};

/**
 * Hook to remove an item from a deal
 */
export const useRemoveDealItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, itemId }: { dealId: string; itemId: string }) => {
      const { error } = await dealsService.removeItem(dealId, itemId);
      if (error) throw error;
      return { dealId, itemId };
    },
    onSettled: (_data, _error, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.detail(dealId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.lists() });
    },
  });
};

// ============ UTILITY HOOKS ============

/**
 * Hook to invalidate all deals queries (useful after bulk operations)
 */
export const useInvalidateDeals = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
};

/**
 * Hook to prefetch a deal (for hover previews)
 */
export const usePrefetchDeal = () => {
  const queryClient = useQueryClient();
  return async (id: string) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.deals.detail(id),
      queryFn: async () => {
        const { data, error } = await dealsService.getById(id);
        if (error) throw error;
        return data;
      },
      staleTime: 5 * 60 * 1000,
    });
  };
};

/**
 * Hook to create a deal together with an optional contact and/or company.
 * Performs an optimistic insert into DEALS_VIEW_KEY cache and replaces the
 * temporary entry with the real server response on success.
 */
export const useCreateDealWithContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deal,
      relatedData,
    }: {
      deal: Omit<Deal, 'id' | 'createdAt'>;
      relatedData?: { contact?: Partial<Contact>; companyName?: string };
    }) => {
      let finalCompanyId = deal.companyId;
      let finalContactId = deal.contactId;

      // Create company if name provided
      if (relatedData?.companyName) {
        const { data: company, error: companyError } = await companiesService.create({ name: relatedData.companyName });
        if (companyError) throw companyError;
        if (company) finalCompanyId = company.id;
      }

      // Create contact if provided
      if (relatedData?.contact?.name) {
        const { data: contact, error: contactError } = await contactsService.create({
          name: relatedData.contact.name,
          email: relatedData.contact.email || '',
          phone: relatedData.contact.phone || '',
          companyId: finalCompanyId,
          status: 'ACTIVE',
          stage: 'LEAD',
        });
        if (contactError) throw contactError;
        if (contact) finalContactId = contact.id;
      }

      const { data: createdDeal, error } = await dealsService.create({
        ...deal,
        companyId: finalCompanyId,
        contactId: finalContactId,
      });
      if (error) throw error;
      return createdDeal!;
    },
    onMutate: async ({ deal, relatedData }) => {
      await queryClient.cancelQueries({ queryKey: DEALS_VIEW_KEY });
      const tempId = `temp-${Date.now()}`;
      const tempDeal: DealView = {
        ...(deal as any),
        id: tempId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        contactName: relatedData?.contact?.name || 'Sem contato',
        contactEmail: relatedData?.contact?.email || '',
        contactPhone: '',
        companyName: relatedData?.companyName || 'Sem empresa',
        clientCompanyName: relatedData?.companyName || 'Sem empresa',
        stageLabel: 'Novo',
        isWon: false,
        isLost: false,
      } as DealView;
      queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) => [tempDeal, ...old]);
      return { tempId };
    },
    onSuccess: (data, _vars, context) => {
      const { tempId } = context as { tempId: string };
      const dealAsView: DealView = {
        ...data,
        companyName: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        stageLabel: '',
      } as DealView;
      queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) => {
        const withoutTemp = old.filter((d) => d.id !== tempId);
        return [dealAsView, ...withoutTemp];
      });
    },
    onError: (_err, _vars, context) => {
      const tempId = (context as any)?.tempId as string | undefined;
      if (tempId) {
        queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, (old = []) => old.filter(d => d.id !== tempId));
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
    },
  });
};

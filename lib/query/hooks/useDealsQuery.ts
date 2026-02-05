/**
 * TanStack Query hooks for Deals - Supabase Edition
 *
 * Features:
 * - Real Supabase API calls
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 * - Ready for Realtime integration
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, DEALS_VIEW_KEY } from '../index';
import { dealsService, contactsService, companiesService, boardStagesService } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Deal, DealView, DealItem } from '@/types';

// ============ QUERY HOOKS ============

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
export const useDeals = (filters?: DealsFilters) => {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: filters
      ? queryKeys.deals.list(filters as Record<string, unknown>)
      : queryKeys.deals.lists(),
    queryFn: async () => {
      const { data, error } = await dealsService.getAll();
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
    enabled: !authLoading && !!user, // Only fetch when auth is ready
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
    queryFn: async () => {
      // Step 1: Fetch deals and stages first (always needed)
      const [dealsResult, stagesResult] = await Promise.all([
        dealsService.getAll(),
        boardStagesService.getAll(),
      ]);

      if (dealsResult.error) throw dealsResult.error;

      const deals = dealsResult.data || [];
      const stages = stagesResult.data || [];

      // Step 2: Extract unique IDs referenced by deals (avoid fetching unused data)
      const contactIds = deals.map(d => d.contactId).filter(Boolean);
      const companyIds = deals.map(d => d.clientCompanyId).filter(Boolean) as string[];

      // Step 3: Fetch only referenced contacts and companies in parallel
      const [contactsResult, companiesResult] = await Promise.all([
        contactsService.getByIds(contactIds),
        companiesService.getByIds(companyIds),
      ]);

      const contacts = contactsResult.data || [];
      const companies = companiesResult.data || [];

      // Create lookup maps
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const stageMap = new Map(stages.map(s => [s.id, s.label || s.name]));

      // Enrich deals with company/contact names and stageLabel
      let enrichedDeals: DealView[] = deals.map(deal => {
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

      // Apply client-side filters
      if (filters) {
        enrichedDeals = enrichedDeals.filter(deal => {
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
      }

      return enrichedDeals;
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
  return useQuery<DealView[], Error, DealView[]>({
    // CRÍTICO: Usar a mesma query key que useDealsView para compartilhar cache
    queryKey: [...queryKeys.deals.lists(), 'view'],
    queryFn: async () => {
      // Step 1: Fetch deals and stages first
      const [dealsResult, stagesResult] = await Promise.all([
        dealsService.getAll(),
        boardStagesService.getAll(),
      ]);

      if (dealsResult.error) throw dealsResult.error;

      const deals = dealsResult.data || [];
      const stages = stagesResult.data || [];

      // Step 2: Extract unique IDs referenced by deals
      const contactIds = deals.map(d => d.contactId).filter(Boolean);
      const companyIds = deals.map(d => d.clientCompanyId).filter(Boolean) as string[];

      // Step 3: Fetch only referenced contacts and companies
      const [contactsResult, companiesResult] = await Promise.all([
        contactsService.getByIds(contactIds),
        companiesService.getByIds(companyIds),
      ]);

      const contacts = contactsResult.data || [];
      const companies = companiesResult.data || [];

      // Create lookup maps
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const companyMap = new Map(companies.map(c => [c.id, c]));
      const stageMap = new Map(stages.map(s => [s.id, s.label || s.name]));

      // Enrich ALL deals (filtering happens in select)
      const enrichedDeals: DealView[] = deals.map(deal => {
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
      return enrichedDeals;
    },
    // Filtrar por boardId no cliente (compartilha cache mas retorna só os deals do board)
    select: (data) => {
      if (!boardId || boardId.startsWith('temp-')) return [];
      return data.filter(d => d.boardId === boardId);
    },
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
        fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useDealsQuery.ts:230',message:'Sending create to server',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'create-deal',hypothesisId:'CD1'})}).catch(()=>{});
      }
      // #endregion

      // Passa null ao invés de '' - o trigger vai preencher automaticamente
      const { data, error } = await dealsService.create(fullDeal);

      if (error) throw error;
      
      // #region agent log
      if (process.env.NODE_ENV !== 'production') {
        const logData = { dealId: data?.id?.slice(0, 8) || 'null', title: data?.title };
        console.log(`[useCreateDeal] ✅ Server confirmed creation`, logData);
        fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useDealsQuery.ts:240',message:'Server confirmed creation',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'create-deal',hypothesisId:'CD2'})}).catch(()=>{});
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
        fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useDealsQuery.ts:260',message:'Optimistic insert with temp ID',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'create-deal',hypothesisId:'CD3'})}).catch(()=>{});
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
        fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useDealsQuery.ts:280',message:'Replacing temp deal with real one',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'create-deal',hypothesisId:'CD4'})}).catch(()=>{});
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
            fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useDealsQuery.ts:290',message:'Deal already exists in cache',data:{dealId:data.id?.slice(0,8)},timestamp:Date.now(),sessionId:'debug-session',runId:'create-deal',hypothesisId:'CD5'})}).catch(()=>{});
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
            fetch('http://127.0.0.1:7242/ingest/d70f541c-09d7-4128-9745-93f15f184017',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useDealsQuery.ts:300',message:'Swapped temp for real deal',data:{tempId:tempId.slice(0,15),realId:data.id?.slice(0,8),cacheSize:withoutTemp.length+1},timestamp:Date.now(),sessionId:'debug-session',runId:'create-deal',hypothesisId:'CD6'})}).catch(()=>{});
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

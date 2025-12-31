import { createQueryKeys, createExtendedQueryKeys } from './createQueryKeys';
import { PaginationState, ContactsServerFilters } from '@/types';

/**
 * Query keys centralizadas para gerenciamento de cache.
 * 
 * Usar estas keys garante consistência na invalidação e prefetch.
 * Pattern: `queryKeys.entity.action(params)`
 * 
 * @example
 * ```typescript
 * // Invalidar todos os deals
 * queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
 * 
 * // Invalidar deals de um board específico
 * queryClient.invalidateQueries({ 
 *   queryKey: queryKeys.deals.list({ boardId: 'xxx' }) 
 * });
 * ```
 */
export const queryKeys = {
    // Standard entity keys (using factory)
    deals: createQueryKeys('deals'),

    // Contacts with custom extension for paginated queries and stage counts
    contacts: createExtendedQueryKeys('contacts', base => ({
        paginated: (pagination: PaginationState, filters?: ContactsServerFilters) =>
            [...base.all, 'paginated', pagination, filters] as const,
        stageCounts: () => [...base.all, 'stageCounts'] as const,
    })),

    companies: createQueryKeys('companies'),
    boards: createQueryKeys('boards'),

    // Activities with custom extension for byDeal
    activities: createExtendedQueryKeys('activities', base => ({
        byDeal: (dealId: string) => [...base.all, 'deal', dealId] as const,
    })),

    // Dashboard (non-standard structure)
    dashboard: {
        stats: ['dashboard', 'stats'] as const,
        funnel: ['dashboard', 'funnel'] as const,
        timeline: ['dashboard', 'timeline'] as const,
    },
};

/**
 * Constante para a query key da view de deals (DealView[]).
 * Esta é a ÚNICA fonte de verdade para deals no Kanban e outras UIs.
 * Todos os pontos de escrita (mutations, Realtime, otimismo) devem usar esta key.
 * 
 * @example
 * ```typescript
 * // Leitura
 * const { data } = useQuery({ queryKey: DEALS_VIEW_KEY, ... });
 * 
 * // Escrita
 * queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, ...);
 * ```
 */
export const DEALS_VIEW_KEY = [...queryKeys.deals.lists(), 'view'] as const;

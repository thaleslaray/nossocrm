'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys, DEALS_VIEW_KEY } from '../queryKeys';
import { dealsViewQueryFn } from './useDealsQuery';
import { boardsService, contactsService, companiesService, activitiesService, dealsService } from '@/lib/supabase';

const STALE_30S  = 30  * 1000;
const STALE_2MIN =  2  * 60 * 1000;
const STALE_5MIN =  5  * 60 * 1000;

type PrefetchEntry = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  staleTime: number;
};

/**
 * Mapa rota → queries que devem ser pré-aquecidas.
 *
 * Regra: queryKey e staleTime devem ser idênticos aos dos hooks reais,
 * para que o dado prefetchado seja aproveitado sem re-fetch ao montar.
 */
const ROUTE_PREFETCH: Readonly<Record<string, PrefetchEntry[]>> = {
  '/boards': [
    {
      queryKey: DEALS_VIEW_KEY,
      queryFn: () => dealsViewQueryFn(),
      staleTime: STALE_2MIN,
    },
    {
      queryKey: queryKeys.boards.lists(),
      queryFn: async () => {
        const { data, error } = await boardsService.getAll();
        if (error) throw error;
        return data ?? [];
      },
      staleTime: STALE_5MIN,
    },
  ],

  '/contacts': [
    {
      queryKey: queryKeys.contacts.lists(),
      queryFn: async () => {
        const { data, error } = await contactsService.getAll();
        if (error) throw error;
        return data ?? [];
      },
      staleTime: STALE_2MIN,
    },
    {
      queryKey: queryKeys.companies.lists(),
      queryFn: async () => {
        const { data, error } = await companiesService.getAll();
        if (error) throw error;
        return data ?? [];
      },
      staleTime: STALE_5MIN,
    },
  ],

  '/activities': [
    {
      queryKey: queryKeys.activities.lists(),
      queryFn: async () => {
        const { data, error } = await activitiesService.getAll();
        if (error) throw error;
        return data ?? [];
      },
      staleTime: STALE_30S,
    },
    {
      // useActivitiesController usa useDeals() → queryKeys.deals.lists() + dealsService.getAll()
      queryKey: queryKeys.deals.lists(),
      queryFn: async () => {
        const { data, error } = await dealsService.getAll({});
        if (error) throw error;
        return data ?? [];
      },
      staleTime: STALE_2MIN,
    },
  ],

  '/dashboard': [
    {
      queryKey: DEALS_VIEW_KEY,
      queryFn: () => dealsViewQueryFn(),
      staleTime: STALE_2MIN,
    },
    {
      queryKey: queryKeys.boards.lists(),
      queryFn: async () => {
        const { data, error } = await boardsService.getAll();
        if (error) throw error;
        return data ?? [];
      },
      staleTime: STALE_5MIN,
    },
  ],
};

/**
 * Hook que retorna uma função `prefetch(href)` estável.
 *
 * Chame no `onMouseEnter` dos links de navegação para pré-aquecer o cache
 * antes do usuário clicar. TanStack Query ignora o prefetch automaticamente
 * se os dados já estiverem dentro do staleTime.
 *
 * @example
 * ```tsx
 * const prefetch = usePrefetchRoute();
 * <Link href="/boards" onMouseEnter={() => prefetch('/boards')}>...</Link>
 * ```
 */
export function usePrefetchRoute() {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();

  return useCallback(
    (href: string) => {
      // Não prefetch sem auth — as queries dependem de RLS do Supabase
      if (authLoading || !user) return;

      const entries = ROUTE_PREFETCH[href];
      if (!entries) return;

      for (const { queryKey, queryFn, staleTime } of entries) {
        queryClient.prefetchQuery({ queryKey, queryFn, staleTime });
      }
    },
    [queryClient, user, authLoading]
  );
}

/**
 * TanStack Query hooks for Products
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { productsService } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Product } from '@/types';

// ============ QUERY HOOKS ============

/** Returns all products (for Settings/admin views) */
export const useProducts = (options?: { enabled?: boolean }) => {
  const { user, loading: authLoading } = useAuth();
  const externalEnabled = options?.enabled ?? true;

  return useQuery<Product[]>({
    queryKey: queryKeys.products.lists(),
    queryFn: async () => {
      const { data, error } = await productsService.getAll();
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => query.state.dataUpdatedAt === 0 || query.state.isInvalidated,
    refetchOnReconnect: false,
    enabled: !authLoading && !!user && externalEnabled,
  });
};

/** Returns only active products (for deal item pickers) */
export const useActiveProducts = (options?: { enabled?: boolean }) => {
  const { user, loading: authLoading } = useAuth();
  const externalEnabled = options?.enabled ?? true;

  return useQuery<Product[]>({
    queryKey: [...queryKeys.products.lists(), 'active'] as const,
    queryFn: async () => {
      const { data, error } = await productsService.getActive();
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => query.state.dataUpdatedAt === 0 || query.state.isInvalidated,
    refetchOnReconnect: false,
    enabled: !authLoading && !!user && externalEnabled,
  });
};

// ============ MUTATION HOOKS ============

export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; price: number; sku?: string; description?: string }) => {
      const { data, error } = await productsService.create(input);
      if (error) throw error;
      return data!;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
};

export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<{ name: string; price: number; sku?: string; description?: string; active: boolean }>;
    }) => {
      const { error } = await productsService.update(id, updates);
      if (error) throw error;
      return { id, updates };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await productsService.delete(id);
      if (error) throw error;
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
};

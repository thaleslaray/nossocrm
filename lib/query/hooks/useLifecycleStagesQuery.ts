/**
 * TanStack Query hooks for Lifecycle Stages
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { lifecycleStagesService } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { LifecycleStage } from '@/types';

// ============ QUERY HOOKS ============

export const useLifecycleStages = (options?: { enabled?: boolean }) => {
  const { user, loading: authLoading } = useAuth();
  const externalEnabled = options?.enabled ?? true;

  return useQuery<LifecycleStage[]>({
    queryKey: queryKeys.lifecycleStages.lists(),
    queryFn: async () => {
      const { data, error } = await lifecycleStagesService.getAll();
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

export const useCreateLifecycleStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stage: Omit<LifecycleStage, 'id' | 'order'>) => {
      const { data, error } = await lifecycleStagesService.create(stage);
      if (error) throw error;
      return data!;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lifecycleStages.all });
    },
  });
};

export const useUpdateLifecycleStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<LifecycleStage> }) => {
      const { error } = await lifecycleStagesService.update(id, updates);
      if (error) throw error;
      return { id, updates };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lifecycleStages.all });
    },
  });
};

export const useDeleteLifecycleStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await lifecycleStagesService.delete(id);
      if (error) throw error;
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lifecycleStages.all });
    },
  });
};

export const useReorderLifecycleStages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stages: LifecycleStage[]) => {
      const { error } = await lifecycleStagesService.reorder(stages);
      if (error) throw error;
      return stages;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lifecycleStages.all });
    },
  });
};

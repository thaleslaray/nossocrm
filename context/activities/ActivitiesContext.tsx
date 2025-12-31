import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity } from '@/types';
import { activitiesService } from '@/lib/supabase';
import { useAuth } from '../AuthContext';
import { queryKeys } from '@/lib/query';
import { useActivities as useTanStackActivities } from '@/lib/query/hooks/useActivitiesQuery';

interface ActivitiesContextType {
  activities: Activity[];
  loading: boolean;
  error: string | null;
  addActivity: (activity: Omit<Activity, 'id' | 'createdAt'>) => Promise<Activity | null>;
  updateActivity: (id: string, updates: Partial<Activity>) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
  toggleActivityCompletion: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ActivitiesContext = createContext<ActivitiesContextType | undefined>(undefined);

/**
 * Componente React `ActivitiesProvider`.
 *
 * @param {{ children: ReactNode; }} { children } - Parâmetro `{ children }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // ============================================
  // TanStack Query como fonte única de verdade
  // ============================================
  const {
    data: activities = [],
    isLoading: loading,
    error: queryError,
  } = useTanStackActivities();

  // Converte erro do TanStack Query para string
  const error = queryError ? (queryError as Error).message : null;

  // Refresh = invalidar cache do TanStack Query
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
  }, [queryClient]);

  // ============================================
  // CRUD Operations - Usam service + invalidam cache
  // ============================================
  const addActivity = useCallback(
    async (activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity | null> => {
      if (!profile) {
        console.error('Usuário não autenticado');
        return null;
      }
      const { data, error: addError } = await activitiesService.create(activity);

      if (addError) {
        console.error('Erro ao criar atividade:', addError.message);
        return null;
      }

      // Invalida cache para TanStack Query atualizar
      // Don't await invalidations — awaiting can block UI flows until heavy refetches finish.
      void queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });

      return data;
    },
    [profile?.organization_id, queryClient]
  );

  const updateActivity = useCallback(async (id: string, updates: Partial<Activity>) => {
    const { error: updateError } = await activitiesService.update(id, updates);

    if (updateError) {
      console.error('Erro ao atualizar atividade:', updateError.message);
      return;
    }

    // Invalida cache para TanStack Query atualizar
    await queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
  }, [queryClient]);

  const deleteActivity = useCallback(async (id: string) => {
    const { error: deleteError } = await activitiesService.delete(id);

    if (deleteError) {
      console.error('Erro ao deletar atividade:', deleteError.message);
      return;
    }

    // Invalida cache para TanStack Query atualizar
    await queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
  }, [queryClient]);

  const toggleActivityCompletion = useCallback(async (id: string) => {
    const activity = activities.find(a => a.id === id);
    if (!activity) return;

    const { error: toggleError } = await activitiesService.toggleCompletion(id);

    if (toggleError) {
      console.error('Erro ao alternar atividade:', toggleError.message);
      return;
    }

    // Invalida cache para TanStack Query atualizar
    await queryClient.invalidateQueries({ queryKey: queryKeys.activities.all });
  }, [activities, queryClient]);

  const value = useMemo(
    () => ({
      activities,
      loading,
      error,
      addActivity,
      updateActivity,
      deleteActivity,
      toggleActivityCompletion,
      refresh,
    }),
    [
      activities,
      loading,
      error,
      addActivity,
      updateActivity,
      deleteActivity,
      toggleActivityCompletion,
      refresh,
    ]
  );

  return <ActivitiesContext.Provider value={value}>{children}</ActivitiesContext.Provider>;
};

/**
 * Hook React `useActivities` que encapsula uma lógica reutilizável.
 * @returns {ActivitiesContextType} Retorna um valor do tipo `ActivitiesContextType`.
 */
export const useActivities = () => {
  const context = useContext(ActivitiesContext);
  if (context === undefined) {
    throw new Error('useActivities must be used within a ActivitiesProvider');
  }
  return context;
};

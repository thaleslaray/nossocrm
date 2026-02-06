/**
 * TanStack Query hooks for Agency Settings Module
 *
 * Features:
 * - Agency Profile management (single profile per org)
 * - Agency Services catalog CRUD
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { agencyProfileService, agencyServicesService } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { AgencyProfile, AgencyService } from '@/types';

// ============ AGENCY PROFILE HOOKS ============

/**
 * Hook to fetch agency profile
 * Returns null if no profile exists yet
 */
export const useAgencyProfile = () => {
  const { user, loading: authLoading } = useAuth();

  return useQuery<AgencyProfile | null>({
    queryKey: queryKeys.agency.profile(),
    queryFn: async () => {
      const { data, error } = await agencyProfileService.getProfile();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - profile doesn't change often
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => query.state.dataUpdatedAt === 0 || query.state.isInvalidated,
    refetchOnReconnect: false,
    enabled: !authLoading && !!user,
  });
};

/**
 * Hook to upsert (create or update) agency profile
 */
export const useUpsertAgencyProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Partial<Omit<AgencyProfile, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>) => {
      const { data, error } = await agencyProfileService.upsertProfile(input);
      if (error) throw error;
      return data!;
    },
    onMutate: async (input) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.agency.profile() });

      // Snapshot previous value
      const previousProfile = queryClient.getQueryData<AgencyProfile | null>(queryKeys.agency.profile());

      // Optimistically update
      queryClient.setQueryData<AgencyProfile | null>(queryKeys.agency.profile(), (old) => {
        if (!old) {
          // Creating new profile - use defaults
          return {
            id: 'temp-profile',
            name: input.name || 'Ads Rocket',
            primaryColor: input.primaryColor || '#6366F1',
            monthlyGoal: input.monthlyGoal || 0,
            clientGoal: input.clientGoal || 0,
            createdAt: new Date().toISOString(),
            ...input,
          } as AgencyProfile;
        }
        // Updating existing profile
        return { ...old, ...input };
      });

      return { previousProfile };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousProfile !== undefined) {
        queryClient.setQueryData(queryKeys.agency.profile(), context.previousProfile);
      }
    },
    onSuccess: (data) => {
      // Replace optimistic data with server data
      queryClient.setQueryData(queryKeys.agency.profile(), data);
    },
    onSettled: () => {
      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.agency.all });
    },
  });
};

// ============ AGENCY SERVICES HOOKS ============

/**
 * Hook to fetch all agency services
 */
export const useAgencyServices = () => {
  const { user, loading: authLoading } = useAuth();

  return useQuery<AgencyService[]>({
    queryKey: queryKeys.agency.services.lists(),
    queryFn: async () => {
      const { data, error } = await agencyServicesService.getAll();
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => query.state.dataUpdatedAt === 0 || query.state.isInvalidated,
    refetchOnReconnect: false,
    enabled: !authLoading && !!user,
  });
};

/**
 * Hook to fetch only active services (for dropdowns)
 */
export const useActiveAgencyServices = () => {
  const { user, loading: authLoading } = useAuth();

  return useQuery<AgencyService[]>({
    queryKey: queryKeys.agency.services.active(),
    queryFn: async () => {
      const { data, error } = await agencyServicesService.getActive();
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - active services change less frequently
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => query.state.dataUpdatedAt === 0 || query.state.isInvalidated,
    refetchOnReconnect: false,
    enabled: !authLoading && !!user,
  });
};

/**
 * Hook to create a new agency service
 */
export const useCreateAgencyService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      price: number;
      commission?: number;
      description?: string;
      active?: boolean;
    }) => {
      const { data, error } = await agencyServicesService.create(input);
      if (error) throw error;
      return data!;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agency.services.all });

      const previousServices = queryClient.getQueryData<AgencyService[]>(queryKeys.agency.services.lists());

      // Optimistic update
      const tempService: AgencyService = {
        id: `temp-${Date.now()}`,
        name: input.name,
        price: input.price,
        commission: input.commission,
        description: input.description,
        active: input.active !== undefined ? input.active : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<AgencyService[]>(queryKeys.agency.services.lists(), (old = []) => [
        tempService,
        ...old,
      ]);

      return { previousServices, tempId: tempService.id };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousServices) {
        queryClient.setQueryData(queryKeys.agency.services.lists(), context.previousServices);
      }
    },
    onSuccess: (data, _vars, context) => {
      // Replace temp service with real data
      queryClient.setQueryData<AgencyService[]>(queryKeys.agency.services.lists(), (old = []) => {
        const withoutTemp = old.filter((s) => s.id !== context?.tempId);
        return [data, ...withoutTemp];
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agency.services.all });
    },
  });
};

/**
 * Hook to update an agency service
 */
export const useUpdateAgencyService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<{
        name: string;
        price: number;
        commission?: number;
        description?: string;
        active: boolean;
      }>;
    }) => {
      const { data, error } = await agencyServicesService.update(id, updates);
      if (error) throw error;
      return data!;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agency.services.all });

      const previousServices = queryClient.getQueryData<AgencyService[]>(queryKeys.agency.services.lists());

      // Optimistic update
      queryClient.setQueryData<AgencyService[]>(queryKeys.agency.services.lists(), (old = []) =>
        old.map((service) => (service.id === id ? { ...service, ...updates } : service))
      );

      return { previousServices };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousServices) {
        queryClient.setQueryData(queryKeys.agency.services.lists(), context.previousServices);
      }
    },
    onSuccess: (data) => {
      // Replace optimistic data with server data
      queryClient.setQueryData<AgencyService[]>(queryKeys.agency.services.lists(), (old = []) =>
        old.map((service) => (service.id === data.id ? data : service))
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agency.services.all });
    },
  });
};

/**
 * Hook to delete an agency service
 */
export const useDeleteAgencyService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await agencyServicesService.delete(id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agency.services.all });

      const previousServices = queryClient.getQueryData<AgencyService[]>(queryKeys.agency.services.lists());

      // Optimistic update
      queryClient.setQueryData<AgencyService[]>(queryKeys.agency.services.lists(), (old = []) =>
        old.filter((service) => service.id !== id)
      );

      return { previousServices };
    },
    onError: (_error, _id, context) => {
      if (context?.previousServices) {
        queryClient.setQueryData(queryKeys.agency.services.lists(), context.previousServices);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agency.services.all });
      // Also invalidate deals since they reference services
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
    },
  });
};

/**
 * Hook to toggle service active status
 */
export const useToggleAgencyService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await agencyServicesService.toggleActive(id);
      if (error) throw error;
      return data!;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agency.services.all });

      const previousServices = queryClient.getQueryData<AgencyService[]>(queryKeys.agency.services.lists());

      // Optimistic toggle
      queryClient.setQueryData<AgencyService[]>(queryKeys.agency.services.lists(), (old = []) =>
        old.map((service) => (service.id === id ? { ...service, active: !service.active } : service))
      );

      return { previousServices };
    },
    onError: (_error, _id, context) => {
      if (context?.previousServices) {
        queryClient.setQueryData(queryKeys.agency.services.lists(), context.previousServices);
      }
    },
    onSuccess: (data) => {
      // Replace optimistic data with server data
      queryClient.setQueryData<AgencyService[]>(queryKeys.agency.services.lists(), (old = []) =>
        old.map((service) => (service.id === data.id ? data : service))
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agency.services.all });
    },
  });
};

// ============ UTILITY HOOKS ============

/**
 * Hook to invalidate all agency queries
 */
export const useInvalidateAgency = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.agency.all });
};

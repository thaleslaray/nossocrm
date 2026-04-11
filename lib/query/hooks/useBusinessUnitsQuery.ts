/**
 * @fileoverview TanStack Query hooks for Business Units
 *
 * Business units are organizational segments that own messaging channels
 * and conversations (e.g., "Sales", "Support").
 *
 * @module lib/query/hooks/useBusinessUnitsQuery
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import { getClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type {
  BusinessUnit,
  BusinessUnitView,
  BusinessUnitMember,
  CreateBusinessUnitInput,
  UpdateBusinessUnitInput,
  transformBusinessUnit,
  transformBusinessUnitToDb,
} from '@/lib/messaging/types';
import {
  transformBusinessUnit as transform,
  transformBusinessUnitToDb as toDb,
} from '@/lib/messaging/types';

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch all business units for the current organization.
 */
export function useBusinessUnits() {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.businessUnits.all,
    queryFn: async (): Promise<BusinessUnit[]> => {
      const supabase = getClient();

      const { data, error } = await supabase
        .from('business_units')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;
      return (data || []).map(transform);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !authLoading && !!user,
  });
}

/**
 * Fetch business units with aggregated counts (members, channels, conversations).
 */
export function useBusinessUnitsWithCounts() {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.businessUnits.withCounts(),
    queryFn: async (): Promise<BusinessUnitView[]> => {
      const supabase = getClient();

      // Fetch units with member count
      const { data: units, error: unitsError } = await supabase
        .from('business_units')
        .select(`
          *,
          member_count:business_unit_members(count),
          channel_count:messaging_channels(count),
          conversation_count:messaging_conversations(count)
        `)
        .is('deleted_at', null)
        .order('name');

      if (unitsError) throw unitsError;

      // Transform and add counts
      return (units || []).map((unit) => {
        const base = transform(unit);
        return {
          ...base,
          memberCount: unit.member_count?.[0]?.count ?? 0,
          channelCount: unit.channel_count?.[0]?.count ?? 0,
          openConversationCount: unit.conversation_count?.[0]?.count ?? 0,
        };
      });
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !authLoading && !!user,
  });
}

/**
 * Fetch a single business unit by ID.
 */
export function useBusinessUnit(unitId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.businessUnits.detail(unitId || ''),
    queryFn: async (): Promise<BusinessUnit | null> => {
      if (!unitId) return null;

      const supabase = getClient();

      const { data, error } = await supabase
        .from('business_units')
        .select('*')
        .eq('id', unitId)
        .is('deleted_at', null)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return transform(data);
    },
    staleTime: 5 * 60 * 1000,
    enabled: !authLoading && !!user && !!unitId,
  });
}

/**
 * Fetch members of a business unit.
 */
export function useBusinessUnitMembers(unitId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.businessUnits.members(unitId || ''),
    queryFn: async (): Promise<BusinessUnitMember[]> => {
      if (!unitId) return [];

      const supabase = getClient();

      const { data, error } = await supabase
        .from('business_unit_members')
        .select(`
          id,
          business_unit_id,
          user_id,
          created_at,
          profiles:user_id (
            name,
            email,
            avatar
          )
        `)
        .eq('business_unit_id', unitId);

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.id,
        businessUnitId: row.business_unit_id,
        userId: row.user_id,
        createdAt: row.created_at,
        userName: (row.profiles as { name?: string })?.name,
        userEmail: (row.profiles as { email?: string })?.email,
        userAvatar: (row.profiles as { avatar?: string })?.avatar,
      }));
    },
    staleTime: 2 * 60 * 1000,
    enabled: !authLoading && !!user && !!unitId,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create a new business unit.
 */
export function useCreateBusinessUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBusinessUnitInput): Promise<BusinessUnit> => {
      const supabase = getClient();

      // Get current user's org
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .single();

      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      const dbData = toDb(input, profile.organization_id);

      const { data, error } = await supabase
        .from('business_units')
        .insert(dbData)
        .select()
        .single();

      if (error) throw error;

      // Add initial members if provided
      if (input.memberIds?.length) {
        const memberInserts = input.memberIds.map((userId) => ({
          business_unit_id: data.id,
          user_id: userId,
        }));

        await supabase.from('business_unit_members').insert(memberInserts);
      }

      return transform(data);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.businessUnits.all });
    },
  });
}

/**
 * Update an existing business unit.
 */
export function useUpdateBusinessUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      unitId,
      input,
    }: {
      unitId: string;
      input: UpdateBusinessUnitInput;
    }): Promise<BusinessUnit> => {
      const supabase = getClient();

      const dbData = toDb(input);

      const { data, error } = await supabase
        .from('business_units')
        .update({ ...dbData, updated_at: new Date().toISOString() })
        .eq('id', unitId)
        .select()
        .single();

      if (error) throw error;

      return transform(data);
    },
    onSettled: (_, _err, { unitId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.businessUnits.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.businessUnits.detail(unitId),
      });
    },
  });
}

/**
 * Soft-delete a business unit.
 */
export function useDeleteBusinessUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unitId: string): Promise<void> => {
      const supabase = getClient();

      const { error } = await supabase
        .from('business_units')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', unitId);

      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.businessUnits.all });
    },
  });
}

/**
 * Add members to a business unit.
 */
export function useAddBusinessUnitMembers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      unitId,
      userIds,
    }: {
      unitId: string;
      userIds: string[];
    }): Promise<void> => {
      const supabase = getClient();

      const inserts = userIds.map((userId) => ({
        business_unit_id: unitId,
        user_id: userId,
      }));

      const { error } = await supabase
        .from('business_unit_members')
        .upsert(inserts, { onConflict: 'business_unit_id,user_id' });

      if (error) throw error;
    },
    onSettled: (_, _err, { unitId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.businessUnits.members(unitId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.businessUnits.withCounts(),
      });
    },
  });
}

/**
 * Remove members from a business unit.
 */
export function useRemoveBusinessUnitMembers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      unitId,
      userIds,
    }: {
      unitId: string;
      userIds: string[];
    }): Promise<void> => {
      const supabase = getClient();

      const { error } = await supabase
        .from('business_unit_members')
        .delete()
        .eq('business_unit_id', unitId)
        .in('user_id', userIds);

      if (error) throw error;
    },
    onSettled: (_, _err, { unitId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.businessUnits.members(unitId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.businessUnits.withCounts(),
      });
    },
  });
}

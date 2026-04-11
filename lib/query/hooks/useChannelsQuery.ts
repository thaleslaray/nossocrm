'use client';

/**
 * @fileoverview Query hooks for messaging channels
 *
 * Provides TanStack Query hooks for managing messaging channels
 * (WhatsApp, Instagram, Email, etc.)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '../queryKeys';
import {
  type MessagingChannel,
  type DbMessagingChannel,
  type CreateChannelInput,
  type UpdateChannelInput,
  transformChannel,
  transformChannelToDb,
} from '@/lib/messaging/types';

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch all channels for the current organization.
 */
export function useChannelsQuery() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.all,
    queryFn: async (): Promise<MessagingChannel[]> => {
      if (!profile?.organization_id) {
        return [];
      }

      // Exclude credentials from list query to avoid leaking secrets to React state
      // Join with business_units to get the unit name
      const { data, error } = await supabase
        .from('messaging_channels')
        .select(`
          id,organization_id,business_unit_id,channel_type,provider,external_identifier,name,settings,status,status_message,last_connected_at,created_at,updated_at,deleted_at,
          business_unit:business_units!business_unit_id(name)
        `)
        .eq('organization_id', profile.organization_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((row) => {
        // business_unit is a single object from the FK join, but Supabase types it as array
        const businessUnit = (Array.isArray(row.business_unit)
          ? row.business_unit[0]
          : row.business_unit) as { name: string } | null;
        return transformChannel({
          ...row,
          credentials: {},
          business_unit_name: businessUnit?.name,
        } as DbMessagingChannel & { business_unit_name?: string });
      });
    },
    enabled: !!profile?.organization_id,
  });
}

/**
 * Fetch a single channel by ID.
 */
export function useChannelQuery(channelId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.messagingChannels.detail(channelId!),
    queryFn: async (): Promise<MessagingChannel | null> => {
      if (!channelId) return null;

      const { data, error } = await supabase
        .from('messaging_channels')
        .select('*')
        .eq('id', channelId)
        .is('deleted_at', null)
        .single();

      if (error) throw error;

      return data ? transformChannel(data as DbMessagingChannel) : null;
    },
    enabled: !!channelId,
  });
}

/**
 * Fetch connected channels only.
 */
export function useConnectedChannelsQuery() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.connected(),
    queryFn: async (): Promise<MessagingChannel[]> => {
      if (!profile?.organization_id) {
        return [];
      }

      // Exclude credentials from list query
      const { data, error } = await supabase
        .from('messaging_channels')
        .select('id,organization_id,business_unit_id,channel_type,provider,external_identifier,name,settings,status,status_message,last_connected_at,created_at,updated_at,deleted_at')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'connected')
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;

      return (data as DbMessagingChannel[]).map((row) =>
        transformChannel({ ...row, credentials: {} } as DbMessagingChannel)
      );
    },
    enabled: !!profile?.organization_id,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create a new messaging channel.
 */
export function useCreateChannelMutation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateChannelInput): Promise<MessagingChannel> => {
      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      const dbData = transformChannelToDb(input, profile.organization_id);

      const { data, error } = await supabase
        .from('messaging_channels')
        .insert({
          ...dbData,
          status: 'pending',
        })
        .select('*')
        .single();

      if (error) throw error;

      return transformChannel(data as DbMessagingChannel);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.all });
    },
  });
}

/**
 * Update an existing channel.
 */
export function useUpdateChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      input,
    }: {
      channelId: string;
      input: UpdateChannelInput;
    }): Promise<MessagingChannel> => {
      const dbData = transformChannelToDb(input);

      const { data, error } = await supabase
        .from('messaging_channels')
        .update({
          ...dbData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', channelId)
        .select('*')
        .single();

      if (error) throw error;

      return transformChannel(data as DbMessagingChannel);
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.all });
      if (data) {
        queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.detail(data.id) });
      }
    },
  });
}

/**
 * Delete (soft-delete) a channel.
 */
export function useDeleteChannelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string): Promise<void> => {
      const { error } = await supabase
        .from('messaging_channels')
        .update({
          deleted_at: new Date().toISOString(),
          status: 'disconnected',
        })
        .eq('id', channelId);

      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.all });
    },
  });
}

/**
 * Toggle channel active status.
 */
export function useToggleChannelStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      connect,
    }: {
      channelId: string;
      connect: boolean;
    }): Promise<MessagingChannel> => {
      const { data, error } = await supabase
        .from('messaging_channels')
        .update({
          status: connect ? 'connecting' : 'disconnected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', channelId)
        .select('*')
        .single();

      if (error) throw error;

      return transformChannel(data as DbMessagingChannel);
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.all });
      if (data) {
        queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.detail(data.id) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.connected() });
    },
  });
}

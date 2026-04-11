/**
 * @fileoverview TanStack Query hooks for Messaging Channels
 *
 * Channels represent connected messaging accounts (WhatsApp numbers,
 * Instagram accounts, email addresses, etc.).
 *
 * @module lib/query/hooks/useMessagingChannelsQuery
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
  MessagingChannel,
  ChannelType,
  ChannelStatus,
  CreateChannelInput,
  UpdateChannelInput,
} from '@/lib/messaging/types';
import {
  transformChannel,
  transformChannelToDb,
} from '@/lib/messaging/types';

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch all messaging channels for the current organization.
 */
export function useMessagingChannels() {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.all,
    queryFn: async (): Promise<MessagingChannel[]> => {
      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_channels')
        .select('id, name, channel_type, provider, external_identifier, status, business_unit_id, organization_id, created_at, updated_at, settings')
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;
      return (data || []).map(transformChannel);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !authLoading && !!user,
  });
}

/**
 * Fetch channels for a specific business unit.
 */
export function useMessagingChannelsByUnit(unitId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.byUnit(unitId || ''),
    queryFn: async (): Promise<MessagingChannel[]> => {
      if (!unitId) return [];

      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_channels')
        .select('id, name, channel_type, provider, external_identifier, status, business_unit_id, organization_id, created_at, updated_at, settings')
        .eq('business_unit_id', unitId)
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;
      return (data || []).map(transformChannel);
    },
    staleTime: 2 * 60 * 1000,
    enabled: !authLoading && !!user && !!unitId,
  });
}

/**
 * Fetch channels by type (whatsapp, instagram, etc.).
 */
export function useMessagingChannelsByType(type: ChannelType | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.byType(type || ''),
    queryFn: async (): Promise<MessagingChannel[]> => {
      if (!type) return [];

      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_channels')
        .select('id, name, channel_type, provider, external_identifier, status, business_unit_id, organization_id, created_at, updated_at, settings')
        .eq('channel_type', type)
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;
      return (data || []).map(transformChannel);
    },
    staleTime: 2 * 60 * 1000,
    enabled: !authLoading && !!user && !!type,
  });
}

/**
 * Fetch only connected channels.
 */
export function useConnectedChannels() {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.connected(),
    queryFn: async (): Promise<MessagingChannel[]> => {
      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_channels')
        .select('id, name, channel_type, provider, external_identifier, status, business_unit_id, organization_id, created_at, updated_at, settings')
        .eq('status', 'connected')
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;
      return (data || []).map(transformChannel);
    },
    staleTime: 1 * 60 * 1000, // 1 minute (status can change)
    enabled: !authLoading && !!user,
  });
}

/**
 * Fetch a single channel by ID.
 */
export function useMessagingChannel(channelId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingChannels.detail(channelId || ''),
    queryFn: async (): Promise<MessagingChannel | null> => {
      if (!channelId) return null;

      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_channels')
        .select('*')
        .eq('id', channelId)
        .is('deleted_at', null)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return transformChannel(data);
    },
    staleTime: 1 * 60 * 1000,
    enabled: !authLoading && !!user && !!channelId,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create a new messaging channel.
 */
export function useCreateMessagingChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateChannelInput): Promise<MessagingChannel> => {
      const supabase = getClient();

      // Get current user's org
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .single();

      if (!profile?.organization_id) {
        throw new Error('Organization not found');
      }

      const dbData = transformChannelToDb(input, profile.organization_id);

      const { data, error } = await supabase
        .from('messaging_channels')
        .insert(dbData)
        .select()
        .single();

      if (error) throw error;

      return transformChannel(data);
    },
    onSettled: (channel) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.all });
      if (channel) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messagingChannels.byUnit(channel.businessUnitId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.messagingChannels.byType(channel.channelType),
        });
      }
    },
  });
}

/**
 * Update an existing messaging channel.
 */
export function useUpdateMessagingChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      input,
    }: {
      channelId: string;
      input: UpdateChannelInput;
    }): Promise<MessagingChannel> => {
      const supabase = getClient();

      const dbData = transformChannelToDb(input);

      const { data, error } = await supabase
        .from('messaging_channels')
        .update({ ...dbData, updated_at: new Date().toISOString() })
        .eq('id', channelId)
        .select()
        .single();

      if (error) throw error;

      return transformChannel(data);
    },
    onSettled: (channel) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingChannels.all });
      if (channel) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messagingChannels.detail(channel.id),
        });
      }
    },
  });
}

/**
 * Update channel status (used by providers).
 */
export function useUpdateChannelStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      channelId,
      status,
      statusMessage,
    }: {
      channelId: string;
      status: ChannelStatus;
      statusMessage?: string;
    }): Promise<void> => {
      const supabase = getClient();

      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (statusMessage !== undefined) {
        updateData.status_message = statusMessage;
      }

      if (status === 'connected') {
        updateData.last_connected_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('messaging_channels')
        .update(updateData)
        .eq('id', channelId);

      if (error) throw error;
    },
    onSettled: (_, _err, { channelId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingChannels.detail(channelId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingChannels.connected(),
      });
    },
  });
}

/**
 * Soft-delete a messaging channel.
 */
export function useDeleteMessagingChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string): Promise<void> => {
      const supabase = getClient();

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

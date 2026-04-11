/**
 * @fileoverview TanStack Query hooks for Messaging Conversations
 *
 * Conversations are threads of messages with external contacts.
 * They belong to a channel and can be linked to CRM contacts.
 *
 * @module lib/query/hooks/useMessagingConversationsQuery
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import { getClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type {
  MessagingConversation,
  ConversationView,
  ConversationFilters,
  ConversationStatus,
  UpdateConversationInput,
} from '@/lib/messaging/types';
import {
  transformConversation,
  isWindowExpired,
  getWindowMinutesRemaining,
} from '@/lib/messaging/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_PAGE_SIZE = 50;

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch conversations with filters (inbox view).
 * Returns ConversationView with denormalized data.
 */
export function useMessagingConversations(filters?: ConversationFilters) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingConversations.filtered(filters),
    queryFn: async ({ signal }): Promise<ConversationView[]> => {
      const supabase = getClient();

      let query = supabase
        .from('messaging_conversations')
        .select(`
          *,
          channel:messaging_channels!channel_id (
            id,
            channel_type,
            name,
            provider
          ),
          contact:contacts!contact_id (
            id,
            name,
            email,
            phone,
            ai_paused
          ),
          assigned_user:profiles!assigned_user_id (
            id,
            name,
            avatar
          )
        `)
        .abortSignal(signal);

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.channelId) {
        query = query.eq('channel_id', filters.channelId);
      }
      if (filters?.businessUnitId) {
        query = query.eq('business_unit_id', filters.businessUnitId);
      }
      if (filters?.assignedUserId) {
        if (filters.assignedUserId === 'unassigned') {
          query = query.is('assigned_user_id', null);
        } else {
          query = query.eq('assigned_user_id', filters.assignedUserId);
        }
      }
      if (filters?.hasUnread) {
        query = query.gt('unread_count', 0);
      }
      if (filters?.search) {
        query = query.or(`external_contact_name.ilike.%${filters.search}%,last_message_preview.ilike.%${filters.search}%`);
      }

      // Apply sorting
      const sortBy = filters?.sortBy || 'lastMessageAt';
      const sortOrder = filters?.sortOrder || 'desc';
      const sortColumn = sortBy === 'lastMessageAt' ? 'last_message_at' :
                        sortBy === 'createdAt' ? 'created_at' : 'unread_count';
      query = query.order(sortColumn, { ascending: sortOrder === 'asc', nullsFirst: false });

      const { data, error } = await query.limit(100);

      if (error) throw error;

      // Transform to ConversationView
      return (data || []).map((row) => {
        const base = transformConversation(row);
        const channel = row.channel as { id?: string; channel_type?: string; name?: string; provider?: string } | null;
        const contact = row.contact as { id?: string; name?: string; email?: string; phone?: string; ai_paused?: boolean } | null;
        const assignedUser = row.assigned_user as { id?: string; name?: string; avatar?: string } | null;

        return {
          ...base,
          channelType: channel?.channel_type as ConversationView['channelType'],
          channelName: channel?.name || '',
          channelProvider: channel?.provider,
          contactName: contact?.name,
          contactEmail: contact?.email,
          contactPhone: contact?.phone,
          contactAiPaused: contact?.ai_paused ?? false,
          assignedUserName: assignedUser?.name,
          assignedUserAvatar: assignedUser?.avatar,
          isWindowExpired: isWindowExpired(base, channel?.provider),
          windowMinutesRemaining: getWindowMinutesRemaining(base),
        };
      });
    },
    staleTime: 30 * 1000, // 30 seconds (conversations change frequently)
    enabled: !authLoading && !!user,
  });
}

/**
 * Fetch conversations for a specific channel.
 */
export function useConversationsByChannel(channelId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingConversations.byChannel(channelId || ''),
    queryFn: async (): Promise<MessagingConversation[]> => {
      if (!channelId) return [];

      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_conversations')
        .select('*')
        .eq('channel_id', channelId)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data || []).map(transformConversation);
    },
    staleTime: 30 * 1000,
    enabled: !authLoading && !!user && !!channelId,
  });
}

/**
 * Fetch conversations for a specific contact.
 */
export function useConversationsByContact(contactId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingConversations.byContact(contactId || ''),
    queryFn: async (): Promise<MessagingConversation[]> => {
      if (!contactId) return [];

      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_conversations')
        .select('*')
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data || []).map(transformConversation);
    },
    staleTime: 30 * 1000,
    enabled: !authLoading && !!user && !!contactId,
  });
}

/**
 * Fetch a single conversation by ID with full details.
 */
export function useMessagingConversation(conversationId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingConversations.detail(conversationId || ''),
    queryFn: async (): Promise<ConversationView | null> => {
      if (!conversationId) return null;

      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_conversations')
        .select(`
          *,
          channel:messaging_channels!channel_id (
            id,
            channel_type,
            name,
            provider
          ),
          contact:contacts!contact_id (
            id,
            name,
            email,
            phone,
            avatar,
            ai_paused
          ),
          assigned_user:profiles!assigned_user_id (
            id,
            name,
            avatar
          )
        `)
        .eq('id', conversationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      const base = transformConversation(data);
      const channel = data.channel as { id?: string; channel_type?: string; name?: string; provider?: string } | null;
      const contact = data.contact as { id?: string; name?: string; email?: string; phone?: string; ai_paused?: boolean } | null;
      const assignedUser = data.assigned_user as { id?: string; name?: string; avatar?: string } | null;

      return {
        ...base,
        channelType: channel?.channel_type as ConversationView['channelType'],
        channelName: channel?.name || '',
        channelProvider: channel?.provider,
        contactName: contact?.name,
        contactEmail: contact?.email,
        contactPhone: contact?.phone,
        contactAiPaused: contact?.ai_paused ?? false,
        assignedUserName: assignedUser?.name,
        assignedUserAvatar: assignedUser?.avatar,
        isWindowExpired: isWindowExpired(base, channel?.provider),
        windowMinutesRemaining: getWindowMinutesRemaining(base),
      };
    },
    staleTime: 30 * 1000,
    enabled: !authLoading && !!user && !!conversationId,
  });
}

/**
 * Fetch unread conversation count.
 */
export function useUnreadConversationCount() {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingConversations.unreadCount(),
    queryFn: async (): Promise<number> => {
      const supabase = getClient();

      const { data, error } = await supabase.rpc('get_messaging_unread_count');

      if (error) throw error;
      return data ?? 0;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Refetch every minute
    enabled: !authLoading && !!user,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Update a conversation (status, priority, assignment).
 */
export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      input,
    }: {
      conversationId: string;
      input: UpdateConversationInput;
    }): Promise<MessagingConversation> => {
      const supabase = getClient();

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (input.status !== undefined) {
        updateData.status = input.status;
      }
      if (input.priority !== undefined) {
        updateData.priority = input.priority;
      }
      if (input.assignedUserId !== undefined) {
        updateData.assigned_user_id = input.assignedUserId;
        updateData.assigned_at = input.assignedUserId
          ? new Date().toISOString()
          : null;
      }

      const { data, error } = await supabase
        .from('messaging_conversations')
        .update(updateData)
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;

      return transformConversation(data);
    },
    onSettled: (conversation) => {
      // Invalidate filtered queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.all,
      });
      // Update detail cache
      if (conversation) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messagingConversations.detail(conversation.id),
        });
      }
    },
  });
}

/**
 * Mark a conversation as read (reset unread count).
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string): Promise<void> => {
      const supabase = getClient();

      const { error } = await supabase.rpc('mark_conversation_read', {
        p_conversation_id: conversationId,
      });

      if (error) throw error;
    },
    onSettled: (_, _err, conversationId) => {
      // Update conversation detail
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.detail(conversationId),
      });
      // Update unread count
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.unreadCount(),
      });
      // Invalidate filtered queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.all,
      });
    },
  });
}

/**
 * Resolve (close) a conversation.
 */
export function useResolveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string): Promise<MessagingConversation> => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('messaging_conversations')
        .update({ status: 'resolved' as ConversationStatus, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .select()
        .single();
      if (error) throw error;
      return transformConversation(data);
    },
    onSettled: (conversation) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingConversations.all });
      if (conversation) {
        queryClient.invalidateQueries({ queryKey: queryKeys.messagingConversations.detail(conversation.id) });
      }
    },
  });
}

/**
 * Reopen a conversation.
 */
export function useReopenConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string): Promise<MessagingConversation> => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('messaging_conversations')
        .update({ status: 'open' as ConversationStatus, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .select()
        .single();
      if (error) throw error;
      return transformConversation(data);
    },
    onSettled: (conversation) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingConversations.all });
      if (conversation) {
        queryClient.invalidateQueries({ queryKey: queryKeys.messagingConversations.detail(conversation.id) });
      }
    },
  });
}

/**
 * Assign a conversation to a user.
 */
export function useAssignConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      userId,
    }: {
      conversationId: string;
      userId: string | null;
    }): Promise<MessagingConversation> => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('messaging_conversations')
        .update({
          assigned_user_id: userId,
          assigned_at: userId ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .select()
        .single();
      if (error) throw error;
      return transformConversation(data);
    },
    onSettled: (conversation) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messagingConversations.all });
      if (conversation) {
        queryClient.invalidateQueries({ queryKey: queryKeys.messagingConversations.detail(conversation.id) });
      }
    },
  });
}

/**
 * Toggle AI pause on a conversation (metadata-level, no linked contact required).
 */
export function useToggleConversationAiPause() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      paused,
      currentMetadata,
    }: {
      conversationId: string;
      paused: boolean;
      currentMetadata: Record<string, unknown>;
    }): Promise<void> => {
      const supabase = getClient();

      const { error } = await supabase
        .from('messaging_conversations')
        .update({
          metadata: { ...currentMetadata, ai_paused: paused },
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSettled: (_, _err, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.detail(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.all,
      });
    },
  });
}

/**
 * Link a conversation to a CRM contact.
 */
export function useLinkConversationToContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      contactId,
    }: {
      conversationId: string;
      contactId: string | null;
    }): Promise<void> => {
      const supabase = getClient();

      const { error } = await supabase
        .from('messaging_conversations')
        .update({
          contact_id: contactId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSettled: (_, _err, { conversationId, contactId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.detail(conversationId),
      });
      if (contactId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messagingConversations.byContact(contactId),
        });
      }
    },
  });
}

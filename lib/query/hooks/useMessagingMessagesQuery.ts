/**
 * @fileoverview TanStack Query hooks for Messaging Messages
 *
 * Messages are individual communications within a conversation.
 * Supports various content types (text, media, templates).
 *
 * @module lib/query/hooks/useMessagingMessagesQuery
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  type InfiniteData,
} from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import { getClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type {
  MessagingMessage,
  MessageContent,
  MessageStatus,
  SendMessageInput,
  PaginationState,
} from '@/lib/messaging/types';
import { transformMessage, createTextContent } from '@/lib/messaging/types';
// NOTE: Channel router is server-only. Client code should call API endpoints.

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_PAGE_SIZE = 50;

// =============================================================================
// TYPES
// =============================================================================

interface MessagesPage {
  messages: MessagingMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch messages for a conversation (paginated, most recent first).
 */
export function useMessagingMessages(
  conversationId: string | undefined,
  pagination?: PaginationState
) {
  const { user, loading: authLoading } = useAuth();
  const pageSize = pagination?.pageSize || DEFAULT_PAGE_SIZE;

  return useQuery({
    queryKey: queryKeys.messagingMessages.byConversation(conversationId || '', pagination),
    queryFn: async (): Promise<MessagingMessage[]> => {
      if (!conversationId) return [];

      const supabase = getClient();

      let query = supabase
        .from('messaging_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      // Apply pagination
      if (pagination) {
        const from = pagination.pageIndex * pageSize;
        query = query.range(from, from + pageSize - 1);
      } else {
        query = query.limit(pageSize);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Return in chronological order for display
      return (data || []).map(transformMessage).reverse();
    },
    staleTime: 10 * 1000, // 10 seconds
    enabled: !authLoading && !!user && !!conversationId,
  });
}

/**
 * Fetch messages with infinite scroll (load more on scroll up).
 */
export function useMessagingMessagesInfinite(conversationId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useInfiniteQuery({
    queryKey: [...queryKeys.messagingMessages.byConversation(conversationId || ''), 'infinite'],
    queryFn: async ({ pageParam }): Promise<MessagesPage> => {
      if (!conversationId) {
        return { messages: [], nextCursor: null, hasMore: false };
      }

      const supabase = getClient();

      let query = supabase
        .from('messaging_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(DEFAULT_PAGE_SIZE + 1); // Fetch one extra to check hasMore

      // If we have a cursor, fetch messages before that timestamp
      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data, error } = await query;

      if (error) throw error;

      const messages = data || [];
      const hasMore = messages.length > DEFAULT_PAGE_SIZE;
      const pageMessages = hasMore ? messages.slice(0, -1) : messages;

      return {
        messages: pageMessages.map(transformMessage).reverse(),
        nextCursor: hasMore ? messages[messages.length - 1].created_at : null,
        hasMore,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 10 * 1000,
    enabled: !authLoading && !!user && !!conversationId,
  });
}

/**
 * Fetch a single message by ID.
 */
export function useMessagingMessage(messageId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingMessages.detail(messageId || ''),
    queryFn: async (): Promise<MessagingMessage | null> => {
      if (!messageId) return null;

      const supabase = getClient();

      const { data, error } = await supabase
        .from('messaging_messages')
        .select('*')
        .eq('id', messageId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return transformMessage(data);
    },
    staleTime: 30 * 1000,
    enabled: !authLoading && !!user && !!messageId,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Send a message in a conversation.
 * Calls the API endpoint which handles provider routing server-side.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput): Promise<MessagingMessage> => {
      // Call the API endpoint (server-side) to send the message
      const response = await fetch('/api/messaging/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send message');
      }

      return response.json();
    },
    onMutate: async (input) => {
      const queryKey = queryKeys.messagingMessages.byConversation(input.conversationId);
      const infiniteQueryKey = [...queryKeys.messagingMessages.byConversation(input.conversationId), 'infinite'] as const;

      await Promise.all([
        queryClient.cancelQueries({ queryKey }),
        queryClient.cancelQueries({ queryKey: infiniteQueryKey }),
      ]);

      const previousMessages = queryClient.getQueryData<MessagingMessage[]>(queryKey);
      const previousInfiniteData = queryClient.getQueryData<InfiniteData<{ messages: MessagingMessage[]; nextCursor: string | null }>>(infiniteQueryKey);

      // For reactions: optimistically update the target message's metadata.reactions
      // This gives instant UI feedback without waiting for the realtime UPDATE event
      if (input.content.type === 'reaction') {
        const { emoji, messageId: targetExternalId } = input.content as { type: 'reaction'; emoji: string; messageId: string };
        const applyReaction = (m: MessagingMessage): MessagingMessage => {
          if (m.externalId !== targetExternalId) return m;
          const reactions = (m.metadata?.reactions as Record<string, number> | undefined) ?? {};
          return {
            ...m,
            metadata: {
              ...m.metadata,
              reactions: { ...reactions, [emoji]: (reactions[emoji] ?? 0) + 1 },
            },
          };
        };
        queryClient.setQueryData<MessagingMessage[]>(queryKey, (old) => old?.map(applyReaction));
        queryClient.setQueryData<InfiniteData<{ messages: MessagingMessage[]; nextCursor: string | null }>>(
          infiniteQueryKey,
          (old) => old
            ? { ...old, pages: old.pages.map(p => ({ ...p, messages: p.messages.map(applyReaction) })) }
            : old
        );
        return { previousMessages, previousInfiniteData, queryKey, infiniteQueryKey, optimisticMessage: null };
      }

      const optimisticMessage: MessagingMessage = {
        id: `temp-${Date.now()}`,
        conversationId: input.conversationId,
        direction: 'outbound',
        contentType: input.content.type,
        content: input.content,
        replyToMessageId: input.replyToMessageId,
        status: 'pending',
        metadata: {},
        createdAt: new Date().toISOString(),
      };

      // Update flat query (used by useMessagingMessages)
      queryClient.setQueryData<MessagingMessage[]>(queryKey, (old) => [
        ...(old || []),
        optimisticMessage,
      ]);

      // Update infinite query (used by MessageThread via useMessagesInfinite)
      // pages[0] holds the MOST RECENT messages (DB fetches desc, then reverses).
      // New outbound messages must go to pages[0], not pages[pages.length - 1] (oldest page).
      queryClient.setQueryData<InfiniteData<{ messages: MessagingMessage[]; nextCursor: string | null }>>(
        infiniteQueryKey,
        (old) => {
          if (!old) return old;
          const pages = [...old.pages];
          const first = pages[0];
          pages[0] = { ...first, messages: [...first.messages, optimisticMessage] };
          return { ...old, pages };
        }
      );

      return { previousMessages, previousInfiniteData, queryKey, infiniteQueryKey, optimisticMessage };
    },
    onError: (_error, _input, context) => {
      if (context?.previousMessages !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previousMessages);
      }
      if (context?.previousInfiniteData !== undefined) {
        queryClient.setQueryData(context.infiniteQueryKey, context.previousInfiniteData);
      }
    },
    onSuccess: (message, _input, context) => {
      // Reactions use optimistic metadata update (no temp message to replace)
      if (!context?.optimisticMessage) return;

      const replaceOptimistic = (m: MessagingMessage) =>
        m.id === context.optimisticMessage!.id ? message : m;

      // Replace in flat query
      queryClient.setQueryData<MessagingMessage[]>(context?.queryKey, (old) =>
        old ? old.map(replaceOptimistic) : [message]
      );

      // Replace in infinite query
      queryClient.setQueryData<InfiniteData<{ messages: MessagingMessage[]; nextCursor: string | null }>>(
        context?.infiniteQueryKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map(replaceOptimistic),
            })),
          };
        }
      );
    },
    onSettled: (_, _err, input) => {
      // Invalidate conversation to update last_message (runs on both success and error)
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.detail(input.conversationId),
      });
    },
  });
}

/**
 * Send a text message (convenience wrapper).
 */
export function useSendTextMessage() {
  const sendMessage = useSendMessage();

  return useMutation({
    mutationFn: async ({
      conversationId,
      text,
      replyToMessageId,
    }: {
      conversationId: string;
      text: string;
      replyToMessageId?: string;
    }) => {
      return sendMessage.mutateAsync({
        conversationId,
        content: createTextContent(text),
        replyToMessageId,
      });
    },
  });
}

/**
 * Update message status (used by webhooks).
 */
export function useUpdateMessageStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageId,
      status,
      errorCode,
      errorMessage,
    }: {
      messageId: string;
      status: MessageStatus;
      errorCode?: string;
      errorMessage?: string;
    }): Promise<void> => {
      const supabase = getClient();

      const updateData: Record<string, unknown> = { status };

      // Set timestamp based on status
      const now = new Date().toISOString();
      switch (status) {
        case 'sent':
          updateData.sent_at = now;
          break;
        case 'delivered':
          updateData.delivered_at = now;
          break;
        case 'read':
          updateData.read_at = now;
          break;
        case 'failed':
          updateData.failed_at = now;
          updateData.error_code = errorCode;
          updateData.error_message = errorMessage;
          break;
      }

      const { error } = await supabase
        .from('messaging_messages')
        .update(updateData)
        .eq('id', messageId);

      if (error) throw error;
    },
    onSettled: (_, _err, { messageId }) => {
      // Invalidate the message
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingMessages.detail(messageId),
      });
    },
  });
}

/**
 * Retry a failed message.
 */
export function useRetryMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string): Promise<MessagingMessage> => {
      // Call the API endpoint (server-side) to retry the message
      const response = await fetch(`/api/messaging/messages/${messageId}/retry`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to retry message');
      }

      return response.json();
    },
    onSettled: (message) => {
      if (message) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messagingMessages.byConversation(message.conversationId),
        });
      }
    },
  });
}

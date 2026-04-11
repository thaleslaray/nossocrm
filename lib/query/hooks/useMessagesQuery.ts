'use client';

/**
 * TanStack Query hooks for Messaging Messages (query-only)
 *
 * Features:
 * - Fetch messages by conversation (with pagination)
 * - Realtime-ready (integrates with useRealtimeSyncMessaging)
 *
 * For mutations (send, retry, update status), use useMessagingMessagesQuery.ts
 */
import {
  useQuery,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { queryKeys } from '../index';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type {
  DbMessagingMessage,
  MessagingMessage,
} from '@/lib/messaging/types';
import { transformMessage } from '@/lib/messaging/types';

const PAGE_SIZE = 50;

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch messages for a conversation.
 * Returns messages in chronological order (oldest first).
 */
export function useMessages(conversationId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingMessages.byConversation(conversationId || ''),
    queryFn: async (): Promise<MessagingMessage[]> => {
      const { data, error } = await supabase
        .from('messaging_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(200); // Limit to last 200 messages for performance

      if (error) throw error;
      return (data || []).map((row) => transformMessage(row as DbMessagingMessage));
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: !authLoading && !!user && !!conversationId,
  });
}

/**
 * Fetch messages with infinite scroll (paginated).
 * Loads older messages as user scrolls up.
 */
export function useMessagesInfinite(conversationId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  return useInfiniteQuery({
    queryKey: [...queryKeys.messagingMessages.byConversation(conversationId || ''), 'infinite'],
    queryFn: async ({ pageParam }): Promise<{
      messages: MessagingMessage[];
      nextCursor: string | null;
    }> => {
      let query = supabase
        .from('messaging_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: false }) // Newest first for pagination
        .limit(PAGE_SIZE);

      // Use cursor-based pagination (created_at)
      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data, error } = await query;
      if (error) throw error;

      const messages = (data || [])
        .map((row) => transformMessage(row as DbMessagingMessage))
        .reverse(); // Reverse to get chronological order

      const nextCursor = data && data.length === PAGE_SIZE
        ? data[data.length - 1].created_at
        : null;

      return { messages, nextCursor };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !authLoading && !!user && !!conversationId,
    staleTime: 30 * 1000,
  });
}

/**
 * @fileoverview Messaging Context Provider
 *
 * Provides messaging state and operations to the component tree.
 * Uses TanStack Query as the single source of truth.
 *
 * Features:
 * - Conversations list and active conversation
 * - Messages for the active conversation
 * - Send message operations
 * - Unread count
 * - Realtime updates subscription
 *
 * @module context/messaging/MessagingContext
 */

import React, {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query';
import {
  useMessagingConversations,
  useMessagingConversation,
  useMessagingMessages,
  useUnreadConversationCount,
  useSendTextMessage,
  useMarkConversationRead,
  useUpdateConversation,
} from '@/lib/query/hooks';
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync';
import type {
  ConversationView,
  MessagingMessage,
  ConversationFilters,
  ConversationStatus,
  ConversationPriority,
  MessageContent,
} from '@/lib/messaging/types';

// =============================================================================
// TYPES
// =============================================================================

interface MessagingContextType {
  // Active conversation
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  activeConversation: ConversationView | null;
  activeConversationLoading: boolean;

  // Conversations list
  conversations: ConversationView[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  conversationFilters: ConversationFilters;
  setConversationFilters: (filters: ConversationFilters) => void;

  // Messages for active conversation
  messages: MessagingMessage[];
  messagesLoading: boolean;
  messagesError: string | null;

  // Unread count
  unreadCount: number;

  // Operations
  sendMessage: (text: string, replyToMessageId?: string) => Promise<void>;
  markAsRead: () => Promise<void>;
  resolveConversation: () => Promise<void>;
  reopenConversation: () => Promise<void>;
  updatePriority: (priority: ConversationPriority) => Promise<void>;

  // Refresh
  refreshConversations: () => Promise<void>;
  refreshMessages: () => Promise<void>;

  // Lookup maps
  conversationMap: Record<string, ConversationView>;
}

// =============================================================================
// CONTEXT
// =============================================================================

const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

// =============================================================================
// PROVIDER
// =============================================================================

interface MessagingProviderProps {
  children: ReactNode;
  /** Initial conversation ID (from URL) */
  initialConversationId?: string;
  /** Initial filters */
  initialFilters?: ConversationFilters;
}

export const MessagingProvider: React.FC<MessagingProviderProps> = ({
  children,
  initialConversationId,
  initialFilters,
}) => {
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Local State
  // ---------------------------------------------------------------------------

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId ?? null
  );

  const [conversationFilters, setConversationFilters] = useState<ConversationFilters>(
    initialFilters ?? { status: 'open' }
  );

  // ---------------------------------------------------------------------------
  // TanStack Query - Single Source of Truth
  // ---------------------------------------------------------------------------

  // Conversations list
  const {
    data: conversations = [],
    isLoading: conversationsLoading,
    error: conversationsQueryError,
  } = useMessagingConversations(conversationFilters);

  // Active conversation details
  const {
    data: activeConversation,
    isLoading: activeConversationLoading,
  } = useMessagingConversation(activeConversationId ?? undefined);

  // Messages for active conversation
  const {
    data: messages = [],
    isLoading: messagesLoading,
    error: messagesQueryError,
  } = useMessagingMessages(activeConversationId ?? undefined);

  // Unread count
  const { data: unreadCount = 0 } = useUnreadConversationCount();

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const sendTextMessageMutation = useSendTextMessage();
  const markConversationReadMutation = useMarkConversationRead();
  const updateConversationMutation = useUpdateConversation();

  // ---------------------------------------------------------------------------
  // Realtime Sync
  // ---------------------------------------------------------------------------

  // Subscribe to realtime updates for messaging tables
  useRealtimeSync(['messaging_conversations', 'messaging_messages']);

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  const conversationsError = conversationsQueryError
    ? (conversationsQueryError as Error).message
    : null;

  const messagesError = messagesQueryError
    ? (messagesQueryError as Error).message
    : null;

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string, replyToMessageId?: string) => {
      if (!activeConversationId) return;

      await sendTextMessageMutation.mutateAsync({
        conversationId: activeConversationId,
        text,
        replyToMessageId,
      });
    },
    [activeConversationId, sendTextMessageMutation]
  );

  const markAsRead = useCallback(async () => {
    if (!activeConversationId) return;

    await markConversationReadMutation.mutateAsync(activeConversationId);
  }, [activeConversationId, markConversationReadMutation]);

  const resolveConversation = useCallback(async () => {
    if (!activeConversationId) return;

    await updateConversationMutation.mutateAsync({
      conversationId: activeConversationId,
      input: { status: 'resolved' },
    });
  }, [activeConversationId, updateConversationMutation]);

  const reopenConversation = useCallback(async () => {
    if (!activeConversationId) return;

    await updateConversationMutation.mutateAsync({
      conversationId: activeConversationId,
      input: { status: 'open' },
    });
  }, [activeConversationId, updateConversationMutation]);

  const updatePriority = useCallback(
    async (priority: ConversationPriority) => {
      if (!activeConversationId) return;

      await updateConversationMutation.mutateAsync({
        conversationId: activeConversationId,
        input: { priority },
      });
    },
    [activeConversationId, updateConversationMutation]
  );

  // ---------------------------------------------------------------------------
  // Refresh Functions
  // ---------------------------------------------------------------------------

  const refreshConversations = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.messagingConversations.all,
    });
  }, [queryClient]);

  const refreshMessages = useCallback(async () => {
    if (!activeConversationId) return;

    await queryClient.invalidateQueries({
      queryKey: queryKeys.messagingMessages.byConversation(activeConversationId),
    });
  }, [queryClient, activeConversationId]);

  // ---------------------------------------------------------------------------
  // Lookup Maps
  // ---------------------------------------------------------------------------

  const conversationMap = useMemo(() => {
    return conversations.reduce(
      (acc, conv) => {
        acc[conv.id] = conv;
        return acc;
      },
      {} as Record<string, ConversationView>
    );
  }, [conversations]);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value = useMemo(
    () => ({
      // Active conversation
      activeConversationId,
      setActiveConversationId,
      activeConversation: activeConversation ?? null,
      activeConversationLoading,

      // Conversations list
      conversations,
      conversationsLoading,
      conversationsError,
      conversationFilters,
      setConversationFilters,

      // Messages
      messages,
      messagesLoading,
      messagesError,

      // Unread count
      unreadCount,

      // Operations
      sendMessage,
      markAsRead,
      resolveConversation,
      reopenConversation,
      updatePriority,

      // Refresh
      refreshConversations,
      refreshMessages,

      // Lookup maps
      conversationMap,
    }),
    [
      activeConversationId,
      setActiveConversationId,
      activeConversation,
      activeConversationLoading,
      conversations,
      conversationsLoading,
      conversationsError,
      conversationFilters,
      setConversationFilters,
      messages,
      messagesLoading,
      messagesError,
      unreadCount,
      sendMessage,
      markAsRead,
      resolveConversation,
      reopenConversation,
      updatePriority,
      refreshConversations,
      refreshMessages,
      conversationMap,
    ]
  );

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
};

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access the messaging context.
 * Must be used within a MessagingProvider.
 */
export function useMessaging() {
  const context = useContext(MessagingContext);

  if (context === undefined) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }

  return context;
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { MessagingContextType };

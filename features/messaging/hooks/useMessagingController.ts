'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations, useUpdateConversation } from './useConversations';
import { useMessages, useSendMessage, useAddChatwootMessageToCache } from './useMessages';
import { useMessagingRealtime } from './useMessagingRealtime';
import { useMarkAsRead } from './useMarkAsRead';
import { useUploadAttachment } from './useUploadAttachment';
import type { ConversationFilters } from '../types/messaging';

/**
 * Main controller hook for the messaging feature.
 *
 * This hook orchestrates conversations and messages from Chatwoot,
 * providing a unified interface for the MessagingPage and related components.
 *
 * Realtime updates are handled via:
 * - messaging_conversation_links: conversation status/metadata updates
 * - messaging_messages_cache: new incoming messages (when Phase 2 is complete)
 */
export function useMessagingController() {
    // State
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [filters, setFilters] = useState<ConversationFilters>({});
    const [draftMessage, setDraftMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Ref to track last marked conversation to prevent duplicate calls
    const lastMarkedConversationRef = useRef<string | null>(null);

    // Queries - now using Chatwoot via adapted hooks
    const {
        data: conversationsData,
        isLoading: isLoadingConversations,
        refetch: refetchConversations,
    } = useConversations({ filters });

    const {
        data: messagesData,
        isLoading: isLoadingMessages,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useMessages({ conversationId: selectedConversationId });

    // Mutations
    const queryClient = useQueryClient();
    const updateConversation = useUpdateConversation();
    const sendMessageMutation = useSendMessage();
    const uploadAttachmentMutation = useUploadAttachment();
    const addChatwootMessageToCache = useAddChatwootMessageToCache();
    const markAsRead = useMarkAsRead();

    // Realtime subscriptions - dedicated hook for messaging tables
    // Handles both messaging_conversation_links (status/metadata updates) and
    // messaging_messages_cache (new incoming messages via webhook)
    useMessagingRealtime({
        conversationId: selectedConversationId ? parseInt(selectedConversationId, 10) : undefined,
        enabled: true,
        onNewMessage: (message) => {
            // Add incoming message to React Query cache
            addChatwootMessageToCache(message);
        },
        onConversationUpdate: () => {
            // Refetch conversations when status/metadata changes
            refetchConversations();
        },
    });

    // Derived state
    const conversations = useMemo(
        () => conversationsData?.data || [],
        [conversationsData]
    );

    const messages = useMemo(() => {
        if (!messagesData?.pages) return [];
        return messagesData.pages.flatMap((page) => page.data);
    }, [messagesData]);

    const selectedConversation = useMemo(
        () => conversations.find((c) => c.id === selectedConversationId) || null,
        [conversations, selectedConversationId]
    );

    const unreadCount = useMemo(
        () => conversations.reduce((acc, c) => acc + c.unread_count, 0),
        [conversations]
    );

    // Handlers
    const handleSelectConversation = useCallback((id: string) => {
        setSelectedConversationId(id);
        setDraftMessage('');
    }, []);

    const handleSendMessage = useCallback(async () => {
        console.log('[handleSendMessage] Called with:', {
            selectedConversationId,
            draftMessage: draftMessage.substring(0, 50),
            isSending,
        });

        if (!selectedConversationId || !draftMessage.trim() || isSending) {
            console.log('[handleSendMessage] Blocked:', {
                noConversation: !selectedConversationId,
                emptyMessage: !draftMessage.trim(),
                alreadySending: isSending,
            });
            return;
        }

        setIsSending(true);
        try {
            console.log('[handleSendMessage] Sending to:', selectedConversationId);
            await sendMessageMutation.mutateAsync({
                conversation_id: selectedConversationId,
                content: draftMessage.trim(),
            });
            console.log('[handleSendMessage] Success');
            setDraftMessage('');
        } catch (error) {
            console.error('[handleSendMessage] Failed:', error);
        } finally {
            setIsSending(false);
        }
    }, [selectedConversationId, draftMessage, isSending, sendMessageMutation]);

    const handleUpdateConversationStatus = useCallback(
        async (status: 'open' | 'pending' | 'resolved' | 'archived') => {
            if (!selectedConversationId) return;
            // Map 'archived' to 'resolved' for Chatwoot (Chatwoot doesn't have archived status)
            const chatwootStatus = status === 'archived' ? 'resolved' : status;
            await updateConversation.mutateAsync({
                id: selectedConversationId,
                updates: { status: chatwootStatus },
            });
        },
        [selectedConversationId, updateConversation]
    );

    const handleToggleAI = useCallback(async () => {
        if (!selectedConversation || !selectedConversationId) return;

        const numericId = parseInt(selectedConversationId, 10);
        if (isNaN(numericId)) return;

        try {
            // Fetch current labels
            const getRes = await fetch(`/api/chatwoot/conversations/${numericId}/labels`);
            if (!getRes.ok) throw new Error('Failed to fetch labels');
            const { labels: currentLabels } = await getRes.json() as { labels: string[] };

            const hasLabel = currentLabels.includes('atendimento-humano');
            const newLabels = hasLabel
                ? currentLabels.filter((l: string) => l !== 'atendimento-humano')
                : [...currentLabels, 'atendimento-humano'];

            // Update labels
            const postRes = await fetch(`/api/chatwoot/conversations/${numericId}/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labels: newLabels }),
            });
            if (!postRes.ok) throw new Error('Failed to update labels');

            // Refresh conversations to reflect new ai_enabled state
            queryClient.invalidateQueries({ queryKey: ['chatwoot'] });
        } catch (error) {
            console.error('Error toggling AI:', error);
        }
    }, [selectedConversation, selectedConversationId, queryClient]);

    const handleFilterChange = useCallback((newFilters: Partial<ConversationFilters>) => {
        setFilters((prev) => ({ ...prev, ...newFilters }));
    }, []);

    const handleLoadMoreMessages = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const handleSendAudio = useCallback(async (blob: Blob) => {
        if (!selectedConversationId) return;

        await uploadAttachmentMutation.mutateAsync({
            conversationId: selectedConversationId,
            file: blob,
        });
    }, [selectedConversationId, uploadAttachmentMutation]);

    const handleSendAttachment = useCallback(async (file: File, caption?: string) => {
        if (!selectedConversationId) return;

        await uploadAttachmentMutation.mutateAsync({
            conversationId: selectedConversationId,
            file,
            content: caption,
        });
    }, [selectedConversationId, uploadAttachmentMutation]);

    // Auto-select first conversation
    useEffect(() => {
        if (!selectedConversationId && conversations.length > 0) {
            setSelectedConversationId(conversations[0].id);
        }
    }, [conversations, selectedConversationId]);

    // Mark conversation as read when selected
    // TEMPORARILY DISABLED - was causing infinite loop
    // TODO: Re-enable with proper debouncing
    // useEffect(() => {
    //     if (selectedConversationId && selectedConversationId !== lastMarkedConversationRef.current) {
    //         const numericId = parseInt(selectedConversationId, 10);
    //         if (!isNaN(numericId)) {
    //             lastMarkedConversationRef.current = selectedConversationId;
    //             markAsRead.mutate(numericId);
    //         }
    //     }
    // }, [selectedConversationId]);

    return {
        // State
        selectedConversationId,
        selectedConversation,
        conversations,
        messages,
        filters,
        draftMessage,
        unreadCount,

        // Loading states
        isLoadingConversations,
        isLoadingMessages,
        isSending,
        isFetchingNextPage,
        hasNextPage,

        // Setters
        setDraftMessage,

        // Handlers
        handleSelectConversation,
        handleSendMessage,
        handleSendAudio,
        handleSendAttachment,
        handleUpdateConversationStatus,
        handleToggleAI,
        handleFilterChange,
        handleLoadMoreMessages,
        refetchConversations,

        // Upload states
        isUploadingAttachment: uploadAttachmentMutation.isPending,
    };
}

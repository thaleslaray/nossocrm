/**
 * @fileoverview Search Messages Query Hook
 *
 * Hook para busca de mensagens dentro de uma conversa com debounce.
 *
 * @module lib/query/hooks/useSearchMessagesQuery
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { queryKeys } from '../queryKeys';

interface SearchMessage {
  id: string;
  conversation_id: string;
  direction: string;
  content_type: string;
  content: { text?: string; [key: string]: unknown };
  status: string;
  sender_name: string | null;
  created_at: string;
}

export function useSearchMessagesQuery(
  conversationId: string | undefined,
  searchTerm: string
) {
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  return useQuery({
    queryKey: queryKeys.messagingMessages.search(conversationId, debouncedTerm),
    queryFn: async (): Promise<SearchMessage[]> => {
      const params = new URLSearchParams({
        conversationId: conversationId!,
        q: debouncedTerm,
      });
      const response = await fetch(`/api/messaging/messages/search?${params}`);
      if (!response.ok) {
        throw new Error('Search failed');
      }
      const data = await response.json();
      return data.messages;
    },
    enabled: !!conversationId && debouncedTerm.length >= 2,
    staleTime: 30 * 1000,
  });
}

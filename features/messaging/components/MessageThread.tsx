'use client';

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, MessageSquare } from 'lucide-react';
import { PresenceIndicator } from './PresenceIndicator';
import { MessageBubble } from './MessageBubble';
import { useMessagesInfinite } from '@/lib/query/hooks/useMessagesQuery';
import type { MessagingMessage } from '@/lib/messaging/types';

interface MessageThreadProps {
  conversationId: string;
  /** Contact presence status from useContactPresence */
  presenceStatus?: 'online' | 'typing' | 'recording' | 'offline';
  onReply?: (message: MessagingMessage) => void;
}

function DateDivider({ date }: { date: Date }) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let label: string;
  if (isSameDay(date, today)) {
    label = 'Hoje';
  } else if (isSameDay(date, yesterday)) {
    label = 'Ontem';
  } else {
    label = format(date, "d 'de' MMMM", { locale: ptBR });
  }

  return (
    <div className="flex items-center justify-center my-4">
      <span className="px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full">
        {label}
      </span>
    </div>
  );
}

export function MessageThread({ conversationId, presenceStatus, onReply }: MessageThreadProps) {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useMessagesInfinite(conversationId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const isLoadingOlderRef = useRef(false);

  // Flatten pages into single message array (chronological order).
  // Filter out reaction messages — they are displayed as pills on the target
  // message bubble, not as standalone bubbles in the thread.
  const messages = (data?.pages.flatMap((p) => p.messages) ?? []).filter(
    (m) => m.contentType !== 'reaction',
  );

  // Scroll to bottom on new messages (not when loading older)
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && !isLoadingOlderRef.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: prevMessagesLengthRef.current === 0 ? 'auto' : 'smooth',
      });
    }
    isLoadingOlderRef.current = false;
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // IntersectionObserver on sentinel to trigger loading older messages
  const handleSentinel = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        const el = scrollRef.current;
        const prevScrollHeight = el?.scrollHeight || 0;

        isLoadingOlderRef.current = true;
        fetchNextPage().then(() => {
          // Preserve scroll position after loading older messages
          requestAnimationFrame(() => {
            if (el) {
              const newScrollHeight = el.scrollHeight;
              el.scrollTop += newScrollHeight - prevScrollHeight;
            }
          });
        });
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleSentinel, {
      root: scrollRef.current,
      threshold: 0.1,
    });
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [handleSentinel]);

  // Group messages by date — must be before early returns (Rules of Hooks)
  const messagesWithDates = useMemo(() => {
    const result: Array<
      { type: 'date'; date: Date } | { type: 'message'; message: MessagingMessage }
    > = [];
    let lastDate: string | null = null;

    messages.forEach((message) => {
      const messageDate = new Date(message.createdAt);
      const dateKey = format(messageDate, 'yyyy-MM-dd');

      if (dateKey !== lastDate) {
        result.push({ type: 'date', date: messageDate });
        lastDate = dateKey;
      }
      result.push({ type: 'message', message });
    });

    return result;
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Carregando mensagens...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500">Erro ao carregar mensagens</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
        <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
        <p>Nenhuma mensagem ainda</p>
        <p className="text-sm">Envie uma mensagem para iniciar a conversa</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Mensagens da conversa"
      className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50 dark:bg-slate-900/50"
    >
      {/* Sentinel for loading older messages */}
      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-slate-400 mr-2" />
          <span className="text-xs text-slate-400">Carregando mensagens anteriores...</span>
        </div>
      )}

      {messagesWithDates.map((item, index) => {
        if (item.type === 'date') {
          return <DateDivider key={`date-${format(item.date, 'yyyy-MM-dd')}`} date={item.date} />;
        }
        return (
          <MessageBubble
            key={item.message.id}
            message={item.message}
            conversationId={conversationId}
            allMessages={messages}
            onReply={onReply}
          />
        );
      })}

      {/* Typing / recording indicator */}
      {presenceStatus && presenceStatus !== 'offline' && presenceStatus !== 'online' && (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <PresenceIndicator status={presenceStatus} showLabel size="md" />
        </div>
      )}
    </div>
  );
}

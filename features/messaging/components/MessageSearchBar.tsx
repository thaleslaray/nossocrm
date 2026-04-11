'use client';

/**
 * @fileoverview Message Search Bar
 *
 * Barra de busca de mensagens dentro de uma conversa.
 * Exibe resultados em um dropdown com preview e navegação.
 *
 * @module features/messaging/components/MessageSearchBar
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useSearchMessagesQuery } from '@/lib/query/hooks/useSearchMessagesQuery';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MessageSearchBarProps {
  conversationId: string;
  onClose: () => void;
  onResultClick?: (messageId: string) => void;
}

export function MessageSearchBar({
  conversationId,
  onClose,
  onResultClick,
}: MessageSearchBarProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { data: results, isLoading } = useSearchMessagesQuery(conversationId, query);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 px-4 py-2">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nas mensagens..."
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
        />
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Results dropdown */}
      {query.length >= 2 && results && results.length > 0 && (
        <div className="max-h-64 overflow-y-auto border-t border-slate-100 dark:border-white/5">
          {results.map((msg) => (
            <button
              key={msg.id}
              type="button"
              onClick={() => onResultClick?.(msg.id)}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  {msg.sender_name || (msg.direction === 'inbound' ? 'Contato' : 'Você')}
                </span>
                <span className="text-xs text-slate-400">
                  {format(new Date(msg.created_at), "d MMM, HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 truncate mt-0.5">
                {highlightMatch(msg.content?.text || '', query)}
              </p>
            </button>
          ))}
        </div>
      )}

      {query.length >= 2 && results && results.length === 0 && !isLoading && (
        <div className="px-4 py-3 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-white/5">
          Nenhuma mensagem encontrada
        </div>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-200 dark:bg-yellow-500/30 text-inherit rounded-sm px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}

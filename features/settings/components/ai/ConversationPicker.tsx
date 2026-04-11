'use client';

/**
 * @fileoverview Conversation Picker Component
 *
 * Permite selecionar conversas para o Few-Shot Learning.
 * Mostra conversas com deals ganhos ou em progresso para aprendizado.
 *
 * @module features/settings/components/ai/ConversationPicker
 */

import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  MessageSquare,
  Clock,
  Search,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMessagingConversations } from '@/lib/query/hooks';
import type { ConversationView } from '@/lib/messaging/types';

// =============================================================================
// Types
// =============================================================================

interface ConversationPickerProps {
  /** IDs das conversas selecionadas */
  selectedIds: string[];
  /** Callback quando seleção muda */
  onSelectionChange: (ids: string[]) => void;
  /** Mínimo de conversas necessárias */
  minRequired?: number;
  /** Máximo de conversas permitidas */
  maxAllowed?: number;
}

// =============================================================================
// Component
// =============================================================================

export function ConversationPicker({
  selectedIds,
  onSelectionChange,
  minRequired = 2,
  maxAllowed = 10,
}: ConversationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: conversations = [], isLoading } = useMessagingConversations();

  // Filtrar conversas com mensagens suficientes
  const eligibleConversations = useMemo(() => {
    return conversations.filter((conv) => {
      // Pelo menos 4 mensagens para ter contexto
      if (conv.messageCount < 4) return false;

      // Filtrar por busca
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const contactName = (conv.contactName || conv.externalContactName || '').toLowerCase();
        return contactName.includes(query);
      }

      return true;
    });
  }, [conversations, searchQuery]);

  // Ordenar por número de mensagens (mais mensagens primeiro)
  const sortedConversations = useMemo(() => {
    return [...eligibleConversations].sort((a, b) => {
      return b.messageCount - a.messageCount;
    });
  }, [eligibleConversations]);

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else if (selectedIds.length < maxAllowed) {
      onSelectionChange([...selectedIds, id]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-slate-900 dark:text-white">
            Selecione Conversas de Sucesso
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Escolha {minRequired}-{maxAllowed} conversas que representam seu estilo de vendas
          </p>
        </div>
        <Badge
          variant={selectedIds.length >= minRequired ? 'default' : 'outline'}
          className={cn(
            'tabular-nums',
            selectedIds.length >= minRequired && 'bg-green-600'
          )}
        >
          {selectedIds.length}/{maxAllowed}
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por contato ou deal..."
          className={cn(
            'w-full pl-10 pr-4 py-2 rounded-lg border',
            'bg-white dark:bg-slate-800',
            'border-slate-200 dark:border-slate-700',
            'text-sm text-slate-900 dark:text-white',
            'placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-primary-500'
          )}
        />
      </div>

      {/* Conversation List */}
      <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
        {sortedConversations.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">
              {searchQuery
                ? 'Nenhuma conversa encontrada'
                : 'Nenhuma conversa com mensagens suficientes'}
            </p>
            <p className="text-xs mt-1">Conversas precisam ter pelo menos 4 mensagens</p>
          </div>
        ) : (
          sortedConversations.map((conv) => (
            <ConversationCard
              key={conv.id}
              conversation={conv}
              isSelected={selectedIds.includes(conv.id)}
              onToggle={() => handleToggle(conv.id)}
              disabled={!selectedIds.includes(conv.id) && selectedIds.length >= maxAllowed}
            />
          ))
        )}
      </div>

      {/* Tip */}
      {selectedIds.length > 0 && selectedIds.length < minRequired && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Selecione pelo menos {minRequired - selectedIds.length} mais
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Conversation Card
// =============================================================================

interface ConversationCardProps {
  conversation: ConversationView;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
}

function ConversationCard({
  conversation,
  isSelected,
  onToggle,
  disabled,
}: ConversationCardProps) {
  const displayName = conversation.contactName || conversation.externalContactName || 'Contato';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        'hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-500/50'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="mt-0.5">
          {isSelected ? (
            <CheckCircle2 className="h-5 w-5 text-primary-500" />
          ) : (
            <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-slate-900 dark:text-white truncate">
              {displayName}
            </span>
            {conversation.messageCount >= 10 && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
                <MessageSquare className="h-3 w-3 mr-1" />
                Extensa
              </Badge>
            )}
          </div>

          {conversation.lastMessagePreview && (
            <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
              {conversation.lastMessagePreview}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {conversation.messageCount} mensagens
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(conversation.lastMessageAt || conversation.createdAt).toLocaleDateString(
                'pt-BR'
              )}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

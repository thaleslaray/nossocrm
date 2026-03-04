'use client';

import { useState, useEffect } from 'react';
import { useWhatsAppConversations, useSyncChats } from '@/lib/query/whatsapp';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import type { WhatsAppConversation } from '@/types/whatsapp';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search,
  Bot,
  User,
  MessageSquare,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface ConversationListProps {
  selectedId?: string;
  onSelect: (conversation: WhatsAppConversation) => void;
  instanceId?: string;
}

export function ConversationList({ selectedId, onSelect, instanceId }: ConversationListProps) {
  const [search, setSearch] = useState('');
  const { data: conversations, isLoading } = useWhatsAppConversations({
    instanceId,
    search: search || undefined,
  });
  const syncChats = useSyncChats();

  const handleSync = () => {
    if (!instanceId || syncChats.isPending) return;
    syncChats.mutate(instanceId);
  };

  // Supabase Realtime subscription for conversation updates
  const queryClient = useQueryClient();
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel('conversations-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
      }, () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.whatsappConversations.all,
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-card border-r border-slate-200 dark:border-white/10">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-500" />
            Conversas
          </h2>
          {instanceId && (
            <button
              onClick={handleSync}
              disabled={syncChats.isPending}
              title="Sincronizar conversas do WhatsApp"
              className="p-1.5 rounded-lg text-slate-400 hover:text-primary-500 hover:bg-primary-500/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncChats.isPending ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversas..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-dark-bg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        {syncChats.isSuccess && (
          <p className="text-xs text-green-500 mt-2">Conversas sincronizadas!</p>
        )}
        {syncChats.isError && (
          <p className="text-xs text-red-500 mt-2">Erro ao sincronizar. Tente novamente.</p>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
          </div>
        ) : !conversations || conversations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {search ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
            </p>
            {!search && instanceId && (
              <button
                onClick={handleSync}
                disabled={syncChats.isPending}
                className="mt-3 px-4 py-2 text-xs font-medium text-primary-600 bg-primary-500/10 rounded-lg hover:bg-primary-500/20 transition-colors disabled:opacity-50"
              >
                {syncChats.isPending ? 'Sincronizando...' : 'Sincronizar do WhatsApp'}
              </button>
            )}
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === selectedId}
              onClick={() => onSelect(conv)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation Item
// ---------------------------------------------------------------------------

function ConversationItem({
  conversation,
  isActive,
  onClick,
}: {
  conversation: WhatsAppConversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const displayName = conversation.contact?.name || conversation.contact_name || conversation.phone;
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true, locale: ptBR })
    : '';

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-4 text-left transition-colors border-b border-slate-100 dark:border-white/5 ${
        isActive
          ? 'bg-primary-500/5 border-l-2 border-l-primary-500'
          : 'hover:bg-slate-50 dark:hover:bg-white/5'
      }`}
    >
      {/* Avatar */}
      {conversation.contact_photo ? (
        <img
          src={conversation.contact_photo}
          alt={displayName}
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {initials || <User className="w-4 h-4" />}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm text-slate-900 dark:text-white truncate">
            {displayName}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">{timeAgo}</span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-slate-500 truncate">
            {conversation.last_message_from_me && (
              <span className="text-slate-400">Você: </span>
            )}
            {conversation.last_message_text || 'Sem mensagens'}
          </p>

          <div className="flex items-center gap-1.5 shrink-0">
            {conversation.ai_active && (
              <span className="w-4 h-4 rounded-full bg-violet-500/10 flex items-center justify-center" title="I.A. ativa">
                <Bot className="w-2.5 h-2.5 text-violet-500" />
              </span>
            )}
            {conversation.unread_count > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center">
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

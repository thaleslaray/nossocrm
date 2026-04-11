'use client';

import React, { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import { ChannelIndicator } from './ChannelIndicator';
import { PresenceIndicator } from './PresenceIndicator';
import type { ConversationView } from '@/lib/messaging/types';
import type { PresenceStatus } from '@/lib/messaging/hooks/useContactPresence';

interface ConversationItemProps {
  conversation: ConversationView;
  isSelected: boolean;
  onClick: () => void;
  presenceStatus?: PresenceStatus;
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  onClick,
  presenceStatus = 'offline',
}: ConversationItemProps) {
  const {
    externalContactName,
    externalContactAvatar,
    channelType,
    lastMessagePreview,
    lastMessageAt,
    lastMessageDirection,
    unreadCount,
    isWindowExpired,
    windowMinutesRemaining,
    assignedUserName,
    status,
  } = conversation;

  const displayName = externalContactName || 'Contato desconhecido';
  const timeAgo = lastMessageAt
    ? formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true, locale: ptBR })
    : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 flex items-start gap-3 transition-colors text-left',
        'hover:bg-slate-50 dark:hover:bg-white/5',
        'border-b border-slate-100 dark:border-white/5',
        isSelected && 'bg-primary-50 dark:bg-primary-500/10 border-l-2 border-l-primary-500',
        status === 'resolved' && 'opacity-60'
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {sanitizeUrl(externalContactAvatar) ? (
          <img
            src={sanitizeUrl(externalContactAvatar)}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
            <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </div>
        )}
        {/* Channel indicator */}
        <div className="absolute -bottom-0.5 -right-0.5">
          <ChannelIndicator type={channelType} size="sm" />
        </div>
        {/* Presence dot */}
        {presenceStatus !== 'offline' && (
          <div className="absolute -top-0.5 -right-0.5">
            <PresenceIndicator status={presenceStatus} size="sm" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name and time */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'font-medium truncate text-sm',
              unreadCount > 0
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-700 dark:text-slate-300'
            )}
          >
            {displayName}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
            {timeAgo}
          </span>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {lastMessageDirection === 'outbound' && (
            <span className="text-xs text-slate-400">Você:</span>
          )}
          <p
            className={cn(
              'text-sm truncate',
              unreadCount > 0
                ? 'text-slate-700 dark:text-slate-200 font-medium'
                : 'text-slate-500 dark:text-slate-400'
            )}
          >
            {lastMessagePreview || 'Sem mensagens'}
          </p>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 mt-1.5">
          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-primary-500 text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}

          {/* Window expiry */}
          {!isWindowExpired && windowMinutesRemaining !== undefined && windowMinutesRemaining <= 60 && (
            <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
              <Clock className="w-3 h-3" />
              {windowMinutesRemaining}min
            </span>
          )}
          {isWindowExpired && (
            <span className="text-xs text-red-500">Janela expirada</span>
          )}

          {/* Assigned */}
          {assignedUserName && (
            <span className="text-xs text-slate-400 truncate max-w-[80px]">
              {assignedUserName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

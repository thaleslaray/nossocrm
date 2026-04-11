'use client';

import React, { memo, useState } from 'react';
import {
  User,
  Phone,
  Mail,
  Building,
  Tag,
  Calendar,
  Clock,
  ExternalLink,
  Briefcase,
  ChevronDown,
  ChevronUp,
  LinkIcon,
  MessageSquare,
  GitMerge,
  BotOff,
  Bot,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { sanitizeUrl } from '@/lib/utils/sanitize';
import type { ConversationView } from '@/lib/messaging/types';
import { ChannelIndicator } from './ChannelIndicator';
import { WindowExpiryBadge } from './WindowExpiryBadge';
import { ContactPanelSkeleton } from './skeletons/ContactPanelSkeleton';
import { useUpdateContact } from '@/lib/query/hooks/useContactsQuery';
import { useToggleConversationAiPause } from '@/lib/query/hooks/useMessagingConversationsQuery';

interface ContactPanelProps {
  conversation: ConversationView | null | undefined;
  isLoading?: boolean;
  onLinkContact?: () => void;
  onViewContact?: (contactId: string) => void;
  onViewDeals?: (contactId: string) => void;
  hasDuplicate?: boolean;
  onResolveDuplicate?: () => void;
  className?: string;
}

interface InfoRowProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  className?: string;
}

const InfoRow = memo(function InfoRow({ icon: Icon, label, value, className }: InfoRowProps) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <div className="text-sm text-slate-900 dark:text-white break-words">
          {value}
        </div>
      </div>
    </div>
  );
});

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const Section = memo(function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-200 dark:border-white/10 last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 py-3 px-1 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {isOpen && <div className="pb-4 space-y-3">{children}</div>}
    </div>
  );
});

export const ContactPanel = memo(function ContactPanel({
  conversation,
  isLoading,
  onLinkContact,
  onViewContact,
  onViewDeals,
  hasDuplicate,
  onResolveDuplicate,
  className,
}: ContactPanelProps) {
  // Hooks must be called unconditionally before any early returns
  const updateContact = useUpdateContact();
  const toggleConversationAiPause = useToggleConversationAiPause();

  const contactId = conversation?.contactId;
  const isAiPaused = contactId
    ? (conversation?.contactAiPaused ?? false)
    : (conversation?.metadata?.ai_paused === true);
  const isPending = updateContact.isPending || toggleConversationAiPause.isPending;

  function handleToggleAiPause() {
    if (!conversation) return;
    if (contactId) {
      updateContact.mutate({ id: contactId, updates: { aiPaused: !isAiPaused } });
    } else {
      toggleConversationAiPause.mutate({
        conversationId: conversation.id,
        paused: !isAiPaused,
        currentMetadata: conversation.metadata as Record<string, unknown>,
      });
    }
  }

  if (isLoading) {
    return <ContactPanelSkeleton className={className} />;
  }

  if (!conversation) {
    return (
      <div className={cn('p-4', className)}>
        <div className="text-center py-8">
          <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Selecione uma conversa para ver detalhes
          </p>
        </div>
      </div>
    );
  }

  const {
    externalContactName,
    externalContactAvatar,
    contactName,
    contactEmail,
    contactPhone,
    channelType,
    channelName,
    windowExpiresAt,
    assignedUserName,
    createdAt,
    lastMessageAt,
    messageCount,
    status,
    priority,
  } = conversation;

  const displayName = contactName || externalContactName || 'Contato desconhecido';
  const hasLinkedContact = !!contactId;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-white/10">
        {/* Avatar & Name */}
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            {sanitizeUrl(externalContactAvatar) ? (
              <img
                src={sanitizeUrl(externalContactAvatar)}
                alt={displayName}
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <User className="w-7 h-7 text-slate-500 dark:text-slate-400" />
              </div>
            )}
            {/* Channel indicator on avatar */}
            <div className="absolute -bottom-1 -right-1">
              <ChannelIndicator type={channelType} size="sm" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
              {displayName}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {channelName}
            </p>
            {/* Status badges */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  status === 'open'
                    ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                )}
              >
                {status === 'open' ? 'Aberto' : 'Resolvido'}
              </span>
              {priority && priority !== 'normal' && (
                <span
                  className={cn(
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    priority === 'high' && 'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400',
                    priority === 'urgent' && 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                  )}
                >
                  {priority === 'high' ? 'Alta' : priority === 'urgent' ? 'Urgente' : priority}
                </span>
              )}
              <WindowExpiryBadge windowExpiresAt={windowExpiresAt} variant="inline" />
              {hasDuplicate && (
                <button
                  type="button"
                  onClick={onResolveDuplicate}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20 transition-colors"
                >
                  <GitMerge className="w-3 h-3" />
                  Duplicado
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-4">
          {hasLinkedContact && onViewContact && (
            <button
              type="button"
              onClick={() => onViewContact(contactId!)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400',
                'hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-colors'
              )}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver Contato
            </button>
          )}
          {!hasLinkedContact && onLinkContact && (
            <button
              type="button"
              onClick={onLinkContact}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
                'hover:bg-slate-200 dark:hover:bg-white/10 transition-colors'
              )}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Vincular Contato
            </button>
          )}
          {hasLinkedContact && onViewDeals && (
            <button
              type="button"
              onClick={() => onViewDeals(contactId!)}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium',
                'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
                'hover:bg-slate-200 dark:hover:bg-white/10 transition-colors'
              )}
            >
              <Briefcase className="w-3.5 h-3.5" />
              Deals
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Contact Info */}
        <Section title="Informações">
          {contactPhone && (
            <InfoRow icon={Phone} label="Telefone" value={contactPhone} />
          )}
          {contactEmail && (
            <InfoRow icon={Mail} label="Email" value={contactEmail} />
          )}
          {assignedUserName && (
            <InfoRow icon={User} label="Atribuído para" value={assignedUserName} />
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {isAiPaused ? (
                <BotOff className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              ) : (
                <Bot className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  IA {contactId ? '(contato)' : '(conversa)'}
                </p>
                <p className="text-sm text-slate-900 dark:text-white">
                  {isAiPaused ? 'Pausada' : 'Ativa'}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={handleToggleAiPause}
              className={cn(
                'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                'transition-colors duration-200 ease-in-out focus:outline-none',
                isAiPaused ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700',
                isPending && 'opacity-50 cursor-not-allowed'
              )}
              title={
                isAiPaused
                  ? contactId ? 'Reativar IA para este contato' : 'Reativar IA para esta conversa'
                  : contactId ? 'Pausar IA para este contato' : 'Pausar IA para esta conversa'
              }
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0',
                  'transition duration-200 ease-in-out',
                  isAiPaused ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </Section>

        {/* Conversation Stats */}
        <Section title="Conversa">
          <InfoRow
            icon={MessageSquare}
            label="Mensagens"
            value={`${messageCount} mensage${messageCount === 1 ? 'm' : 'ns'}`}
          />
          <InfoRow
            icon={Calendar}
            label="Iniciada em"
            value={createdAt ? format(new Date(createdAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : '-'}
          />
          <InfoRow
            icon={Clock}
            label="Última mensagem"
            value={
              lastMessageAt
                ? formatDistanceToNow(new Date(lastMessageAt), { addSuffix: true, locale: ptBR })
                : '-'
            }
          />
        </Section>

        {/* Tags/Labels placeholder */}
        <Section title="Tags" defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 rounded-full">
              Nenhuma tag
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Tags serão implementadas em uma versão futura.
          </p>
        </Section>
      </div>
    </div>
  );
});

export default ContactPanel;

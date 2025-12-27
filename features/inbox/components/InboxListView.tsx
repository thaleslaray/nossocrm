import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity } from '@/types';
import { AISuggestion } from '../hooks/useInboxController';
import { InboxSection } from './InboxSection';
import { InboxZeroState } from './InboxZeroState';
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Check,
  ExternalLink,
  X,
  Clock,
} from 'lucide-react';

interface InboxListViewProps {
  // Atividades
  overdueActivities: Activity[];
  todayMeetings: Activity[];
  todayTasks: Activity[];
  upcomingActivities: Activity[];

  // Sugestões
  aiSuggestions: AISuggestion[];

  // Handlers Atividades
  onCompleteActivity: (id: string) => void;
  onSnoozeActivity: (id: string) => void;
  onDiscardActivity: (id: string) => void;

  // Handlers Sugestões
  onAcceptSuggestion: (suggestion: AISuggestion) => void;
  onDismissSuggestion: (id: string) => void;
  onSnoozeSuggestion: (id: string) => void;
  onSelectActivity: (id: string) => void;

  // Presets de UI (ex.: vindo da Visão Geral)
  suggestionsDefaultOpen?: boolean;
  suggestionsDefaultShowAll?: boolean;
}

// Componente de Sugestão Simplificado (linha única)
const SuggestionRow: React.FC<{
  suggestion: AISuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
}> = ({ suggestion, onAccept, onDismiss, onSnooze }) => {
  const router = useRouter();

  const getIcon = () => {
    switch (suggestion.type) {
      case 'STALLED':
        return <AlertTriangle size={16} className="text-orange-500" />;
      case 'UPSELL':
        return <TrendingUp size={16} className="text-green-500" />;
      default:
        return <AlertTriangle size={16} className="text-slate-500" />;
    }
  };

  const value = suggestion.data.deal?.value;
  const dealId = suggestion.data.deal?.id;
  const contactId = suggestion.data.contact?.id;

  const navigationTarget = dealId
    ? { href: `/boards?deal=${dealId}`, label: 'Ver negócio' }
    : contactId
      ? { href: `/contacts?contactId=${contactId}`, label: 'Ver contato' }
      : null;

  // Navigate to deal or contact
  const handleNavigate = () => {
    if (!navigationTarget) return;
    router.push(navigationTarget.href);
  };

  return (
    <div className="group flex items-center gap-3 py-3 px-4 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg transition-colors">
      <div className="shrink-0">{getIcon()}</div>

      {/* Clickable area for navigation */}
      <button
        onClick={handleNavigate}
        disabled={!navigationTarget}
        className="flex-1 min-w-0 text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-60 disabled:hover:text-inherit"
      >
        <p className="text-sm text-slate-700 dark:text-slate-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
          {suggestion.description}
        </p>
      </button>

      {value && (
        <span className="shrink-0 text-sm font-medium text-green-600 dark:text-green-400">
          R$ {(value / 1000).toFixed(0)}k
        </span>
      )}

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onAccept}
          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-md transition-colors"
          aria-label="Aplicar sugestão"
          title="Aplicar"
        >
          <Check size={14} aria-hidden="true" />
        </button>
        <button
          onClick={onSnooze}
          className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-md transition-colors"
          aria-label="Adiar sugestão"
          title="Adiar"
        >
          <Clock size={14} aria-hidden="true" />
        </button>
        <button
          onClick={onDismiss}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
          aria-label="Descartar sugestão"
          title="Descartar"
        >
          <X size={14} aria-hidden="true" />
        </button>
        <button
          onClick={handleNavigate}
          className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-md transition-colors"
          aria-label={navigationTarget?.label || 'Abrir'}
          title={navigationTarget?.label || 'Abrir'}
          disabled={!navigationTarget}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

// Card de Sugestões IA Colapsável
const MAX_SUGGESTIONS = 5;

const AISuggestionsCard: React.FC<{
  suggestions: AISuggestion[];
  onAccept: (suggestion: AISuggestion) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  defaultOpen?: boolean;
  defaultShowAll?: boolean;
}> = ({
  suggestions,
  onAccept,
  onDismiss,
  onSnooze,
  defaultOpen,
  defaultShowAll,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? true);
  const [showAll, setShowAll] = useState(defaultShowAll ?? false);

  useEffect(() => {
    if (defaultOpen !== undefined) {
      setIsOpen(defaultOpen);
    }
  }, [defaultOpen]);

  useEffect(() => {
    if (defaultShowAll !== undefined) {
      setShowAll(defaultShowAll);
    }
  }, [defaultShowAll]);

  if (suggestions.length === 0) return null;

  const visibleSuggestions = showAll ? suggestions : suggestions.slice(0, MAX_SUGGESTIONS);
  const hasMore = suggestions.length > MAX_SUGGESTIONS;

  return (
    <div className="mb-6 border border-primary-200 dark:border-primary-500/20 rounded-xl overflow-hidden bg-primary-50/50 dark:bg-primary-500/5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 hover:bg-primary-100/50 dark:hover:bg-primary-500/10 transition-colors"
      >
        <div className="p-1.5 rounded-lg bg-primary-100 dark:bg-primary-500/20">
          <Sparkles size={16} className="text-primary-600 dark:text-primary-400" />
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">Sugestões da IA</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-200 dark:bg-primary-500/30 text-primary-700 dark:text-primary-300">
          {suggestions.length}
        </span>
        <div className="flex-1" />
        {isOpen ? (
          <ChevronDown size={18} className="text-slate-400" />
        ) : (
          <ChevronRight size={18} className="text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-primary-200 dark:border-primary-500/20 divide-y divide-primary-100 dark:divide-primary-500/10">
          {visibleSuggestions.map(suggestion => (
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={() => onAccept(suggestion)}
              onDismiss={() => onDismiss(suggestion.id)}
              onSnooze={() => onSnooze(suggestion.id)}
            />
          ))}

          {hasMore && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 px-4 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-100/50 dark:hover:bg-primary-500/10 transition-colors"
            >
              Ver todas as {suggestions.length} sugestões
            </button>
          )}

          {showAll && hasMore && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full py-3 px-4 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Mostrar menos
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Componente React `InboxListView`.
 *
 * @param {InboxListViewProps} {
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onCompleteActivity,
  onSnoozeActivity,
  onDiscardActivity,
  onAcceptSuggestion,
  onDismissSuggestion,
  onSnoozeSuggestion,
  onSelectActivity,
  suggestionsDefaultOpen,
  suggestionsDefaultShowAll,
} - Parâmetro `{
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onCompleteActivity,
  onSnoozeActivity,
  onDiscardActivity,
  onAcceptSuggestion,
  onDismissSuggestion,
  onSnoozeSuggestion,
  onSelectActivity,
  suggestionsDefaultOpen,
  suggestionsDefaultShowAll,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const InboxListView: React.FC<InboxListViewProps> = ({
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onCompleteActivity,
  onSnoozeActivity,
  onDiscardActivity,
  onAcceptSuggestion,
  onDismissSuggestion,
  onSnoozeSuggestion,
  onSelectActivity,
  suggestionsDefaultOpen,
  suggestionsDefaultShowAll,
}) => {
  const isEmpty =
    overdueActivities.length === 0
    && todayMeetings.length === 0
    && todayTasks.length === 0
    && upcomingActivities.length === 0
    && aiSuggestions.length === 0;

  if (isEmpty) {
    return <InboxZeroState />;
  }

  return (
    <div className="space-y-6">
      {/* AI Suggestions (Card único colapsável) */}
      <AISuggestionsCard
        suggestions={aiSuggestions}
        onAccept={onAcceptSuggestion}
        onDismiss={onDismissSuggestion}
        onSnooze={onSnoozeSuggestion}
        defaultOpen={suggestionsDefaultOpen}
        defaultShowAll={suggestionsDefaultShowAll}
      />

      {/* Activities */}
      <div className="space-y-2">
        <InboxSection
          title="Atrasados"
          activities={overdueActivities}
          color="red"
          filterParam="overdue"
          onToggleComplete={onCompleteActivity}
          onSnooze={onSnoozeActivity}
          onDiscard={onDiscardActivity}
          onSelect={onSelectActivity}
        />

        {/* Hoje separado: Reuniões vs Tarefas */}
        <InboxSection
          title="Reuniões Hoje"
          activities={todayMeetings}
          color="green"
          filterParam="today"
          onToggleComplete={onCompleteActivity}
          onSnooze={onSnoozeActivity}
          onDiscard={onDiscardActivity}
          onSelect={onSelectActivity}
        />

        <InboxSection
          title="Tarefas Hoje"
          activities={todayTasks}
          color="green"
          filterParam="today"
          onToggleComplete={onCompleteActivity}
          onSnooze={onSnoozeActivity}
          onDiscard={onDiscardActivity}
          onSelect={onSelectActivity}
        />

        <InboxSection
          title="Próximos"
          activities={upcomingActivities}
          color="slate"
          filterParam="upcoming"
          defaultOpen={false}
          onToggleComplete={onCompleteActivity}
          onSnooze={onSnoozeActivity}
          onDiscard={onDiscardActivity}
          onSelect={onSelectActivity}
        />
      </div>
    </div>
  );
};

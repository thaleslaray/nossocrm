import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, TrendingUp, UserX, ArrowRight, Sparkles, Target } from 'lucide-react';
import type { Activity } from '@/types';
import type { AISuggestion } from '../hooks/useInboxController';

interface InboxOverviewViewProps {
  overdueActivities: Activity[];
  todayMeetings: Activity[];
  todayTasks: Activity[];
  upcomingActivities: Activity[];
  aiSuggestions: AISuggestion[];

  onGoToList: () => void;
  onStartFocus: () => void;
  onAcceptSuggestion: (suggestion: AISuggestion) => void;
}

const StatCard: React.FC<{
  label: string;
  value: number;
  tone: 'neutral' | 'danger' | 'success' | 'warning';
  hint?: string;
  onClick?: () => void;
}> = ({ label, value, tone, hint, onClick }) => {
  const toneStyles: Record<typeof tone, string> = {
    neutral: 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5',
    danger: 'border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-500/10',
    warning: 'border-orange-200 dark:border-orange-500/20 bg-orange-50/60 dark:bg-orange-500/10',
    success: 'border-green-200 dark:border-green-500/20 bg-green-50/60 dark:bg-green-500/10',
  };

  const valueStyles: Record<typeof tone, string> = {
    neutral: 'text-slate-900 dark:text-white',
    danger: 'text-red-700 dark:text-red-300',
    warning: 'text-orange-700 dark:text-orange-300',
    success: 'text-green-700 dark:text-green-300',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-colors ${toneStyles[tone]} ${onClick ? 'hover:bg-slate-50 dark:hover:bg-white/10' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
          {hint ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
          ) : null}
        </div>
        <div className={`text-2xl font-bold ${valueStyles[tone]}`}>{value}</div>
      </div>
    </Component>
  );
};

const SuggestionMiniRow: React.FC<{
  suggestion: AISuggestion;
  onAccept: () => void;
}> = ({ suggestion, onAccept }) => {
  const router = useRouter();

  const icon = useMemo(() => {
    switch (suggestion.type) {
      case 'STALLED':
        return <AlertTriangle size={16} className="text-orange-600 dark:text-orange-400" aria-hidden="true" />;
      case 'RESCUE':
        return <UserX size={16} className="text-red-600 dark:text-red-400" aria-hidden="true" />;
      case 'UPSELL':
        return <TrendingUp size={16} className="text-green-600 dark:text-green-400" aria-hidden="true" />;
      default:
        return <Sparkles size={16} className="text-primary-600 dark:text-primary-400" aria-hidden="true" />;
    }
  }, [suggestion.type]);

  const navigationTarget = useMemo(() => {
    const dealId = suggestion.data.deal?.id;
    const contactId = suggestion.data.contact?.id;
    if (dealId) return `/boards?deal=${dealId}`;
    if (contactId) return `/contacts?contactId=${contactId}`;
    return null;
  }, [suggestion.data.deal?.id, suggestion.data.contact?.id]);

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-800 dark:text-slate-100 truncate">{suggestion.title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{suggestion.description}</div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <button
          onClick={onAccept}
          className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
        >
          Aplicar
        </button>
        <button
          onClick={() => navigationTarget && router.push(navigationTarget)}
          disabled={!navigationTarget}
          className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          Abrir
        </button>
      </div>
    </div>
  );
};

export const InboxOverviewView: React.FC<InboxOverviewViewProps> = ({
  overdueActivities,
  todayMeetings,
  todayTasks,
  upcomingActivities,
  aiSuggestions,
  onGoToList,
  onStartFocus,
  onAcceptSuggestion,
}) => {
  const todayTotal = todayMeetings.length + todayTasks.length;
  const totalPending = overdueActivities.length + todayTotal + aiSuggestions.length;

  const highPrioritySuggestions = useMemo(
    () => aiSuggestions.filter(s => s.priority === 'high'),
    [aiSuggestions]
  );

  const riskSuggestions = useMemo(
    () => aiSuggestions.filter(s => s.type === 'STALLED' || s.type === 'RESCUE').slice(0, 5),
    [aiSuggestions]
  );

  const opportunitySuggestions = useMemo(
    () => aiSuggestions.filter(s => s.type === 'UPSELL').slice(0, 5),
    [aiSuggestions]
  );

  const canStartFocus = totalPending > 0;

  return (
    <div className="space-y-6">
      {/* Top CTA */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Visão Geral</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Diagnóstico rápido do dia (sem virar outra lista de atividades).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onGoToList}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            Ver lista
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            onClick={onStartFocus}
            disabled={!canStartFocus}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
            title={canStartFocus ? 'Começar a executar' : 'Nada pendente'}
          >
            <Target size={16} aria-hidden="true" />
            Começar foco
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Atrasados"
          value={overdueActivities.length}
          tone={overdueActivities.length > 0 ? 'danger' : 'success'}
          hint={overdueActivities.length > 0 ? 'Prioridade máxima' : 'Tudo em dia'}
          onClick={onGoToList}
        />
        <StatCard
          label="Hoje"
          value={todayTotal}
          tone={todayTotal > 0 ? 'warning' : 'success'}
          hint={todayTotal > 0 ? `${todayMeetings.length} reuniões • ${todayTasks.length} tarefas` : 'Sem tarefas para hoje'}
          onClick={onGoToList}
        />
        <StatCard
          label="Sugestões críticas"
          value={highPrioritySuggestions.length}
          tone={highPrioritySuggestions.length > 0 ? 'warning' : 'neutral'}
          hint={highPrioritySuggestions.length > 0 ? 'Risco/Oportunidade agora' : 'Sem urgências'}
          onClick={onGoToList}
        />
        <StatCard
          label="Pendências"
          value={totalPending}
          tone={totalPending > 0 ? 'neutral' : 'success'}
          hint={upcomingActivities.length > 0 ? `${upcomingActivities.length} próximos` : 'Backlog leve'}
          onClick={onGoToList}
        />
      </div>

      {/* Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-600 dark:text-orange-400" aria-hidden="true" />
              <h3 className="font-bold text-slate-900 dark:text-white">Risco (resgate e deals parados)</h3>
            </div>
            <button
              onClick={onGoToList}
              className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
            >
              Ver tudo
            </button>
          </div>
          {riskSuggestions.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Sem riscos destacados agora.</div>
          ) : (
            <div className="space-y-1">
              {riskSuggestions.map(s => (
                <SuggestionMiniRow
                  key={s.id}
                  suggestion={s}
                  onAccept={() => onAcceptSuggestion(s)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-green-600 dark:text-green-400" aria-hidden="true" />
              <h3 className="font-bold text-slate-900 dark:text-white">Oportunidades (upsell)</h3>
            </div>
            <button
              onClick={onGoToList}
              className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
            >
              Ver tudo
            </button>
          </div>
          {opportunitySuggestions.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Sem oportunidades destacadas agora.</div>
          ) : (
            <div className="space-y-1">
              {opportunitySuggestions.map(s => (
                <SuggestionMiniRow
                  key={s.id}
                  suggestion={s}
                  onAccept={() => onAcceptSuggestion(s)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

'use client'

/**
 * Decision Queue Page
 * Central de Decisões - Página principal
 */

import React, { useMemo } from 'react';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  Trash2,
  Loader2,
  Inbox,
  Zap,
} from 'lucide-react';
import { DecisionCard } from './components/DecisionCard';
import { useDecisionQueue } from './hooks/useDecisionQueue';
import { PRIORITY_LABELS, CATEGORY_LABELS } from './types';

// Performance: reuse formatter instance.
const PT_BR_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Componente React `DecisionQueuePage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const DecisionQueuePage: React.FC = () => {
  const {
    decisions,
    stats,
    lastAnalyzedAt,
    isAnalyzing,
    executingIds,
    runAnalyzers,
    approveDecision,
    rejectDecision,
    snoozeDecision,
    approveAll,
    clearAll,
  } = useDecisionQueue();

  const lastAnalyzedLabel = useMemo(() => {
    if (!lastAnalyzedAt) return 'Nunca analisado';

    const dateTs = Date.parse(lastAnalyzedAt);
    const diffMinutes = Math.floor((Date.now() - dateTs) / (1000 * 60));

    if (diffMinutes < 1) return 'Agora mesmo';
    if (diffMinutes < 60) return `Há ${diffMinutes} minutos`;
    if (diffMinutes < 1440) return `Há ${Math.floor(diffMinutes / 60)} horas`;
    return PT_BR_DATE_TIME_FORMATTER.format(new Date(dateTs));
  }, [lastAnalyzedAt]);

  // Performance: group by priority in a single pass (instead of 4x filter per render).
  const grouped = useMemo(() => {
    const critical: typeof decisions = [];
    const high: typeof decisions = [];
    const medium: typeof decisions = [];
    const low: typeof decisions = [];

    for (const d of decisions) {
      if (d.priority === 'critical') critical.push(d);
      else if (d.priority === 'high') high.push(d);
      else if (d.priority === 'medium') medium.push(d);
      else low.push(d);
    }

    return { critical, high, medium, low };
  }, [decisions]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="text-primary-500" size={28} />
            Central de Decisões
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Decisões proativas para você tomar ação rapidamente
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runAnalyzers}
            disabled={isAnalyzing}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Analisar Agora
          </button>

          {decisions.length > 0 && (
            <button
              onClick={clearAll}
              className="p-2 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
              title="Limpar tudo"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
            <Inbox size={16} />
            <span className="text-xs font-medium">Total</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {stats.total}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-500 mb-1">
            <AlertTriangle size={16} />
            <span className="text-xs font-medium">Crítico</span>
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {stats.critical}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-orange-500 mb-1">
            <TrendingUp size={16} />
            <span className="text-xs font-medium">Importante</span>
          </div>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {stats.high}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-yellow-500 mb-1">
            <Clock size={16} />
            <span className="text-xs font-medium">Moderado</span>
          </div>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {stats.medium}
          </div>
        </div>

        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <CheckCircle2 size={16} />
            <span className="text-xs font-medium">Baixo</span>
          </div>
          <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
            {stats.low}
          </div>
        </div>
      </div>

      {/* Last analyzed info */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Última análise: {lastAnalyzedLabel}</span>
        {decisions.length > 0 && (
          <button
            onClick={approveAll}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
          >
            <CheckCircle2 size={14} />
            Aprovar todas as sugeridas
          </button>
        )}
      </div>

      {/* Empty State */}
      {decisions.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-500/10 text-primary-500 mb-4">
            <Sparkles size={32} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Nenhuma decisão pendente
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Clique em "Analisar Agora" para que a IA analise seu CRM e sugira ações
            baseadas em deals parados, atividades atrasadas e oportunidades.
          </p>
          <button
            onClick={runAnalyzers}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Sparkles size={18} />
            )}
            Analisar Meu CRM
          </button>
        </div>
      )}

      {/* Decision Groups */}
      {grouped.critical.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400 mb-3">
            <AlertTriangle size={16} />
            {PRIORITY_LABELS.critical.toUpperCase()} ({grouped.critical.length})
          </h2>
          <div className="space-y-3">
            {grouped.critical.map(decision => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                onApprove={approveDecision}
                onReject={rejectDecision}
                onSnooze={snoozeDecision}
                isExecuting={executingIds.has(decision.id)}
              />
            ))}
          </div>
        </section>
      )}

      {grouped.high.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-orange-600 dark:text-orange-400 mb-3">
            <TrendingUp size={16} />
            {PRIORITY_LABELS.high.toUpperCase()} ({grouped.high.length})
          </h2>
          <div className="space-y-3">
            {grouped.high.map(decision => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                onApprove={approveDecision}
                onReject={rejectDecision}
                onSnooze={snoozeDecision}
                isExecuting={executingIds.has(decision.id)}
              />
            ))}
          </div>
        </section>
      )}

      {grouped.medium.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-3">
            <Clock size={16} />
            {PRIORITY_LABELS.medium.toUpperCase()} ({grouped.medium.length})
          </h2>
          <div className="space-y-3">
            {grouped.medium.map(decision => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                onApprove={approveDecision}
                onReject={rejectDecision}
                onSnooze={snoozeDecision}
                isExecuting={executingIds.has(decision.id)}
              />
            ))}
          </div>
        </section>
      )}

      {grouped.low.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">
            <CheckCircle2 size={16} />
            {PRIORITY_LABELS.low.toUpperCase()} ({grouped.low.length})
          </h2>
          <div className="space-y-3">
            {grouped.low.map(decision => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                onApprove={approveDecision}
                onReject={rejectDecision}
                onSnooze={snoozeDecision}
                isExecuting={executingIds.has(decision.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default DecisionQueuePage;

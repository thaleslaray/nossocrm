/**
 * @fileoverview AI Metrics Section
 *
 * Exibe métricas do AI Agent no Dashboard.
 * Mostra conversas respondidas, HITL pendentes, taxas de avanço.
 *
 * @module features/dashboard/components/AIMetricsSection
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { Bot, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, Sparkles } from 'lucide-react';
import { useAIMetricsQuery } from '@/lib/query/hooks';

/**
 * Card compacto para exibir uma métrica AI.
 */
function AIMetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = 'primary',
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'primary' | 'green' | 'amber' | 'red' | 'purple';
  onClick?: () => void;
}) {
  const colorClasses = {
    primary: 'text-primary-500 bg-primary-100 dark:bg-primary-500/20',
    green: 'text-green-500 bg-green-100 dark:bg-green-500/20',
    amber: 'text-amber-500 bg-amber-100 dark:bg-amber-500/20',
    red: 'text-red-500 bg-red-100 dark:bg-red-500/20',
    purple: 'text-purple-500 bg-purple-100 dark:bg-purple-500/20',
  };

  return (
    <div
      className={`glass p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm ${
        onClick ? 'cursor-pointer hover:border-primary-500/50 transition-colors' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
            {label}
          </p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
              {subtext}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Barra de progresso para distribuição de ações.
 */
function ActionDistributionBar({
  responded,
  advanced,
  handoff,
  skipped,
  total,
}: {
  responded: number;
  advanced: number;
  handoff: number;
  skipped: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2">
        <div className="bg-slate-300 dark:bg-slate-600 h-full rounded-full w-full opacity-30" />
      </div>
    );
  }

  const respondedPct = (responded / total) * 100;
  const advancedPct = (advanced / total) * 100;
  const handoffPct = (handoff / total) * 100;
  const skippedPct = (skipped / total) * 100;

  return (
    <div className="space-y-2">
      <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2 overflow-hidden flex">
        <div
          className="bg-green-500 h-full"
          style={{ width: `${respondedPct}%` }}
          title={`Respondidas: ${responded}`}
        />
        <div
          className="bg-blue-500 h-full"
          style={{ width: `${advancedPct}%` }}
          title={`Avançou Estágio: ${advanced}`}
        />
        <div
          className="bg-amber-500 h-full"
          style={{ width: `${handoffPct}%` }}
          title={`Handoff: ${handoff}`}
        />
        <div
          className="bg-slate-400 h-full"
          style={{ width: `${skippedPct}%` }}
          title={`Ignoradas: ${skipped}`}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Respondidas ({responded})
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          Avançou ({advanced})
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          Handoff ({handoff})
        </div>
      </div>
    </div>
  );
}

export function AIMetricsSection() {
  const router = useRouter();
  const { data, isLoading, error } = useAIMetricsQuery();

  if (error) {
    return null; // Silently hide on error
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
          <Bot className="text-primary-500" size={20} />
          Performance da IA
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass p-4 rounded-xl border border-slate-200 dark:border-white/5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                <div className="flex-1">
                  <div className="w-20 h-3 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                  <div className="w-12 h-6 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.conversations.thisMonth.total === 0) {
    // No AI activity yet - show a minimal placeholder
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
          <Bot className="text-primary-500" size={20} />
          Performance da IA
        </h2>
        <div className="glass p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-100 dark:bg-primary-500/20 rounded-full">
              <Sparkles className="text-primary-500" size={24} />
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Nenhuma conversa AI registrada ainda
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Configure o AI Agent nas configurações para começar a automatizar conversas.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { conversations, hitl, tokensUsed } = data;
  const monthStats = conversations.thisMonth;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
        <Bot className="text-primary-500" size={20} />
        Performance da IA
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <AIMetricCard
          icon={MessageSquare}
          label="Conversas Hoje"
          value={conversations.today.total}
          subtext={`${conversations.thisWeek.total} esta semana`}
          color="primary"
        />

        <AIMetricCard
          icon={hitl.pending > 0 ? AlertCircle : CheckCircle}
          label="HITL Pendentes"
          value={hitl.pending}
          subtext={hitl.pending > 0 ? 'Aguardando aprovação' : 'Nenhum pendente'}
          color={hitl.pending > 0 ? 'amber' : 'green'}
          onClick={() => router.push('/settings?tab=ai')}
        />

        <AIMetricCard
          icon={CheckCircle}
          label="Taxa Aprovação HITL"
          value={`${hitl.approvalRate.toFixed(0)}%`}
          subtext={`${hitl.approved} aprovados, ${hitl.rejected} rejeitados`}
          color="green"
        />

        <AIMetricCard
          icon={Clock}
          label="Auto-Avanços"
          value={monthStats.advancedStage}
          subtext={`${hitl.autoApproved} automáticos este mês`}
          color="purple"
        />
      </div>

      {/* Action Distribution */}
      <div className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
          Distribuição de Ações (Este Mês)
        </h3>
        <ActionDistributionBar
          responded={monthStats.responded}
          advanced={monthStats.advancedStage}
          handoff={monthStats.handoff}
          skipped={monthStats.skipped}
          total={monthStats.total}
        />
        <div className="mt-3 flex justify-between items-center">
          <p className="text-xs text-slate-400">
            Total: {monthStats.total} interações
          </p>
          <p className="text-xs text-slate-400">
            Tokens: {tokensUsed.thisMonth.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

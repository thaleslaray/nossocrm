/**
 * @fileoverview Messaging Metrics Section
 *
 * Exibe métricas de messaging no Dashboard: mensagens enviadas,
 * novos contatos, First Response Time, e taxa de resposta.
 * Suporta filtro por vendedor via dropdown.
 *
 * @module features/dashboard/components/MessagingMetricsSection
 */

import React, { useState } from 'react';
import { Send, UserPlus, Clock, CheckCircle, MessageSquare, Inbox } from 'lucide-react';
import { useMessagingMetricsQuery, useOrgMembersQuery } from '@/lib/query/hooks';
import type { PeriodFilter } from '../hooks/useDashboardMetrics';

// =============================================================================
// Helpers
// =============================================================================

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '--';
  if (seconds < 60) return '< 1min';
  if (seconds < 3600) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return sec > 0 ? `${min}min ${sec}s` : `${min}min`;
  }
  const hours = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  return min > 0 ? `${hours}h ${min}min` : `${hours}h`;
}

// =============================================================================
// Metric Card
// =============================================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = 'primary',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'primary' | 'green' | 'amber' | 'purple' | 'blue';
}) {
  const colorClasses = {
    primary: 'text-primary-500 bg-primary-100 dark:bg-primary-500/20',
    green: 'text-green-500 bg-green-100 dark:bg-green-500/20',
    amber: 'text-amber-500 bg-amber-100 dark:bg-amber-500/20',
    purple: 'text-purple-500 bg-purple-100 dark:bg-purple-500/20',
    blue: 'text-blue-500 bg-blue-100 dark:bg-blue-500/20',
  };

  return (
    <div className="glass p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
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

// =============================================================================
// Distribution Bar
// =============================================================================

function SenderDistributionBar({
  byType,
  total,
}: {
  byType: Record<string, number>;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2">
        <div className="bg-slate-300 dark:bg-slate-600 h-full rounded-full w-full opacity-30" />
      </div>
    );
  }

  const userCount = (byType.user ?? 0);
  const aiCount = (byType.ai ?? 0) + (byType.agent ?? 0);
  const systemCount = byType.system ?? 0;
  const unknownCount = byType.unknown ?? 0;

  const userPct = (userCount / total) * 100;
  const aiPct = (aiCount / total) * 100;
  const systemPct = (systemCount / total) * 100;
  const unknownPct = (unknownCount / total) * 100;

  return (
    <div className="space-y-2">
      <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2 overflow-hidden flex">
        <div
          className="bg-green-500 h-full"
          style={{ width: `${userPct}%` }}
          title={`Humanos: ${userCount}`}
        />
        <div
          className="bg-purple-500 h-full"
          style={{ width: `${aiPct}%` }}
          title={`IA: ${aiCount}`}
        />
        <div
          className="bg-blue-500 h-full"
          style={{ width: `${systemPct}%` }}
          title={`Sistema: ${systemCount}`}
        />
        {unknownPct > 0 && (
          <div
            className="bg-slate-400 h-full"
            style={{ width: `${unknownPct}%` }}
            title={`Não atribuído: ${unknownCount}`}
          />
        )}
      </div>
      <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Humanos ({userCount})
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          IA ({aiCount})
        </div>
        {systemCount > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            Sistema ({systemCount})
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Section
// =============================================================================

export function MessagingMetricsSection({ period }: { period: PeriodFilter }) {
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const userId = selectedUserId === 'all' ? undefined : selectedUserId;

  const { data, isLoading, error } = useMessagingMetricsQuery(period, userId);
  const { data: members = [] } = useOrgMembersQuery();

  if (error) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-3 shrink-0">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
          <MessageSquare className="text-primary-500" size={20} />
          Performance de Mensagens
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

  if (!data || data.messagesSent.total === 0) {
    return (
      <div className="space-y-3 shrink-0">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
          <MessageSquare className="text-primary-500" size={20} />
          Performance de Mensagens
        </h2>
        <div className="glass p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-100 dark:bg-primary-500/20 rounded-full">
              <Inbox className="text-primary-500" size={24} />
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-200">
                Nenhuma mensagem registrada neste período
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                As métricas aparecerão quando mensagens forem enviadas pelo sistema.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { messagesSent, contacts, sla, responseRate } = data;
  const humanCount = messagesSent.byType.user ?? 0;
  const aiCount = (messagesSent.byType.ai ?? 0) + (messagesSent.byType.agent ?? 0);

  return (
    <div className="space-y-3 shrink-0">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
          <MessageSquare className="text-primary-500" size={20} />
          Performance de Mensagens
        </h2>
        {members.length > 1 && (
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos os vendedores</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Send}
          label="Mensagens Enviadas"
          value={messagesSent.total}
          subtext={`${humanCount} humanos, ${aiCount} IA`}
          color="primary"
        />

        <MetricCard
          icon={UserPlus}
          label="Novos Contatos"
          value={contacts.new}
          subtext={`${contacts.followUp} follow-ups`}
          color="blue"
        />

        <MetricCard
          icon={Clock}
          label="First Response Time"
          value={formatSeconds(sla.avgFirstResponseSeconds)}
          subtext={`${sla.conversationsWithFRT} conversas medidas`}
          color="amber"
        />

        <MetricCard
          icon={CheckCircle}
          label="Taxa de Resposta"
          value={`${responseRate.rate}%`}
          subtext={`${responseRate.responded} de ${responseRate.total} conversas`}
          color="green"
        />
      </div>

      {/* Sender Distribution */}
      <div className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
          Distribuição por Remetente
        </h3>
        <SenderDistributionBar byType={messagesSent.byType} total={messagesSent.total} />
      </div>
    </div>
  );
}

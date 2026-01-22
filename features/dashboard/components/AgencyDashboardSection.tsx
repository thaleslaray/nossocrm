/**
 * AgencyDashboardSection - Seção de métricas da agência no Dashboard
 *
 * Exibe KPIs específicos para agências de tráfego pago:
 * - Novos Leads
 * - Propostas Enviadas
 * - Fechamentos
 * - Receita Mensal
 * - Progresso da Meta
 */
import React from 'react';
import { Users, FileText, CheckCircle, DollarSign } from 'lucide-react';
import { useAgencyDashboardMetrics, formatCurrency } from '../hooks/useAgencyDashboardMetrics';
import { StatCard } from './StatCard';
import { GoalProgressCard } from './GoalProgressCard';

export const AgencyDashboardSection: React.FC = () => {
  const metrics = useAgencyDashboardMetrics();

  if (metrics.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="glass p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm animate-pulse"
            >
              <div className="h-20 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            </div>
          ))}
        </div>
        <div className="glass p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm animate-pulse">
          <div className="h-32 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Novos Leads */}
        <StatCard
          title="Novos Leads"
          value={metrics.newLeadsCount.toString()}
          subtext="este mês"
          subtextPositive={true}
          icon={Users}
          color="bg-blue-500"
          comparisonLabel=""
        />

        {/* Propostas */}
        <StatCard
          title="Propostas"
          value={metrics.proposalsCount.toString()}
          subtext="em aberto"
          subtextPositive={true}
          icon={FileText}
          color="bg-purple-500"
          comparisonLabel=""
        />

        {/* Fechamentos */}
        <StatCard
          title="Fechamentos"
          value={metrics.closedCount.toString()}
          subtext="este mês"
          subtextPositive={true}
          icon={CheckCircle}
          color="bg-green-500"
          comparisonLabel=""
        />

        {/* Receita Mensal */}
        <StatCard
          title="Receita Mensal"
          value={formatCurrency(metrics.wonRevenue)}
          subtext={`${metrics.progressPercent}% da meta`}
          subtextPositive={metrics.progressPercent >= 50}
          icon={DollarSign}
          color="bg-emerald-500"
          comparisonLabel=""
        />
      </div>

      {/* Goal Progress */}
      <GoalProgressCard
        currentRevenue={metrics.wonRevenue}
        monthlyGoal={metrics.monthlyGoal}
        progressPercent={metrics.progressPercent}
        closedDealsCount={metrics.closedCount}
      />
    </div>
  );
};

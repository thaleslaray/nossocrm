/**
 * GoalProgressCard - Componente para exibir progresso da meta mensal
 *
 * Mostra visualmente o progresso em relação à meta de receita mensal
 * com barra de progresso animada e breakdown de valores
 */
import React from 'react';
import { Target, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../hooks/useAgencyDashboardMetrics';

interface GoalProgressCardProps {
  currentRevenue: number;
  monthlyGoal: number;
  progressPercent: number;
  closedDealsCount: number;
  isLoading?: boolean;
}

export const GoalProgressCard: React.FC<GoalProgressCardProps> = ({
  currentRevenue,
  monthlyGoal,
  progressPercent,
  closedDealsCount,
  isLoading = false,
}) => {
  // Determine color based on progress
  const getProgressColor = (percent: number): string => {
    if (percent >= 100) return 'bg-green-500';
    if (percent >= 75) return 'bg-blue-500';
    if (percent >= 50) return 'bg-amber-500';
    return 'bg-orange-500';
  };

  const getProgressTextColor = (percent: number): string => {
    if (percent >= 100) return 'text-green-600 dark:text-green-400';
    if (percent >= 75) return 'text-blue-600 dark:text-blue-400';
    if (percent >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  const remaining = Math.max(0, monthlyGoal - currentRevenue);

  if (isLoading) {
    return (
      <div className="glass p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-neutral-200 dark:bg-neutral-700 rounded w-1/3"></div>
          <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
          <div className="h-8 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm relative overflow-hidden group">
      {/* Gradient background */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-full blur-3xl opacity-20 -mr-32 -mt-32 transition-opacity group-hover:opacity-30"></div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary-500/10 ring-1 ring-inset ring-white/10">
              <Target className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white font-display">
              Meta de Fechamento
            </h3>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900 dark:text-white font-display">
              {progressPercent}%
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">do objetivo</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="h-3 bg-neutral-200 dark:bg-neutral-700/50 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(progressPercent)} transition-all duration-700 ease-out rounded-full`}
              style={{
                width: `${Math.min(progressPercent, 100)}%`,
                transformOrigin: 'left',
              }}
            ></div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Faturado</p>
            <p className={`text-sm font-semibold ${getProgressTextColor(progressPercent)}`}>
              {formatCurrency(currentRevenue)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Meta</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {formatCurrency(monthlyGoal)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Restante</p>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {formatCurrency(remaining)}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <TrendingUp className="w-4 h-4" />
              <span>
                {closedDealsCount} {closedDealsCount === 1 ? 'fechamento' : 'fechamentos'} este mês
              </span>
            </div>
            {progressPercent >= 100 && (
              <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-semibold">
                Meta atingida! 🎉
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

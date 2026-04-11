'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { TrendingUp, Clock, Target, DollarSign, Trophy, Users, Download, Settings } from 'lucide-react';
import { useDashboardMetrics, PeriodFilter, COMPARISON_LABELS } from '../dashboard/hooks/useDashboardMetrics';
import { PeriodFilterSelect } from '@/components/filters/PeriodFilterSelect';
import { LazyRevenueTrendChart, ChartWrapper } from '@/components/charts';
import { generateReportPDF } from './utils/generateReportPDF';
import { useBoards } from '@/lib/query/hooks';
import { useAuth } from '@/context/AuthContext';

/**
 * Componente React `ReportsPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
const ReportsPage: React.FC = () => {
  const router = useRouter();
  const { data: boards = [] } = useBoards();
  const { profile } = useAuth();
  const [period, setPeriod] = useState<PeriodFilter>('this_month');
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');

  // Performance: avoid recomputing the "default board id" logic inside the effect.
  const defaultBoardId = useMemo(() => {
    if (!boards.length) return '';
    const defaultB = boards.find(b => b.isDefault) || boards[0];
    return defaultB?.id || '';
  }, [boards]);

  // Inicializar board selecionado
  useEffect(() => {
    if (!selectedBoardId && defaultBoardId) {
      setSelectedBoardId(defaultBoardId);
    }
  }, [defaultBoardId, selectedBoardId]);

  // Pegar o board selecionado para acessar a meta
  const selectedBoard = useMemo(() => {
    return boards.find(b => b.id === selectedBoardId);
  }, [boards, selectedBoardId]);

  const {
    trendData,
    avgSalesCycle,
    fastestDeal,
    slowestDeal,
    wonDealsWithDates,
    actualWinRate,
    wonDeals,
    lostDeals,
    topLossReasons,
    topDeals,
    wonRevenue,
    pipelineValue,
    deals,
    changes,
    funnelData,
  } = useDashboardMetrics(period, selectedBoardId);

  // Extrair meta do board selecionado
  const boardGoal = selectedBoard?.goal;
  const goalType = boardGoal?.type || 'currency';
  const goalTarget = parseFloat(boardGoal?.targetValue || '0') || 0;
  const goalKpi = boardGoal?.kpi || 'Receita';
  const hasGoal = goalTarget > 0;

  // Calcular valor atual baseado no tipo de meta (PADRÃO HUBSPOT/SALESFORCE)
  // Usa dados DO PERÍODO selecionado, não o total histórico
  const currentValue = React.useMemo(() => {
    switch (goalType) {
      case 'currency':
        // Receita GANHA no período
        return wonRevenue;
      case 'percentage':
        // Taxa de conversão do período
        return actualWinRate;
      case 'number':
      default:
        // Quantidade de deals GANHOS no período
        return wonDeals.length;
    }
  }, [goalType, wonRevenue, actualWinRate, wonDeals.length]);

  // Calcular Forecast
  const forecastPercent = hasGoal ? Math.min((currentValue / goalTarget) * 100, 100) : 0;
  const forecastGap = goalTarget - currentValue;
  const isOnTrack = forecastPercent >= 75;

  // Formatador baseado no tipo
  // Performance: keep formatter stable (prevents unnecessary child rerenders when passed down).
  const formatGoalValue = useCallback((value: number) => {
    switch (goalType) {
      case 'currency':
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
        return `$${value.toLocaleString()}`;
      case 'number':
        return value.toFixed(0);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      default:
        return value.toLocaleString();
    }
  }, [goalType]);

  // Calcular Performance por Vendedor (Leaderboard)
  const leaderboard = React.useMemo(() => {
    const repsMap: Record<string, { name: string; avatar: string; deals: number; revenue: number; winRate: number }> = {};

    wonDeals.forEach(deal => {
      const ownerKey = deal.owner?.name || 'unknown';
      const ownerName = deal.owner?.name || 'Sem Dono';
      const ownerAvatar = deal.owner?.avatar || '';

      if (!repsMap[ownerKey]) {
        repsMap[ownerKey] = { name: ownerName, avatar: ownerAvatar, deals: 0, revenue: 0, winRate: 0 };
      }
      repsMap[ownerKey].deals += 1;
      repsMap[ownerKey].revenue += deal.value;
    });

    return Object.entries(repsMap)
      .map(([id, data]) => ({
        id,
        ...data,
        winRate: data.deals > 0 ? Math.round((data.deals / Math.max(data.deals, 1)) * 100) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [wonDeals]);

  // Formatador de moeda
  const formatCurrency = useCallback((value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    return `$${value.toLocaleString()}`;
  }, []);

  const generatedBy = useMemo(() => {
    if (profile?.first_name && profile?.last_name) return `${profile.first_name} ${profile.last_name}`;
    return profile?.first_name || profile?.email || 'Usuário';
  }, [profile?.email, profile?.first_name, profile?.last_name]);

  const handleExportPDF = useCallback(async () => {
    // generateReportPDF usa dynamic imports para carregar jsPDF apenas quando necessário
    await generateReportPDF(
      {
        pipelineValue,
        actualWinRate,
        avgSalesCycle,
        fastestDeal,
        wonRevenue,
        wonDeals,
        changes,
        funnelData,
      },
      period,
      selectedBoard?.name,
      generatedBy
    );
  }, [
    actualWinRate,
    avgSalesCycle,
    changes,
    fastestDeal,
    funnelData,
    generatedBy,
    period,
    pipelineValue,
    selectedBoard?.name,
    wonDeals,
    wonRevenue,
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] space-y-4">
      {/* Header com Filtros */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">
            Relatórios de Performance
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Análise detalhada de vendas e tendências.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            aria-label="Selecionar Pipeline"
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {boards.map(board => (
              <option key={board.id} value={board.id}>{board.name}</option>
            ))}
          </select>

          <PeriodFilterSelect value={period} onChange={setPeriod} />

          <button
            type="button"
            onClick={handleExportPDF}
            className="group flex items-center gap-2 px-3 py-2 rounded-lg glass border border-slate-200/50 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200"
            title="Exportar PDF"
          >
            <Download size={16} className="group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium opacity-80 group-hover:opacity-100">PDF</span>
          </button>
        </div>
      </div>

      {/* Forecast Bar - FEATURE #1 (80/20) */}
      {hasGoal ? (
        <div className="glass p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className={`${isOnTrack ? 'text-emerald-500' : 'text-amber-500'}`} size={20} />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {goalKpi}
              </h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-slate-500">Realizado</span>
                <p className="text-lg font-bold text-emerald-500">{formatGoalValue(currentValue)}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500">Meta</span>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{formatGoalValue(goalTarget)}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500">Gap</span>
                <p className={`text-lg font-bold ${forecastGap > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {forecastGap > 0 ? `-${formatGoalValue(forecastGap)}` : '✓ Atingido'}
                </p>
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-4 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isOnTrack ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-amber-400 to-amber-500'
                  }`}
                style={{ width: `${forecastPercent}%` }}
              />
            </div>
            <div className="absolute top-0 right-0 h-4 flex items-center">
              <span className={`text-xs font-bold px-2 ${forecastPercent >= 50 ? 'text-white' : 'text-slate-600'}`}>
                {forecastPercent.toFixed(0)}%
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {isOnTrack
              ? `🎯 No ritmo! Faltam ${formatGoalValue(Math.abs(forecastGap))} para bater a meta.`
              : `⚠️ Atenção! Você está abaixo de 75% da meta. Faltam ${formatGoalValue(Math.abs(forecastGap))}.`
            }
          </p>
        </div>
      ) : (
        <div className="glass p-4 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <Settings className="text-amber-500" size={20} />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Meta não configurada</h3>
              <p className="text-xs text-slate-500">Defina uma meta no board para acompanhar o forecast.</p>
            </div>
            <button
              onClick={() => router.push('/boards')}
              className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              Configurar
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {/* Pipeline Value - FEATURE #2 */}
        <div className="glass p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <DollarSign className="text-blue-500" size={18} />
            </div>
            <span className="text-xs text-slate-500">Pipeline Total</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(pipelineValue)}</p>
          <p className={`text-xs ${changes.pipeline >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {changes.pipeline >= 0 ? '+' : ''}{changes.pipeline.toFixed(1)}% {COMPARISON_LABELS[period]}
          </p>
        </div>

        {/* Win Rate */}
        <div className="glass p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Target className="text-emerald-500" size={18} />
            </div>
            <span className="text-xs text-slate-500">Win Rate</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{actualWinRate.toFixed(1)}%</p>
          <p className={`text-xs ${changes.winRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {changes.winRate >= 0 ? '+' : ''}{changes.winRate.toFixed(1)}% {COMPARISON_LABELS[period]}
          </p>
        </div>

        {/* Ciclo Médio */}
        <div className="glass p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Clock className="text-purple-500" size={18} />
            </div>
            <span className="text-xs text-slate-500">Ciclo Médio</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{avgSalesCycle} dias</p>
          <p className="text-xs text-slate-500">
            Rápido: {fastestDeal}d | Lento: {slowestDeal}d
          </p>
        </div>

        {/* Deals Fechados */}
        <div className="glass p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <TrendingUp className="text-orange-500" size={18} />
            </div>
            <span className="text-xs text-slate-500">Deals Fechados</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            <span className="text-emerald-500">{wonDeals.length}</span>
            <span className="text-slate-400 mx-1">/</span>
            <span className="text-red-500">{lostDeals.length}</span>
          </p>
          <p className="text-xs text-slate-500">
            Ganhos / Perdas
          </p>
        </div>
      </div>

      {/* Bottom Grid - Charts & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[250px]">
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm flex flex-col h-full">
          <div className="flex justify-between items-center mb-2 shrink-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              Tendência de Receita
            </h2>
            <span className="text-xs text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded">
              Últimos 6 Meses
            </span>
          </div>
          <div className="flex-1 min-h-0 relative">
            <div className="absolute inset-0">
              <ChartWrapper height="100%">
                <LazyRevenueTrendChart data={trendData} />
              </ChartWrapper>
            </div>
          </div>
        </div>

        {/* Leaderboard - FEATURE #3 (Top Performers) */}
        <div className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm flex flex-col h-full overflow-hidden">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
              <Trophy className="text-amber-500" size={20} />
              Top Vendedores
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
            {leaderboard.length > 0 ? (
              leaderboard.map((rep, index) => (
                <div
                  key={rep.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-amber-100 text-amber-600' :
                    index === 1 ? 'bg-slate-100 text-slate-600' :
                      index === 2 ? 'bg-orange-100 text-orange-600' :
                        'bg-slate-50 text-slate-500'
                    }`}>
                    {index + 1}
                  </div>
                  <Image
                    src={rep.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${rep.name}`}
                    alt={rep.name}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full"
                    unoptimized
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{rep.name}</p>
                    <p className="text-xs text-slate-500">{rep.deals} deals</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-500">{formatCurrency(rep.revenue)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 py-6">
                <Users size={32} className="mb-2 opacity-50" />
                <p className="text-sm">Nenhum deal fechado no período.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;

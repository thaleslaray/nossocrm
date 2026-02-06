import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCRM } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { TrendingUp, TrendingDown, Users, DollarSign, Target, Clock, MoreVertical, AlertTriangle } from 'lucide-react';
import { StatCard } from './components/StatCard';
import { ActivityFeedItem } from './components/ActivityFeedItem';
import { PipelineAlertsModal } from './components/PipelineAlertsModal';
import { AgencyDashboardSection } from './components/AgencyDashboardSection';
import { useDashboardMetrics, PeriodFilter, COMPARISON_LABELS } from './hooks/useDashboardMetrics';
import { PeriodFilterSelect } from '@/components/filters/PeriodFilterSelect';
import { LazyFunnelChart, ChartWrapper } from '@/components/charts';


/**
 * Formata a variação percentual para exibição
 */
function formatChange(value: number): { text: string; isPositive: boolean } {
  const isPositive = value >= 0;
  const sign = isPositive ? '+' : '';
  return {
    text: `${sign}${value.toFixed(1)}%`,
    isPositive,
  };
}

/**
 * Componente React `DashboardPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
const DashboardPage: React.FC = () => {
  const router = useRouter();
  const { activities, lifecycleStages, contacts, boards } = useCRM();
  const { addToast } = useToast();
  const [period, setPeriod] = useState<PeriodFilter>('this_month');
  const [showPipelineAlerts, setShowPipelineAlerts] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');

  // Inicializar board selecionado
  useEffect(() => {
    if (!selectedBoardId && boards.length > 0) {
      const defaultB = boards.find(b => b.isDefault) || boards[0];
      setSelectedBoardId(defaultB.id);
    }
  }, [boards, selectedBoardId]);

  // Calcular contagem de contatos por estágio de ciclo de vida
  const stageCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    contacts.forEach(contact => {
      if (contact.stage) {
        counts[contact.stage] = (counts[contact.stage] || 0) + 1;
      }
    });
    return counts;
  }, [contacts]);

  useEffect(() => {
    console.log('DashboardPage mounted');
  }, []);

  const {
    deals,
    wonDeals,
    wonRevenue,
    winRate,
    pipelineValue,
    topDeals,
    funnelData,
    trendData,
    activePercent,
    inactivePercent,
    churnedPercent,
    activeContacts,
    inactiveContacts,
    churnedContacts,
    riskyCount,
    stagnantDealsCount,
    stagnantDealsValue,
    avgLTV,
    avgSalesCycle,
    fastestDeal,
    slowestDeal,
    actualWinRate,
    lostDeals,
    topLossReasons,
    wonDealsWithDates,
    changes,
    activeSnapshotDeals,
  } = useDashboardMetrics(period, selectedBoardId);

  // Formatar variações para exibição
  const pipelineChangeInfo = formatChange(changes.pipeline);
  const dealsChangeInfo = formatChange(changes.deals);
  const winRateChangeInfo = formatChange(changes.winRate);
  const revenueChangeInfo = formatChange(changes.revenue);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] space-y-4">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">
            Visão Geral
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            O pulso do seu negócio em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            aria-label="Selecionar Pipeline de Vendas"
            className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {boards.map(board => (
              <option key={board.id} value={board.id}>{board.name}</option>
            ))}
          </select>

          <PeriodFilterSelect value={period} onChange={setPeriod} />

          <button
            onClick={() => setShowPipelineAlerts(true)}
            className={`p-2 rounded-lg border transition-colors relative ${(riskyCount > 0 || stagnantDealsCount > 0)
              ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30 text-amber-600 dark:text-amber-400'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700'
              }`}
            title="Alertas de Pipeline"
          >
            <AlertTriangle size={20} />
            {(riskyCount > 0 || stagnantDealsCount > 0) && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
            )}
            <span className="sr-only">Alertas de Pipeline</span>
          </button>

          {/* Button removed */}
        </div>
      </div>

      {/* Agency Dashboard Section */}
      <div className="shrink-0">
        <AgencyDashboardSection />
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200 dark:border-white/10 shrink-0"></div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <StatCard
          title="Pipeline Total"
          value={`$${pipelineValue.toLocaleString()}`}
          subtext={pipelineChangeInfo.text}
          subtextPositive={pipelineChangeInfo.isPositive}
          icon={DollarSign}
          color="bg-blue-500"
          onClick={() => router.push('/boards')}
          comparisonLabel={COMPARISON_LABELS[period]}
        />
        <StatCard
          title="Negócios Ativos"
          value={`${deals.length - wonDeals.length}`}
          subtext={dealsChangeInfo.text}
          subtextPositive={dealsChangeInfo.isPositive}
          icon={Users}
          color="bg-purple-500"
          onClick={() => router.push('/boards?status=open')}
          comparisonLabel={COMPARISON_LABELS[period]}
        />
        <StatCard
          title="Conversão"
          value={`${winRate.toFixed(1)}%`}
          subtext={winRateChangeInfo.text}
          subtextPositive={winRateChangeInfo.isPositive}
          icon={Target}
          color="bg-emerald-500"
          onClick={() => router.push('/reports')}
          comparisonLabel={COMPARISON_LABELS[period]}
        />
        <StatCard
          title="Receita (Ganha)"
          value={`$${wonRevenue.toLocaleString()}`}
          subtext={revenueChangeInfo.text}
          subtextPositive={revenueChangeInfo.isPositive}
          icon={TrendingUp}
          color="bg-orange-500"
          onClick={() => router.push('/boards?status=won&view=list')}
          comparisonLabel={COMPARISON_LABELS[period]}
        />
      </div>

      {/* Wallet Health Section - Compact */}
      <div className="space-y-3 shrink-0">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
          <Users className="text-primary-500" size={20} />
          Saúde da Carteira
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm cursor-pointer hover:border-primary-500/50 transition-colors"
            onClick={() => router.push('/contacts')}
          >
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              Distribuição da Carteira
            </h3>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {activePercent}%
              </span>
              <span className="text-xs text-green-500 font-bold mb-1">Ativos</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2 overflow-hidden flex">
              <div
                className="bg-green-500 h-full"
                style={{ width: `${activePercent}%` }}
                title="Ativos"
              ></div>
              <div
                className="bg-yellow-500 h-full"
                style={{ width: `${inactivePercent}%` }}
                title="Inativos"
              ></div>
              <div
                className="bg-red-500 h-full"
                style={{ width: `${churnedPercent}%` }}
                title="Churn"
              ></div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div> Ativos (
                {activeContacts.length})
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div> Inativos (
                {inactiveContacts.length})
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div> Churn (
                {churnedContacts.length})
              </div>
            </div>
          </div>

          <div
            className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm cursor-pointer hover:border-amber-500/50 transition-colors"
            onClick={() => setShowPipelineAlerts(true)}
          >
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              Negócios Parados
            </h3>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                {stagnantDealsCount} Deals
              </span>
              <span className={`text-xs font-bold mb-1 ${stagnantDealsCount > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                {stagnantDealsCount > 0 ? 'Atenção' : 'OK'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Sem mudança de estágio há +10 dias.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ${stagnantDealsValue.toLocaleString()} em risco
            </p>
          </div>

          <div className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              LTV Médio
            </h3>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">
                ${(avgLTV / 1000).toFixed(1)}k
              </span>
              <span className="text-xs text-green-500 font-bold mb-1">Médio</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Valor médio vitalício por cliente ativo.</p>
          </div>
        </div>
      </div>

      {/* Auto-Resize Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[300px]">
        {/* Funnel */}
        <div className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm flex flex-col h-full">
          <div className="flex justify-between items-center mb-2 shrink-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              Funil
            </h2>
          </div>
          <div className="flex-1 min-h-0 relative">
            <div className="absolute inset-0">
              <ChartWrapper height="100%">
                <LazyFunnelChart data={funnelData} />
              </ChartWrapper>
            </div>
          </div>
        </div>

        {/* Activity Feed - Expanded */}
        <div className="lg:col-span-2 glass flex flex-col rounded-xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden h-full">
          <div className="p-5 border-b border-slate-100 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 rounded-t-xl backdrop-blur-sm z-10 shrink-0">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Atividades Recentes
              </h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 pt-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
            <div className="space-y-1">
              {activities.length > 0 ? (
                activities.slice(0, 15).map(activity => (
                  <ActivityFeedItem key={activity.id} activity={activity} />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 py-8">
                  <Clock size={32} className="mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma atividade recente.</p>
                </div>
              )}
            </div>

            <button
              onClick={() => router.push('/activities')}
              className="w-full mt-4 py-2 text-sm text-primary-500 border border-dashed border-primary-500/30 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors"
            >
              Ver todas as atividades
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Alerts Modal */}
      <PipelineAlertsModal
        isOpen={showPipelineAlerts}
        onClose={() => setShowPipelineAlerts(false)}
        deals={activeSnapshotDeals}
        activities={activities.map(a => ({ dealId: a.dealId, date: a.date, completed: a.completed }))}
        onNavigateToDeal={(dealId) => {
          setShowPipelineAlerts(false);
          router.push(`/pipeline?deal=${dealId}`);
        }}
      />
    </div>
  );
};

export default DashboardPage;

import React from 'react';
import { useDeals } from '@/lib/query/hooks/useDealsQuery';
import { useContacts } from '@/lib/query/hooks/useContactsQuery';
import { useBoards, useDefaultBoard } from '@/lib/query/hooks/useBoardsQuery';

export type PeriodFilter =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year';

export const PERIOD_LABELS: Record<PeriodFilter, string> = {
  all: 'Todo o Período',
  today: 'Hoje',
  yesterday: 'Ontem',
  last_7_days: 'Últimos 7 dias',
  last_30_days: 'Últimos 30 dias',
  this_month: 'Este Mês',
  last_month: 'Mês Passado',
  this_quarter: 'Este Trimestre',
  last_quarter: 'Último Trimestre',
  this_year: 'Este Ano',
  last_year: 'Ano Passado',
};

/**
 * Labels que explicam com o que estamos comparando
 */
export const COMPARISON_LABELS: Record<PeriodFilter, string> = {
  all: 'total',
  today: 'vs ontem',
  yesterday: 'vs anteontem',
  last_7_days: 'vs 7 dias anteriores',
  last_30_days: 'vs 30 dias anteriores',
  this_month: 'vs mês passado',
  last_month: 'vs mês anterior',
  this_quarter: 'vs trimestre passado',
  last_quarter: 'vs trimestre anterior',
  this_year: 'vs ano passado',
  last_year: 'vs ano anterior',
};

interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Calcula o range de datas baseado no filtro de período
 */
function getDateRange(period: PeriodFilter): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (period) {
    case 'all':
      // Retorna um range desde 2000 até hoje (efetivamente "todos os dados")
      return { start: new Date(2000, 0, 1), end: endOfToday };

    case 'today':
      return { start: today, end: endOfToday };

    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const endOfYesterday = new Date(today.getTime() - 1);
      return { start: yesterday, end: endOfYesterday };
    }

    case 'last_7_days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start, end: endOfToday };
    }

    case 'last_30_days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start, end: endOfToday };
    }

    case 'this_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: endOfToday
      };

    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end };
    }

    case 'this_quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      return {
        start: new Date(now.getFullYear(), quarterStart, 1),
        end: endOfToday
      };
    }

    case 'last_quarter': {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const lastQuarterStart = (currentQuarter - 1 + 4) % 4;
      const year = currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const start = new Date(year, lastQuarterStart * 3, 1);
      const end = new Date(year, lastQuarterStart * 3 + 3, 0, 23, 59, 59);
      return { start, end };
    }

    case 'this_year':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: endOfToday
      };

    case 'last_year': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
      return { start, end };
    }

    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: endOfToday
      };
  }
}

/**
 * Calcula o período anterior equivalente para comparação
 */
function getPreviousDateRange(period: PeriodFilter): DateRange {
  const current = getDateRange(period);
  const duration = current.end.getTime() - current.start.getTime();

  return {
    start: new Date(current.start.getTime() - duration - 1),
    end: new Date(current.start.getTime() - 1),
  };
}

/**
 * Calcula a variação percentual entre dois valores
 */
function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export const useDashboardMetrics = (period: PeriodFilter = 'this_month', boardId?: string) => {
  const { data: allDeals = [], isLoading: dealsLoading } = useDeals();
  const { data: allContacts = [], isLoading: contactsLoading } = useContacts();
  const { data: boards = [] } = useBoards();
  const { data: defaultBoard } = useDefaultBoard();

  const isLoading = dealsLoading || contactsLoading;

  // Calcular ranges de data para período atual e anterior
  const dateRange = React.useMemo(() => getDateRange(period), [period]);
  const previousDateRange = React.useMemo(() => getPreviousDateRange(period), [period]);

  // Filtrar deals por período atual e Board (se fornecido) - FLUXO/COHORT (Criados no período)
  const deals = React.useMemo(() => {
    return allDeals.filter(deal => {
      const dealDate = new Date(deal.createdAt);
      const periodMatch = dealDate >= dateRange.start && dealDate <= dateRange.end;
      const boardMatch = boardId ? deal.boardId === boardId : true;
      return periodMatch && boardMatch;
    });
  }, [allDeals, dateRange, boardId]);

  // Filtrar deals ATIVOS no Board atual - SNAPSHOT (O que está no funil HOJE, independente de data)
  const activeSnapshotDeals = React.useMemo(() => {
    return allDeals.filter(deal => {
      const boardMatch = boardId ? deal.boardId === boardId : true;
      const isClosed = deal.isWon || deal.isLost;
      return boardMatch && !isClosed;
    });
  }, [allDeals, boardId]);

  // Filtrar deals por período anterior (para comparação)
  const previousDeals = React.useMemo(() => {
    return allDeals.filter(deal => {
      const dealDate = new Date(deal.createdAt);
      const periodMatch = dealDate >= previousDateRange.start && dealDate <= previousDateRange.end;
      const boardMatch = boardId ? deal.boardId === boardId : true;
      return periodMatch && boardMatch;
    });
  }, [allDeals, previousDateRange, boardId]);

  // Filtrar contacts por período atual
  const contacts = React.useMemo(() => {
    return allContacts.filter(contact => {
      const contactDate = new Date(contact.createdAt);
      return contactDate >= dateRange.start && contactDate <= dateRange.end;
    });
  }, [allContacts, dateRange]);

  // Filtrar contacts por período anterior
  const previousContacts = React.useMemo(() => {
    return allContacts.filter(contact => {
      const contactDate = new Date(contact.createdAt);
      return contactDate >= previousDateRange.start && contactDate <= previousDateRange.end;
    });
  }, [allContacts, previousDateRange]);

  // Calculate metrics

  // Total Value -> Valor total de novos negócios no período
  const totalValue = deals.reduce((acc, deal) => acc + deal.value, 0);

  // Won Deals -> Negócios ganhos que foram criados neste período (Cohort View)
  // TODO: Em um futuro refactor, talvez o usuário queira "Ganhos neste mês" independente de criação.
  // Por enquanto, mantemos a consistência com "deals" que é filtrado por criação.
  const wonDeals = deals.filter(d => d.isWon);
  const lostDeals = deals.filter(d => d.isLost);

  // Pipeline Value -> Valor total em aberto HOJE (Snapshot)
  const pipelineValue = activeSnapshotDeals.reduce((acc, l) => acc + l.value, 0);

  const wonRevenue = wonDeals.reduce((acc, l) => acc + l.value, 0);

  // Win Rate do período
  const winRate = deals.length > 0 ? (wonDeals.length / deals.length) * 100 : 0;

  // Métricas do período anterior
  const previousWonDeals = previousDeals.filter(d => d.isWon);

  // Para comparação do Pipeline Value, precisamos do snapshot anterior... 
  // O que é difícil calcular precisamente sem histórico.
  // Vamos usar a aproximação dos deals criados no período anterior que ainda estão ativos (proxy)
  // OU simplesmente comparar "Novos negócios ativos" vs "Novos negócios ativos anteriores".
  // Para manter consistência visual nos cards, vamos comparar "Novos Ativos" vs "Novos Ativos Anteriores" nos cards de mudança,
  // mas o valor exibido principal será o Snapshot Total.
  // Ajuste: A variação do Pipeline Value Total é complexa. Vamos simplificar mostrando variação de novos volumes.
  const activeDealsInPeriod = deals.filter(d => !d.isWon && !d.isLost); // Criados no período e ativos
  const previousActiveDeals = previousDeals.filter(d => !d.isWon && !d.isLost);

  const previousPipelineValueProxy = previousActiveDeals.reduce((acc, l) => acc + l.value, 0);
  const currentPipelineValueProxy = activeDealsInPeriod.reduce((acc, l) => acc + l.value, 0);

  const previousWonRevenue = previousWonDeals.reduce((acc, l) => acc + l.value, 0);
  const previousWinRate = previousDeals.length > 0
    ? (previousWonDeals.length / previousDeals.length) * 100
    : 0;

  // Calcular variações percentuais
  // Nota: Para Pipeline Total, estamos comparando o "Volume Novo Adicionado" vs "Volume Novo Anterior" como indicador de tendência
  const pipelineChange = calculateChange(currentPipelineValueProxy, previousPipelineValueProxy);
  const dealsChange = calculateChange(activeDealsInPeriod.length, previousActiveDeals.length);
  const winRateChange = calculateChange(winRate, previousWinRate);
  const revenueChange = calculateChange(wonRevenue, previousWonRevenue);

  // Top Deals (Highest Value) - Mostra do Snapshot (Ativos grandes) ou do Período?
  // Geralmente num dashboard queremos ver as maiores oportunidades ABERTAS agora.
  const topDeals = [...activeSnapshotDeals]
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  // Prepare Chart Data - usar stages do board padrão ou selecionado
  const funnelData = React.useMemo(() => {
    // Se boardId foi fornecido, tenta achar o board específico. Se não, usa default ou o primeiro.
    const selectedBoard = boardId
      ? boards.find(b => b.id === boardId)
      : (defaultBoard || boards[0]);

    const stages = selectedBoard?.stages || [];

    const COLOR_MAP: Record<string, string> = {
      'bg-blue-500': '#3b82f6',
      'bg-green-500': '#22c55e',
      'bg-yellow-500': '#eab308',
      'bg-orange-500': '#f97316',
      'bg-red-500': '#ef4444',
      'bg-purple-500': '#a855f7',
      'bg-pink-500': '#ec4899',
      'bg-indigo-500': '#6366f1',
      'bg-teal-500': '#14b8a6',
      'bg-slate-500': '#64748b',
    };

    if (stages.length === 0) {
      // Fallback simples se não tiver stages
      return [
        { name: 'Em aberto', count: deals.filter(d => !d.isWon && !d.isLost).length, fill: '#3b82f6' },
        { name: 'Ganho', count: deals.filter(d => d.isWon).length, fill: '#22c55e' },
        { name: 'Perdido', count: deals.filter(d => d.isLost).length, fill: '#ef4444' },
      ];
    }

    // Usar dados de SNAPSHOT (activeSnapshotDeals)
    // Mostra tudo que está no funil AGORA, independente de quando foi criado.
    return stages.map(stage => ({
      name: stage.label,
      count: activeSnapshotDeals.filter(d => d.status === stage.id).length,
      fill: COLOR_MAP[stage.color] || '#3b82f6', // Fallback to blue
    }));
  }, [activeSnapshotDeals, defaultBoard, boards, boardId]);

  // Mock Trend Data
  // Real Trend Data (Last 6 Months)
  const trendData = React.useMemo(() => {
    /**
     * Performance: avoid O(6*N) by pre-aggregating revenue by month once.
     * (Previously: for each month, `wonDeals.reduce(...)`.)
     */
    const revenueByMonthKey = new Map<string, number>();
    for (const deal of wonDeals) {
      if (!deal.updatedAt) continue;
      const dt = new Date(deal.updatedAt);
      const key = `${dt.getMonth()}-${dt.getFullYear()}`;
      revenueByMonthKey.set(key, (revenueByMonthKey.get(key) ?? 0) + deal.value);
    }

    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return d;
    });

    return last6Months.map(date => {
      const monthName = date.toLocaleString('default', { month: 'short' });
      const monthKey = `${date.getMonth()}-${date.getFullYear()}`;
      const monthlyRevenue = revenueByMonthKey.get(monthKey) ?? 0;

      return {
        month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        revenue: monthlyRevenue
      };
    });
  }, [wonDeals]);

  // Wallet Health Metrics - Usa TODOS os contatos (não filtrados por período)
  // A saúde da carteira é um snapshot atual, não depende do período selecionado
  /**
   * Performance: compute contact buckets in a single pass (avoid 3 filters + 1 reduce).
   */
  const contactsBuckets = React.useMemo(() => {
    const active: typeof allContacts = [];
    const inactive: typeof allContacts = [];
    const churned: typeof allContacts = [];
    let totalLTV = 0;
    for (const c of allContacts) {
      totalLTV += c.totalValue || 0;
      if (c.status === 'ACTIVE') active.push(c);
      else if (c.status === 'INACTIVE') inactive.push(c);
      else if (c.status === 'CHURNED') churned.push(c);
    }
    return { active, inactive, churned, totalLTV };
  }, [allContacts]);

  const activeContacts = contactsBuckets.active;
  const inactiveContacts = contactsBuckets.inactive;
  const churnedContacts = contactsBuckets.churned;
  const totalContacts = allContacts.length || 1; // Avoid division by zero

  const activePercent = Math.round((activeContacts.length / totalContacts) * 100);
  const inactivePercent = Math.round((inactiveContacts.length / totalContacts) * 100);
  const churnedPercent = Math.round((churnedContacts.length / totalContacts) * 100);

  const avgLTV = activeContacts.length > 0 ? contactsBuckets.totalLTV / activeContacts.length : 0;

  // Calculate Stagnant Deals (no stage change > 10 days)
  const tenDaysAgoTs = Date.now() - 10 * 24 * 60 * 60 * 1000;
  let stagnantDealsCount = 0;
  let stagnantDealsValue = 0;
  for (const deal of allDeals) {
    if (deal.isWon || deal.isLost) continue;
    const lastChangeTs = deal.lastStageChangeDate ? Date.parse(deal.lastStageChangeDate) : Date.parse(deal.createdAt);
    if (lastChangeTs < tenDaysAgoTs) {
      stagnantDealsCount += 1;
      stagnantDealsValue += deal.value;
    }
  }

  // Calculate Deals without scheduled activities
  // (simplified - would need activities data for full implementation)
  const riskyCount = stagnantDealsCount; // Using stagnant as risk indicator

  // Sales Cycle Metrics
  const wonDealsWithDates = wonDeals.filter(d => d.createdAt && d.updatedAt);
  /**
   * Performance: compute avg/min/max in one pass (avoid allocating `salesCycles` array + spreading).
   */
  let salesCycleCount = 0;
  let salesCycleSum = 0;
  let fastestDeal = 0;
  let slowestDeal = 0;
  for (const d of wonDealsWithDates) {
    const createdTs = Date.parse(d.createdAt);
    const closedTs = Date.parse(d.updatedAt);
    const days = Math.floor((closedTs - createdTs) / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(days)) continue;
    salesCycleCount += 1;
    salesCycleSum += days;
    if (salesCycleCount === 1) {
      fastestDeal = days;
      slowestDeal = days;
    } else {
      fastestDeal = Math.min(fastestDeal, days);
      slowestDeal = Math.max(slowestDeal, days);
    }
  }
  const avgSalesCycle = salesCycleCount > 0 ? Math.round(salesCycleSum / salesCycleCount) : 0;

  // Conversion Funnel Metrics (lostDeals já calculado acima)
  const totalClosedDeals = wonDeals.length + lostDeals.length;
  const actualWinRate = totalClosedDeals > 0 ? (wonDeals.length / totalClosedDeals) * 100 : 0;

  // Loss Reasons Analysis
  const lossReasons = lostDeals.reduce((acc, deal) => {
    const reason = deal.lossReason || 'Não especificado';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  /**
   * Performance: avoid sorting all entries; keep top 3 while scanning.
   */
  const topLossReasons = (() => {
    const top: Array<[string, number]> = [];
    for (const [k, v] of Object.entries(lossReasons)) {
      if (top.length < 3) {
        top.push([k, v]);
        top.sort((a, b) => b[1] - a[1]);
        continue;
      }
      if (v > top[2][1]) {
        top[2] = [k, v];
        top.sort((a, b) => b[1] - a[1]);
      }
    }
    return top;
  })();

  return {
    isLoading,
    deals,
    totalValue,
    wonDeals,
    wonRevenue,
    winRate,
    pipelineValue,
    topDeals,
    funnelData,
    trendData,
    activeContacts,
    inactiveContacts,
    churnedContacts,
    activePercent,
    inactivePercent,
    churnedPercent,
    avgLTV,
    riskyCount,
    stagnantDealsCount,
    stagnantDealsValue,
    avgSalesCycle,
    fastestDeal,
    slowestDeal,
    actualWinRate,
    lostDeals,
    topLossReasons,
    wonDealsWithDates,
    // Variações percentuais para comparação
    changes: {
      pipeline: pipelineChange,
      deals: dealsChange,
      winRate: winRateChange,
      revenue: revenueChange,
    },
    activeSnapshotDeals, // Exposing full active pipeline for alerts
  };
};

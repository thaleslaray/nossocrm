/**
 * useAgencyDashboardMetrics - Hook para métricas específicas de agências
 *
 * Calcula KPIs focados em agências de tráfego pago:
 * - Novos Leads (deals criados no período)
 * - Propostas Enviadas (deals em estágio de proposta)
 * - Fechamentos (deals ganhos no período)
 * - Receita Mensal (soma de deals ganhos)
 * - Progresso da Meta (receita vs meta mensal)
 */
import { useMemo } from 'react';
import { useDealsView } from '@/lib/query/hooks/useDealsQuery';
import { useAgencyProfile } from '@/lib/query/hooks';
import type { DealView } from '@/types';

/**
 * Calcula o início e fim do mês corrente
 */
function getCurrentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

/**
 * Verifica se uma data está dentro do range
 */
function isInRange(dateStr: string | undefined, range: { start: Date; end: Date }): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return date >= range.start && date <= range.end;
}

/**
 * Identifica se um deal está em estágio de proposta baseado no stageLabel
 */
function isProposalStage(deal: DealView): boolean {
  const label = (deal.stageLabel || '').toLowerCase();
  return label.includes('proposta') || label.includes('proposal');
}

/**
 * Calcula a porcentagem de progresso da meta
 */
function calculateProgress(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(Math.round((current / goal) * 100), 100);
}

export interface AgencyDashboardMetrics {
  // Counts
  newLeadsCount: number; // Deals criados este mês
  proposalsCount: number; // Deals em estágio de proposta (ativos)
  closedCount: number; // Deals ganhos este mês
  wonRevenue: number; // Receita de deals ganhos este mês

  // Goal Progress
  monthlyGoal: number; // Meta de receita mensal (do perfil da agência)
  progressPercent: number; // Porcentagem de progresso (wonRevenue / monthlyGoal)

  // Deals Lists (para detalhamento)
  newLeads: DealView[];
  proposalDeals: DealView[];
  closedDeals: DealView[];

  // Loading states
  isLoading: boolean;
}

/**
 * Hook principal para métricas de agência
 */
export function useAgencyDashboardMetrics(): AgencyDashboardMetrics {
  const { data: allDeals = [], isLoading: dealsLoading } = useDealsView();
  const { data: agencyProfile, isLoading: profileLoading } = useAgencyProfile();

  const metrics = useMemo(() => {
    const monthRange = getCurrentMonthRange();

    // Filter deals created this month
    const newLeads = allDeals.filter((deal) =>
      isInRange(deal.createdAt, monthRange)
    );

    // Filter active deals in proposal stage
    const proposalDeals = allDeals.filter(
      (deal) => !deal.isWon && !deal.isLost && isProposalStage(deal)
    );

    // Filter deals won this month
    const closedDeals = allDeals.filter((deal) => {
      if (!deal.isWon) return false;
      // Check if closedAt is in range, fallback to updatedAt
      const dateToCheck = deal.closedAt || deal.updatedAt;
      return isInRange(dateToCheck, monthRange);
    });

    // Calculate revenue from closed deals
    const wonRevenue = closedDeals.reduce((sum, deal) => sum + (deal.value || 0), 0);

    // Get monthly goal from agency profile
    const monthlyGoal = agencyProfile?.monthlyGoal || 0;

    // Calculate progress percentage
    const progressPercent = calculateProgress(wonRevenue, monthlyGoal);

    return {
      newLeadsCount: newLeads.length,
      proposalsCount: proposalDeals.length,
      closedCount: closedDeals.length,
      wonRevenue,
      monthlyGoal,
      progressPercent,
      newLeads,
      proposalDeals,
      closedDeals,
      isLoading: dealsLoading || profileLoading,
    };
  }, [allDeals, agencyProfile, dealsLoading, profileLoading]);

  return metrics;
}

/**
 * Formata valor para moeda brasileira
 */
export function formatCurrency(value: number): string {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

/**
 * Retorna variação percentual entre dois valores
 */
export function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

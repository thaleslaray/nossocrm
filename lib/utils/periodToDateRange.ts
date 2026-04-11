/**
 * @fileoverview Period to Date Range Converter
 *
 * Converte PeriodFilter do dashboard em date range ISO strings
 * para uso em queries de métricas (client + server).
 *
 * @module lib/utils/periodToDateRange
 */

import type { PeriodFilter } from '@/features/dashboard/hooks/useDashboardMetrics';

export interface DateRangeISO {
  start: string;
  end: string;
}

/**
 * Converte um PeriodFilter em date range ISO strings.
 *
 * `'all'` é limitado a 365 dias (cap client-side; RPC também limita server-side).
 */
export function periodToDateRange(period: PeriodFilter): DateRangeISO {
  const now = new Date();
  const end = now.toISOString();

  switch (period) {
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return { start: d.toISOString(), end };
    }
    case 'yesterday': {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      const e = new Date();
      e.setHours(0, 0, 0, 0);
      return { start: d.toISOString(), end: e.toISOString() };
    }
    case 'last_7_days': {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return { start: d.toISOString(), end };
    }
    case 'last_30_days': {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      d.setHours(0, 0, 0, 0);
      return { start: d.toISOString(), end };
    }
    case 'this_month': {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return { start: d.toISOString(), end };
    }
    case 'last_month': {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      const e = new Date();
      e.setDate(1);
      e.setHours(0, 0, 0, 0);
      return { start: d.toISOString(), end: e.toISOString() };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      const d = new Date(now.getFullYear(), q, 1);
      return { start: d.toISOString(), end };
    }
    case 'last_quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      const d = new Date(now.getFullYear(), q - 3, 1);
      const e = new Date(now.getFullYear(), q, 1);
      return { start: d.toISOString(), end: e.toISOString() };
    }
    case 'this_year': {
      const d = new Date(now.getFullYear(), 0, 1);
      return { start: d.toISOString(), end };
    }
    case 'last_year': {
      const d = new Date(now.getFullYear() - 1, 0, 1);
      const e = new Date(now.getFullYear(), 0, 1);
      return { start: d.toISOString(), end: e.toISOString() };
    }
    case 'all':
    default: {
      // Cap: 365 dias (RPC também limita server-side)
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      d.setHours(0, 0, 0, 0);
      return { start: d.toISOString(), end };
    }
  }
}

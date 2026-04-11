/**
 * @fileoverview BANT Status Grid Component
 *
 * Visual grid showing Budget, Authority, Need, Timeline qualification status.
 * Each quadrant shows the status with appropriate colors and icons.
 *
 * @module features/deals/components/BANTStatusGrid
 */

import React from 'react';
import { DollarSign, Users, Target, Clock, CheckCircle2, HelpCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BantStatus } from '@/lib/ai/briefing/schemas';

interface BANTStatusGridProps {
  bantStatus: BantStatus;
  className?: string;
}

type StatusLevel = 'unknown' | 'partial' | 'complete';

interface StatusConfig {
  level: StatusLevel;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * Get status configuration based on status string.
 */
function getStatusConfig(status: string): StatusConfig {
  switch (status) {
    case 'confirmed':
    case 'validated':
      return {
        level: 'complete',
        label: 'Confirmado',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-500/10',
        borderColor: 'border-green-200 dark:border-green-500/20',
      };
    case 'mentioned':
    case 'expressed':
      return {
        level: 'partial',
        label: 'Mencionado',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-500/10',
        borderColor: 'border-amber-200 dark:border-amber-500/20',
      };
    case 'identified':
      return {
        level: 'partial',
        label: 'Identificado',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-500/10',
        borderColor: 'border-amber-200 dark:border-amber-500/20',
      };
    case 'negotiating':
      return {
        level: 'partial',
        label: 'Em negociação',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-500/10',
        borderColor: 'border-amber-200 dark:border-amber-500/20',
      };
    case 'urgent':
      return {
        level: 'complete',
        label: 'Urgente',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-500/10',
        borderColor: 'border-red-200 dark:border-red-500/20',
      };
    case 'flexible':
      return {
        level: 'partial',
        label: 'Flexível',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-500/10',
        borderColor: 'border-blue-200 dark:border-blue-500/20',
      };
    default:
      return {
        level: 'unknown',
        label: 'Desconhecido',
        color: 'text-slate-400 dark:text-slate-500',
        bgColor: 'bg-slate-50 dark:bg-slate-800/50',
        borderColor: 'border-slate-200 dark:border-slate-700',
      };
  }
}

function StatusIcon({ level }: { level: StatusLevel }) {
  switch (level) {
    case 'complete':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'partial':
      return <AlertCircle className="w-4 h-4 text-amber-500" />;
    default:
      return <HelpCircle className="w-4 h-4 text-slate-400" />;
  }
}

interface BANTItemProps {
  icon: React.ReactNode;
  title: string;
  status: string;
  value: string | null;
  notes: string;
}

function BANTItem({ icon, title, status, value, notes }: BANTItemProps) {
  const config = getStatusConfig(status);

  return (
    <div
      className={cn(
        'p-4 rounded-xl border transition-colors',
        config.bgColor,
        config.borderColor
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn('p-1.5 rounded-lg', config.bgColor, config.color)}>
            {icon}
          </div>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {title}
          </span>
        </div>
        <StatusIcon level={config.level} />
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              config.bgColor,
              config.color
            )}
          >
            {config.label}
          </span>
          {value && (
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {value}
            </span>
          )}
        </div>
        {notes && (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
            {notes}
          </p>
        )}
      </div>
    </div>
  );
}

export function BANTStatusGrid({ bantStatus, className }: BANTStatusGridProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <BANTItem
        icon={<DollarSign className="w-4 h-4" />}
        title="Orçamento"
        status={bantStatus.budget.status}
        value={bantStatus.budget.value}
        notes={bantStatus.budget.notes}
      />
      <BANTItem
        icon={<Users className="w-4 h-4" />}
        title="Autoridade"
        status={bantStatus.authority.status}
        value={bantStatus.authority.decisionMaker}
        notes={bantStatus.authority.notes}
      />
      <BANTItem
        icon={<Target className="w-4 h-4" />}
        title="Necessidade"
        status={bantStatus.need.status}
        value={
          bantStatus.need.painPoints.length > 0
            ? `${bantStatus.need.painPoints.length} dores`
            : null
        }
        notes={bantStatus.need.notes}
      />
      <BANTItem
        icon={<Clock className="w-4 h-4" />}
        title="Prazo"
        status={bantStatus.timeline.status}
        value={bantStatus.timeline.deadline}
        notes={bantStatus.timeline.notes}
      />
    </div>
  );
}

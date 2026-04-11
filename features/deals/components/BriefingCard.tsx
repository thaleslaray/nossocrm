/**
 * @fileoverview Meeting Briefing Card Component
 *
 * Displays a complete AI-generated meeting briefing with:
 * - Executive summary
 * - BANT status grid
 * - Pending points
 * - Recommended approach
 * - Alerts
 *
 * @module features/deals/components/BriefingCard
 */

import React from 'react';
import {
  FileText,
  RefreshCw,
  MessageSquare,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BANTStatusGrid } from './BANTStatusGrid';
import type { BriefingResponse } from '@/lib/ai/briefing/schemas';

interface BriefingCardProps {
  briefing: BriefingResponse;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

/**
 * Priority badge colors.
 */
function getPriorityBadge(priority: 'high' | 'medium' | 'low') {
  switch (priority) {
    case 'high':
      return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
    case 'medium':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
    case 'low':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
  }
}

/**
 * Alert type colors and icons.
 */
function getAlertConfig(type: 'warning' | 'opportunity' | 'risk') {
  switch (type) {
    case 'warning':
      return {
        icon: <AlertTriangle className="w-4 h-4" />,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-500/10',
        borderColor: 'border-amber-200 dark:border-amber-500/20',
      };
    case 'opportunity':
      return {
        icon: <Lightbulb className="w-4 h-4" />,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-500/10',
        borderColor: 'border-green-200 dark:border-green-500/20',
      };
    case 'risk':
      return {
        icon: <TrendingUp className="w-4 h-4 rotate-180" />,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-500/10',
        borderColor: 'border-red-200 dark:border-red-500/20',
      };
  }
}

export function BriefingCard({
  briefing,
  onRefresh,
  isRefreshing,
  className,
}: BriefingCardProps) {
  const formattedDate = new Date(briefing.generatedAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-500/20 rounded-lg">
            <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">
              Briefing Pré-Conversa
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gerado em {formattedDate} • {briefing.basedOnMessages} mensagens analisadas
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            title="Atualizar briefing"
          >
            <RefreshCw
              className={cn('w-4 h-4', isRefreshing && 'animate-spin')}
            />
          </button>
        )}
      </div>

      {/* Confidence indicator */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              briefing.confidence >= 0.7
                ? 'bg-green-500'
                : briefing.confidence >= 0.4
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            )}
            style={{ width: `${briefing.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {Math.round(briefing.confidence * 100)}% confiança
        </span>
      </div>

      {/* Executive Summary */}
      <div className="bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-4">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
          Resumo Executivo
        </h4>
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          {briefing.executiveSummary}
        </p>
      </div>

      {/* BANT Status */}
      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Status BANT
        </h4>
        <BANTStatusGrid bantStatus={briefing.bantStatus} />
      </div>

      {/* Pending Points */}
      {briefing.pendingPoints.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Pontos Pendentes
          </h4>
          <div className="space-y-2">
            {briefing.pendingPoints.map((point, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg"
              >
                <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {point.point}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                        getPriorityBadge(point.priority)
                      )}
                    >
                      {point.priority === 'high'
                        ? 'Alta'
                        : point.priority === 'medium'
                          ? 'Média'
                          : 'Baixa'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {point.context}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Approach */}
      <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-200 dark:border-primary-500/20 rounded-xl p-4">
        <h4 className="text-xs font-bold text-primary-700 dark:text-primary-400 uppercase tracking-wider mb-4">
          Abordagem Recomendada
        </h4>

        <div className="space-y-4">
          {/* Opening */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-3 h-3 text-primary-600 dark:text-primary-400" />
              <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">
                Abertura
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 pl-5">
              {briefing.recommendedApproach.opening}
            </p>
          </div>

          {/* Key Questions */}
          {briefing.recommendedApproach.keyQuestions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">
                  Perguntas-Chave
                </span>
              </div>
              <ul className="space-y-1.5 pl-5">
                {briefing.recommendedApproach.keyQuestions.map((q, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-slate-700 dark:text-slate-200 flex items-start gap-2"
                  >
                    <span className="text-primary-500 font-bold">{idx + 1}.</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Objections */}
          {briefing.recommendedApproach.objectionsToAnticipate.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">
                  Objeções a Antecipar
                </span>
              </div>
              <ul className="space-y-1.5 pl-5">
                {briefing.recommendedApproach.objectionsToAnticipate.map(
                  (obj, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-500 mt-1 shrink-0" />
                      {obj}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}

          {/* Next Step */}
          <div className="pt-3 border-t border-primary-200 dark:border-primary-500/20">
            <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
              <ArrowRight className="w-4 h-4" />
              <span className="text-sm font-semibold">Próximo Passo:</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 pl-6">
              {briefing.recommendedApproach.suggestedNextStep}
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {briefing.alerts.length > 0 && (
        <div className="space-y-2">
          {briefing.alerts.map((alert, idx) => {
            const config = getAlertConfig(alert.type);
            return (
              <div
                key={idx}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  config.bgColor,
                  config.borderColor
                )}
              >
                <div className={cn('mt-0.5', config.color)}>{config.icon}</div>
                <p className={cn('text-sm flex-1', config.color)}>
                  {alert.message}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * @fileoverview AI Extracted Fields Component
 *
 * Shows automatically extracted BANT fields from conversations.
 * Zero config - displays whatever has been extracted.
 *
 * @module features/deals/components/AIExtractedFields
 */

import React from 'react';
import { DollarSign, Users, Target, Clock, Sparkles, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIExtractedData, AIExtractedField } from '@/lib/ai/extraction/schemas';

interface AIExtractedFieldsProps {
  data: AIExtractedData | null | undefined;
  className?: string;
  compact?: boolean;
}

interface FieldConfig {
  key: keyof Omit<AIExtractedData, 'lastExtractedAt'>;
  label: string;
  icon: React.ReactNode;
}

const FIELD_CONFIG: FieldConfig[] = [
  { key: 'budget', label: 'Orçamento', icon: <DollarSign className="w-3.5 h-3.5" /> },
  { key: 'authority', label: 'Decisor', icon: <Users className="w-3.5 h-3.5" /> },
  { key: 'need', label: 'Necessidade', icon: <Target className="w-3.5 h-3.5" /> },
  { key: 'timeline', label: 'Prazo', icon: <Clock className="w-3.5 h-3.5" /> },
];

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600 dark:text-green-400';
  if (confidence >= 0.6) return 'text-amber-600 dark:text-amber-400';
  return 'text-slate-400 dark:text-slate-500';
}

function getConfidenceBg(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20';
  if (confidence >= 0.6) return 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20';
  return 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700';
}

function FieldItem({
  config,
  field,
  compact,
}: {
  config: FieldConfig;
  field: AIExtractedField | undefined;
  compact?: boolean;
}) {
  const hasValue = field?.value;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn(
          'p-1 rounded',
          hasValue ? getConfidenceBg(field.confidence) : 'bg-slate-100 dark:bg-slate-800'
        )}>
          <span className={hasValue ? getConfidenceColor(field.confidence) : 'text-slate-400'}>
            {config.icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            {config.label}
          </p>
          <p className={cn(
            'text-xs truncate',
            hasValue ? 'text-slate-900 dark:text-white' : 'text-slate-400 italic'
          )}>
            {hasValue ? field.value : 'Não identificado'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-colors',
        hasValue ? getConfidenceBg(field.confidence) : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={hasValue ? getConfidenceColor(field.confidence) : 'text-slate-400'}>
          {config.icon}
        </span>
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          {config.label}
        </span>
        {hasValue && (
          <span className={cn(
            'ml-auto text-[10px] font-medium',
            getConfidenceColor(field.confidence)
          )}>
            {Math.round(field.confidence * 100)}%
          </span>
        )}
      </div>
      <p className={cn(
        'text-sm',
        hasValue ? 'text-slate-900 dark:text-white' : 'text-slate-400 italic'
      )}>
        {hasValue ? field.value : 'Não identificado ainda'}
      </p>
      {hasValue && field.reasoning && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
          {field.reasoning}
        </p>
      )}
    </div>
  );
}

export function AIExtractedFields({ data, className, compact }: AIExtractedFieldsProps) {
  const hasAnyData = data && FIELD_CONFIG.some((c) => data[c.key]?.value);

  if (!hasAnyData) {
    return (
      <div className={cn('text-center py-4', className)}>
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
          <HelpCircle className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Informações serão extraídas automaticamente das conversas
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn('space-y-2', className)}>
        {FIELD_CONFIG.map((config) => (
          <FieldItem
            key={config.key}
            config={config}
            field={data?.[config.key]}
            compact
          />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary-500" />
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Extraído pela IA
        </h4>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FIELD_CONFIG.map((config) => (
          <FieldItem
            key={config.key}
            config={config}
            field={data?.[config.key]}
          />
        ))}
      </div>
      {data?.lastExtractedAt && (
        <p className="text-[10px] text-slate-400 mt-2 text-right">
          Atualizado em {new Date(data.lastExtractedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}

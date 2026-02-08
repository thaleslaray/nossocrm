'use client';

/**
 * @fileoverview Learned Patterns Preview Component
 *
 * Mostra os padrões aprendidos pelo Few-Shot Learning.
 * Permite visualizar critérios, tom, e técnicas extraídas.
 *
 * @module features/settings/components/ai/LearnedPatternsPreview
 */

import {
  Brain,
  MessageCircle,
  Target,
  Shield,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Hash,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LearnedPattern, LearnedCriterion } from '@/lib/ai/agent/few-shot-learner';

// =============================================================================
// Types
// =============================================================================

interface LearnedPatternsPreviewProps {
  patterns: LearnedPattern | null;
  onClear?: () => void;
  onRetrain?: () => void;
  isClearing?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function LearnedPatternsPreview({
  patterns,
  onClear,
  onRetrain,
  isClearing,
}: LearnedPatternsPreviewProps) {
  if (!patterns) {
    return (
      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
        <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-sm">Nenhum padrão aprendido ainda</p>
        <p className="text-xs mt-1">Selecione conversas para começar o aprendizado</p>
      </div>
    );
  }

  const toneLabels: Record<string, string> = {
    formal: 'Formal',
    casual: 'Casual',
    consultative: 'Consultivo',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary-500" />
            <h4 className="font-medium text-slate-900 dark:text-white">Padrões Aprendidos</h4>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Extraídos de {patterns.extractedFrom?.length ?? 0} conversas
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRetrain && (
            <Button variant="outline" size="sm" onClick={onRetrain}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retreinar
            </Button>
          )}
          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={isClearing}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Meta Info */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="outline" className="text-xs">
          <Calendar className="h-3 w-3 mr-1" />
          {new Date(patterns.learnedAt).toLocaleDateString('pt-BR')}
        </Badge>
        <Badge variant="outline" className="text-xs">
          <Hash className="h-3 w-3 mr-1" />
          {patterns.modelVersion}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            patterns.tone === 'formal' && 'border-blue-300 text-blue-700',
            patterns.tone === 'casual' && 'border-green-300 text-green-700',
            patterns.tone === 'consultative' && 'border-purple-300 text-purple-700'
          )}
        >
          <MessageCircle className="h-3 w-3 mr-1" />
          Tom: {toneLabels[patterns.tone]}
        </Badge>
      </div>

      {/* Criteria */}
      <PatternSection
        title="Critérios de Qualificação"
        icon={<Target className="h-4 w-4" />}
        count={patterns.learnedCriteria.length}
      >
        <div className="space-y-2">
          {patterns.learnedCriteria.map((criterion) => (
            <CriterionCard key={criterion.name} criterion={criterion} />
          ))}
        </div>
      </PatternSection>

      {/* Greeting Style */}
      <PatternSection
        title="Estilo de Saudação"
        icon={<Sparkles className="h-4 w-4" />}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 italic">
          &quot;{patterns.greetingStyle}&quot;
        </p>
      </PatternSection>

      {/* Question Patterns */}
      <PatternSection
        title="Perguntas de Qualificação"
        icon={<MessageCircle className="h-4 w-4" />}
        count={patterns.questionPatterns.length}
      >
        <ul className="space-y-1">
          {patterns.questionPatterns.map((question, i) => (
            <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
              <span className="text-slate-400">•</span>
              {question}
            </li>
          ))}
        </ul>
      </PatternSection>

      {/* Objection Handling */}
      <PatternSection
        title="Tratamento de Objeções"
        icon={<Shield className="h-4 w-4" />}
        count={patterns.objectionHandling.length}
      >
        <ul className="space-y-1">
          {patterns.objectionHandling.map((technique, i) => (
            <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
              <span className="text-slate-400">•</span>
              {technique}
            </li>
          ))}
        </ul>
      </PatternSection>

      {/* Closing Techniques */}
      <PatternSection
        title="Técnicas de Fechamento"
        icon={<CheckCircle2 className="h-4 w-4" />}
        count={patterns.closingTechniques.length}
      >
        <ul className="space-y-1">
          {patterns.closingTechniques.map((technique, i) => (
            <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
              <span className="text-slate-400">•</span>
              {technique}
            </li>
          ))}
        </ul>
      </PatternSection>
    </div>
  );
}

// =============================================================================
// Pattern Section
// =============================================================================

interface PatternSectionProps {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}

function PatternSection({ title, icon, count, children }: PatternSectionProps) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-primary-500">{icon}</span>
        <h5 className="font-medium text-slate-900 dark:text-white">{title}</h5>
        {count !== undefined && (
          <Badge variant="secondary" className="text-[10px]">
            {count}
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}

// =============================================================================
// Criterion Card
// =============================================================================

interface CriterionCardProps {
  criterion: LearnedCriterion;
}

function CriterionCard({ criterion }: CriterionCardProps) {
  const isRequired = criterion.importance === 'required';

  return (
    <div
      className={cn(
        'p-3 rounded-lg border',
        'bg-white dark:bg-slate-900',
        isRequired
          ? 'border-amber-200 dark:border-amber-500/30'
          : 'border-slate-200 dark:border-slate-700'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <code className="text-xs font-mono text-slate-600 dark:text-slate-400">
          {criterion.name}
        </code>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            isRequired
              ? 'border-amber-300 text-amber-700 dark:border-amber-500/50 dark:text-amber-400'
              : 'border-slate-300 text-slate-500'
          )}
        >
          {isRequired ? (
            <>
              <AlertCircle className="h-3 w-3 mr-1" />
              Obrigatório
            </>
          ) : (
            'Opcional'
          )}
        </Badge>
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">{criterion.description}</p>

      <div className="flex flex-wrap gap-1">
        {criterion.detectionHints.slice(0, 5).map((hint) => (
          <Badge key={hint} variant="secondary" className="text-[10px] font-normal">
            {hint}
          </Badge>
        ))}
        {criterion.detectionHints.length > 5 && (
          <Badge variant="secondary" className="text-[10px]">
            +{criterion.detectionHints.length - 5}
          </Badge>
        )}
      </div>
    </div>
  );
}

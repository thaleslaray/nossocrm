'use client';

/**
 * @fileoverview Stage Advance Suggestion Component
 *
 * Componente UI editável para aprovar/rejeitar/editar sugestões de avanço de estágio.
 * Segue o padrão Lightfield de HITL onde o usuário pode:
 * 1. Aprovar como está
 * 2. Editar e aprovar (mudar estágio destino, motivo)
 * 3. Rejeitar
 * 4. Decidir depois (dismiss)
 *
 * @module features/messaging/components/StageAdvanceSuggestion
 */

import { useState } from 'react';
import {
  Brain,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { StageAdvanceSuggestion as SuggestionType, UserEdits } from '@/lib/ai/agent/hitl-stage-advance';

// =============================================================================
// Types
// =============================================================================

interface BoardStage {
  id: string;
  name: string;
  order?: number;
}

interface StageAdvanceSuggestionProps {
  /** A sugestão da AI */
  suggestion: SuggestionType;
  /** Estágios disponíveis para seleção */
  stages: BoardStage[];
  /** Callback quando usuário submete decisão */
  onSubmit: (edits: UserEdits) => Promise<void>;
  /** Callback quando usuário quer decidir depois */
  onDismiss: () => void;
  /** Se está processando */
  isLoading?: boolean;
}

// =============================================================================
// Styled Form Components (inline styles for this feature)
// =============================================================================

const labelStyles = 'block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1';
const inputStyles = cn(
  'w-full bg-slate-50 dark:bg-black/20',
  'border border-slate-200 dark:border-slate-700',
  'rounded-lg px-3 py-2 text-sm',
  'text-slate-900 dark:text-white',
  'outline-none focus:ring-2 focus:ring-primary-500',
  'transition-all duration-200',
  'placeholder:text-slate-400'
);

// =============================================================================
// Component
// =============================================================================

export function StageAdvanceSuggestion({
  suggestion,
  stages,
  onSubmit,
  onDismiss,
  isLoading = false,
}: StageAdvanceSuggestionProps) {
  // Estado editável
  const [targetStageId, setTargetStageId] = useState(suggestion.targetStageId);
  const [reason, setReason] = useState(suggestion.reason);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  // Detectar se foi editado
  const wasEdited =
    targetStageId !== suggestion.targetStageId ||
    reason !== suggestion.reason ||
    additionalNotes.length > 0;

  // Encontrar nome do estágio selecionado
  const selectedStage = stages.find((s) => s.id === targetStageId);

  const handleApprove = async () => {
    await onSubmit({
      approved: true,
      targetStageId: wasEdited ? targetStageId : undefined,
      reason: reason !== suggestion.reason ? reason : undefined,
      additionalNotes: additionalNotes || undefined,
    });
  };

  const handleReject = async () => {
    await onSubmit({
      approved: false,
      additionalNotes: additionalNotes || undefined,
    });
  };

  const confidencePercent = Math.round(suggestion.confidence * 100);
  const confidenceColor =
    confidencePercent >= 85
      ? 'text-green-600'
      : confidencePercent >= 70
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <Card className="border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-base font-semibold text-amber-900 dark:text-amber-100">
              AI sugere avançar lead
            </CardTitle>
          </div>
          <Badge variant="outline" className={cn('font-mono', confidenceColor)}>
            {confidencePercent}% confiança
          </Badge>
        </div>

        {/* Deal info */}
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300 mt-2">
          <span className="font-medium">{suggestion.dealTitle}</span>
          <ArrowRight className="h-4 w-4" />
          <span>{suggestion.currentStageName}</span>
          <ArrowRight className="h-4 w-4" />
          <span className="font-medium">{selectedStage?.name || suggestion.targetStageName}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Toggle detalhes */}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100"
        >
          {showDetails ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Ocultar detalhes
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Ver critérios avaliados
            </>
          )}
        </button>

        {/* Critérios avaliados */}
        {showDetails && (
          <div className="space-y-2 p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-500/20">
            <span className={labelStyles}>
              Critérios Avaliados
            </span>
            <div className="space-y-2">
              {suggestion.criteriaEvaluation.map((c) => (
                <div key={c.criterion} className="flex items-start gap-2">
                  {c.met ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-900 dark:text-white">
                        {c.criterion}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({Math.round(c.confidence * 100)}%)
                      </span>
                    </div>
                    {c.evidence && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 italic">
                        &quot;{c.evidence}&quot;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Campos editáveis */}
        <div className="space-y-4 p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-500/20">
          {/* Estágio destino */}
          <div>
            <label htmlFor="targetStage" className={cn(labelStyles, 'flex items-center gap-1')}>
              Avançar para
              {targetStageId !== suggestion.targetStageId && (
                <Pencil className="h-3 w-3 text-amber-500" />
              )}
            </label>
            <select
              id="targetStage"
              value={targetStageId}
              onChange={(e) => setTargetStageId(e.target.value)}
              className={inputStyles}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                  {stage.id === suggestion.targetStageId ? ' (sugerido)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Motivo */}
          <div>
            <label htmlFor="reason" className={cn(labelStyles, 'flex items-center gap-1')}>
              Motivo
              {reason !== suggestion.reason && (
                <Pencil className="h-3 w-3 text-amber-500" />
              )}
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={cn(inputStyles, 'min-h-[60px] resize-none')}
              placeholder="Motivo do avanço..."
            />
          </div>

          {/* Notas adicionais */}
          <div>
            <label htmlFor="notes" className={labelStyles}>
              Notas adicionais (opcional)
            </label>
            <input
              type="text"
              id="notes"
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className={inputStyles}
              placeholder="Adicione contexto..."
            />
          </div>

          {/* Indicador de edição */}
          {wasEdited && (
            <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
              <Pencil className="h-3 w-3" />
              Você editou a sugestão original
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2 pt-0">
        <Button onClick={handleApprove} disabled={isLoading} className="flex-1 sm:flex-none">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          {wasEdited ? 'Aplicar Edições' : 'Confirmar Avanço'}
        </Button>

        <Button
          variant="outline"
          onClick={handleReject}
          disabled={isLoading}
          className="flex-1 sm:flex-none"
        >
          <XCircle className="h-4 w-4 mr-2" />
          Rejeitar
        </Button>

        <Button
          variant="ghost"
          onClick={onDismiss}
          disabled={isLoading}
          className="flex-1 sm:flex-none"
        >
          Decidir Depois
        </Button>
      </CardFooter>
    </Card>
  );
}

// =============================================================================
// Compact Version (for notification/list view)
// =============================================================================

interface CompactSuggestionProps {
  suggestion: SuggestionType;
  onClick: () => void;
}

export function CompactStageAdvanceSuggestion({ suggestion, onClick }: CompactSuggestionProps) {
  const confidencePercent = Math.round(suggestion.confidence * 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        'bg-amber-50 dark:bg-amber-900/10',
        'border-amber-200 dark:border-amber-500/30',
        'hover:bg-amber-100 dark:hover:bg-amber-900/20'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
            AI sugere avanço
          </span>
        </div>
        <Badge variant="outline" className="text-xs">
          {confidencePercent}%
        </Badge>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
        {suggestion.dealTitle}: {suggestion.currentStageName} → {suggestion.targetStageName}
      </p>
    </button>
  );
}

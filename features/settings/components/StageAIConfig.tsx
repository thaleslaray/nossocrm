'use client';

/**
 * @fileoverview Stage AI Configuration Component
 *
 * Permite configurar o AI Agent para cada estágio do funil.
 * Admin pode definir prompts, objetivos e critérios de avanço.
 *
 * @module features/settings/components/StageAIConfig
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Ban, Bot, ChevronDown, ChevronRight, Sparkles, Wand2, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  useStageAIConfigsQuery,
  useUpsertStageAIConfigMutation,
  useToggleStageAIMutation,
  useGenerateStagePromptsMutation,
} from '@/lib/query/hooks/useStageAIConfigQuery';
import {
  getTemplateForStage,
  getDefaultPrompt,
} from '@/lib/ai/agent/prompt-templates';

// =============================================================================
// Types
// =============================================================================

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface StageAIConfigProps {
  boardId: string;
  stages: Stage[];
  goalStageId?: string;
}

// =============================================================================
// Component
// =============================================================================

// =============================================================================
// Generated prompts preview state (per stage)
// =============================================================================

interface GeneratedPreview {
  [stageId: string]: {
    system_prompt: string;
    stage_goal: string;
    advancement_criteria: string[];
    suggestedMaxMessages?: number;
    handoffKeywords?: string[];
  };
}

export function StageAIConfig({ boardId, stages, goalStageId }: StageAIConfigProps) {
  const goalStageOrder = goalStageId ? (stages.find((s) => s.id === goalStageId)?.order ?? null) : null;
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [businessDescription, setBusinessDescription] = useState('');
  const [generatedPreview, setGeneratedPreview] = useState<GeneratedPreview>({});
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSaveResult, setBatchSaveResult] = useState<{ success: number; total: number } | null>(null);

  const { data: configs, isLoading } = useStageAIConfigsQuery(boardId);
  const upsertMutation = useUpsertStageAIConfigMutation();
  const toggleMutation = useToggleStageAIMutation();
  const generateMutation = useGenerateStagePromptsMutation();

  // Map configs by stage ID for easy lookup
  const configMap = new Map(configs?.map((c) => [c.stage_id, c]) || []);

  const hasGeneratedPreview = Object.keys(generatedPreview).length > 0;

  const handleToggle = (stageId: string) => {
    const config = configMap.get(stageId);
    if (config) {
      toggleMutation.mutate({ configId: config.id, enabled: !config.enabled });
    } else {
      // Create new config when enabling for the first time
      upsertMutation.mutate({
        board_id: boardId,
        stage_id: stageId,
        enabled: true,
        system_prompt: getDefaultPrompt(stages.find((s) => s.id === stageId)?.name || 'Novo'),
      });
    }
  };

  const handleSaveConfig = (stageId: string, data: {
    system_prompt: string;
    stage_goal?: string;
    advancement_criteria?: string[];
    notify_team?: boolean;
  }) => {
    const config = configMap.get(stageId);
    upsertMutation.mutate({
      board_id: boardId,
      stage_id: stageId,
      enabled: config?.enabled ?? false,
      ...data,
    });
  };

  const handleGenerate = useCallback(() => {
    if (!businessDescription.trim() || businessDescription.trim().length < 10) return;

    generateMutation.mutate(
      { boardId, businessDescription: businessDescription.trim() },
      {
        onSuccess: (data) => {
          if (!data.success || !data.stages?.length) return;

          // Map generated prompts to stage IDs
          const preview: GeneratedPreview = {};
          for (const gen of data.stages) {
            const stageId = gen.stageId || stages.find((s) => s.name === gen.stageName)?.id;
            if (stageId) {
              preview[stageId] = {
                system_prompt: gen.systemPrompt,
                stage_goal: gen.stageGoal,
                advancement_criteria: gen.advancementCriteria,
                suggestedMaxMessages: gen.suggestedMaxMessages,
                handoffKeywords: gen.handoffKeywords,
              };
            }
          }
          setGeneratedPreview(preview);
          setShowGenerateDialog(false);
        },
      }
    );
  }, [boardId, businessDescription, generateMutation, stages]);

  const handleBatchSave = useCallback(async () => {
    if (!hasGeneratedPreview) return;
    setBatchSaving(true);
    setBatchSaveResult(null);

    let success = 0;
    const stageIds = Object.keys(generatedPreview);

    for (const stageId of stageIds) {
      const preview = generatedPreview[stageId];
      try {
        await new Promise<void>((resolve, reject) => {
          upsertMutation.mutate(
            {
              board_id: boardId,
              stage_id: stageId,
              enabled: configMap.get(stageId)?.enabled ?? true,
              system_prompt: preview.system_prompt,
              stage_goal: preview.stage_goal,
              advancement_criteria: preview.advancement_criteria,
              settings: {
                ...(preview.suggestedMaxMessages
                  ? { max_messages_per_conversation: preview.suggestedMaxMessages }
                  : {}),
                ...(preview.handoffKeywords?.length
                  ? { handoff_keywords: preview.handoffKeywords }
                  : {}),
              },
            },
            { onSuccess: () => resolve(), onError: () => reject() }
          );
        });
        success++;
      } catch {
        // Continue saving others
      }
    }

    setBatchSaving(false);
    setBatchSaveResult({ success, total: stageIds.length });
    if (success === stageIds.length) {
      // Clear preview after successful save
      setTimeout(() => {
        setGeneratedPreview({});
        setBatchSaveResult(null);
      }, 2000);
    }
  }, [boardId, configMap, generatedPreview, hasGeneratedPreview, upsertMutation]);

  const handleDiscardPreview = useCallback(() => {
    setGeneratedPreview({});
    setBatchSaveResult(null);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">AI Agent por Estágio</h3>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowGenerateDialog(true)}
          className="gap-1.5"
        >
          <Wand2 className="h-4 w-4" />
          Gerar prompts com IA
        </Button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Configure prompts específicos para cada estágio do funil. O AI responderá
        automaticamente seguindo as instruções de cada fase.
      </p>

      {/* Generate Dialog */}
      {showGenerateDialog && (
        <GeneratePromptsDialog
          description={businessDescription}
          onDescriptionChange={setBusinessDescription}
          onGenerate={handleGenerate}
          onClose={() => setShowGenerateDialog(false)}
          isGenerating={generateMutation.isPending}
          error={generateMutation.error?.message}
          stageCount={stages.length}
        />
      )}

      {/* Generated Preview Banner */}
      {hasGeneratedPreview && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mb-3">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Sparkles className="h-4 w-4 flex-shrink-0" />
            <span>
              {Object.keys(generatedPreview).length} prompts gerados pela IA.
              Revise abaixo e clique em &quot;Salvar Todos&quot;.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {batchSaveResult && (
              <span className={cn(
                'text-xs',
                batchSaveResult.success === batchSaveResult.total
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              )}>
                {batchSaveResult.success === batchSaveResult.total
                  ? 'Salvos!'
                  : `${batchSaveResult.success}/${batchSaveResult.total} salvos`}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscardPreview}
              disabled={batchSaving}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              onClick={handleBatchSave}
              disabled={batchSaving}
              className="gap-1.5"
            >
              {batchSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Salvar Todos
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {stages
          .sort((a, b) => a.order - b.order)
          .map((stage) => {
            const config = configMap.get(stage.id);
            const isExpanded = expandedStage === stage.id;
            const preview = generatedPreview[stage.id];

            const isOutOfScope = goalStageOrder !== null && stage.order > goalStageOrder;

            return (
              <StageConfigRow
                key={stage.id}
                stage={stage}
                config={config}
                isExpanded={isExpanded}
                isOutOfScope={isOutOfScope}
                onToggle={() => handleToggle(stage.id)}
                onExpand={() => setExpandedStage(isExpanded ? null : stage.id)}
                onSave={(data) => handleSaveConfig(stage.id, data)}
                isSaving={upsertMutation.isPending}
                generatedPreview={preview}
              />
            );
          })}
      </div>
    </div>
  );
}

// =============================================================================
// Generate Prompts Dialog
// =============================================================================

interface GeneratePromptsDialogProps {
  description: string;
  onDescriptionChange: (value: string) => void;
  onGenerate: () => void;
  onClose: () => void;
  isGenerating: boolean;
  error?: string;
  stageCount: number;
}

function GeneratePromptsDialog({
  description,
  onDescriptionChange,
  onGenerate,
  onClose,
  isGenerating,
  error,
  stageCount,
}: GeneratePromptsDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="mb-4 p-4 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/20">
      <div className="flex items-center gap-2 mb-3">
        <Wand2 className="h-4 w-4 text-primary-500" />
        <h4 className="font-medium text-sm text-slate-900 dark:text-white">
          Gerar prompts com IA
        </h4>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Descreva seu negócio e processo de vendas. A IA vai gerar prompts profissionais
        para cada um dos {stageCount} estágios do funil.
      </p>

      <textarea
        ref={textareaRef}
        placeholder="Ex: Vendemos software de automação de marketing para PMEs. Ciclo de venda de 2-4 semanas. Tom profissional mas acessível. Foco em demonstrar ROI rápido."
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        rows={4}
        disabled={isGenerating}
        className={cn(
          'w-full bg-white dark:bg-black/20',
          'border border-slate-200 dark:border-slate-700',
          'rounded-lg px-3 py-2 text-sm',
          'text-slate-900 dark:text-white',
          'outline-none focus:ring-2 focus:ring-primary-500',
          'resize-y min-h-[80px]',
          'placeholder:text-slate-400',
          isGenerating && 'opacity-60'
        )}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isGenerating) {
            e.preventDefault();
            onGenerate();
          }
        }}
      />

      {error && (
        <div className="flex items-center gap-2 mt-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-slate-400">
          {description.trim().length < 10
            ? `Mínimo 10 caracteres (${description.trim().length}/10)`
            : `${description.trim().length} caracteres`}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={isGenerating || description.trim().length < 10}
            className="gap-1.5"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5" />
                Gerar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Stage Config Row
// =============================================================================

interface StageConfigRowProps {
  stage: Stage;
  config?: {
    id: string;
    enabled: boolean;
    system_prompt: string;
    stage_goal: string | null;
    advancement_criteria: string[];
    notify_team?: boolean;
  };
  isExpanded: boolean;
  isOutOfScope?: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onSave: (data: { system_prompt: string; stage_goal?: string; advancement_criteria?: string[]; notify_team?: boolean }) => void;
  isSaving: boolean;
  generatedPreview?: {
    system_prompt: string;
    stage_goal: string;
    advancement_criteria: string[];
  };
}

function StageConfigRow({
  stage,
  config,
  isExpanded,
  isOutOfScope = false,
  onToggle,
  onExpand,
  onSave,
  isSaving,
  generatedPreview,
}: StageConfigRowProps) {
  const [prompt, setPrompt] = useState(config?.system_prompt || '');
  const [goal, setGoal] = useState(config?.stage_goal || '');
  const [criteria, setCriteria] = useState(config?.advancement_criteria?.join('\n') || '');
  const [notifyTeam, setNotifyTeam] = useState<boolean>(config?.notify_team ?? false);

  // Apply generated preview when it arrives
  useEffect(() => {
    if (generatedPreview) {
      setPrompt(generatedPreview.system_prompt);
      setGoal(generatedPreview.stage_goal);
      setCriteria(generatedPreview.advancement_criteria?.join('\n') ?? '');
    }
  }, [generatedPreview]);

  const hasChanges =
    prompt !== (config?.system_prompt || '') ||
    goal !== (config?.stage_goal || '') ||
    criteria !== (config?.advancement_criteria?.join('\n') || '') ||
    notifyTeam !== (config?.notify_team ?? false);

  // Reset form when expanding - uses smart templates
  const handleExpand = () => {
    if (!isExpanded) {
      if (generatedPreview) {
        setPrompt(generatedPreview.system_prompt);
        setGoal(generatedPreview.stage_goal);
        setCriteria(generatedPreview.advancement_criteria?.join('\n') ?? '');
      } else {
        const template = getTemplateForStage(stage.name);
        setPrompt(config?.system_prompt || template.prompt);
        setGoal(config?.stage_goal || template.goal);
        setCriteria(config?.advancement_criteria?.join('\n') || template.advancementCriteria.join('\n'));
      }
    }
    onExpand();
  };

  const handleSave = () => {
    onSave({
      system_prompt: prompt,
      stage_goal: goal || undefined,
      advancement_criteria: criteria.split('\n').filter(Boolean),
      notify_team: notifyTeam,
    });
  };

  return (
    <div
      className={cn(
        'border rounded-lg transition-colors',
        isOutOfScope
          ? 'border-slate-200 dark:border-slate-700 opacity-60'
          : isExpanded
            ? 'border-primary-500/50 bg-primary-500/5'
            : 'border-slate-200 dark:border-slate-700',
        !isOutOfScope && config?.enabled && 'border-l-4 border-l-green-500',
        isOutOfScope && config?.enabled && 'border-l-4 border-l-slate-300 dark:border-l-slate-600',
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
        onClick={handleExpand}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900 dark:text-white">{stage.name}</span>
              {generatedPreview && (
                <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <Wand2 className="h-3 w-3 mr-1" />
                  Preview
                </Badge>
              )}
              {isOutOfScope ? (
                <Badge className="text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <Ban className="h-3 w-3 mr-1" />
                  Fora do escopo
                </Badge>
              ) : config?.enabled ? (
                <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Ativo
                </Badge>
              ) : null}
            </div>
            {config?.stage_goal && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {config.stage_goal}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Simple toggle button */}
          <button
            type="button"
            onClick={isOutOfScope ? undefined : onToggle}
            disabled={isOutOfScope}
            title={isOutOfScope ? 'O agente não age neste estágio (além do limite configurado)' : undefined}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              isOutOfScope
                ? 'cursor-not-allowed opacity-50 bg-slate-200 dark:bg-slate-700'
                : cn(
                    'cursor-pointer',
                    config?.enabled ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'
                  )
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                !isOutOfScope && config?.enabled ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
          <div className="pt-4 space-y-4">
            {/* Goal */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Objetivo do Estágio
              </label>
              <input
                type="text"
                placeholder="Ex: Qualificar interesse e agendar demonstração"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className={cn(
                  'w-full bg-slate-50 dark:bg-black/20',
                  'border border-slate-200 dark:border-slate-700',
                  'rounded-lg px-3 py-2 text-sm',
                  'text-slate-900 dark:text-white',
                  'outline-none focus:ring-2 focus:ring-primary-500'
                )}
              />
              <p className="text-xs text-slate-400">
                Define o objetivo principal que o AI deve perseguir neste estágio.
              </p>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Prompt do Sistema
              </label>
              <textarea
                placeholder="Instruções específicas para o AI neste estágio..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                className={cn(
                  'w-full bg-slate-50 dark:bg-black/20',
                  'border border-slate-200 dark:border-slate-700',
                  'rounded-lg px-3 py-2 text-sm font-mono',
                  'text-slate-900 dark:text-white',
                  'outline-none focus:ring-2 focus:ring-primary-500',
                  'resize-y min-h-[120px]'
                )}
              />
              <p className="text-xs text-slate-400">
                Instruções detalhadas que guiam o comportamento do AI.
              </p>
            </div>

            {/* Advancement Criteria */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">
                Critérios para Avançar
              </label>
              <textarea
                placeholder="Um critério por linha. Ex:&#10;Lead confirmou interesse&#10;Lead informou orçamento&#10;Lead agendou demonstração"
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                rows={3}
                className={cn(
                  'w-full bg-slate-50 dark:bg-black/20',
                  'border border-slate-200 dark:border-slate-700',
                  'rounded-lg px-3 py-2 text-sm',
                  'text-slate-900 dark:text-white',
                  'outline-none focus:ring-2 focus:ring-primary-500',
                  'resize-y min-h-[80px]'
                )}
              />
              <p className="text-xs text-slate-400">
                Quando estes critérios forem atingidos, o lead pode avançar.
              </p>
            </div>

            {/* Notify Team Toggle */}
            <div className="flex items-center justify-between py-3 border-t border-slate-200 dark:border-slate-700">
              <div className="space-y-0.5">
                <Label htmlFor={`notify-team-${stage.id}`}>Notificar time (Handoff)</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, o agente não responde e notifica o time por Telegram.
                </p>
              </div>
              <Switch
                id={`notify-team-${stage.id}`}
                checked={notifyTeam}
                onCheckedChange={setNotifyTeam}
              />
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const template = getTemplateForStage(stage.name);
                  setPrompt(config?.system_prompt || template.prompt);
                  setGoal(config?.stage_goal || template.goal);
                  setCriteria(config?.advancement_criteria?.join('\n') || template.advancementCriteria.join('\n'));
                  setNotifyTeam(config?.notify_team ?? false);
                }}
                disabled={!hasChanges}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


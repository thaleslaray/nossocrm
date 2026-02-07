'use client';

/**
 * @fileoverview Stage AI Configuration Component
 *
 * Permite configurar o AI Agent para cada estágio do funil.
 * Admin pode definir prompts, objetivos e critérios de avanço.
 *
 * @module features/settings/components/StageAIConfig
 */

import { useState } from 'react';
import { Bot, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  useStageAIConfigsQuery,
  useUpsertStageAIConfigMutation,
  useToggleStageAIMutation,
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
}

// =============================================================================
// Component
// =============================================================================

export function StageAIConfig({ boardId, stages }: StageAIConfigProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const { data: configs, isLoading } = useStageAIConfigsQuery(boardId);
  const upsertMutation = useUpsertStageAIConfigMutation();
  const toggleMutation = useToggleStageAIMutation();

  // Map configs by stage ID for easy lookup
  const configMap = new Map(configs?.map((c) => [c.stage_id, c]) || []);

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
  }) => {
    const config = configMap.get(stageId);
    upsertMutation.mutate({
      board_id: boardId,
      stage_id: stageId,
      enabled: config?.enabled ?? false,
      ...data,
    });
  };

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
      <div className="flex items-center gap-2 mb-4">
        <Bot className="h-5 w-5 text-primary-500" />
        <h3 className="font-semibold text-slate-900 dark:text-white">AI Agent por Estágio</h3>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Configure prompts específicos para cada estágio do funil. O AI responderá
        automaticamente seguindo as instruções de cada fase.
      </p>

      <div className="space-y-2">
        {stages
          .sort((a, b) => a.order - b.order)
          .map((stage) => {
            const config = configMap.get(stage.id);
            const isExpanded = expandedStage === stage.id;

            return (
              <StageConfigRow
                key={stage.id}
                stage={stage}
                config={config}
                isExpanded={isExpanded}
                onToggle={() => handleToggle(stage.id)}
                onExpand={() => setExpandedStage(isExpanded ? null : stage.id)}
                onSave={(data) => handleSaveConfig(stage.id, data)}
                isSaving={upsertMutation.isPending}
              />
            );
          })}
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
  };
  isExpanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onSave: (data: { system_prompt: string; stage_goal?: string; advancement_criteria?: string[] }) => void;
  isSaving: boolean;
}

function StageConfigRow({
  stage,
  config,
  isExpanded,
  onToggle,
  onExpand,
  onSave,
  isSaving,
}: StageConfigRowProps) {
  const [prompt, setPrompt] = useState(config?.system_prompt || '');
  const [goal, setGoal] = useState(config?.stage_goal || '');
  const [criteria, setCriteria] = useState(config?.advancement_criteria?.join('\n') || '');

  const hasChanges =
    prompt !== (config?.system_prompt || '') ||
    goal !== (config?.stage_goal || '') ||
    criteria !== (config?.advancement_criteria?.join('\n') || '');

  // Reset form when expanding - uses smart templates
  const handleExpand = () => {
    if (!isExpanded) {
      const template = getTemplateForStage(stage.name);
      setPrompt(config?.system_prompt || template.prompt);
      setGoal(config?.stage_goal || template.goal);
      setCriteria(config?.advancement_criteria?.join('\n') || template.advancementCriteria.join('\n'));
    }
    onExpand();
  };

  const handleSave = () => {
    onSave({
      system_prompt: prompt,
      stage_goal: goal || undefined,
      advancement_criteria: criteria.split('\n').filter(Boolean),
    });
  };

  return (
    <div
      className={cn(
        'border rounded-lg transition-colors',
        isExpanded ? 'border-primary-500/50 bg-primary-500/5' : 'border-slate-200 dark:border-slate-700',
        config?.enabled && 'border-l-4 border-l-green-500'
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
              {config?.enabled && (
                <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Ativo
                </Badge>
              )}
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
            onClick={onToggle}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              config?.enabled ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                config?.enabled ? 'translate-x-5' : 'translate-x-0'
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


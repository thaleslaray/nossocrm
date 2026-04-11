'use client';

/**
 * @fileoverview Template Selection Mode Component
 *
 * Permite selecionar uma metodologia de vendas pré-definida:
 * - BANT
 * - SPIN Selling
 * - MEDDIC
 * - GPCT
 * - Custom (templates da organização)
 *
 * @module features/settings/components/ai/modes/TemplateSelectionMode
 */

import { useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  useAITemplatesQuery,
  useUpdateAIConfigMutation,
  type OrgAIConfig,
  type AITemplate,
} from '@/lib/query/hooks/useAIConfigQuery';

// =============================================================================
// Types
// =============================================================================

interface TemplateSelectionModeProps {
  config: OrgAIConfig | null | undefined;
}

// =============================================================================
// Constants
// =============================================================================

const TEMPLATE_ICONS: Record<string, string> = {
  simple: '🎯',
  bant: '💰',
  spin: '🔄',
  meddic: '📊',
  gpct: '🎪',
};

const TEMPLATE_COLORS: Record<string, string> = {
  simple: 'border-l-blue-500',
  bant: 'border-l-amber-500',
  spin: 'border-l-purple-500',
  meddic: 'border-l-green-500',
  gpct: 'border-l-pink-500',
};

// =============================================================================
// Component
// =============================================================================

export function TemplateSelectionMode({ config }: TemplateSelectionModeProps) {
  const { data, isLoading, error } = useAITemplatesQuery();
  const updateConfig = useUpdateAIConfigMutation();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    config?.ai_template_id || null
  );

  const handleSelectTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId);

    try {
      await updateConfig.mutateAsync({
        ai_config_mode: 'template',
        ai_template_id: templateId,
      });
    } catch (e) {
      console.error('[TemplateSelection] Failed to update:', e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Erro ao carregar templates: {error.message}</AlertDescription>
      </Alert>
    );
  }

  const { systemTemplates = [], customTemplates = [] } = data || {};

  return (
    <div className="space-y-6">
      {/* Description */}
      <div>
        <h4 className="font-medium text-slate-900 dark:text-white mb-1">Escolha uma Metodologia</h4>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Selecione a metodologia de vendas que o AI Agent deve seguir. Cada template define
          estágios, critérios e prompts específicos.
        </p>
      </div>

      {/* System Templates */}
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          Templates do Sistema
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {systemTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedTemplateId === template.id}
              onSelect={() => handleSelectTemplate(template.id)}
              isLoading={updateConfig.isPending && selectedTemplateId === template.id}
            />
          ))}
        </div>
      </div>

      {/* Custom Templates */}
      {customTemplates.length > 0 && (
        <div className="space-y-3">
          <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            Seus Templates
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={selectedTemplateId === template.id}
                onSelect={() => handleSelectTemplate(template.id)}
                isLoading={updateConfig.isPending && selectedTemplateId === template.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Selected Template Details */}
      {selectedTemplateId && (
        <SelectedTemplateDetails
          templates={[...systemTemplates, ...customTemplates]}
          selectedId={selectedTemplateId}
        />
      )}
    </div>
  );
}

// =============================================================================
// Template Card
// =============================================================================

interface TemplateCardProps {
  template: AITemplate;
  isSelected: boolean;
  onSelect: () => void;
  isLoading: boolean;
}

function TemplateCard({ template, isSelected, onSelect, isLoading }: TemplateCardProps) {
  const icon = TEMPLATE_ICONS[template.name] || '📋';
  const colorClass = TEMPLATE_COLORS[template.name] || 'border-l-slate-500';

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isLoading}
      className={cn(
        'relative text-left p-4 rounded-lg border-l-4 border transition-all',
        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
        colorClass,
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-500/30'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
      )}
    >
      {/* Selected Indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-primary-500 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-primary-500" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h5 className="font-semibold text-slate-900 dark:text-white">{template.display_name}</h5>
            {template.is_system && (
              <Badge variant="outline" className="text-[10px]">
                Sistema
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
            {template.description}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-slate-400">{template.stages?.length || 0} estágios</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// Selected Template Details
// =============================================================================

interface SelectedTemplateDetailsProps {
  templates: AITemplate[];
  selectedId: string;
}

function SelectedTemplateDetails({ templates, selectedId }: SelectedTemplateDetailsProps) {
  const template = templates.find((t) => t.id === selectedId);
  if (!template) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h5 className="font-medium text-slate-900 dark:text-white">Estágios do Template</h5>
        <Badge variant="secondary">{template.display_name}</Badge>
      </div>

      <div className="space-y-3">
        {template.stages?.map((stage, index) => (
          <div
            key={stage.name}
            className="flex items-start gap-3 p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-800/30 text-primary-600 dark:text-primary-400 text-sm font-bold">
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <h6 className="font-medium text-slate-900 dark:text-white">{stage.name}</h6>
              {stage.goal && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stage.goal}</p>
              )}
              {stage.criteria.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {stage.criteria.slice(0, 3).map((criterion) => (
                    <Badge key={criterion} variant="outline" className="text-[10px]">
                      {criterion}
                    </Badge>
                  ))}
                  {stage.criteria.length > 3 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{stage.criteria.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Apply to Board Button - Future */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Este template será aplicado automaticamente aos novos deals criados via Messaging.
        </p>
      </div>
    </div>
  );
}

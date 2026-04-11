'use client';

/**
 * @fileoverview AI Onboarding Component
 *
 * Wizard de onboarding para primeira configuração do AI Agent.
 * Guia o usuário através das opções de configuração de forma amigável.
 *
 * @module features/settings/components/ai/AIOnboarding
 */

import { useState } from 'react';
import {
  Bot,
  Zap,
  LayoutTemplate,
  Brain,
  Settings2,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useUpdateAIConfigMutation,
  useProvisionStagesMutation,
} from '@/lib/query/hooks/useAIConfigQuery';
import type { AIConfigMode } from './AIConfigModeSelector';

// =============================================================================
// Types
// =============================================================================

interface AIOnboardingProps {
  onComplete: (mode: AIConfigMode) => void;
}

interface ModeOption {
  id: AIConfigMode;
  icon: React.ReactNode;
  title: string;
  description: string;
  features: string[];
  recommended?: boolean;
  forExperts?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'zero_config',
    icon: <Zap className="h-6 w-6" />,
    title: 'Começar Automático',
    description: 'Use metodologia BANT padrão. Funciona imediatamente sem configuração.',
    features: [
      'Qualificação BANT automática',
      'Avanço de estágio inteligente',
      'Respostas contextualizadas',
      'Handoff para humano quando necessário',
    ],
    recommended: true,
  },
  {
    id: 'template',
    icon: <LayoutTemplate className="h-6 w-6" />,
    title: 'Escolher Metodologia',
    description: 'Selecione entre BANT, SPIN, MEDDIC, GPCT ou crie a sua.',
    features: [
      '5 metodologias pré-definidas',
      'Critérios específicos por metodologia',
      'Personalize estágios e prompts',
      'Templates da comunidade',
    ],
  },
  {
    id: 'auto_learn',
    icon: <Brain className="h-6 w-6" />,
    title: 'Ensinar com Exemplos',
    description: 'A IA aprende seu estilo analisando conversas de sucesso.',
    features: [
      'Aprende com 2-10 conversas',
      'Extrai seu estilo de vendas',
      'Critérios personalizados automáticos',
      'Melhora com o tempo',
    ],
  },
  {
    id: 'advanced',
    icon: <Settings2 className="h-6 w-6" />,
    title: 'Configurar Manualmente',
    description: 'Controle total sobre prompts e critérios de cada estágio.',
    features: [
      'Prompt customizado por estágio',
      'Critérios de avanço manuais',
      'Controle granular',
      'Para usuários avançados',
    ],
    forExperts: true,
  },
];

// =============================================================================
// Component
// =============================================================================

export function AIOnboarding({ onComplete }: AIOnboardingProps) {
  const [selectedMode, setSelectedMode] = useState<AIConfigMode | null>(null);
  const updateConfig = useUpdateAIConfigMutation();
  const provisionStages = useProvisionStagesMutation();

  const handleContinue = async () => {
    if (!selectedMode) return;

    try {
      await updateConfig.mutateAsync({
        ai_config_mode: selectedMode,
      });

      // If selecting zero_config, provision stage configs automatically
      if (selectedMode === 'zero_config') {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[AIOnboarding] Provisioning stage configs...');
        }
        await provisionStages.mutateAsync();
      }

      onComplete(selectedMode);
    } catch (error) {
      console.error('[AIOnboarding] Failed to save mode:', error);
    }
  };

  const isPending = updateConfig.isPending || provisionStages.isPending;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 mb-4">
          <Bot className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Configure seu AI Agent
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
          Escolha como você quer que o agente responda automaticamente aos seus leads.
          Você pode mudar a qualquer momento.
        </p>
      </div>

      {/* Mode Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODE_OPTIONS.map((option) => (
          <ModeOptionCard
            key={option.id}
            option={option}
            isSelected={selectedMode === option.id}
            onSelect={() => setSelectedMode(option.id)}
          />
        ))}
      </div>

      {/* Continue Button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleContinue}
          disabled={!selectedMode || isPending}
          className="min-w-[200px]"
        >
          {isPending ? (
            'Configurando...'
          ) : (
            <>
              Continuar
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>

      {/* Tip */}
      <p className="text-center text-xs text-slate-400">
        <Sparkles className="h-3 w-3 inline mr-1" />
        Dica: Comece com &quot;Automático&quot; e personalize depois conforme suas necessidades.
      </p>
    </div>
  );
}

// =============================================================================
// Mode Option Card
// =============================================================================

interface ModeOptionCardProps {
  option: ModeOption;
  isSelected: boolean;
  onSelect: () => void;
}

function ModeOptionCard({ option, isSelected, onSelect }: ModeOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative text-left p-5 rounded-xl border-2 transition-all',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-lg'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
      )}
    >
      {/* Badges */}
      <div className="absolute top-3 right-3 flex gap-2">
        {option.recommended && (
          <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            Recomendado
          </span>
        )}
        {option.forExperts && (
          <span className="bg-slate-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            Avançado
          </span>
        )}
      </div>

      {/* Selected Indicator */}
      {isSelected && (
        <div className="absolute top-3 left-3">
          <CheckCircle2 className="h-5 w-5 text-primary-500" />
        </div>
      )}

      {/* Content */}
      <div className="flex items-start gap-4 pt-4">
        <div
          className={cn(
            'p-3 rounded-xl flex-shrink-0',
            isSelected
              ? 'bg-primary-100 dark:bg-primary-800/30 text-primary-600 dark:text-primary-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          )}
        >
          {option.icon}
        </div>

        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              'font-semibold text-lg mb-1',
              isSelected ? 'text-primary-700 dark:text-primary-300' : 'text-slate-900 dark:text-white'
            )}
          >
            {option.title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{option.description}</p>

          {/* Features */}
          <ul className="space-y-1">
            {option.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  );
}

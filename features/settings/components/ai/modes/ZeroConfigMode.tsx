'use client';

/**
 * @fileoverview Zero Config Mode Component
 *
 * Modo automático que usa BANT padrão sem configuração.
 * O usuário só precisa ativar o AI Agent e ele funciona.
 *
 * @module features/settings/components/ai/modes/ZeroConfigMode
 */

import { Zap, CheckCircle2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrgAIConfig } from '@/lib/query/hooks/useAIConfigQuery';

// =============================================================================
// Types
// =============================================================================

interface ZeroConfigModeProps {
  config: OrgAIConfig | null | undefined;
}

// =============================================================================
// Constants
// =============================================================================

const BANT_STAGES = [
  {
    name: 'Descoberta',
    goal: 'Entender contexto e problema',
    color: 'bg-blue-500',
  },
  {
    name: 'Qualificação BANT',
    goal: 'Budget, Authority, Need, Timeline',
    color: 'bg-amber-500',
  },
  {
    name: 'Proposta',
    goal: 'Apresentar solução personalizada',
    color: 'bg-purple-500',
  },
  {
    name: 'Negociação',
    goal: 'Fechar o negócio',
    color: 'bg-green-500',
  },
];

// =============================================================================
// Component
// =============================================================================

export function ZeroConfigMode({ config }: ZeroConfigModeProps) {
  const isActive = config?.ai_config_mode === 'zero_config' && config?.ai_enabled;

  return (
    <div className="space-y-6">
      {/* Status */}
      <div
        className={cn(
          'flex items-center gap-3 p-4 rounded-lg border',
          isActive
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-500/30'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        )}
      >
        <div
          className={cn(
            'p-2 rounded-full',
            isActive ? 'bg-green-100 dark:bg-green-800/30' : 'bg-slate-200 dark:bg-slate-700'
          )}
        >
          <Zap
            className={cn('h-5 w-5', isActive ? 'text-green-600 dark:text-green-400' : 'text-slate-500')}
          />
        </div>
        <div className="flex-1">
          <h3
            className={cn(
              'font-semibold',
              isActive ? 'text-green-800 dark:text-green-200' : 'text-slate-700 dark:text-slate-300'
            )}
          >
            {isActive ? 'AI Agent Ativo' : 'AI Agent Inativo'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isActive
              ? 'O agente está respondendo automaticamente usando BANT.'
              : 'Ative o AI nas configurações para começar.'}
          </p>
        </div>
        {isActive && <CheckCircle2 className="h-6 w-6 text-green-500" />}
      </div>

      {/* BANT Explanation */}
      <div className="space-y-4">
        <div>
          <h4 className="font-medium text-slate-900 dark:text-white mb-1">Metodologia BANT</h4>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O agente segue automaticamente a metodologia BANT (Budget, Authority, Need, Timeline)
            para qualificar leads e movê-los pelo funil.
          </p>
        </div>

        {/* Stages Flow */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {BANT_STAGES.map((stage, index) => (
            <div key={stage.name} className="flex items-center">
              <div className="flex flex-col items-center min-w-[120px]">
                <div className={cn('w-3 h-3 rounded-full mb-2', stage.color)} />
                <span className="text-xs font-medium text-slate-900 dark:text-white text-center">
                  {stage.name}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
                  {stage.goal}
                </span>
              </div>
              {index < BANT_STAGES.length - 1 && (
                <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 mx-2 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FeatureCard
          title="Qualificação Automática"
          description="Identifica Budget, Autoridade, Necessidade e Prazo"
        />
        <FeatureCard
          title="Avanço de Estágio"
          description="Move leads automaticamente quando critérios são atingidos"
        />
        <FeatureCard
          title="Handoff para Humano"
          description="Passa para vendedor quando necessário"
        />
        <FeatureCard
          title="Resposta Contextual"
          description="Usa histórico da conversa para respostas relevantes"
        />
      </div>

      {/* Tip */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-lg p-4">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Dica:</strong> Para personalizar o comportamento do agente, mude para o modo
          &quot;Templates&quot; ou &quot;Avançado&quot;.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Feature Card
// =============================================================================

interface FeatureCardProps {
  title: string;
  description: string;
}

function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
      <div>
        <h5 className="text-sm font-medium text-slate-900 dark:text-white">{title}</h5>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

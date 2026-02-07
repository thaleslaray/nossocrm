'use client';

/**
 * @fileoverview AI Agent Configuration Section
 *
 * Container principal para configuração do AI Agent com 4 modos:
 * 1. Zero Config (BANT automático)
 * 2. Template Selection (BANT/SPIN/MEDDIC)
 * 3. Auto-Learn (few-shot learning com conversas de sucesso)
 * 4. Advanced (configuração manual por estágio)
 *
 * Inclui onboarding flow para primeira ativação.
 *
 * @module features/settings/components/ai/AIAgentConfigSection
 */

import { useState } from 'react';
import { Bot, Sparkles, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AIConfigModeSelector, type AIConfigMode } from './AIConfigModeSelector';
import { AIOnboarding } from './AIOnboarding';
import { ZeroConfigMode } from './modes/ZeroConfigMode';
import { TemplateSelectionMode } from './modes/TemplateSelectionMode';
import { AutoLearnMode } from './modes/AutoLearnMode';
import { AdvancedMode } from './modes/AdvancedMode';
import { useAIConfigQuery, useUpdateAIConfigMutation } from '@/lib/query/hooks/useAIConfigQuery';
import { useCRM } from '@/context/CRMContext';

// =============================================================================
// Component
// =============================================================================

export function AIAgentConfigSection() {
  const { aiKeyConfigured } = useCRM();
  const { data: config, isLoading, error } = useAIConfigQuery();
  const updateConfig = useUpdateAIConfigMutation();

  const [selectedMode, setSelectedMode] = useState<AIConfigMode | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  // Mode from DB or local selection
  const currentMode = selectedMode || (config?.ai_config_mode as AIConfigMode) || 'zero_config';

  // Check if this is first-time setup (no mode configured yet)
  const isFirstTimeSetup = config && !config.ai_config_mode && !hasCompletedOnboarding;

  const handleModeChange = async (mode: AIConfigMode) => {
    setSelectedMode(mode);

    // Persist mode change
    try {
      await updateConfig.mutateAsync({ ai_config_mode: mode });
    } catch (e) {
      console.error('[AIAgentConfig] Failed to update mode:', e);
    }
  };

  const handleOnboardingComplete = (mode: AIConfigMode) => {
    setSelectedMode(mode);
    setHasCompletedOnboarding(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
        <div className="h-48 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar configuração de IA: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  // Se API key não está configurada, mostrar aviso
  if (!aiKeyConfigured) {
    return (
      <div className="space-y-4">
        <Header />
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            Configure uma chave de API acima para ativar o AI Agent.
            O agente responderá automaticamente às mensagens dos leads.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Primeira configuração - mostrar onboarding
  if (isFirstTimeSetup) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-6 shadow-sm">
        <AIOnboarding onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />

      {/* Mode Selector */}
      <AIConfigModeSelector currentMode={currentMode} onModeChange={handleModeChange} />

      {/* Mode Content */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4 shadow-sm">
        {currentMode === 'zero_config' && <ZeroConfigMode config={config} />}

        {currentMode === 'template' && <TemplateSelectionMode config={config} />}

        {currentMode === 'auto_learn' && <AutoLearnMode config={config} />}

        {currentMode === 'advanced' && <AdvancedMode config={config} />}
      </div>
    </div>
  );
}

// =============================================================================
// Header
// =============================================================================

function Header() {
  return (
    <div className="flex items-center gap-3">
      <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg text-emerald-600 dark:text-emerald-400">
        <Bot size={24} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
          AI Agent de Vendas
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure como o agente responde automaticamente aos leads.
        </p>
      </div>
    </div>
  );
}

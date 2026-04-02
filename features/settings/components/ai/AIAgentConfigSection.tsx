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
import { Bot, Sparkles, AlertCircle, Timer } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AIConfigModeSelector, type AIConfigMode } from './AIConfigModeSelector';
import { AIOnboarding } from './AIOnboarding';
import { ZeroConfigMode } from './modes/ZeroConfigMode';
import { TemplateSelectionMode } from './modes/TemplateSelectionMode';
import { AutoLearnMode } from './modes/AutoLearnMode';
import { AdvancedMode } from './modes/AdvancedMode';
import {
  useAIConfigQuery,
  useUpdateAIConfigMutation,
  useProvisionStagesMutation,
} from '@/lib/query/hooks/useAIConfigQuery';
import { useOrgSettings } from '@/lib/query/hooks/useOrgSettingsQuery';

// =============================================================================
// Component
// =============================================================================

export function AIAgentConfigSection() {
  const { data: settings } = useOrgSettings();
  const aiKeyConfigured = settings?.aiKeyConfigured ?? false;
  const { data: config, isLoading, error } = useAIConfigQuery();
  const updateConfig = useUpdateAIConfigMutation();
  const provisionStages = useProvisionStagesMutation();

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

      // If switching to zero_config (Automático), provision stage configs automatically
      if (mode === 'zero_config') {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[AIAgentConfig] Provisioning stage configs for zero_config mode...');
        }
        const result = await provisionStages.mutateAsync();
        if (process.env.NODE_ENV !== 'production') {
          console.log('[AIAgentConfig] Provisioning result:', result);
        }
      }
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

      {/* AI Takeover */}
      <AITakeoverSection config={config} onUpdate={updateConfig.mutateAsync} />
    </div>
  );
}

// =============================================================================
// AI Takeover Section
// =============================================================================

function AITakeoverSection({
  config,
  onUpdate,
}: {
  config: ReturnType<typeof useAIConfigQuery>['data'];
  onUpdate: (params: { ai_takeover_enabled?: boolean; ai_takeover_minutes?: number }) => Promise<unknown>;
}) {
  const takeoverEnabled = config?.ai_takeover_enabled ?? false;
  const takeoverMinutes = config?.ai_takeover_minutes ?? 15;

  const handleToggle = async () => {
    try {
      await onUpdate({ ai_takeover_enabled: !takeoverEnabled });
    } catch (e) {
      console.error('[AITakeover] Toggle failed:', e);
    }
  };

  const handleMinutesChange = async (minutes: number) => {
    const clamped = Math.max(5, Math.min(120, minutes));
    try {
      await onUpdate({ ai_takeover_minutes: clamped });
    } catch (e) {
      console.error('[AITakeover] Minutes update failed:', e);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-100 dark:bg-amber-900/20 rounded-lg text-amber-600 dark:text-amber-400">
            <Timer size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              AI Takeover
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              AI assume quando o operador ficar inativo
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={takeoverEnabled}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            takeoverEnabled
              ? 'bg-amber-500'
              : 'bg-slate-200 dark:bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
              takeoverEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {takeoverEnabled && (
        <div className="mt-4 pl-10">
          <label className="flex items-center gap-3">
            <span className="text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
              Tempo de inatividade:
            </span>
            <select
              value={takeoverMinutes}
              onChange={(e) => handleMinutesChange(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              <option value={5}>5 minutos</option>
              <option value={10}>10 minutos</option>
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
              <option value={120}>2 horas</option>
            </select>
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Se o operador atribuído não responder dentro deste tempo, o AI assume a conversa automaticamente.
            Quando o operador voltar a responder, o AI cede o controle.
          </p>
        </div>
      )}
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

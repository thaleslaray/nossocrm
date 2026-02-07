'use client';

/**
 * @fileoverview AI Configuration Mode Selector
 *
 * Cards para selecionar entre os 4 modos de configuração do AI Agent:
 * - Zero Config: BANT automático
 * - Template: Escolher metodologia (BANT, SPIN, MEDDIC)
 * - Auto-Learn: Few-shot learning com conversas de sucesso
 * - Advanced: Configuração manual por estágio
 *
 * @module features/settings/components/ai/AIConfigModeSelector
 */

import { Zap, LayoutTemplate, Brain, Settings2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

export type AIConfigMode = 'zero_config' | 'template' | 'auto_learn' | 'advanced';

interface AIConfigModeSelectorProps {
  currentMode: AIConfigMode;
  onModeChange: (mode: AIConfigMode) => void;
}

interface ModeConfig {
  id: AIConfigMode;
  icon: React.ReactNode;
  title: string;
  description: string;
  recommended?: boolean;
  comingSoon?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const MODES: ModeConfig[] = [
  {
    id: 'zero_config',
    icon: <Zap className="h-5 w-5" />,
    title: 'Automático',
    description: 'BANT padrão, funciona imediatamente',
    recommended: true,
  },
  {
    id: 'template',
    icon: <LayoutTemplate className="h-5 w-5" />,
    title: 'Templates',
    description: 'BANT, SPIN, MEDDIC ou personalizado',
  },
  {
    id: 'auto_learn',
    icon: <Brain className="h-5 w-5" />,
    title: 'Aprender',
    description: 'IA aprende com suas conversas',
  },
  {
    id: 'advanced',
    icon: <Settings2 className="h-5 w-5" />,
    title: 'Avançado',
    description: 'Controle total de prompts',
  },
];

// =============================================================================
// Component
// =============================================================================

export function AIConfigModeSelector({ currentMode, onModeChange }: AIConfigModeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {MODES.map((mode) => (
        <ModeCard
          key={mode.id}
          mode={mode}
          isActive={currentMode === mode.id}
          onClick={() => !mode.comingSoon && onModeChange(mode.id)}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Mode Card
// =============================================================================

interface ModeCardProps {
  mode: ModeConfig;
  isActive: boolean;
  onClick: () => void;
}

function ModeCard({ mode, isActive, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={mode.comingSoon}
      className={cn(
        'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
        isActive
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
        mode.comingSoon && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* Recommended Badge */}
      {mode.recommended && (
        <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          Recomendado
        </span>
      )}

      {/* Coming Soon Badge */}
      {mode.comingSoon && (
        <span className="absolute -top-2 -right-2 bg-slate-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          Em breve
        </span>
      )}

      {/* Active Indicator */}
      {isActive && (
        <div className="absolute top-2 left-2">
          <CheckCircle className="h-4 w-4 text-primary-500" />
        </div>
      )}

      {/* Icon */}
      <div
        className={cn(
          'p-2 rounded-lg',
          isActive
            ? 'bg-primary-100 dark:bg-primary-800/30 text-primary-600 dark:text-primary-400'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
        )}
      >
        {mode.icon}
      </div>

      {/* Title */}
      <h3
        className={cn(
          'font-semibold text-sm',
          isActive ? 'text-primary-700 dark:text-primary-300' : 'text-slate-900 dark:text-white'
        )}
      >
        {mode.title}
      </h3>

      {/* Description */}
      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{mode.description}</p>
    </button>
  );
}

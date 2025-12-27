/**
 * DebugFillButton - Botão para preencher formulário com dados fake
 * 
 * Só aparece quando DEBUG_MODE está ativado
 */

import React from 'react';
import { Sparkles } from 'lucide-react';
import { debugButtonStyles } from '@/lib/debug';
import { useDebugMode } from '@/lib/debug/useDebugMode';

interface DebugFillButtonProps {
  onClick: () => void;
  label?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  disabled?: boolean;
}

/**
 * Componente React `DebugFillButton`.
 *
 * @param {DebugFillButtonProps} {
  onClick,
  label = 'Fake',
  variant = 'primary',
  className = '',
} - Parâmetro `{
  onClick,
  label = 'Fake',
  variant = 'primary',
  className = '',
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const DebugFillButton: React.FC<DebugFillButtonProps> = ({
  onClick,
  label = 'Fake',
  variant = 'primary',
  className = '',
  disabled = false,
}) => {
  const debugEnabled = useDebugMode();
  if (!debugEnabled) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${debugButtonStyles.base} ${debugButtonStyles[variant]} ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
      title="Preencher com dados fake (Debug Mode)"
    >
      <Sparkles className="w-3 h-3" />
      {label}
    </button>
  );
};

/**
 * DebugBadge - Badge indicando modo debug ativo
 */
export const DebugBadge: React.FC = () => {
  const debugEnabled = useDebugMode();
  if (!debugEnabled) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
      <Sparkles className="w-3 h-3" />
      Debug Mode
    </span>
  );
};

/**
 * DebugPanel - Painel flutuante com controles de debug
 */
export const DebugPanel: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const debugEnabled = useDebugMode();
  if (!debugEnabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 p-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg shadow-lg">
      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-purple-700 dark:text-purple-300">
        <Sparkles className="w-4 h-4" />
        Debug Mode
      </div>
      {children}
    </div>
  );
};

export default DebugFillButton;

/**
 * @fileoverview Briefing Drawer Component
 *
 * Drawer/sheet that displays the AI-generated meeting briefing.
 * Can be opened from the DealDetailModal header.
 *
 * @module features/deals/components/BriefingDrawer
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, FileText, Loader2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';
import { useBriefingQuery, useGenerateBriefing } from '@/lib/query/hooks/useBriefingQuery';
import { BriefingCard } from './BriefingCard';

interface BriefingDrawerProps {
  dealId: string;
  dealTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Loading state skeleton.
 */
function BriefingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="space-y-2">
          <div className="w-40 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="w-24 h-3 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>

      {/* Summary skeleton */}
      <div className="space-y-2">
        <div className="w-full h-4 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="w-3/4 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="w-1/2 h-4 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>

      {/* BANT grid skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl"
          />
        ))}
      </div>

      {/* Points skeleton */}
      <div className="space-y-2">
        <div className="w-32 h-3 bg-slate-200 dark:bg-slate-700 rounded" />
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-16 bg-slate-200 dark:bg-slate-700 rounded-lg"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Error state component.
 */
function BriefingError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-3 bg-red-100 dark:bg-red-500/20 rounded-full mb-4">
        <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
      </div>
      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
        Não foi possível gerar o briefing
      </h4>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-4">
        {error}
      </p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Tentar novamente
      </button>
    </div>
  );
}

/**
 * Empty state when no messages exist.
 */
function BriefingEmpty({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-3 bg-primary-100 dark:bg-primary-500/20 rounded-full mb-4">
        <Sparkles className="w-6 h-6 text-primary-600 dark:text-primary-400" />
      </div>
      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
        Preparar para a conversa
      </h4>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-4">
        Gere um briefing com insights de IA para se preparar antes da próxima
        interação com este lead.
      </p>
      <button
        onClick={onGenerate}
        className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <FileText className="w-4 h-4" />
        Gerar Briefing
      </button>
    </div>
  );
}

export function BriefingDrawer({
  dealId,
  dealTitle,
  isOpen,
  onClose,
}: BriefingDrawerProps) {
  useFocusReturn({ enabled: isOpen });

  // Query for cached briefing
  const {
    data: briefing,
    isLoading,
    error,
    refetch,
  } = useBriefingQuery(isOpen ? dealId : null);

  // Mutation for generating/refreshing
  const { mutate: generate, isPending: isGenerating } = useGenerateBriefing();

  const handleGenerate = () => {
    generate(dealId);
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <FocusTrap active={isOpen} onEscape={onClose} returnFocus>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[10000] bg-slate-950/50 backdrop-blur-sm md:left-[var(--app-sidebar-width,0px)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          >
            {/* Drawer Panel */}
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Briefing: ${dealTitle}`}
              className={cn(
                'absolute right-0 top-0 bottom-0',
                'w-full max-w-lg',
                'bg-white dark:bg-dark-card',
                'border-l border-slate-200 dark:border-white/10',
                'shadow-2xl flex flex-col overflow-hidden'
              )}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-100 dark:bg-primary-500/20 rounded-lg">
                    <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">
                      Preparar Conversa
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                      {dealTitle}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {isLoading || isGenerating ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin mb-4" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Analisando histórico e gerando briefing...
                    </p>
                  </div>
                ) : error ? (
                  <BriefingError
                    error={error instanceof Error ? error.message : 'Erro desconhecido'}
                    onRetry={handleGenerate}
                  />
                ) : briefing ? (
                  <BriefingCard
                    briefing={briefing}
                    onRefresh={handleRefresh}
                    isRefreshing={isLoading}
                  />
                ) : (
                  <BriefingEmpty onGenerate={handleGenerate} />
                )}
              </div>
            </motion.div>
          </motion.div>
        </FocusTrap>
      )}
    </AnimatePresence>
  );
}

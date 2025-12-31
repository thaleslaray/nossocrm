/**
 * ActionSheet (bottom sheet) — Apple-like fallback UI for choices/advanced actions.
 *
 * Goals:
 * - Behaves like an iOS action sheet (bottom-aligned, scrollable content)
 * - Accessible (focus trap, Escape to close, click backdrop)
 * - Smooth motion (slide-up + blur)
 */
import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';

type ActionSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Optional: show a close button in header (default true) */
  showCloseButton?: boolean;
  /** Optional extra classes for the panel */
  className?: string;
  /** Optional max height override */
  maxHeightClassName?: string;
};

export function ActionSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  showCloseButton = true,
  className,
  maxHeightClassName,
}: ActionSheetProps) {
  useFocusReturn({ enabled: isOpen });

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleEscape = useCallback(() => onClose(), [onClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <FocusTrap active={isOpen} onEscape={handleEscape} returnFocus={true}>
          <motion.div
            className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] bg-slate-950/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={handleBackdropClick}
            aria-hidden="false"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              className={cn(
                'absolute left-0 right-0 bottom-0 mx-auto w-full',
                'sm:w-[min(720px,92vw)]',
                'rounded-t-2xl sm:rounded-2xl',
                'bg-white dark:bg-dark-card',
                'border border-slate-200 dark:border-white/10',
                'shadow-2xl overflow-hidden',
                // safe area
                'pb-[var(--app-safe-area-bottom,0px)]',
                maxHeightClassName || 'max-h-[calc(90dvh-1rem)]'
              )}
              initial={{ y: 30, opacity: 0, filter: 'blur(10px)' }}
              animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: 20, opacity: 0, filter: 'blur(8px)' }}
              transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.28 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* subtle teal rim light */}
              <div className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 dark:opacity-100 bg-[radial-gradient(900px_circle_at_20%_0%,rgba(34,211,238,0.14),transparent_55%),radial-gradient(700px_circle_at_100%_10%,rgba(45,212,191,0.10),transparent_55%)]" />

              <div className={cn('relative px-4 py-4 sm:px-5 border-b border-slate-200 dark:border-white/10', className)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
                    {description ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</div>
                    ) : null}
                  </div>
                  {showCloseButton ? (
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus-visible-ring"
                      aria-label="Fechar"
                    >
                      <X size={18} className="text-slate-500" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="relative p-4 sm:p-5 overflow-auto">{children}</div>
            </motion.div>
          </motion.div>
        </FocusTrap>
      ) : null}
    </AnimatePresence>
  );
}


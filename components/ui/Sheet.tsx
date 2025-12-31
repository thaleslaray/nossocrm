/**
 * Sheet (primitive)
 *
 * A lightweight dialog surface meant for mobile-first flows.
 * - Uses the same FocusTrap strategy as Modal/ActionSheet.
 * - Renders as a bottom-aligned panel by default.
 */
import React, { useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional aria label when no visible title exists */
  ariaLabel?: string;
  /** Extra classes for the panel */
  className?: string;
}

export function Sheet({ isOpen, onClose, children, ariaLabel, className }: SheetProps) {
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
            className={cn(
              'fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm',
              // keep consistent with desktop sidebar behavior
              'md:left-[var(--app-sidebar-width,0px)]'
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={handleBackdropClick}
            aria-hidden="false"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              className={cn(
                'absolute left-0 right-0 bottom-0 mx-auto w-full',
                'rounded-t-2xl bg-white dark:bg-dark-card',
                'border border-slate-200 dark:border-white/10',
                'shadow-2xl overflow-hidden',
                // safe area
                'pb-[var(--app-safe-area-bottom,0px)]',
                className
              )}
              initial={{ y: 30, opacity: 0, filter: 'blur(10px)' }}
              animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: 20, opacity: 0, filter: 'blur(8px)' }}
              transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.22 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {children}
            </motion.div>
          </motion.div>
        </FocusTrap>
      ) : null}
    </AnimatePresence>
  );
}

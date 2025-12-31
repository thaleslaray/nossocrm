/**
 * Reusable Modal component with consistent styling
 * 
 * Accessibility Features:
 * - role="dialog" and aria-modal="true" for screen readers
 * - aria-labelledby pointing to modal title
 * - Focus trap to keep keyboard focus within modal
 * - Focus returns to trigger element on close
 * - Escape key closes modal
 */
import React, { useId, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';
import {
  MODAL_BODY_CLASS,
  MODAL_CLOSE_BUTTON_CLASS,
  MODAL_HEADER_CLASS,
  MODAL_OVERLAY_CLASS,
  MODAL_PANEL_BASE_CLASS,
  MODAL_TITLE_CLASS,
  MODAL_VIEWPORT_CAP_CLASS,
} from './modalStyles';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional extra classes for the dialog container */
  className?: string;
  /** Optional extra classes for the body wrapper (useful for scroll/height) */
  bodyClassName?: string;
  /** Optional ID for aria-labelledby (auto-generated if not provided) */
  labelledById?: string;
  /** Optional ID for aria-describedby */
  describedById?: string;
  /** Initial element to focus (CSS selector or false to disable) */
  initialFocus?: string | false;
  /**
   * When embedding another modal inside (nested modal), you may want to disable
   * the focus trap temporarily to avoid trapping focus behind the nested dialog.
   */
  focusTrapEnabled?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

/**
 * Componente React `Modal`.
 *
 * @param {ModalProps} { 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  className,
  bodyClassName,
  labelledById,
  describedById,
  initialFocus,
  focusTrapEnabled = true,
} - Parâmetro `{ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  className,
  bodyClassName,
  labelledById,
  describedById,
  initialFocus,
  focusTrapEnabled = true,
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  className,
  bodyClassName,
  labelledById,
  describedById,
  initialFocus,
  focusTrapEnabled = true,
}) => {
  // Generate unique ID for title if not provided
  const generatedId = useId();
  const titleId = labelledById || `modal-title-${generatedId}`;
  
  // Restore focus to trigger element on close
  useFocusReturn({ enabled: isOpen });

  // Handle Escape key
  const handleEscape = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  const content = (
    <div
      className={MODAL_OVERLAY_CLASS}
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedById}
        className={cn(
          MODAL_PANEL_BASE_CLASS,
          MODAL_VIEWPORT_CAP_CLASS,
          'animate-in zoom-in-95 duration-200',
          sizeClasses[size],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={MODAL_HEADER_CLASS}>
          <h2 id={titleId} className={MODAL_TITLE_CLASS}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className={MODAL_CLOSE_BUTTON_CLASS}
          >
            <X size={20} className="text-slate-500" aria-hidden="true" />
          </button>
        </div>
        <div className={cn(MODAL_BODY_CLASS, bodyClassName)}>{children}</div>
      </div>
    </div>
  );

  return focusTrapEnabled ? (
    <FocusTrap
      active={isOpen}
      onEscape={handleEscape}
      initialFocus={initialFocus}
      returnFocus={true}
    >
      {content}
    </FocusTrap>
  ) : (
    content
  );
};

// ============ MODAL FORM WRAPPER ============

interface ModalFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
}

/**
 * Componente React `ModalForm`.
 *
 * @param {ModalFormProps} { children, className, ...props } - Parâmetro `{ children, className, ...props }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ModalForm: React.FC<ModalFormProps> = ({ children, className, ...props }) => (
  <form className={cn('space-y-4', className)} {...props}>
    {children}
  </form>
);

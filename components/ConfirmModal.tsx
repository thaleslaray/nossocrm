/**
 * @fileoverview Modal de Confirmação Acessível
 *
 * @deprecated Use `ConfirmDialog` de `@/components/ui/confirm-dialog` para novos usos.
 * Todos os 7 call sites foram migrados para a versão shadcn AlertDialog.
 * Este arquivo é mantido apenas para retrocompatibilidade até ser removido.
 *
 * Componente de diálogo de confirmação com suporte completo a acessibilidade
 * para ações destrutivas ou que requerem confirmação do usuário.
 * 
 * @module components/ConfirmModal
 * 
 * Recursos de Acessibilidade (WCAG 2.1 AA):
 * - role="alertdialog" para diálogos de confirmação
 * - aria-describedby para conteúdo da mensagem
 * - Focus trap mantém foco dentro do diálogo
 * - Foco retorna ao elemento trigger ao fechar
 * - Tecla Escape fecha o modal
 * - Auto-focus no botão cancelar (opção mais segura)
 * 
 * @example
 * ```tsx
 * function DeleteButton() {
 *   const [isOpen, setIsOpen] = useState(false);
 *   
 *   return (
 *     <>
 *       <button onClick={() => setIsOpen(true)}>Deletar</button>
 *       <ConfirmModal
 *         isOpen={isOpen}
 *         onClose={() => setIsOpen(false)}
 *         onConfirm={handleDelete}
 *         title="Confirmar exclusão"
 *         message="Esta ação não pode ser desfeita."
 *         variant="danger"
 *       />
 *     </>
 *   );
 * }
 * ```
 */

import React, { useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';

/**
 * Props do componente ConfirmModal
 * 
 * @interface ConfirmModalProps
 * @property {boolean} isOpen - Se o modal está visível
 * @property {() => void} onClose - Callback ao fechar/cancelar
 * @property {() => void} onConfirm - Callback ao confirmar
 * @property {string} title - Título do diálogo
 * @property {React.ReactNode} message - Mensagem de confirmação
 * @property {string} [confirmText='Confirmar'] - Texto do botão de confirmar
 * @property {string} [cancelText='Cancelar'] - Texto do botão de cancelar
 * @property {'danger' | 'primary'} [variant='danger'] - Estilo visual
 */
interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'primary';
}

/**
 * Modal de confirmação acessível
 * 
 * Exibe diálogo de confirmação com focus trap e suporte a teclado.
 * Use variant="danger" para ações destrutivas como exclusão.
 * 
 * @param {ConfirmModalProps} props - Props do componente
 * @returns {JSX.Element | null} Modal ou null se fechado
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'danger'
}) => {
    const generatedId = useId();
    const titleId = `confirm-title-${generatedId}`;
    const descId = `confirm-desc-${generatedId}`;
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    
    // Restaura foco ao elemento trigger ao fechar
    useFocusReturn({ enabled: isOpen });

    if (!isOpen) return null;

    return (
        <FocusTrap 
            active={isOpen} 
            onEscape={onClose}
            initialFocus={false}
            returnFocus={true}
        >
            <div 
                className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <div 
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={descId}
                    className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-6 text-center">
                        <div 
                            className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${variant === 'danger'
                                    ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                    : 'bg-primary-100 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400'
                                }`}
                            aria-hidden="true"
                        >
                            <AlertTriangle size={24} />
                        </div>

                        <h3 
                            id={titleId}
                            className="text-lg font-bold text-slate-900 dark:text-white mb-2 font-display"
                        >
                            {title}
                        </h3>

                        <div 
                            id={descId}
                            className="text-sm text-slate-500 dark:text-slate-400 mb-6"
                        >
                            {message}
                        </div>

                        <div className="flex gap-3 justify-center">
                            <button
                                ref={cancelButtonRef}
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus-visible-ring"
                                autoFocus
                            >
                                {cancelText}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-bold text-white shadow-lg transition-all focus-visible-ring ${variant === 'danger'
                                        ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20'
                                        : 'bg-primary-600 hover:bg-primary-500 shadow-primary-600/20'
                                    }`}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </FocusTrap>
    );
};

export default ConfirmModal;

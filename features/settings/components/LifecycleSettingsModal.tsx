import React, { useState, useId } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { useLifecycleStages, useCreateLifecycleStage, useUpdateLifecycleStage, useDeleteLifecycleStage, useReorderLifecycleStages } from '@/lib/query/hooks/useLifecycleStagesQuery';
import { useContacts } from '@/lib/query/hooks/useContactsQuery';
import { FocusTrap, useFocusReturn } from '@/lib/a11y';

interface LifecycleSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const STAGE_COLORS = [
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-orange-500',
    'bg-red-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-slate-500',
];

/**
 * Componente React `LifecycleSettingsModal`.
 *
 * @param {LifecycleSettingsModalProps} { isOpen, onClose } - Parâmetro `{ isOpen, onClose }`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const LifecycleSettingsModal: React.FC<LifecycleSettingsModalProps> = ({ isOpen, onClose }) => {
    const headingId = useId();
    useFocusReturn({ enabled: isOpen });

    const { data: lifecycleStages = [] } = useLifecycleStages();
    const createStage = useCreateLifecycleStage();
    const updateStageMutation = useUpdateLifecycleStage();
    const deleteStageMutation = useDeleteLifecycleStage();
    const reorderStagesMutation = useReorderLifecycleStages();
    const { data: contacts = [] } = useContacts();
    const [newStageName, setNewStageName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // Calcular contagem de contatos por estágio
    const stageCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        contacts.forEach(contact => {
            if (contact.stage) {
                counts[contact.stage] = (counts[contact.stage] || 0) + 1;
            }
        });
        return counts;
    }, [contacts]);

    if (!isOpen) return null;

    const handleAdd = () => {
        if (!newStageName.trim()) return;
        createStage.mutate({
            name: newStageName.trim(),
            color: STAGE_COLORS[lifecycleStages.length % STAGE_COLORS.length],
            isDefault: false
        });
        setNewStageName('');
        setIsAdding(false);
    };

    const handleMove = (index: number, direction: 'up' | 'down') => {
        const newStages = [...lifecycleStages];
        if (direction === 'up' && index > 0) {
            [newStages[index], newStages[index - 1]] = [newStages[index - 1], newStages[index]];
        } else if (direction === 'down' && index < newStages.length - 1) {
            [newStages[index], newStages[index + 1]] = [newStages[index + 1], newStages[index]];
        }
        reorderStagesMutation.mutate(newStages);
    };

    return (
        <FocusTrap active={isOpen} onEscape={onClose}>
            <div
                className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center"
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
            >
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

                <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                        <h3 id={headingId} className="font-bold text-slate-900 dark:text-white">Gerenciar Ciclos de Vida</h3>
                        <button
                            onClick={onClose}
                            aria-label="Fechar modal"
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors focus-visible-ring"
                        >
                            <X size={20} className="text-slate-500" aria-hidden="true" />
                        </button>
                    </div>

                    <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                            Defina os estágios de maturidade dos seus contatos (ex: Lead, Cliente).
                            A ordem aqui define a progressão no funil.
                        </div>

                        {lifecycleStages.map((stage, index) => (
                            <div key={stage.id} className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                {/* Color */}
                                <div className="relative flex-shrink-0 group">
                                    <div className={`w-6 h-6 rounded-full ${stage.color} cursor-pointer ring-2 ring-transparent hover:ring-slate-300 dark:hover:ring-slate-600 transition-all`} />
                                    <select
                                        value={stage.color}
                                        onChange={(e) => updateStageMutation.mutate({ id: stage.id, updates: { color: e.target.value } })}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    >
                                        {STAGE_COLORS.map(c => (
                                            <option key={c} value={c}>{c.replace('bg-', '')}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Name */}
                                <input
                                    type="text"
                                    value={stage.name}
                                    onChange={(e) => updateStageMutation.mutate({ id: stage.id, updates: { name: e.target.value } })}
                                    className="flex-1 bg-transparent text-sm font-medium text-slate-900 dark:text-white outline-none border-b border-transparent focus:border-primary-500 px-1"
                                />

                                {/* Count Badge */}
                                <span
                                    className="text-[10px] font-medium text-slate-500 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700"
                                    title={`${stageCounts[stage.id] || 0} contatos neste estágio`}
                                >
                                    {stageCounts[stage.id] || 0}
                                </span>

                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                    <div className="flex flex-col">
                                        <button
                                            onClick={() => handleMove(index, 'up')}
                                            disabled={index === 0}
                                            className="p-0.5 text-slate-400 hover:text-primary-500 disabled:opacity-30"
                                        >
                                            <ArrowUp size={12} />
                                        </button>
                                        <button
                                            onClick={() => handleMove(index, 'down')}
                                            disabled={index === lifecycleStages.length - 1}
                                            className="p-0.5 text-slate-400 hover:text-primary-500 disabled:opacity-30"
                                        >
                                            <ArrowDown size={12} />
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => deleteStageMutation.mutate(stage.id)}
                                        disabled={stage.isDefault || (stageCounts[stage.id] || 0) > 0}
                                        className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed ml-1"
                                        title={
                                            stage.isDefault
                                                ? "Estágio padrão não pode ser removido"
                                                : (stageCounts[stage.id] || 0) > 0
                                                    ? "Não é possível remover estágio com contatos vinculados"
                                                    : "Remover estágio"
                                        }
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Add New */}
                        {isAdding ? (
                            <div className="flex items-center gap-3 p-2 border border-primary-200 dark:border-primary-800 rounded-lg bg-primary-50 dark:bg-primary-900/10 animate-in fade-in slide-in-from-top-2">
                                <div className={`w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-600`} />
                                <input
                                    autoFocus
                                    type="text"
                                    value={newStageName}
                                    onChange={(e) => setNewStageName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                    placeholder="Nome do novo estágio..."
                                    className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                                />
                                <button
                                    onClick={handleAdd}
                                    disabled={!newStageName.trim()}
                                    className="p-1.5 bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50"
                                >
                                    <Check size={14} />
                                </button>
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="p-1.5 text-slate-500 hover:text-slate-700"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsAdding(true)}
                                className="w-full py-2 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-primary-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 transition-all"
                            >
                                <Plus size={16} />
                                Adicionar Estágio
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </FocusTrap>
    );
};

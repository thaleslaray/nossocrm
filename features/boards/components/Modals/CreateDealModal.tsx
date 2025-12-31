import React, { useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { useAuth } from '@/context/AuthContext';
import { Deal, Board } from '@/types';
import { X } from 'lucide-react';
import { DebugFillButton } from '@/components/debug/DebugFillButton';
import { fakeDeal, fakeContact, fakeCompany } from '@/lib/debug';

interface CreateDealModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** O board ativo - passado pelo controller do Kanban */
    activeBoard?: Board | null;
    /** O ID do board ativo - passado pelo controller do Kanban */
    activeBoardId?: string;
}

/**
 * Componente React `CreateDealModal`.
 *
 * @param {CreateDealModalProps} {
    isOpen,
    onClose,
    activeBoard: propActiveBoard,
    activeBoardId: propActiveBoardId
} - Parâmetro `{
    isOpen,
    onClose,
    activeBoard: propActiveBoard,
    activeBoardId: propActiveBoardId
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const CreateDealModal: React.FC<CreateDealModalProps> = ({
    isOpen,
    onClose,
    activeBoard: propActiveBoard,
    activeBoardId: propActiveBoardId
}) => {
    const { addDeal, activeBoard: contextActiveBoard, activeBoardId: contextActiveBoardId } = useCRM();
    const { profile, user } = useAuth();

    // Prioriza props sobre contexto (permite que o Kanban passe o board correto)
    const activeBoard = propActiveBoard || contextActiveBoard;
    const activeBoardId = propActiveBoardId || contextActiveBoardId;

    const [newDealData, setNewDealData] = useState({
        title: '',
        companyName: '',
        value: '',
        contactName: '',
        email: '',
        phone: ''
    });

    const fillWithFakeData = () => {
        const deal = fakeDeal();
        const contact = fakeContact();
        const company = fakeCompany();
        setNewDealData({
            title: deal.title,
            value: String(deal.value),
            companyName: company.name,
            contactName: contact.name,
            email: contact.email,
            phone: contact.phone,
        });
    };

    if (!isOpen) return null;

    // Guard: não permite criar deal sem board ativo
    if (!activeBoard || !activeBoard.stages?.length) {
        return (
            <div className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-5">
                    <p className="text-slate-700 dark:text-slate-300 text-center">
                        Nenhum board selecionado ou board sem estágios.
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full mt-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-bold py-2.5 rounded-lg transition-all"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        );
    }

    const handleCreateDeal = (e: React.FormEvent) => {
        e.preventDefault();

        // Usa o primeiro estágio do board ativo
        const firstStage = activeBoard.stages[0];

        const ownerName = profile?.nickname ||
            profile?.first_name ||
            (profile?.email || user?.email || '').split('@')[0] ||
            'Eu';

        const deal: Deal = {
            id: crypto.randomUUID(),
            title: newDealData.title,
            companyId: '', // Será criado pelo CRMContext
            contactId: '', // Será criado pelo CRMContext
            boardId: activeBoardId || activeBoard.id,
            ownerId: user?.id || '',
            value: Number(newDealData.value) || 0,
            items: [],
            status: firstStage.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            probability: 10,
            priority: 'medium',
            tags: ['Novo'],
            owner: {
                name: ownerName,
                avatar: profile?.avatar_url || ''
            },
            customFields: {},
            isWon: false,
            isLost: false,
        };

        addDeal(deal, {
            companyName: newDealData.companyName,
            contact: {
                name: newDealData.contactName,
                email: newDealData.email,
                phone: newDealData.phone
            }
        });
        onClose();
        setNewDealData({ title: '', companyName: '', value: '', contactName: '', email: '', phone: '' });
    };

    return (
        <div
            className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
            onClick={(e) => {
                // Close only when clicking the backdrop (outside the panel).
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">Novo Negócio</h2>
                        <DebugFillButton onClick={fillWithFakeData} />
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20} /></button>
                </div>
                <form onSubmit={handleCreateDeal} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome do Negócio</label>
                        <input
                            required
                            type="text"
                            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Ex: Contrato Anual - Acme"
                            value={newDealData.title}
                            onChange={e => setNewDealData({ ...newDealData, title: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valor Estimado ($)</label>
                            <input
                                required
                                type="number"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="0.00"
                                value={newDealData.value}
                                onChange={e => setNewDealData({ ...newDealData, value: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Empresa</label>
                            <input
                                required
                                type="text"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Empresa Ltd"
                                value={newDealData.companyName}
                                onChange={e => setNewDealData({ ...newDealData, companyName: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Contato Principal</h3>
                        <div className="space-y-3">
                            <input
                                type="text"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Nome do Contato"
                                value={newDealData.contactName}
                                onChange={e => setNewDealData({ ...newDealData, contactName: e.target.value })}
                            />
                            <input
                                type="email"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="email@exemplo.com"
                                value={newDealData.email}
                                onChange={e => setNewDealData({ ...newDealData, email: e.target.value })}
                            />
                            <input
                                type="tel"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="Telefone (opcional)"
                                value={newDealData.phone}
                                onChange={e => setNewDealData({ ...newDealData, phone: e.target.value })}
                            />
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-primary-600 hover:bg-primary-500 text-white font-bold py-2.5 rounded-lg mt-2 shadow-lg shadow-primary-600/20 transition-all">
                        Criar Negócio
                    </button>
                </form>
            </div>
        </div>
    );
};

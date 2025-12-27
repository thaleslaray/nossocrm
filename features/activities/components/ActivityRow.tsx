import React from 'react';
import Link from 'next/link';
import { Phone, Users, Mail, CheckSquare, Clock, Trash2, Edit2, CheckCircle2, Circle, Building2 } from 'lucide-react';
import { useCRM } from '@/context/CRMContext';
import { Activity, Deal, Contact, Company } from '@/types';

interface ActivityRowProps {
    activity: Activity;
    deal?: Deal;
    contact?: Contact;
    company?: Company;
    onToggleComplete: (id: string) => void;
    onEdit: (activity: Activity) => void;
    onDelete: (id: string) => void;
    isSelected?: boolean;
    onSelect?: (id: string, selected: boolean) => void;
}

/**
 * Performance: essa linha aparece em listas grandes (activities).
 * `React.memo` ajuda a evitar re-render de todas as linhas quando apenas seleção/1 item muda.
 */
const ActivityRowComponent: React.FC<ActivityRowProps> = ({
    activity,
    deal,
    contact,
    company,
    onToggleComplete,
    onEdit,
    onDelete,
    isSelected = false,
    onSelect
}) => {
    const getActivityIcon = (type: Activity['type']) => {
        switch (type) {
            case 'CALL': return <Phone size={16} className="text-blue-500" />;
            case 'MEETING': return <Users size={16} className="text-purple-500" />;
            case 'EMAIL': return <Mail size={16} className="text-green-500" />;
            case 'TASK': return <CheckSquare size={16} className="text-orange-500" />;
            case 'STATUS_CHANGE': return <CheckCircle2 size={16} className="text-slate-500" />;
            default: return <Circle size={16} className="text-slate-400" />;
        }
    };

    const { activeBoard, boards } = useCRM();

    const translateStatus = (status: string) => {
        // Se não parece ser um UUID, retorna direto (já é um label legível)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(status)) {
            return status;
        }

        // Procura em TODOS os boards, não só no ativo
        for (const board of boards) {
            const stage = board.stages.find(s => s.id === status);
            if (stage) return stage.label;
        }

        // Fallback para mapeamento legado
        const map: Record<string, string> = {
            'NEW': 'Novas Oportunidades',
            'CONTACTED': 'Contatado',
            'PROPOSAL': 'Proposta',
            'NEGOTIATION': 'Negociação',
            'CLOSED_WON': 'Ganho',
            'CLOSED_LOST': 'Perdido',
            'LEAD': 'Lead',
            'MQL': 'Lead Qualificado',
            'PROSPECT': 'Oportunidade',
            'CUSTOMER': 'Cliente'
        };
        
        // Se ainda é UUID e não encontrou, mostra fallback amigável
        return map[status] || 'Estágio não identificado';
    };

    const formatRelativeTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'agora mesmo';
        if (diffInSeconds < 3600) return `há ${Math.floor(diffInSeconds / 60)} min`;
        if (diffInSeconds < 86400) return `há ${Math.floor(diffInSeconds / 3600)} h`;
        if (diffInSeconds < 172800) return 'ontem';
        return date.toLocaleDateString('pt-BR');
    };

    const formatTitle = (title: string) => {
        if (title.includes('Moveu para')) {
            const status = title.replace('Moveu para ', '');
            return (
                <span>
                    Movido para <span className="font-bold text-slate-700 dark:text-slate-200">{translateStatus(status)}</span>
                </span>
            );
        }
        if (title === 'Negócio Criado') return 'Negócio criado';
        return title;
    };

    const isSystemActivity = activity.type === 'STATUS_CHANGE';
    const isOverdue = new Date(activity.date) < new Date() && !activity.completed;

    if (isSystemActivity) {
        return (
            <div className="group flex gap-4 px-4 py-2 items-center">
                {/* Timeline Line/Dot */}
                <div className="flex-shrink-0 w-6 flex justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 ring-4 ring-white dark:ring-dark-card" />
                </div>

                <div className="flex-1 flex items-center justify-between min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                            {formatTitle(activity.title)}
                        </span>
                    </div>

                    <span className="text-xs text-slate-400 whitespace-nowrap ml-4">
                        {formatRelativeTime(activity.date)}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className={`group flex items-center gap-4 p-4 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/5 rounded-xl hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-all ${activity.completed ? 'opacity-60' : ''} ${isSelected ? 'border-primary-500 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-500/10' : ''}`}>
            {onSelect && (
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(activity.id, e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                />
            )}

            <button
                onClick={() => onToggleComplete(activity.id)}
                className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${activity.completed
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-slate-300 dark:border-slate-600 hover:border-green-500 text-transparent hover:text-green-500'
                    }`}
            >
                <CheckCircle2 size={14} fill="currentColor" />
            </button>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="p-1.5 bg-slate-100 dark:bg-white/5 rounded-lg">
                        {getActivityIcon(activity.type)}
                    </span>
                    <h3 className={`font-medium text-slate-900 dark:text-white truncate ${activity.completed ? 'line-through text-slate-500' : ''}`}>
                        {formatTitle(activity.title)}
                    </h3>
                    {isOverdue && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 rounded-full">
                            ATRASADO
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                    {deal && (
                        <span className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 font-medium">
                            <Circle size={8} fill="currentColor" />
                            {deal.title}
                        </span>
                    )}
                    {!deal && contact && (
                        <Link
                            href={`/contacts?contactId=${contact.id}`}
                            className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 font-medium hover:underline"
                            title={`Abrir contato: ${contact.name}`}
                        >
                            <Users size={14} />
                            <span className="truncate max-w-[280px]">{contact.name}</span>
                        </Link>
                    )}
                    {!deal && company && (
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                            <Building2 size={14} />
                            <span className="truncate max-w-[280px]">{company.name}</span>
                        </span>
                    )}
                    <span className="flex items-center gap-1.5">
                        <Clock size={14} />
                        {formatRelativeTime(activity.date)}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => onEdit(activity)}
                    className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition-colors"
                    title="Editar"
                >
                    <Edit2 size={16} />
                </button>
                <button
                    onClick={() => onDelete(activity.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Excluir"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
};

export const ActivityRow = React.memo(ActivityRowComponent);

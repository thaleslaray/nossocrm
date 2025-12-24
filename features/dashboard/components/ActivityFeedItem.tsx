import React from 'react';
import {
    Phone,
    Mail,
    Calendar,
    CheckCircle,
    StickyNote,
    ArrowRightLeft,
    AlertCircle
} from 'lucide-react';
import { Activity } from '@/types';

interface ActivityFeedItemProps {
    activity: Activity;
}

// Performance: reuse Intl formatter instead of instantiating options object per render.
const ACTIVITY_FEED_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

export const ActivityFeedItem: React.FC<ActivityFeedItemProps> = ({ activity }) => {
    // Smart Icon Logic: Corrigir visualmente inconsistências de dados legados/seed
    const titleLower = activity.title.toLowerCase();
    const visualType =
        titleLower.includes('call') || titleLower.includes('ligação')
            ? 'CALL'
            : titleLower.includes('email')
              ? 'EMAIL'
              : titleLower.includes('reunião') || titleLower.includes('meeting') || titleLower.includes('demo')
                ? 'MEETING'
                : activity.type;

    const icon = (() => {
        switch (visualType) {
            case 'CALL':
                return (
                    <div className="bg-blue-500/10 text-blue-500 p-2 rounded-full ring-1 ring-blue-500/20">
                        <Phone size={16} />
                    </div>
                );
            case 'EMAIL':
                return (
                    <div className="bg-purple-500/10 text-purple-500 p-2 rounded-full ring-1 ring-purple-500/20">
                        <Mail size={16} />
                    </div>
                );
            case 'MEETING':
                return (
                    <div className="bg-orange-500/10 text-orange-500 p-2 rounded-full ring-1 ring-orange-500/20">
                        <Calendar size={16} />
                    </div>
                );
            case 'TASK':
                return (
                    <div className="bg-emerald-500/10 text-emerald-500 p-2 rounded-full ring-1 ring-emerald-500/20">
                        <CheckCircle size={16} />
                    </div>
                );
            case 'NOTE':
                return (
                    <div className="bg-yellow-500/10 text-yellow-500 p-2 rounded-full ring-1 ring-yellow-500/20">
                        <StickyNote size={16} />
                    </div>
                );
            case 'STATUS_CHANGE':
                return (
                    <div className="bg-slate-500/10 text-slate-500 p-2 rounded-full ring-1 ring-slate-500/20">
                        <ArrowRightLeft size={16} />
                    </div>
                );
            default:
                return (
                    <div className="bg-slate-500/10 text-slate-500 p-2 rounded-full ring-1 ring-slate-500/20">
                        <AlertCircle size={16} />
                    </div>
                );
        }
    })();

    // Formatar data relativa ou absoluta melhorada
    const formattedDate = ACTIVITY_FEED_DATE_FORMATTER.format(new Date(activity.date));

    return (
        <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-lg transition-colors group">
            <div className="mt-0.5 shrink-0">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                    {activity.title}
                </p>
                {activity.dealTitle && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        em <span className="font-medium text-slate-600 dark:text-slate-300">{activity.dealTitle}</span>
                    </p>
                )}
                {activity.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1 italic">
                        "{activity.description}"
                    </p>
                )}
            </div>
            <span className="text-[10px] text-slate-400 whitespace-nowrap bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                {formattedDate}
            </span>
        </div>
    );
};

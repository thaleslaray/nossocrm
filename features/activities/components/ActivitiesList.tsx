import React, { useMemo } from 'react';
import { Activity, Deal, Contact, Company } from '@/types';
import { ActivityRow } from './ActivityRow';

interface ActivitiesListProps {
    activities: Activity[];
    deals: Deal[];
    contacts: Contact[];
    companies: Company[];
    onToggleComplete: (id: string) => void;
    onEdit: (activity: Activity) => void;
    onDelete: (id: string) => void;
    selectedActivities?: Set<string>;
    onSelectActivity?: (id: string, selected: boolean) => void;
}

/**
 * Componente React `ActivitiesList`.
 *
 * @param {ActivitiesListProps} {
    activities,
    deals,
    onToggleComplete,
    onEdit,
    onDelete,
    selectedActivities = new Set(),
    onSelectActivity
} - Parâmetro `{
    activities,
    deals,
    onToggleComplete,
    onEdit,
    onDelete,
    selectedActivities = new Set(),
    onSelectActivity
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesList: React.FC<ActivitiesListProps> = ({
    activities,
    deals,
    contacts,
    companies,
    onToggleComplete,
    onEdit,
    onDelete,
    selectedActivities = new Set(),
    onSelectActivity
}) => {
    // Performance: Activities pode ser uma lista grande; evitamos `find` por linha (O(N*M)).
    const dealById = useMemo(() => {
        const map = new Map<string, Deal>();
        for (const d of deals) map.set(d.id, d);
        return map;
    }, [deals]);

    const contactById = useMemo(() => {
        const map = new Map<string, Contact>();
        for (const c of contacts) map.set(c.id, c);
        return map;
    }, [contacts]);

    const companyById = useMemo(() => {
        const map = new Map<string, Company>();
        for (const c of companies) map.set(c.id, c);
        return map;
    }, [companies]);

    if (activities.length === 0) {
        return (
            <div className="text-center py-12 bg-white dark:bg-dark-card rounded-xl border border-slate-200 dark:border-white/5 border-dashed">
                <p className="text-slate-500 dark:text-slate-400">Nenhuma atividade encontrada</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {activities.map(activity => (
                <ActivityRow
                    key={activity.id}
                    activity={activity}
                    deal={activity.dealId ? dealById.get(activity.dealId) : undefined}
                    contact={activity.contactId ? contactById.get(activity.contactId) : undefined}
                    company={activity.clientCompanyId ? companyById.get(activity.clientCompanyId) : undefined}
                    onToggleComplete={onToggleComplete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    isSelected={selectedActivities.has(activity.id)}
                    onSelect={onSelectActivity}
                />
            ))}
        </div>
    );
};

import React from 'react';
import { Building2, Mail, Phone, Plus, Calendar, Pencil, Trash2, Globe, MoreHorizontal, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Contact, Company, ContactSortableColumn } from '@/types';
import { StageBadge } from './ContactsStageTabs';

// Performance: reuse Intl formatters (they are relatively expensive to instantiate).
const PT_BR_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR');
const PT_BR_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

/**
 * Formata uma data para exibição relativa (ex: "Hoje", "Ontem", "Há 3 dias", "15/11/2024")
 */
function formatRelativeDate(dateString: string | undefined | null, now: Date): string {
    if (!dateString) return '---';
    
    const date = new Date(dateString);
    
    // Reset hours for accurate day comparison
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffTime = today.getTime() - dateDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `Há ${diffDays} dias`;
    if (diffDays < 30) return `Há ${Math.floor(diffDays / 7)} sem.`;
    
    // For older dates, show the actual date
    return PT_BR_DATE_FORMATTER.format(date);
}

/** Props for sortable column header */
interface SortableHeaderProps {
    label: string;
    column: ContactSortableColumn;
    currentSort: ContactSortableColumn;
    sortOrder: 'asc' | 'desc';
    onSort: (column: ContactSortableColumn) => void;
}

/** Sortable column header component */
const SortableHeader: React.FC<SortableHeaderProps> = ({ label, column, currentSort, sortOrder, onSort }) => {
    const isActive = currentSort === column;
    
    return (
        <th scope="col" className="px-6 py-4">
            <button
                onClick={() => onSort(column)}
                className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider hover:text-primary-600 dark:hover:text-primary-400 transition-colors group"
                aria-label={`Ordenar por ${label}`}
            >
                {label}
                <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                    {isActive ? (
                        sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                        <ArrowUpDown size={14} />
                    )}
                </span>
            </button>
        </th>
    );
};

interface ContactsListProps {
    viewMode: 'people' | 'companies';
    filteredContacts: Contact[];
    filteredCompanies: Company[];
    contacts: Contact[]; // Needed for company view avatar grouping
    selectedIds: Set<string>;
    toggleSelect: (id: string) => void;
    toggleSelectAll: () => void;
    getCompanyName: (id: string | undefined | null) => string;
    updateContact: (id: string, data: Partial<Contact>) => void;
    convertContactToDeal: (id: string) => void;
    openEditModal: (contact: Contact) => void;
    setDeleteId: (id: string) => void;
    openEditCompanyModal?: (company: Company) => void;
    setDeleteCompanyId?: (id: string) => void;
    // Sorting props
    sortBy?: ContactSortableColumn;
    sortOrder?: 'asc' | 'desc';
    onSort?: (column: ContactSortableColumn) => void;
}

/**
 * Componente React `ContactsList`.
 *
 * @param {ContactsListProps} {
    viewMode,
    filteredContacts,
    filteredCompanies,
    contacts,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    getCompanyName,
    updateContact,
    convertContactToDeal,
    openEditModal,
    setDeleteId,
    sortBy = 'created_at',
    sortOrder = 'desc',
    onSort,
} - Parâmetro `{
    viewMode,
    filteredContacts,
    filteredCompanies,
    contacts,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    getCompanyName,
    updateContact,
    convertContactToDeal,
    openEditModal,
    setDeleteId,
    sortBy = 'created_at',
    sortOrder = 'desc',
    onSort,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ContactsList: React.FC<ContactsListProps> = ({
    viewMode,
    filteredContacts,
    filteredCompanies,
    contacts,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    getCompanyName,
    updateContact,
    convertContactToDeal,
    openEditModal,
    setDeleteId,
    openEditCompanyModal,
    setDeleteCompanyId,
    sortBy = 'created_at',
    sortOrder = 'desc',
    onSort,
}) => {
    const activeListIds = viewMode === 'people'
        ? filteredContacts.map(c => c.id)
        : filteredCompanies.map(c => c.id);
    const allSelected = activeListIds.length > 0 && selectedIds.size === activeListIds.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < activeListIds.length;

    // Performance: compute "contacts by company" once (avoids N filters per company row).
    const contactsByCompanyId = React.useMemo(() => {
        const map = new Map<string, Contact[]>();
        for (const c of contacts) {
            const companyId = c.clientCompanyId;
            if (!companyId) continue;
            const list = map.get(companyId);
            if (list) list.push(c);
            else map.set(companyId, [c]);
        }
        return map;
    }, [contacts]);

    // Performance: avoid creating `new Date()` for each row in formatRelativeDate.
    const now = new Date();
    
    return (
        <div className="glass rounded-xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                {viewMode === 'people' ? (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/80 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                            <tr>
                                <th scope="col" className="w-12 px-6 py-4">
                                    <input 
                                        type="checkbox" 
                                        checked={allSelected}
                                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                                        onChange={toggleSelectAll}
                                        aria-label={allSelected ? 'Desmarcar todos os contatos' : 'Selecionar todos os contatos'}
                                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:bg-white/5 dark:border-white/10" 
                                    />
                                </th>
                                {onSort ? (
                                    <SortableHeader label="Nome" column="name" currentSort={sortBy} sortOrder={sortOrder} onSort={onSort} />
                                ) : (
                                    <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Nome</th>
                                )}
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Estágio</th>
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Cargo / Empresa</th>
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Contato</th>
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Status</th>
                                {onSort ? (
                                    <SortableHeader label="Criado" column="created_at" currentSort={sortBy} sortOrder={sortOrder} onSort={onSort} />
                                ) : (
                                    <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Criado</th>
                                )}
                                {onSort ? (
                                    <SortableHeader label="Modificado" column="updated_at" currentSort={sortBy} sortOrder={sortOrder} onSort={onSort} />
                                ) : (
                                    <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Modificado</th>
                                )}
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider"><span className="sr-only">Ações</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {filteredContacts.map((contact) => (
                                <tr key={contact.id} className={`hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group ${selectedIds.has(contact.id) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                                    <td className="px-6 py-4">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(contact.id)}
                                            onChange={() => toggleSelect(contact.id)}
                                            aria-label={`Selecionar ${contact.name}`}
                                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:bg-white/5 dark:border-white/10" 
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => openEditModal(contact)}
                                                className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 text-primary-700 dark:text-primary-200 flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-white dark:ring-white/5 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-dark-card"
                                                aria-label={`Editar contato: ${contact.name || 'Sem nome'}`}
                                                title={contact.name || 'Sem nome'}
                                            >
                                                {(contact.name || '?').charAt(0)}
                                            </button>
                                            <div>
                                                <span className="font-semibold text-slate-900 dark:text-white block">{contact.name}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <StageBadge stage={contact.stage} />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div>
                                            <span className="text-slate-900 dark:text-white font-medium block">{contact.role || 'Cargo não inf.'}</span>
                                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                <Building2 size={10} />
                                                <span>{getCompanyName(contact.clientCompanyId)}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs">
                                                <Mail size={12} /> {contact.email || '---'}
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs">
                                                <Phone size={12} /> {contact.phone || '---'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const nextStatus = contact.status === 'ACTIVE' ? 'INACTIVE' : contact.status === 'INACTIVE' ? 'CHURNED' : 'ACTIVE';
                                                    updateContact(contact.id, { status: nextStatus });
                                                }}
                                                aria-label={`Alterar status de ${contact.name} de ${contact.status === 'ACTIVE' ? 'ativo' : contact.status === 'INACTIVE' ? 'inativo' : 'perdido'}`}
                                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${contact.status === 'ACTIVE' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20' :
                                                    contact.status === 'INACTIVE' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20' :
                                                        'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                                                    }`}
                                            >
                                                {contact.status === 'ACTIVE' ? 'ATIVO' : contact.status === 'INACTIVE' ? 'INATIVO' : 'PERDIDO'}
                                            </button>
                                            <button
                                                onClick={() => convertContactToDeal(contact.id)}
                                                className="p-1 text-slate-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                                                aria-label={`Criar oportunidade para ${contact.name}`}
                                            >
                                                <Plus size={14} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div
                                            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs"
                                            title={contact.createdAt ? PT_BR_DATE_TIME_FORMATTER.format(new Date(contact.createdAt)) : undefined}
                                        >
                                            <Calendar size={14} className="text-slate-400" />
                                            <span>{formatRelativeDate(contact.createdAt, now)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div
                                            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs"
                                            title={contact.updatedAt ? PT_BR_DATE_TIME_FORMATTER.format(new Date(contact.updatedAt)) : undefined}
                                        >
                                            <Calendar size={14} className="text-slate-400" />
                                            <span>{formatRelativeDate(contact.updatedAt, now)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                            <button
                                                onClick={() => openEditModal(contact)}
                                                className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                                                aria-label={`Editar ${contact.name}`}
                                            >
                                                <Pencil size={16} aria-hidden="true" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteId(contact.id)}
                                                className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-400 hover:text-red-500 transition-colors"
                                                aria-label={`Excluir ${contact.name}`}
                                            >
                                                <Trash2 size={16} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/80 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                            <tr>
                                <th scope="col" className="w-12 px-6 py-4">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                                        onChange={toggleSelectAll}
                                        aria-label={allSelected ? 'Desmarcar todas as empresas' : 'Selecionar todas as empresas'}
                                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:bg-white/5 dark:border-white/10"
                                    />
                                </th>
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Empresa</th>
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Setor</th>
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Criado em</th>
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider">Pessoas Vinc.</th>
                                <th scope="col" className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200 font-display text-xs uppercase tracking-wider"><span className="sr-only">Ações</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {filteredCompanies.map((company) => (
                                <tr key={company.id} className={`hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group ${selectedIds.has(company.id) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(company.id)}
                                            onChange={() => toggleSelect(company.id)}
                                            aria-label={`Selecionar ${company.name}`}
                                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:bg-white/5 dark:border-white/10"
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {(() => {
                                                const firstLinkedContact = (contactsByCompanyId.get(company.id) ?? [])[0];
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (firstLinkedContact) openEditModal(firstLinkedContact);
                                                        }}
                                                        disabled={!firstLinkedContact}
                                                        className={`w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-dark-card ${
                                                            firstLinkedContact
                                                                ? 'hover:bg-slate-200 dark:hover:bg-white/15'
                                                                : 'opacity-50 cursor-not-allowed'
                                                        }`}
                                                        aria-label={
                                                            firstLinkedContact
                                                                ? `Abrir contato vinculado de ${company.name}`
                                                                : `Sem contatos vinculados para ${company.name}`
                                                        }
                                                        title={
                                                            firstLinkedContact
                                                                ? `Abrir: ${firstLinkedContact.name || 'Contato'}`
                                                                : 'Sem contatos vinculados'
                                                        }
                                                    >
                                                        <Building2 size={18} />
                                                    </button>
                                                );
                                            })()}
                                            <div>
                                                <span className="font-semibold text-slate-900 dark:text-white block">{company.name}</span>
                                                {company.website && (
                                                    <a href={`https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline flex items-center gap-1">
                                                        <Globe size={10} /> {company.website}
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 text-xs font-medium">
                                            {company.industry || 'Indefinido'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-slate-600 dark:text-slate-400 text-xs">
                                            {PT_BR_DATE_FORMATTER.format(new Date(company.createdAt))}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {/*
                                          Performance: this row used to call `contacts.filter(...)` twice per company.
                                          We pre-index contactsByCompanyId above to make this O(C + P) instead of O(C * P).
                                        */}
                                        <div className="flex -space-x-2 overflow-hidden">
                                            {(contactsByCompanyId.get(company.id) ?? []).map(c => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => openEditModal(c)}
                                                    className="h-6 w-6 rounded-full ring-2 ring-white dark:ring-dark-card bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-[10px] font-bold text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-dark-card"
                                                    title={c.name || 'Sem nome'}
                                                    aria-label={`Editar contato: ${c.name || 'Sem nome'}`}
                                                >
                                                    {(c.name || '?').charAt(0)}
                                                </button>
                                            ))}
                                            {(contactsByCompanyId.get(company.id) ?? []).length === 0 && (
                                                <span className="text-slate-400 text-xs italic">Ninguém</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                            <button
                                                onClick={() => openEditCompanyModal?.(company)}
                                                className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                                                aria-label={`Editar ${company.name}`}
                                            >
                                                <Pencil size={16} aria-hidden="true" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteCompanyId?.(company.id)}
                                                className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-400 hover:text-red-500 transition-colors"
                                                aria-label={`Excluir ${company.name}`}
                                            >
                                                <Trash2 size={16} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

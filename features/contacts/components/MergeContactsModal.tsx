'use client';

import React, { useState, useCallback } from 'react';
import { X, GitMerge, Phone, Mail, Check } from 'lucide-react';
import { FocusTrap } from '@/lib/a11y';
import { cn } from '@/lib/utils';
import type { Contact } from '@/types';
import type { DuplicateGroup } from '@/lib/query/hooks/useDuplicateContactsQuery';

interface MergeContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: DuplicateGroup[];
  contacts: Contact[];
  onMerge: (sourceId: string, targetId: string) => Promise<unknown>;
}

export const MergeContactsModal: React.FC<MergeContactsModalProps> = ({
  isOpen,
  onClose,
  groups,
  contacts,
  onMerge,
}) => {
  const [selectedTargets, setSelectedTargets] = useState<Record<number, string>>({});
  const [mergedGroups, setMergedGroups] = useState<Set<number>>(new Set());
  const [mergingGroup, setMergingGroup] = useState<number | null>(null);

  const contactMap = React.useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts) map.set(c.id, c);
    return map;
  }, [contacts]);

  const handleMergeGroup = useCallback(
    async (groupIndex: number, group: DuplicateGroup) => {
      const targetId = selectedTargets[groupIndex];
      if (!targetId) return;

      setMergingGroup(groupIndex);
      try {
        for (const contactId of group.contact_ids) {
          if (contactId !== targetId) {
            await onMerge(contactId, targetId);
          }
        }
        setMergedGroups((prev) => new Set(prev).add(groupIndex));
      } finally {
        setMergingGroup(null);
      }
    },
    [selectedTargets, onMerge]
  );

  if (!isOpen) return null;

  const pendingCount = groups.filter((_, i) => !mergedGroups.has(i)).length;

  return (
    <FocusTrap active={isOpen} onEscape={onClose} returnFocus>
      <div
        className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Resolver contatos duplicados"
          className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/10">
                <GitMerge className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                  Contatos Duplicados
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pendingCount} grupo{pendingCount !== 1 ? 's' : ''} pendente
                  {pendingCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {pendingCount === 0 ? (
              <div className="text-center py-12">
                <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  Tudo resolvido!
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Não há mais duplicatas para resolver.
                </p>
              </div>
            ) : (
              groups.map((group, groupIndex) => {
                if (mergedGroups.has(groupIndex)) return null;
                const isMergingThis = mergingGroup === groupIndex;
                const selectedTarget = selectedTargets[groupIndex];

                return (
                  <div
                    key={`${group.match_type}-${group.match_value}-${groupIndex}`}
                    className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden"
                  >
                    {/* Group header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                      {group.match_type === 'phone' ? (
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {group.match_type === 'phone' ? 'Telefone' : 'E-mail'}:{' '}
                        <span className="font-mono">{group.match_value}</span>
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">
                        {group.group_size} contatos
                      </span>
                    </div>

                    {/* Contact cards */}
                    <div className="p-3 space-y-2">
                      {group.contact_ids.map((contactId, i) => {
                        const contact = contactMap.get(contactId);
                        const isSelected = selectedTarget === contactId;

                        return (
                          <label
                            key={contactId}
                            className={cn(
                              'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                              isSelected
                                ? 'border-primary-300 dark:border-primary-500/30 bg-primary-50/50 dark:bg-primary-500/5'
                                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                            )}
                          >
                            <input
                              type="radio"
                              name={`group-${groupIndex}`}
                              value={contactId}
                              checked={isSelected}
                              onChange={() =>
                                setSelectedTargets((prev) => ({
                                  ...prev,
                                  [groupIndex]: contactId,
                                }))
                              }
                              className="text-primary-600 focus:ring-primary-500"
                            />
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 text-primary-700 dark:text-primary-200 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {(contact?.name || group.contact_names[i] || '?').charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                {contact?.name || group.contact_names[i]}
                              </p>
                              <div className="flex items-center gap-3 mt-0.5">
                                {contact?.email && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {contact.email}
                                  </span>
                                )}
                                {contact?.phone && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {contact.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-primary-100 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400 rounded-full flex-shrink-0">
                                MANTER
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>

                    {/* Merge button */}
                    <div className="px-4 pb-3">
                      <button
                        type="button"
                        onClick={() => handleMergeGroup(groupIndex, group)}
                        disabled={!selectedTarget || isMergingThis}
                        className={cn(
                          'w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                          selectedTarget && !isMergingThis
                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                        )}
                      >
                        {isMergingThis ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Mesclando...
                          </>
                        ) : (
                          <>
                            <GitMerge className="w-4 h-4" />
                            {selectedTarget
                              ? `Mesclar ${group.group_size - 1} contato${group.group_size - 1 !== 1 ? 's' : ''} no selecionado`
                              : 'Selecione o contato principal'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
};

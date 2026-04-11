'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  User,
  Phone,
  Mail,
  LinkIcon,
  Plus,
  X,
  Loader2,
  Check,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { sanitizePostgrestValue } from '@/lib/utils/sanitize';
import { useAuth } from '@/context/AuthContext';
import type { Contact } from '@/types';

interface ContactLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkContact: (contactId: string) => Promise<void>;
  onCreateContact?: (params: { name: string; phone?: string }) => Promise<string>;
  currentContactId?: string | null;
  suggestedPhone?: string;
  suggestedName?: string;
}

export function ContactLinkModal({
  isOpen,
  onClose,
  onLinkContact,
  onCreateContact,
  currentContactId,
  suggestedPhone,
  suggestedName,
}: ContactLinkModalProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState(suggestedName || '');
  const [newPhone, setNewPhone] = useState(suggestedPhone || '');
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search input (300ms)
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // Server-side search: only fetch when 2+ characters typed
  const { data: filteredContacts = [], isLoading } = useQuery({
    queryKey: ['contacts', 'search', debouncedSearch],
    queryFn: async (): Promise<Contact[]> => {
      const safe = sanitizePostgrestValue(debouncedSearch);
      if (!safe) return [];

      const { data, error: queryError } = await supabase
        .from('contacts')
        .select('id, name, email, phone')
        .or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`)
        .limit(10);

      if (queryError) throw queryError;
      return (data || []) as Contact[];
    },
    enabled: !!user && debouncedSearch.length >= 2,
    staleTime: 30 * 1000,
  });

  const handleClose = useCallback(() => {
    setSearch('');
    setShowCreateForm(false);
    setNewName(suggestedName || '');
    setNewPhone(suggestedPhone || '');
    setError(null);
    onClose();
  }, [onClose, suggestedName, suggestedPhone]);

  const handleLinkContact = async (contactId: string) => {
    setIsLinking(true);
    setError(null);

    try {
      await onLinkContact(contactId);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao vincular contato');
    } finally {
      setIsLinking(false);
    }
  };

  const handleCreateAndLink = async () => {
    if (!onCreateContact) return;
    if (!newName.trim()) {
      setError('Nome é obrigatório');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const contactId = await onCreateContact({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
      });
      await onLinkContact(contactId);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar contato');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Vincular Contato"
      size="md"
    >
      <div className="space-y-4">
        {/* Error */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {!showCreateForm ? (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contato por nome, email ou telefone..."
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 rounded-lg border',
                  'bg-white dark:bg-black/20',
                  'border-slate-200 dark:border-white/10',
                  'text-slate-900 dark:text-white',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500'
                )}
                autoFocus
              />
            </div>

            {/* Contact list */}
            <div className="max-h-64 overflow-y-auto space-y-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : debouncedSearch.length < 2 ? (
                <div className="text-center py-8">
                  <Search className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Digite ao menos 2 caracteres para buscar
                  </p>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhum contato encontrado
                  </p>
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleLinkContact(contact.id)}
                    disabled={isLinking || contact.id === currentContactId}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                      'hover:bg-slate-50 dark:hover:bg-white/5',
                      'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      contact.id === currentContactId && 'bg-primary-50 dark:bg-primary-500/10'
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {contact.name || 'Sem nome'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        {contact.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {contact.phone}
                          </span>
                        )}
                        {contact.email && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3" />
                            {contact.email}
                          </span>
                        )}
                      </div>
                    </div>
                    {contact.id === currentContactId ? (
                      <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    ) : (
                      <LinkIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Create new button */}
            {onCreateContact && (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed',
                  'border-slate-200 dark:border-white/10',
                  'text-slate-600 dark:text-slate-300',
                  'hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20',
                  'transition-colors'
                )}
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">Criar novo contato</span>
              </button>
            )}
          </>
        ) : (
          /* Create form */
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                Criar novo contato
              </h4>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do contato"
                  className={cn(
                    'w-full px-4 py-2.5 rounded-lg border',
                    'bg-white dark:bg-black/20',
                    'border-slate-200 dark:border-white/10',
                    'text-slate-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-primary-500'
                  )}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className={cn(
                    'w-full px-4 py-2.5 rounded-lg border',
                    'bg-white dark:bg-black/20',
                    'border-slate-200 dark:border-white/10',
                    'text-slate-900 dark:text-white',
                    'focus:outline-none focus:ring-2 focus:ring-primary-500'
                  )}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateAndLink}
              disabled={isCreating || !newName.trim()}
              className={cn(
                'w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold',
                'bg-primary-600 text-white hover:bg-primary-700',
                'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              )}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Criar e Vincular
                </>
              )}
            </button>
          </div>
        )}

        {/* Close button */}
        {!showCreateForm && (
          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ContactLinkModal;

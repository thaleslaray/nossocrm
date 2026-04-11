'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Users,
  MessageSquare,
  RefreshCw,
  Check,
  X,
  UserPlus,
  UserMinus,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog as ConfirmModal } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils/cn';
import { getClient } from '@/lib/supabase/client';
import {
  useBusinessUnitsWithCounts,
  useBusinessUnitMembers,
  useCreateBusinessUnit,
  useUpdateBusinessUnit,
  useDeleteBusinessUnit,
  useAddBusinessUnitMembers,
  useRemoveBusinessUnitMembers,
} from '@/lib/query/hooks/useBusinessUnitsQuery';
import type {
  BusinessUnitView,
  BusinessUnitMember,
  CreateBusinessUnitInput,
  UpdateBusinessUnitInput,
} from '@/lib/messaging/types';

// =============================================================================
// HELPERS
// =============================================================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// =============================================================================
// UNIT CARD
// =============================================================================

interface UnitCardProps {
  unit: BusinessUnitView;
  onEdit: () => void;
  onManageMembers: () => void;
  onDelete: () => void;
  isLoading?: boolean;
}

function UnitCard({
  unit,
  onEdit,
  onManageMembers,
  onDelete,
  isLoading,
}: UnitCardProps) {
  return (
    <div className="p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
              {unit.name}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {unit.key}
            </p>
            {unit.description && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 line-clamp-2">
                {unit.description}
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1" title="Membros">
            <Users className="w-4 h-4" />
            <span>{unit.memberCount ?? 0}</span>
          </div>
          <div className="flex items-center gap-1" title="Canais">
            <MessageSquare className="w-4 h-4" />
            <span>{unit.channelCount ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Auto-create deal badge */}
      {unit.autoCreateDeal && (
        <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-300 text-xs font-medium">
          <Check className="w-3 h-3" />
          Criar deal automaticamente
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onEdit}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
            bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10
            hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <Pencil className="w-3.5 h-3.5" />
          Editar
        </button>
        <button
          onClick={onManageMembers}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
            bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10
            hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <Users className="w-3.5 h-3.5" />
          Membros
        </button>
        <button
          onClick={onDelete}
          disabled={isLoading || (unit.channelCount ?? 0) > 0}
          title={
            (unit.channelCount ?? 0) > 0
              ? 'Remova os canais antes de excluir'
              : 'Excluir unidade'
          }
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
            bg-white dark:bg-white/5 border border-red-200 dark:border-red-500/20
            text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyUnitsState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
        Nenhuma unidade de negócio
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
        Crie unidades de negócio para organizar seus canais e conversas por área
        (Vendas, Suporte, etc.).
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold
          bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Criar Unidade
      </button>
    </div>
  );
}

// =============================================================================
// UNIT FORM MODAL
// =============================================================================

interface UnitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit?: BusinessUnitView | null;
  onSave: (input: CreateBusinessUnitInput | UpdateBusinessUnitInput) => Promise<void>;
  isSaving: boolean;
}

function UnitFormModal({
  isOpen,
  onClose,
  unit,
  onSave,
  isSaving,
}: UnitFormModalProps) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [autoCreateDeal, setAutoCreateDeal] = useState(false);
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);

  const isEditing = !!unit;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (unit) {
        setName(unit.name);
        setKey(unit.key);
        setDescription(unit.description || '');
        setAutoCreateDeal(unit.autoCreateDeal);
        setKeyManuallyEdited(true);
      } else {
        setName('');
        setKey('');
        setDescription('');
        setAutoCreateDeal(false);
        setKeyManuallyEdited(false);
      }
    }
  }, [isOpen, unit]);

  // Auto-generate key from name
  useEffect(() => {
    if (!isEditing && !keyManuallyEdited && name) {
      setKey(generateSlug(name));
    }
  }, [name, isEditing, keyManuallyEdited]);

  const handleKeyChange = (value: string) => {
    setKeyManuallyEdited(true);
    setKey(generateSlug(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;

    const input: CreateBusinessUnitInput | UpdateBusinessUnitInput = {
      name: name.trim(),
      key: key.trim(),
      description: description.trim() || undefined,
      autoCreateDeal,
    };

    await onSave(input);
  };

  const isValid = name.trim().length > 0 && key.trim().length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar Unidade' : 'Nova Unidade de Negócio'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Nome <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Vendas, Suporte, Marketing"
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            autoFocus
          />
        </div>

        {/* Key */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Identificador (slug) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={key}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="vendas"
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white font-mono"
            disabled={isEditing}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Identificador único usado internamente. Não pode ser alterado depois.
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Descrição
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição opcional da unidade"
            rows={2}
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white resize-none"
          />
        </div>

        {/* Auto-create deal */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAutoCreateDeal(!autoCreateDeal)}
            className={cn(
              'relative w-10 h-6 rounded-full transition-colors',
              autoCreateDeal
                ? 'bg-primary-600'
                : 'bg-slate-200 dark:bg-white/10'
            )}
          >
            <span
              className={cn(
                'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                autoCreateDeal ? 'left-5' : 'left-1'
              )}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Criar deal automaticamente
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Criar deal no funil quando iniciar uma nova conversa
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium
              text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!isValid || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
              bg-primary-600 text-white hover:bg-primary-700
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {isEditing ? 'Salvar' : 'Criar Unidade'}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// MEMBERS MODAL
// =============================================================================

interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: BusinessUnitView | null;
  members: BusinessUnitMember[];
  isLoading: boolean;
  allUsers: { id: string; name: string; email: string; avatarUrl?: string }[];
  onAddMember: (userId: string) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  isAdding: boolean;
  isRemoving: boolean;
}

function MembersModal({
  isOpen,
  onClose,
  unit,
  members,
  isLoading,
  allUsers,
  onAddMember,
  onRemoveMember,
  isAdding,
  isRemoving,
}: MembersModalProps) {
  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const nonMembers = useMemo(
    () => allUsers.filter((u) => !memberIds.has(u.id)),
    [allUsers, memberIds]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Membros: ${unit?.name || ''}`}
      size="md"
    >
      <div className="space-y-4">
        {/* Current members */}
        <div>
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Membros atuais ({members.length})
          </h4>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              Nenhum membro adicionado ainda.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-50 dark:bg-black/20"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary-600 dark:text-primary-400">
                        {(member.userName || member.userEmail || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {member.userName || 'Sem nome'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {member.userEmail}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveMember(member.userId)}
                    disabled={isRemoving}
                    className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Remover membro"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add members */}
        {nonMembers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Adicionar membros
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {nonMembers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg border border-slate-200 dark:border-white/10"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {(user.name || user.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {user.name || 'Sem nome'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onAddMember(user.id)}
                    disabled={isAdding}
                    className="p-1.5 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/10 transition-colors disabled:opacity-50"
                    title="Adicionar membro"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close button */}
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium
              text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function BusinessUnitsSection() {
  const { profile } = useAuth();
  const { addToast } = useToast();

  // Queries
  const { data: units = [], isLoading } = useBusinessUnitsWithCounts();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const { data: members = [], isLoading: membersLoading } = useBusinessUnitMembers(
    selectedUnitId || undefined
  );

  // Mutations
  const createMutation = useCreateBusinessUnit();
  const updateMutation = useUpdateBusinessUnit();
  const deleteMutation = useDeleteBusinessUnit();
  const addMemberMutation = useAddBusinessUnitMembers();
  const removeMemberMutation = useRemoveBusinessUnitMembers();

  // Local state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<BusinessUnitView | null>(null);
  const [unitToDelete, setUnitToDelete] = useState<BusinessUnitView | null>(null);
  const [membersUnit, setMembersUnit] = useState<BusinessUnitView | null>(null);

  // Fetch all users in the same organization for member management
  const { data: allUsers = [] } = useQuery({
    queryKey: ['org-profiles', profile?.organization_id],
    queryFn: async () => {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .eq('organization_id', profile!.organization_id)
        .order('first_name');

      if (error) throw error;

      return (data ?? []).map((u) => ({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
        email: u.email,
        avatarUrl: u.avatar_url ?? undefined,
      }));
    },
    enabled: !!profile?.organization_id,
  });

  const canUse = profile?.role === 'admin';

  // Update selectedUnitId when membersUnit changes
  useEffect(() => {
    setSelectedUnitId(membersUnit?.id || null);
  }, [membersUnit?.id]);

  // Handlers
  const handleOpenForm = (unit?: BusinessUnitView) => {
    setEditingUnit(unit || null);
    setIsFormOpen(true);
  };

  const handleSaveUnit = async (input: CreateBusinessUnitInput | UpdateBusinessUnitInput) => {
    try {
      if (editingUnit) {
        await updateMutation.mutateAsync({
          unitId: editingUnit.id,
          input: input as UpdateBusinessUnitInput,
        });
        addToast('Unidade atualizada com sucesso!', 'success');
      } else {
        await createMutation.mutateAsync(input as CreateBusinessUnitInput);
        addToast('Unidade criada com sucesso!', 'success');
      }
      setIsFormOpen(false);
      setEditingUnit(null);
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Erro ao salvar unidade',
        'error'
      );
    }
  };

  const handleDeleteUnit = async () => {
    if (!unitToDelete) return;
    try {
      await deleteMutation.mutateAsync(unitToDelete.id);
      addToast('Unidade removida com sucesso!', 'success');
      setUnitToDelete(null);
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Erro ao remover unidade',
        'error'
      );
    }
  };

  const handleAddMember = async (userId: string) => {
    if (!membersUnit) return;
    try {
      await addMemberMutation.mutateAsync({
        unitId: membersUnit.id,
        userIds: [userId],
      });
      addToast('Membro adicionado!', 'success');
    } catch (error) {
      addToast('Erro ao adicionar membro', 'error');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!membersUnit) return;
    try {
      await removeMemberMutation.mutateAsync({
        unitId: membersUnit.id,
        userIds: [userId],
      });
      addToast('Membro removido!', 'success');
    } catch (error) {
      addToast('Erro ao remover membro', 'error');
    }
  };

  if (!canUse) {
    return (
      <SettingsSection title="Unidades de Negócio" icon={Building2}>
        <div className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-600 dark:text-slate-300">
          Disponível apenas para administradores.
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Unidades de Negócio" icon={Building2}>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
        Organize seus canais de comunicação e conversas por área de atuação
        (Vendas, Suporte, Marketing, etc.).
      </p>

      {/* Actions - only show when there are units */}
      {units.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {units.length} unidade{units.length > 1 ? 's' : ''}
          </div>
          <button
            onClick={() => handleOpenForm()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold
              bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Criar Unidade
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : units.length === 0 ? (
        <EmptyUnitsState onAdd={() => handleOpenForm()} />
      ) : (
        <div className="grid gap-4">
          {units.map((unit) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              onEdit={() => handleOpenForm(unit)}
              onManageMembers={() => setMembersUnit(unit)}
              onDelete={() => setUnitToDelete(unit)}
              isLoading={
                deleteMutation.isPending ||
                updateMutation.isPending
              }
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      <UnitFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingUnit(null);
        }}
        unit={editingUnit}
        onSave={handleSaveUnit}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />

      {/* Members Modal */}
      <MembersModal
        isOpen={!!membersUnit}
        onClose={() => setMembersUnit(null)}
        unit={membersUnit}
        members={members}
        isLoading={membersLoading}
        allUsers={allUsers}
        onAddMember={handleAddMember}
        onRemoveMember={handleRemoveMember}
        isAdding={addMemberMutation.isPending}
        isRemoving={removeMemberMutation.isPending}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!unitToDelete}
        onClose={() => setUnitToDelete(null)}
        onConfirm={handleDeleteUnit}
        title="Remover unidade de negócio?"
        message={
          <div>
            Isso vai remover a unidade <b>{unitToDelete?.name}</b>. Os canais e
            conversas associados não serão excluídos, mas ficarão sem unidade.
          </div>
        }
        confirmText="Remover"
        cancelText="Cancelar"
        variant="danger"
      />
    </SettingsSection>
  );
}

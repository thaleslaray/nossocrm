/**
 * ServicesManager - Componente para gerenciar catálogo de serviços da agência
 *
 * Permite criar, editar, ativar/desativar e deletar serviços.
 * Serviços ativos aparecem nos dropdowns ao criar deals.
 */
import React, { useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Save,
  X,
  Search,
  DollarSign,
  Briefcase,
} from 'lucide-react';
import {
  useAgencyServices,
  useCreateAgencyService,
  useUpdateAgencyService,
  useDeleteAgencyService,
  useToggleAgencyService,
} from '@/lib/query/hooks';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import type { AgencyService } from '@/types';

/**
 * Formata número para formato brasileiro de moeda
 */
function formatBRL(v: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

export const ServicesManager: React.FC = () => {
  const { toast } = useToast();
  const { data: services = [], isLoading } = useAgencyServices();
  const createMutation = useCreateAgencyService();
  const updateMutation = useUpdateAgencyService();
  const deleteMutation = useDeleteAgencyService();
  const toggleMutation = useToggleAgencyService();

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(false);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('0');
  const [newCommission, setNewCommission] = useState('10');
  const [newDescription, setNewDescription] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('0');
  const [editCommission, setEditCommission] = useState('0');
  const [editDescription, setEditDescription] = useState('');

  // Filtered services
  const filteredServices = services.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActive = !showOnlyActive || service.active;
    return matchesSearch && matchesActive;
  });

  // Handlers
  const handleCreate = async () => {
    if (!newName.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome do serviço é obrigatório.',
        variant: 'error',
      });
      return;
    }

    if (Number(newPrice) <= 0) {
      toast({
        title: 'Erro',
        description: 'O preço deve ser maior que zero.',
        variant: 'error',
      });
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: newName.trim(),
        price: Number(newPrice),
        commission: Number(newCommission) || undefined,
        description: newDescription.trim() || undefined,
        active: true,
      });

      toast({
        title: 'Sucesso!',
        description: 'Serviço criado com sucesso.',
        variant: 'success',
      });

      // Reset form
      setNewName('');
      setNewPrice('0');
      setNewCommission('10');
      setNewDescription('');
      setShowCreateForm(false);

      // Notify app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm:agency-services-updated'));
      }
    } catch (error) {
      console.error('Erro ao criar serviço:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível criar o serviço. Tente novamente.',
        variant: 'error',
      });
    }
  };

  const handleStartEdit = (service: AgencyService) => {
    setEditingId(service.id);
    setEditName(service.name);
    setEditPrice(String(service.price));
    setEditCommission(String(service.commission || 0));
    setEditDescription(service.description || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPrice('0');
    setEditCommission('0');
    setEditDescription('');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    if (!editName.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome do serviço é obrigatório.',
        variant: 'error',
      });
      return;
    }

    if (Number(editPrice) <= 0) {
      toast({
        title: 'Erro',
        description: 'O preço deve ser maior que zero.',
        variant: 'error',
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: editingId,
        updates: {
          name: editName.trim(),
          price: Number(editPrice),
          commission: Number(editCommission) || undefined,
          description: editDescription.trim() || undefined,
        },
      });

      toast({
        title: 'Sucesso!',
        description: 'Serviço atualizado com sucesso.',
        variant: 'success',
      });

      handleCancelEdit();

      // Notify app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm:agency-services-updated'));
      }
    } catch (error) {
      console.error('Erro ao atualizar serviço:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o serviço. Tente novamente.',
        variant: 'error',
      });
    }
  };

  const handleToggle = async (service: AgencyService) => {
    try {
      await toggleMutation.mutateAsync(service.id);

      toast({
        title: 'Sucesso!',
        description: `Serviço ${service.active ? 'desativado' : 'ativado'} com sucesso.`,
        variant: 'success',
      });

      // Notify app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm:agency-services-updated'));
      }
    } catch (error) {
      console.error('Erro ao alternar status do serviço:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o status do serviço.',
        variant: 'error',
      });
    }
  };

  const handleDelete = async (service: AgencyService) => {
    if (!confirm(`Tem certeza que deseja deletar o serviço "${service.name}"?`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(service.id);

      toast({
        title: 'Sucesso!',
        description: 'Serviço deletado com sucesso.',
        variant: 'success',
      });

      // Notify app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm:agency-services-updated'));
      }
    } catch (error) {
      console.error('Erro ao deletar serviço:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível deletar o serviço. Tente novamente.',
        variant: 'error',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Catálogo de Serviços
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Gerencie os serviços oferecidos pela sua agência
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? (
            <>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Novo Serviço
            </>
          )}
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Novo Serviço
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Nome do Serviço <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Ex: Gestão de Tráfego Pago"
                aria-label="Nome do Serviço"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Preço (R$) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="5000"
                min="0"
                step="100"
                aria-label="Preço"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Comissão (%)
              </label>
              <input
                type="number"
                value={newCommission}
                onChange={(e) => setNewCommission(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="10"
                min="0"
                max="100"
                step="1"
                aria-label="Comissão"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Descrição
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Descrição do serviço..."
                rows={2}
                aria-label="Descrição"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreateForm(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {createMutation.isPending ? 'Criando...' : 'Criar Serviço'}
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Buscar serviços..."
            aria-label="Buscar serviços"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyActive}
            onChange={(e) => setShowOnlyActive(e.target.checked)}
            className="rounded border-neutral-300 dark:border-neutral-600"
          />
          Mostrar apenas ativos
        </label>
      </div>

      {/* Services Table */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Serviço
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Preço
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Comissão
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-neutral-500 dark:text-neutral-400">
                    <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">
                      {searchTerm
                        ? 'Nenhum serviço encontrado com este filtro.'
                        : 'Nenhum serviço cadastrado. Clique em "Novo Serviço" para começar.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredServices.map((service) => (
                  <tr
                    key={service.id}
                    className={`${
                      !service.active ? 'opacity-50' : ''
                    } hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors`}
                  >
                    {editingId === service.id ? (
                      <>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 text-sm"
                            aria-label="Editar nome"
                          />
                          <input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 text-xs mt-1"
                            placeholder="Descrição..."
                            aria-label="Editar descrição"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-24 px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 text-sm"
                            aria-label="Editar preço"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={editCommission}
                            onChange={(e) => setEditCommission(e.target.value)}
                            className="w-20 px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-900 text-sm"
                            aria-label="Editar comissão"
                          />
                        </td>
                        <td className="px-6 py-4"></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEdit}
                              disabled={updateMutation.isPending}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={updateMutation.isPending}
                            >
                              <Save className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Briefcase className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                {service.name}
                              </p>
                              {service.description && (
                                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                                  {service.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {formatBRL(service.price)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-neutral-600 dark:text-neutral-400">
                            {service.commission ? `${service.commission}%` : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              service.active
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                                : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                            }`}
                          >
                            {service.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(service)}
                              aria-label="Editar serviço"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggle(service)}
                              disabled={toggleMutation.isPending}
                              aria-label={service.active ? 'Desativar serviço' : 'Ativar serviço'}
                            >
                              {service.active ? (
                                <ToggleRight className="w-4 h-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="w-4 h-4 text-neutral-400" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(service)}
                              disabled={deleteMutation.isPending}
                              aria-label="Deletar serviço"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Stats */}
      {services.length > 0 && (
        <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
          <span>
            Total: {services.length} serviço{services.length !== 1 ? 's' : ''}
          </span>
          <span>
            Ativos: {services.filter((s) => s.active).length}
          </span>
        </div>
      )}
    </div>
  );
};

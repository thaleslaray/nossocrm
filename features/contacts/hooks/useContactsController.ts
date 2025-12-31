import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { Contact, Company, ContactStage, PaginationState, ContactsServerFilters, DEFAULT_PAGE_SIZE, ContactSortableColumn } from '@/types';
import {
  useContacts,
  useContactsPaginated,
  useContactStageCounts,
  useCompanies,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useBulkDeleteContacts,
  useBulkDeleteCompanies,
  useCreateCompany,
  useUpdateCompany,
  useDeleteCompany,
  useContactHasDeals,
} from '@/lib/query/hooks/useContactsQuery';
import { useCreateDeal } from '@/lib/query/hooks/useDealsQuery';
import { useBoards } from '@/lib/query/hooks/useBoardsQuery';
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync';
import { normalizePhoneE164 } from '@/lib/phone';
import { generateFakeContacts } from '@/lib/debug';

/**
 * Hook React `useContactsController` que encapsula uma lógica reutilizável.
 * @returns {{ search: string; setSearch: Dispatch<SetStateAction<string>>; statusFilter: "ALL" | "ACTIVE" | "INACTIVE" | "CHURNED" | "RISK"; setStatusFilter: Dispatch<SetStateAction<"ALL" | ... 3 more ... | "RISK">>; ... 51 more ...; addToast: (message: string, type?: ToastType | undefined) => void; }} Retorna um valor do tipo `{ search: string; setSearch: Dispatch<SetStateAction<string>>; statusFilter: "ALL" | "ACTIVE" | "INACTIVE" | "CHURNED" | "RISK"; setStatusFilter: Dispatch<SetStateAction<"ALL" | ... 3 more ... | "RISK">>; ... 51 more ...; addToast: (message: string, type?: ToastType | undefined) => void; }`.
 */
export const useContactsController = () => {
  // T017: Pagination state
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // TanStack Query hooks
  const { data: companies = [], isLoading: companiesLoading } = useCompanies();
  const { data: boards = [] } = useBoards();
  const createContactMutation = useCreateContact();
  const updateContactMutation = useUpdateContact();
  const deleteContactMutation = useDeleteContact();
  const bulkDeleteContactsMutation = useBulkDeleteContacts();
  const checkHasDealsMutation = useContactHasDeals();
  const createCompanyMutation = useCreateCompany();
  const updateCompanyMutation = useUpdateCompany();
  const deleteCompanyMutation = useDeleteCompany();
  const bulkDeleteCompaniesMutation = useBulkDeleteCompanies();
  const createDealMutation = useCreateDeal();

  // Enable realtime sync
  useRealtimeSync('contacts');
  useRealtimeSync('crm_companies');

  const { addToast, showToast } = useToast();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'INACTIVE' | 'CHURNED' | 'RISK'
  >(() => {
    const filter = searchParams?.get('filter');
    const validFilters = ['ALL', 'ACTIVE', 'INACTIVE', 'CHURNED', 'RISK'] as const;
    return validFilters.includes(filter as (typeof validFilters)[number])
      ? (filter as (typeof validFilters)[number])
      : 'ALL';
  });
  const [stageFilter, setStageFilter] = useState<ContactStage | 'ALL'>(
    (searchParams?.get('stage') as ContactStage) || 'ALL'
  );
  const [viewMode, setViewMode] = useState<'people' | 'companies'>('people');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Sorting state
  const [sortBy, setSortBy] = useState<ContactSortableColumn>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Toggle sort handler
  const handleSort = useCallback((column: ContactSortableColumn) => {
    if (sortBy === column) {
      // Toggle direction if same column
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to desc
      setSortBy(column);
      setSortOrder('desc');
    }
    // Reset to first page when sorting changes
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  }, [sortBy]);

  // T027-T028: Build server filters from state
  const serverFilters = useMemo<ContactsServerFilters | undefined>(() => {
    const filters: ContactsServerFilters = {};

    if (search.trim()) {
      filters.search = search.trim();
    }
    if (stageFilter !== 'ALL') {
      filters.stage = stageFilter;
    }
    if (statusFilter !== 'ALL') {
      filters.status = statusFilter;
    }
    if (dateRange.start) {
      filters.dateStart = dateRange.start;
    }
    if (dateRange.end) {
      filters.dateEnd = dateRange.end;
    }

    // Always include sorting
    filters.sortBy = sortBy;
    filters.sortOrder = sortOrder;

    // Return filters (always has at least sorting)
    return filters;
  }, [search, stageFilter, statusFilter, dateRange, sortBy, sortOrder]);

  // T029: Track filter changes to reset pagination synchronously
  // This prevents 416 errors when filters change while on a high page number
  const filterKey = `${search}-${stageFilter}-${statusFilter}-${dateRange.start}-${dateRange.end}`;
  const prevFilterKeyRef = React.useRef<string>(filterKey);

  // Reset to first page when filters change (safe: inside effect)
  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setPagination(prev => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
    }
  }, [filterKey]);

  // T018-T019: Use paginated query instead of getAll
  const {
    data: paginatedData,
    isLoading: contactsLoading,
    isFetching,
    isPlaceholderData,
  } = useContactsPaginated(pagination, serverFilters);

  // T019: Extract contacts and totalCount from paginated response
  const contacts = paginatedData?.data ?? [];
  const totalCount = paginatedData?.totalCount ?? 0;

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deleteCompanyId, setDeleteCompanyId] = useState<string | null>(null);
  const [deleteWithDeals, setDeleteWithDeals] = useState<{ id: string; dealCount: number; deals: Array<{ id: string; title: string }> } | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    companyName: '',
  });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  // Create Deal State
  const [createDealContactId, setCreateDealContactId] = useState<string | null>(null);
  const contactForDeal = contacts.find(c => c.id === createDealContactId);

  const isLoading = contactsLoading || companiesLoading;

  const openCreateModal = () => {
    if (viewMode === 'companies') {
      setEditingCompany(null);
      setIsCompanyModalOpen(true);
      return;
    }
    setEditingContact(null);
    setFormData({ name: '', email: '', phone: '', role: '', companyName: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    const company = companies.find(c => c.id === contact.companyId);
    setFormData({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role || '',
      companyName: company?.name || '',
    });
    setIsModalOpen(true);
  };

  const openEditCompanyModal = (company: Company) => {
    setEditingCompany(company);
    setIsCompanyModalOpen(true);
  };

  const handleCompanySubmit = (data: { name: string; industry?: string; website?: string }) => {
    if (editingCompany) {
      updateCompanyMutation.mutate(
        { id: editingCompany.id, updates: { ...data } },
        {
          onSuccess: () => {
            (addToast || showToast)('Empresa atualizada!', 'success');
            setIsCompanyModalOpen(false);
            setEditingCompany(null);
          },
          onError: (error: Error) => {
            (addToast || showToast)(`Erro ao atualizar empresa: ${error.message}`, 'error');
          },
        }
      );
    } else {
      // Close immediately for better UX (same pattern as contact creation)
      setIsCompanyModalOpen(false);
      (addToast || showToast)('Criando empresa...', 'info');

      createCompanyMutation.mutate(
        { name: data.name, industry: data.industry || '', website: data.website || '' } as any,
        {
          onSuccess: () => {
            (addToast || showToast)('Empresa criada!', 'success');
          },
          onError: (error: Error) => {
            (addToast || showToast)(`Erro ao criar empresa: ${error.message}`, 'error');
            // Re-open modal so user can retry
            setIsCompanyModalOpen(true);
          },
        }
      );
    }
  };

  const confirmDeleteCompany = async () => {
    if (!deleteCompanyId) return;
    // Close confirm modal immediately to avoid "stuck" feeling
    setDeleteCompanyId(null);
    (addToast || showToast)('Excluindo empresa...', 'info');
    try {
      await deleteCompanyMutation.mutateAsync(deleteCompanyId);
      (addToast || showToast)('Empresa excluída com sucesso', 'success');
    } catch (e) {
      (addToast || showToast)(`Erro ao excluir empresa: ${(e as Error).message}`, 'error');
    }
  };

  const confirmDelete = async () => {
    if (deleteId) {
      // First check if contact has deals
      try {
        const result = await checkHasDealsMutation.mutateAsync(deleteId);

        if (result.hasDeals) {
          // Show confirmation for deleting with deals
          setDeleteWithDeals({ id: deleteId, dealCount: result.dealCount, deals: result.deals });
          setDeleteId(null);
          return;
        }

        // No deals, delete normally
        deleteContactMutation.mutate(
          { id: deleteId },
          {
            onSuccess: () => {
              (addToast || showToast)('Contato excluído com sucesso', 'success');
              setDeleteId(null);
            },
            onError: (error: Error) => {
              (addToast || showToast)(`Erro ao excluir: ${error.message}`, 'error');
            },
          }
        );
      } catch (error) {
        (addToast || showToast)('Erro ao verificar negócios do contato', 'error');
      }
    }
  };

  const confirmDeleteWithDeals = () => {
    if (deleteWithDeals) {
      deleteContactMutation.mutate(
        { id: deleteWithDeals.id, forceDeleteDeals: true },
        {
          onSuccess: () => {
            (addToast || showToast)(`Contato e ${deleteWithDeals.dealCount} negócio(s) excluídos`, 'success');
            setDeleteWithDeals(null);
          },
          onError: (error: Error) => {
            (addToast || showToast)(`Erro ao excluir: ${error.message}`, 'error');
          },
        }
      );
    }
  };

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const ids = viewMode === 'people' ? filteredContacts.map(c => c.id) : filteredCompanies.map(c => c.id);
    if (selectedIds.size === ids.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ids));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk delete
  const confirmBulkDelete = async () => {
    const ids: string[] = Array.from(selectedIds);
    let successCount = 0;
    let errorCount = 0;

      try {
        if (viewMode === 'companies') {
        const result = await bulkDeleteCompaniesMutation.mutateAsync({
          ids,
          concurrency: 2,
        });
        successCount = result.successCount;
        errorCount = result.errorCount;
        } else {
        const result = await bulkDeleteContactsMutation.mutateAsync({
          ids,
          forceDeleteDeals: true,
          concurrency: 3,
        });
        successCount = result.successCount;
        errorCount = result.errorCount;
      }
    } catch {
      // If bulk fails unexpectedly, count everything as error (keeps UX predictable)
      errorCount = ids.length;
    }

    if (successCount > 0) {
      (addToast || showToast)(
        `${successCount} ${viewMode === 'companies' ? 'empresa(s)' : 'contato(s)'} excluído(s)`,
        'success'
      );
    }
    if (errorCount > 0) {
      (addToast || showToast)(
        `Falha ao excluir ${errorCount} ${viewMode === 'companies' ? 'empresa(s)' : 'contato(s)'}`,
        'error'
      );
    }

    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const t0 = Date.now();
    setIsSubmittingContact(true);
    const normalizedPhone = normalizePhoneE164(formData.phone);

    // Close immediately to avoid "modal close lag" while we wait for Supabase.
    // (TanStack Query does not support onMutate in mutate() call options.)
    if (!editingContact) {
      setIsModalOpen(false);
      (addToast || showToast)('Criando contato...', 'info');
    }

    // Find or create company
    let companyId: string | undefined;
    const companyName = (formData.companyName || '').trim();
    const companyNameKey = companyName.toLowerCase();

    if (companyName) {
      const existingCompany = companies.find(c => (c.name || '').toLowerCase() === companyNameKey);

      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        // Create new company and wait for result
        const tCompany0 = Date.now();
        const newCompany = await new Promise<{ id: string } | null>(resolve => {
          createCompanyMutation.mutate(
            { name: companyName },
            { onSuccess: resolve, onError: () => resolve(null) }
          );
        });
        if (newCompany) {
          companyId = newCompany.id;
        }
      }
    } else if (editingContact) {
      // Explicitly unlink company when clearing the field in Edit
      companyId = '';
    }

    if (editingContact) {
      updateContactMutation.mutate(
        {
          id: editingContact.id,
          updates: {
            name: formData.name,
            email: formData.email,
            phone: normalizedPhone,
            role: formData.role,
            companyId: companyId,
          },
        },
        {
          onSuccess: () => {
            (addToast || showToast)('Contato atualizado!', 'success');
            setIsModalOpen(false);
          },
          onSettled: () => setIsSubmittingContact(false),
        }
      );
    } else {
      createContactMutation.mutate(
        {
          name: formData.name,
          email: formData.email,
          phone: normalizedPhone,
          role: formData.role,
          companyId: companyId || '',
          status: 'ACTIVE',
          stage: ContactStage.LEAD,
          totalValue: 0,
        },
        {
          onSuccess: () => {
            (addToast || showToast)('Contato criado!', 'success');
          },
          onError: (error: Error) => {
            (addToast || showToast)(`Erro ao criar contato: ${error.message}`, 'error');
            // Re-open modal so user can adjust and retry
            setIsModalOpen(true);
          },
          onSettled: () => setIsSubmittingContact(false),
        }
      );
    }
  };

  const createFakeContactsBatch = useCallback(async (count: number) => {
    const fakeContacts = generateFakeContacts(count);
    let createdCount = 0;

    for (const fake of fakeContacts) {
      let companyId: string | undefined;

      if (fake.companyName) {
        const existingCompany = companies.find(
          c => (c.name || '').toLowerCase() === (fake.companyName || '').toLowerCase()
        );

        if (existingCompany) {
          companyId = existingCompany.id;
        } else {
          const newCompany = await new Promise<{ id: string } | null>(resolve => {
            createCompanyMutation.mutate(
              { name: fake.companyName },
              { onSuccess: resolve, onError: () => resolve(null) }
            );
          });
          if (newCompany) companyId = newCompany.id;
        }
      }

      await createContactMutation.mutateAsync({
        name: fake.name,
        email: fake.email,
        phone: normalizePhoneE164(fake.phone),
        role: fake.role,
        companyId: companyId || '',
        status: 'ACTIVE',
        stage: ContactStage.LEAD,
        totalValue: 0,
      });

      createdCount++;
    }

    (addToast || showToast)(`${createdCount} contatos fake criados!`, 'success');
  }, [addToast, showToast, companies, createCompanyMutation, createContactMutation]);

  // Open modal to select board for deal creation (or create directly if only 1 board)
  const convertContactToDeal = (contactId: string) => {
    if (boards.length === 0) {
      addToast('Nenhum board disponível. Crie um board primeiro.', 'error');
      return;
    }

    // Se só tem 1 board, cria direto sem abrir modal
    if (boards.length === 1) {
      createDealDirectly(contactId, boards[0]);
      return;
    }

    // Se tem mais de 1 board, abre modal para escolher
    setCreateDealContactId(contactId);
  };

  // Create deal directly (used when only 1 board or from modal)
  const createDealDirectly = (contactId: string, board: typeof boards[0]) => {
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      addToast('Contato não encontrado', 'error');
      return;
    }

    if (!board.stages?.length) {
      addToast('Board não tem estágios configurados', 'error');
      console.error('Board sem stages:', board);
      return;
    }

    const firstStage = board.stages[0];



    createDealMutation.mutate(
      {
        title: `Deal - ${contact.name}`,
        contactId: contact.id,
        companyId: contact.companyId || undefined,
        boardId: board.id,
        status: firstStage.id, // status = stageId (UUID do stage)
        value: 0,
        probability: 0,
        priority: 'medium',
        tags: [],
        items: [],
        customFields: {},
        owner: { name: 'Eu', avatar: '' },
        isWon: false,
        isLost: false,
      },
      {
        onSuccess: () => {
          addToast(`Deal criado no board "${board.name}"`, 'success');
        },
        onError: (error: Error) => {
          addToast(`Erro ao criar deal: ${error.message}`, 'error');
        },
      }
    );
  };

  // Called from modal after board selection
  const createDealForContact = (boardId: string) => {
    const contact = contacts.find(c => c.id === createDealContactId);
    const board = boards.find(b => b.id === boardId);

    if (!contact || !board) {
      addToast('Erro ao criar deal', 'error');
      setCreateDealContactId(null);
      return;
    }

    createDealDirectly(contact.id, board);
    setCreateDealContactId(null);
  };

  // Update contact wrapper
  const updateContact = (contactId: string, data: Partial<Contact>) => {
    updateContactMutation.mutate({
      id: contactId,
      updates: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
        status: data.status,
        stage: data.stage,
      },
    });
  };

  // T030: Removed client-side filtering - now using server-side filters
  // contacts already comes filtered from the server
  const filteredContacts = contacts;

  // Filter companies
  const filteredCompanies = useMemo(() => {
    return companies.filter(
      c =>
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.industry || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [companies, search]);

  // Performance: O(1) lookups instead of calling `companies.find(...)` for every row render.
  const companyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) {
      if (c?.id) map.set(c.id, c.name || 'Empresa não vinculada');
    }
    return map;
  }, [companies]);

  const getCompanyName = useCallback(
    (clientCompanyId: string | undefined | null) => {
      if (!clientCompanyId) return 'Empresa não vinculada';
      return companyNameById.get(clientCompanyId) || 'Empresa não vinculada';
    },
    [companyNameById]
  );

  // T031: Stage counts from server (RPC)
  // Uses dedicated query for accurate totals across all contacts
  const { data: serverStageCounts = {} } = useContactStageCounts();

  // Transform to expected format with fallbacks
  const stageCounts = useMemo(
    () => ({
      LEAD: serverStageCounts.LEAD || 0,
      MQL: serverStageCounts.MQL || 0,
      PROSPECT: serverStageCounts.PROSPECT || 0,
      CUSTOMER: serverStageCounts.CUSTOMER || 0,
      OTHER: (serverStageCounts.CHURNED || 0) + (serverStageCounts.OTHER || 0),
    }),
    [serverStageCounts]
  );

  return {
    // State
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    stageFilter,
    setStageFilter,
    stageCounts,
    viewMode,
    setViewMode,
    isFilterOpen,
    setIsFilterOpen,
    dateRange,
    setDateRange,
    isModalOpen,
    setIsModalOpen,
    editingContact,
    isCompanyModalOpen,
    setIsCompanyModalOpen,
    editingCompany,
    setEditingCompany,
    deleteId,
    setDeleteId,
    deleteCompanyId,
    setDeleteCompanyId,
    deleteWithDeals,
    setDeleteWithDeals,
    bulkDeleteConfirm,
    setBulkDeleteConfirm,
    formData,
    setFormData,
    isSubmittingContact,
    isLoading,

    // T017-T020: Pagination state and handlers
    pagination,
    setPagination,
    totalCount,
    isFetching,
    isPlaceholderData,

    // Selection
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    clearSelection,

    // Sorting
    sortBy,
    sortOrder,
    handleSort,

    // Create Deal State
    createDealContactId,
    setCreateDealContactId,
    contactForDeal,
    boards,

    // Data
    contacts,
    companies,
    filteredContacts,
    filteredCompanies,

    // Actions
    openCreateModal,
    openEditModal,
    openEditCompanyModal,
    confirmDelete,
    confirmDeleteCompany,
    confirmDeleteWithDeals,
    handleSubmit,
    handleCompanySubmit,
    createFakeContactsBatch,
    getCompanyName,
    updateContact,
    convertContactToDeal,
    createDealForContact,
    confirmBulkDelete,
    addToast: addToast || showToast,
  };
};

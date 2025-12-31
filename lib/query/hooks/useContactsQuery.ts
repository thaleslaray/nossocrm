/**
 * TanStack Query hooks for Contacts - Supabase Edition
 *
 * Features:
 * - Real Supabase API calls
 * - Optimistic updates for instant UI feedback
 * - Automatic cache invalidation
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData, type QueryKey } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { contactsService, companiesService } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Contact, ContactStage, Company, PaginationState, PaginatedResponse, ContactsServerFilters } from '@/types';

function matchesContactsServerFilters(contact: Contact, filters?: ContactsServerFilters): boolean {
  if (!filters) return true;

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    const nameOk = (contact.name || '').toLowerCase().includes(q);
    const emailOk = (contact.email || '').toLowerCase().includes(q);
    if (!nameOk && !emailOk) return false;
  }

  if (filters.stage && filters.stage !== 'ALL') {
    if (contact.stage !== filters.stage) return false;
  }

  if (filters.status && filters.status !== 'ALL') {
    // In the DB, RISK is computed; in the client we can't reliably infer it.
    // We avoid optimistic inserts for RISK-filtered lists.
    if (filters.status === 'RISK') return false;
    if (contact.status !== filters.status) return false;
  }

  if (filters.dateStart) {
    if (Date.parse(contact.createdAt) < Date.parse(filters.dateStart)) return false;
  }
  if (filters.dateEnd) {
    if (Date.parse(contact.createdAt) > Date.parse(filters.dateEnd)) return false;
  }

  if (filters.clientCompanyId) {
    const id = contact.clientCompanyId || contact.companyId || '';
    if (id !== filters.clientCompanyId) return false;
  }

  return true;
}

// ============ QUERY HOOKS ============

export interface ContactsFilters {
  clientCompanyId?: string;
  /** @deprecated Use clientCompanyId instead */
  companyId?: string;
  stage?: ContactStage | string;
  status?: 'ACTIVE' | 'INACTIVE';
  search?: string;
}

/**
 * Hook to fetch all contacts with optional filters
 * Waits for auth to be ready before fetching to ensure RLS works correctly
 */
export const useContacts = (filters?: ContactsFilters) => {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: filters
      ? queryKeys.contacts.list(filters as Record<string, unknown>)
      : queryKeys.contacts.lists(),
    queryFn: async () => {
      const { data, error } = await contactsService.getAll();
      if (error) throw error;

      let contacts = data || [];

      // Apply client-side filters
      if (filters) {
        contacts = contacts.filter(contact => {
          // Support both clientCompanyId and deprecated companyId
          const filterCompanyId = filters.clientCompanyId || filters.companyId;
          if (filterCompanyId && contact.clientCompanyId !== filterCompanyId && contact.companyId !== filterCompanyId) return false;
          if (filters.stage && contact.stage !== filters.stage) return false;
          if (filters.status && contact.status !== filters.status) return false;
          if (filters.search) {
            const search = filters.search.toLowerCase();
            const matchName = (contact.name || '').toLowerCase().includes(search);
            const matchEmail = (contact.email || '').toLowerCase().includes(search);
            if (!matchName && !matchEmail) return false;
          }
          return true;
        });
      }

      return contacts;
    },
    staleTime: 2 * 60 * 1000,
    enabled: !authLoading && !!user, // Only fetch when auth is ready
  });
};

/**
 * Hook to fetch a single contact by ID
 */
export const useContact = (id: string | undefined) => {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.contacts.detail(id || ''),
    queryFn: async () => {
      const { data, error } = await contactsService.getAll();
      if (error) throw error;
      return (data || []).find(c => c.id === id) || null;
    },
    enabled: !authLoading && !!user && !!id,
  });
};

/**
 * Hook to fetch contacts by company (CRM client company)
 */
export const useContactsByCompany = (clientCompanyId: string) => {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.contacts.list({ clientCompanyId }),
    queryFn: async () => {
      const { data, error } = await contactsService.getAll();
      if (error) throw error;
      return (data || []).filter(c => c.clientCompanyId === clientCompanyId || c.companyId === clientCompanyId);
    },
    enabled: !authLoading && !!user && !!clientCompanyId,
  });
};

/**
 * Hook to fetch leads (contacts in LEAD stage)
 */
export const useLeadContacts = () => {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.contacts.list({ stage: 'LEAD' }),
    queryFn: async () => {
      const { data, error } = await contactsService.getAll();
      if (error) throw error;
      return (data || []).filter(c => c.stage === 'LEAD');
    },
    enabled: !authLoading && !!user,
  });
};

/**
 * Hook to fetch paginated contacts with server-side filters.
 * Uses keepPreviousData for smooth UX during page transitions.
 * 
 * @param pagination - Pagination state { pageIndex, pageSize }
 * @param filters - Optional server-side filters (search, stage, status, dateRange)
 * @returns Query result with paginated data
 * 
 * @example
 * ```tsx
 * const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
 * const { data, isFetching, isPlaceholderData } = useContactsPaginated(pagination, { stage: 'LEAD' });
 * 
 * // data.data = Contact[]
 * // data.totalCount = 10000
 * // data.hasMore = true
 * ```
 */
export const useContactsPaginated = (
  pagination: PaginationState,
  filters?: ContactsServerFilters
) => {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.contacts.paginated(pagination, filters),
    queryFn: async () => {
      const { data, error } = await contactsService.getAllPaginated(pagination, filters);
      if (error) throw error;
      return data!;
    },
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !authLoading && !!user,
  });
};

/**
 * Hook to fetch contact counts by stage (funnel).
 * Uses server-side RPC for efficient counting across all contacts.
 * 
 * @returns Query result with stage counts object
 * 
 * @example
 * ```tsx
 * const { data: stageCounts } = useContactStageCounts();
 * // stageCounts = { LEAD: 1500, MQL: 2041, PROSPECT: 800, ... }
 * ```
 */
export const useContactStageCounts = () => {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.contacts.stageCounts(),
    queryFn: async () => {
      const { data, error } = await contactsService.getStageCounts();
      if (error) throw error;
      return data || {};
    },
    staleTime: 30 * 1000, // 30 seconds - counts can be slightly stale
    enabled: !authLoading && !!user,
  });
};

/**
 * Hook to fetch all CRM companies
 */
export const useCompanies = () => {
  const { user, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: queryKeys.companies.lists(),
    queryFn: async () => {
      const { data, error } = await companiesService.getAll();
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - companies change less frequently
    enabled: !authLoading && !!user,
  });
};

// ============ MUTATION HOOKS ============

/**
 * Hook to create a new contact
 */
export const useCreateContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: Omit<Contact, 'id' | 'createdAt'>) => {
      // organization_id will be auto-set by trigger
      const { data, error } = await contactsService.create(contact);
      if (error) throw error;
      return data!;
    },
    onMutate: async newContact => {
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.all });
      const previousContacts = queryClient.getQueryData<Contact[]>(queryKeys.contacts.lists());

      const tempContact: Contact = {
        ...newContact,
        id: `temp-${Date.now()}`,
        createdAt: new Date().toISOString(),
      } as Contact;

      queryClient.setQueryData<Contact[]>(queryKeys.contacts.lists(), (old = []) => [
        tempContact,
        ...old,
      ]);

      // Also update paginated caches (Contacts page uses server-side pagination)
      const previousPaginated: Array<[QueryKey, PaginatedResponse<Contact> | undefined]> = [];
      const queries = queryClient.getQueriesData<PaginatedResponse<Contact>>({
        queryKey: queryKeys.contacts.all,
      });

      let touchedPaginated = 0;
      let skippedNotFirstPage = 0;
      let skippedFilters = 0;
      for (const [key, data] of queries) {
        if (!Array.isArray(key)) continue;
        if (key[1] !== 'paginated') continue;
        const paginationKey = key[2] as PaginationState | undefined;
        const filtersKey = key[3] as ContactsServerFilters | undefined;
        if (!paginationKey || paginationKey.pageIndex !== 0) { skippedNotFirstPage += 1; continue; }
        if (!matchesContactsServerFilters(tempContact, filtersKey)) { skippedFilters += 1; continue; }

        previousPaginated.push([key, data]);
        touchedPaginated += 1;

        queryClient.setQueryData<PaginatedResponse<Contact>>(key, (old) => {
          if (!old) {
            return {
              data: [tempContact],
              totalCount: 1,
              pageIndex: 0,
              pageSize: paginationKey.pageSize,
              hasMore: false,
            };
          }

          const already = old.data.some((c) => c.id === tempContact.id);
          if (already) return old;

          const insertAtStart = (filtersKey?.sortOrder || 'desc') === 'desc';
          const nextData = insertAtStart ? [tempContact, ...old.data] : [...old.data, tempContact];
          const trimmed = nextData.slice(0, old.pageSize);

          return {
            ...old,
            data: trimmed,
            totalCount: (old.totalCount ?? 0) + 1,
            hasMore: true,
          };
        });
      }

      return { previousContacts, previousPaginated, tempId: tempContact.id };
    },
    onError: (_error, _newContact, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(queryKeys.contacts.lists(), context.previousContacts);
      }

      if (context?.previousPaginated) {
        for (const [key, data] of context.previousPaginated as Array<[QueryKey, PaginatedResponse<Contact> | undefined]>) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSuccess: (data, _newContact, context) => {
      // Replace temp contact in any paginated caches we touched
      const tempId = (context as any)?.tempId as string | undefined;
      if (!tempId) return;

      const queries = queryClient.getQueriesData<PaginatedResponse<Contact>>({
        queryKey: queryKeys.contacts.all,
      });

      for (const [key, old] of queries) {
        if (!Array.isArray(key)) continue;
        if (key[1] !== 'paginated') continue;
        if (!old) continue;

        const idx = old.data.findIndex((c) => c.id === tempId);
        if (idx === -1) continue;
        queryClient.setQueryData<PaginatedResponse<Contact>>(key, (curr) => {
          if (!curr) return curr;
          const next = [...curr.data];
          next[idx] = data;
          return { ...curr, data: next };
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });
};

/**
 * Hook to update a contact
 */
export const useUpdateContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Contact> }) => {
      const { error } = await contactsService.update(id, updates);
      if (error) throw error;
      return { id, updates };
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.all });
      const previousContacts = queryClient.getQueryData<Contact[]>(queryKeys.contacts.lists());
      queryClient.setQueryData<Contact[]>(queryKeys.contacts.lists(), (old = []) =>
        old.map(contact => (contact.id === id ? { ...contact, ...updates } : contact))
      );
      const previousPaginated: Array<[QueryKey, PaginatedResponse<Contact> | undefined]> = [];
      const queries = queryClient.getQueriesData<PaginatedResponse<Contact>>({ queryKey: queryKeys.contacts.all });
      for (const [key, data] of queries) {
        if (!Array.isArray(key)) continue;
        if (key[1] !== 'paginated') continue;
        if (!data) continue;
        if (!data.data.some((c) => c.id === id)) continue;
        previousPaginated.push([key, data]);
        queryClient.setQueryData<PaginatedResponse<Contact>>(key, (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((c) => (c.id === id ? ({ ...c, ...updates } as Contact) : c)),
          };
        });
      }

      return { previousContacts, previousPaginated };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(queryKeys.contacts.lists(), context.previousContacts);
      }
      if (context?.previousPaginated) {
        for (const [key, data] of context.previousPaginated as Array<[QueryKey, PaginatedResponse<Contact> | undefined]>) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });
};

/**
 * Hook to update contact stage (lifecycle)
 */
export const useUpdateContactStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await contactsService.update(id, { stage });
      if (error) throw error;
      return { id, stage };
    },
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.all });
      const previousContacts = queryClient.getQueryData<Contact[]>(queryKeys.contacts.lists());
      queryClient.setQueryData<Contact[]>(queryKeys.contacts.lists(), (old = []) =>
        old.map(contact => (contact.id === id ? { ...contact, stage } : contact))
      );
      return { previousContacts };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(queryKeys.contacts.lists(), context.previousContacts);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });
};

/**
 * Hook to delete a contact
 */
export const useDeleteContact = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, forceDeleteDeals = false }: { id: string; forceDeleteDeals?: boolean }) => {
      if (forceDeleteDeals) {
        // Delete contact and all associated deals
        const { error } = await contactsService.deleteWithDeals(id);
        if (error) throw error;
      } else {
        // Try normal delete (will fail if has deals)
        const { error } = await contactsService.delete(id);
        if (error) throw error;
      }
      return id;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.all });
      const previousContacts = queryClient.getQueryData<Contact[]>(queryKeys.contacts.lists());
      queryClient.setQueryData<Contact[]>(queryKeys.contacts.lists(), (old = []) =>
        old.filter(contact => contact.id !== id)
      );
      const previousPaginated: Array<[QueryKey, PaginatedResponse<Contact> | undefined]> = [];
      const queries = queryClient.getQueriesData<PaginatedResponse<Contact>>({ queryKey: queryKeys.contacts.all });
      for (const [key, data] of queries) {
        if (!Array.isArray(key)) continue;
        if (key[1] !== 'paginated') continue;
        if (!data) continue;
        if (!data.data.some((c) => c.id === id)) continue;
        previousPaginated.push([key, data]);
        queryClient.setQueryData<PaginatedResponse<Contact>>(key, (old) => {
          if (!old) return old;
          const nextData = old.data.filter((c) => c.id !== id);
          return {
            ...old,
            data: nextData,
            totalCount: Math.max(0, (old.totalCount ?? 0) - 1),
          };
        });
      }

      return { previousContacts, previousPaginated };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousContacts) {
        queryClient.setQueryData(queryKeys.contacts.lists(), context.previousContacts);
      }
      if (context?.previousPaginated) {
        for (const [key, data] of context.previousPaginated as Array<[QueryKey, PaginatedResponse<Contact> | undefined]>) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      // Also invalidate deals since they reference contacts
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
    },
  });
};

/**
 * Bulk delete contacts with limited concurrency.
 * Rationale: sequential bulk deletes can take "forever" (N * delete latency).
 * This batches deletes and only invalidates once at the end to avoid refetch storms.
 */
export const useBulkDeleteContacts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      forceDeleteDeals = true,
      concurrency = 3,
    }: {
      ids: string[];
      forceDeleteDeals?: boolean;
      concurrency?: number;
    }) => {
      let successCount = 0;
      let errorCount = 0;

      const runBatch = async (batch: string[]) => {
        const results = await Promise.allSettled(
          batch.map(async (id) => {
            if (forceDeleteDeals) {
              const { error } = await contactsService.deleteWithDeals(id);
              if (error) throw error;
            } else {
              const { error } = await contactsService.delete(id);
              if (error) throw error;
            }
            return id;
          })
        );

        for (const r of results) {
          if (r.status === 'fulfilled') successCount += 1;
          else errorCount += 1;
        }
      };

      for (let i = 0; i < ids.length; i += concurrency) {
        const batch = ids.slice(i, i + concurrency);
        await runBatch(batch);
      }

      return { successCount, errorCount };
    },
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.contacts.all });
      const previousLists = queryClient.getQueryData<Contact[]>(queryKeys.contacts.lists());

      // Optimistically remove from list cache
      queryClient.setQueryData<Contact[]>(queryKeys.contacts.lists(), (old = []) =>
        old.filter((c) => !ids.includes(c.id))
      );

      // Optimistically remove from paginated caches
      const previousPaginated: Array<[QueryKey, PaginatedResponse<Contact> | undefined]> = [];
      const queries = queryClient.getQueriesData<PaginatedResponse<Contact>>({ queryKey: queryKeys.contacts.all });
      for (const [key, data] of queries) {
        if (!Array.isArray(key)) continue;
        if (key[1] !== 'paginated') continue;
        previousPaginated.push([key, data]);
        if (!data) continue;
        queryClient.setQueryData<PaginatedResponse<Contact>>(key, (old) => {
          if (!old) return old;
          const nextData = old.data.filter((c) => !ids.includes(c.id));
          const removed = old.data.length - nextData.length;
          return {
            ...old,
            data: nextData,
            totalCount: Math.max(0, (old.totalCount ?? 0) - removed),
          };
        });
      }

      return { previousLists, previousPaginated };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(queryKeys.contacts.lists(), context.previousLists);
      }
      if (context?.previousPaginated) {
        for (const [key, data] of context.previousPaginated as Array<[QueryKey, PaginatedResponse<Contact> | undefined]>) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
    },
  });
};

/**
 * Bulk delete companies with limited concurrency.
 * Note: company delete updates contacts/deals to unlink FK, so we invalidate related caches once at the end.
 */
export const useBulkDeleteCompanies = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ids,
      concurrency = 2,
    }: {
      ids: string[];
      concurrency?: number;
    }) => {
      let successCount = 0;
      let errorCount = 0;

      const runBatch = async (batch: string[]) => {
        const results = await Promise.allSettled(
          batch.map(async (id) => {
            const { error } = await companiesService.delete(id as string);
            if (error) throw error;
            return id;
          })
        );

        for (const r of results) {
          if (r.status === 'fulfilled') successCount += 1;
          else errorCount += 1;
        }
      };

      for (let i = 0; i < ids.length; i += concurrency) {
        const batch = ids.slice(i, i + concurrency);
        await runBatch(batch);
      }

      return { successCount, errorCount };
    },
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.companies.all });
      const previousCompanies = queryClient.getQueryData<Company[]>(queryKeys.companies.lists());

      // Optimistically remove from companies list cache
      queryClient.setQueryData<Company[]>(queryKeys.companies.lists(), (old = []) =>
        old.filter((c) => !ids.includes(c.id))
      );

      return { previousCompanies };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousCompanies) {
        queryClient.setQueryData(queryKeys.companies.lists(), context.previousCompanies);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
    },
  });
};

/**
 * Hook to check if contact has deals
 */
export const useContactHasDeals = () => {
  return useMutation({
    mutationFn: async (contactId: string) => {
      const result = await contactsService.hasDeals(contactId);
      if (result.error) throw result.error;
      return { hasDeals: result.hasDeals, dealCount: result.dealCount, deals: result.deals };
    },
  });
};

// ============ COMPANIES MUTATIONS ============

/**
 * Hook to create a new company
 */
export const useCreateCompany = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (company: Omit<Company, 'id' | 'createdAt'>) => {
      const { data, error } = await companiesService.create(company);
      if (error) throw error;
      return data!;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });
};

/**
 * Hook to update a company
 */
export const useUpdateCompany = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Company> }) => {
      const { error } = await companiesService.update(id, updates);
      if (error) throw error;
      return { id, updates };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });
};

/**
 * Hook to delete a company
 */
export const useDeleteCompany = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await companiesService.delete(id);
      if (error) throw error;
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    },
  });
};

// ============ UTILITY HOOKS ============

/**
 * Hook to prefetch a contact (for hover previews)
 */
export const usePrefetchContact = () => {
  const queryClient = useQueryClient();
  return async (id: string) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.contacts.detail(id),
      queryFn: async () => {
        const { data, error } = await contactsService.getAll();
        if (error) throw error;
        return (data || []).find(c => c.id === id) || null;
      },
      staleTime: 5 * 60 * 1000,
    });
  };
};

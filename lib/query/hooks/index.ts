/**
 * TanStack Query Hooks - Barrel Export
 *
 * All query and mutation hooks for FlowCRM entities
 * Now using Supabase as data source with Realtime support
 */

// Deals
export {
  useDeals,
  useDealsView,
  useDeal,
  useDealsByBoard,
  useCreateDeal,
  useUpdateDeal,
  useUpdateDealStatus,
  useDeleteDeal,
  useAddDealItem,
  useRemoveDealItem,
  useInvalidateDeals,
  usePrefetchDeal,
  type DealsFilters,
} from './useDealsQuery';

// Contacts
export {
  useContacts,
  useContactsPaginated,
  useContactStageCounts,
  useContact,
  useContactsByCompany,
  useLeadContacts,
  useCreateContact,
  useUpdateContact,
  useUpdateContactStage,
  useDeleteContact,
  useContactHasDeals,
  usePrefetchContact,
  type ContactsFilters,
} from './useContactsQuery';

// Companies
export {
  useCompanies,
  useCreateCompany,
  useUpdateCompany,
  useDeleteCompany,
} from './useContactsQuery';

// Activities
export {
  useActivities,
  useActivitiesByDeal,
  usePendingActivities,
  useTodayActivities,
  useCreateActivity,
  useUpdateActivity,
  useToggleActivity,
  useDeleteActivity,
  type ActivitiesFilters,
} from './useActivitiesQuery';

// Boards
export {
  useBoards,
  useBoard,
  useDefaultBoard,
  useCreateBoard,
  useUpdateBoard,
  useDeleteBoard,
  useAddBoardStage,
  useUpdateBoardStage,
  useDeleteBoardStage,
  useInvalidateBoards,
} from './useBoardsQuery';

// Unified Deal Movement
export {
  useMoveDeal,
  useMoveDealSimple,
} from './useMoveDeal';

// Agency Settings Module
export {
  useAgencyProfile,
  useUpsertAgencyProfile,
  useAgencyServices,
  useActiveAgencyServices,
  useCreateAgencyService,
  useUpdateAgencyService,
  useDeleteAgencyService,
  useToggleAgencyService,
  useInvalidateAgency,
} from './useAgencyQuery';

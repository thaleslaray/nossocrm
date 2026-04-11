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
  useCreateDealWithContact,
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

// Navigation prefetch
export { usePrefetchRoute } from './usePrefetchRoute';

// =============================================================================
// MESSAGING MODULE
// =============================================================================

// Business Units
export {
  useBusinessUnits,
  useBusinessUnitsWithCounts,
  useBusinessUnit,
  useBusinessUnitMembers,
  useCreateBusinessUnit,
  useUpdateBusinessUnit,
  useDeleteBusinessUnit,
  useAddBusinessUnitMembers,
  useRemoveBusinessUnitMembers,
} from './useBusinessUnitsQuery';

// Messaging Channels
export {
  useMessagingChannels,
  useMessagingChannelsByUnit,
  useMessagingChannelsByType,
  useConnectedChannels,
  useMessagingChannel,
  useCreateMessagingChannel,
  useUpdateMessagingChannel,
  useUpdateChannelStatus,
  useDeleteMessagingChannel,
} from './useMessagingChannelsQuery';

// Messaging Conversations
export {
  useMessagingConversations,
  useConversationsByChannel,
  useConversationsByContact,
  useMessagingConversation,
  useUnreadConversationCount,
  useUpdateConversation,
  useMarkConversationRead,
  useResolveConversation,
  useReopenConversation,
  useAssignConversation,
  useLinkConversationToContact,
} from './useMessagingConversationsQuery';

// Messaging Messages
export {
  useMessagingMessages,
  useMessagingMessagesInfinite,
  useMessagingMessage,
  useSendMessage,
  useSendTextMessage,
  useUpdateMessageStatus,
  useRetryMessage,
} from './useMessagingMessagesQuery';

// Messaging Templates (WhatsApp HSM)
export {
  useTemplatesQuery,
  useApprovedTemplatesQuery,
  useTemplateSyncMutation,
  useSendTemplateMutation,
} from './useTemplatesQuery';

// Contact Duplicates & Merge
export {
  useDuplicateContactsQuery,
  useMergeContactsMutation,
  type DuplicateGroup,
  type MergeResult,
} from './useDuplicateContactsQuery';

// Messaging Metrics
export {
  useMessagingMetricsQuery,
  type MessagingMetrics,
} from './useMessagingMetricsQuery';

// Org Members
export {
  useOrgMembersQuery,
  type OrgMember,
} from './useOrgMembersQuery';

// Lead Routing Rules
export {
  useLeadRoutingRules,
  useChannelsWithoutRoutingRules,
  useBoardsWithStages,
  useCreateLeadRoutingRule,
  useUpdateLeadRoutingRule,
  useDeleteLeadRoutingRule,
} from './useLeadRoutingRulesQuery';

// =============================================================================
// AI MODULE
// =============================================================================

// AI Agent Configuration
export {
  useAIConfigQuery,
  useUpdateAIConfigMutation,
  useAITemplatesQuery,
  useAITemplateQuery,
  type OrgAIConfig,
  type AITemplate,
  type TemplateStage,
} from './useAIConfigQuery';

// Pending Stage Advances (HITL)
export {
  usePendingAdvancesQuery,
  usePendingAdvanceCountQuery,
  useResolvePendingAdvanceMutation,
  type PendingAdvanceListItem,
  type ResolvePendingAdvanceParams,
} from './usePendingAdvancesQuery';

// Few-Shot Learning
export {
  useLearnedPatternsQuery,
  useLearnMutation,
  useClearPatternsMutation,
} from './useLearnedPatternsQuery';

// AI Metrics (Dashboard)
export {
  useAIMetricsQuery,
  useAIQuickStats,
  type AIMetrics,
  type AIConversationStats,
  type AIHITLStats,
} from './useAIMetricsQuery';

// =============================================================================
// SETTINGS / ORG MODULE
// =============================================================================

// Lifecycle Stages
export {
  useLifecycleStages,
  useCreateLifecycleStage,
  useUpdateLifecycleStage,
  useDeleteLifecycleStage,
  useReorderLifecycleStages,
} from './useLifecycleStagesQuery';

// Products
export {
  useProducts,
  useActiveProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from './useProductsQuery';

// Org Settings (user prefs + org AI config)
export {
  useOrgSettings,
  useUpdateUserSettings,
  useUpdateAISettings,
  useAIFeatureFlags,
  useSetAIFeatureFlag,
  type MergedOrgSettings,
  type OrgAISettings,
  type AIFeatureFlagsResponse,
} from './useOrgSettingsQuery';

// =============================================================================

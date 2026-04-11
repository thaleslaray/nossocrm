import { createQueryKeys, createExtendedQueryKeys } from './createQueryKeys';
import { PaginationState, ContactsServerFilters } from '@/types';
import type { ConversationFilters } from '@/lib/messaging/types';

/**
 * Query keys centralizadas para gerenciamento de cache.
 * 
 * Usar estas keys garante consistência na invalidação e prefetch.
 * Pattern: `queryKeys.entity.action(params)`
 * 
 * @example
 * ```typescript
 * // Invalidar todos os deals
 * queryClient.invalidateQueries({ queryKey: queryKeys.deals.all });
 * 
 * // Invalidar deals de um board específico
 * queryClient.invalidateQueries({ 
 *   queryKey: queryKeys.deals.list({ boardId: 'xxx' }) 
 * });
 * ```
 */
export const queryKeys = {
    // Standard entity keys (using factory)
    deals: createQueryKeys('deals'),

    // Contacts with custom extension for paginated queries and stage counts
    contacts: createExtendedQueryKeys('contacts', base => ({
        paginated: (pagination: PaginationState, filters?: ContactsServerFilters) =>
            [...base.all, 'paginated', pagination, filters] as const,
        stageCounts: () => [...base.all, 'stageCounts'] as const,
    })),

    companies: createQueryKeys('companies'),
    boards: createQueryKeys('boards'),

    // Activities with custom extension for byDeal
    activities: createExtendedQueryKeys('activities', base => ({
        byDeal: (dealId: string) => [...base.all, 'deal', dealId] as const,
    })),

    // Dashboard (non-standard structure)
    dashboard: {
        stats: ['dashboard', 'stats'] as const,
        funnel: ['dashboard', 'funnel'] as const,
        timeline: ['dashboard', 'timeline'] as const,
    },

    // =========================================================================
    // MESSAGING MODULE
    // =========================================================================

    /**
     * Business units query keys.
     * Used for organizational segmentation (sales, support, etc.)
     */
    businessUnits: createExtendedQueryKeys('businessUnits', base => ({
        /** All units with member counts */
        withCounts: () => [...base.all, 'withCounts'] as const,
        /** Members of a specific unit */
        members: (unitId: string) => [...base.all, 'members', unitId] as const,
    })),

    /**
     * Messaging channels query keys.
     * Channels are connected accounts (WhatsApp numbers, Instagram accounts, etc.)
     */
    messagingChannels: createExtendedQueryKeys('messagingChannels', base => ({
        /** Channels for a specific business unit */
        byUnit: (unitId: string) => [...base.all, 'byUnit', unitId] as const,
        /** Channels by type (whatsapp, instagram, etc.) */
        byType: (type: string) => [...base.all, 'byType', type] as const,
        /** Connected channels only */
        connected: () => [...base.all, 'connected'] as const,
    })),

    /**
     * Messaging conversations query keys.
     * Conversations are threads with external contacts.
     */
    messagingConversations: createExtendedQueryKeys('messagingConversations', base => ({
        /** Filtered conversations (inbox view) */
        filtered: (filters?: ConversationFilters) =>
          [...base.all, 'filtered',
            filters?.status ?? null,
            filters?.channelId ?? null,
            filters?.businessUnitId ?? null,
            filters?.assignedUserId ?? null,
            filters?.hasUnread ?? null,
            filters?.search ?? null,
            filters?.sortBy ?? null,
            filters?.sortOrder ?? null,
          ] as const,
        /** Conversations for a specific channel */
        byChannel: (channelId: string) => [...base.all, 'byChannel', channelId] as const,
        /** Conversations for a specific business unit */
        byUnit: (unitId: string) => [...base.all, 'byUnit', unitId] as const,
        /** Conversations for a specific contact */
        byContact: (contactId: string) => [...base.all, 'byContact', contactId] as const,
        /** Unread count */
        unreadCount: () => [...base.all, 'unreadCount'] as const,
    })),

    /**
     * Messaging messages query keys.
     * Individual messages within a conversation.
     */
    messagingMessages: createExtendedQueryKeys('messagingMessages', base => ({
        /** Messages in a conversation (paginated) */
        byConversation: (conversationId: string, pagination?: PaginationState) =>
            [...base.all, 'byConversation', conversationId, pagination] as const,
        /** Full-text search within a conversation */
        search: (conversationId: string | undefined, term: string) =>
            [...base.all, 'search', conversationId, term] as const,
    })),

    /**
     * Messaging templates query keys (WhatsApp HSM).
     */
    messagingTemplates: createExtendedQueryKeys('messagingTemplates', base => ({
        /** Templates for a specific channel */
        byChannel: (channelId: string) => [...base.all, 'byChannel', channelId] as const,
        /** Approved templates only */
        approved: (channelId: string) => [...base.all, 'approved', channelId] as const,
    })),

    /**
     * Contact duplicates query keys.
     */
    contactDuplicates: {
        all: ['contactDuplicates'] as const,
        list: (orgId: string) => ['contactDuplicates', orgId] as const,
    },

    /**
     * Messaging metrics query keys.
     */
    messagingMetrics: {
        all: ['messagingMetrics'] as const,
        byPeriod: (orgId: string, period: string, userId?: string) =>
            ['messagingMetrics', orgId, period, userId] as const,
    },

    /**
     * Organization members query keys (for filters/dropdowns).
     */
    orgMembers: {
        all: ['orgMembers'] as const,
        list: (orgId: string) => ['orgMembers', orgId] as const,
    },

    /**
     * Lead routing rules query keys.
     * Rules for automatic deal creation from messaging channels.
     */
    leadRoutingRules: createExtendedQueryKeys('leadRoutingRules', base => ({
        /** Channels without routing rules (for adding new rules) */
        channelsWithoutRules: () => [...base.all, 'channelsWithoutRules'] as const,
    })),

    /**
     * Boards with stages for destination selector.
     */
    boardsWithStages: createQueryKeys('boardsWithStages'),

    // =========================================================================
    // AI MODULE
    // =========================================================================

    /**
     * AI configuration query keys.
     * Configures autonomous AI agent per stage.
     */
    ai: {
        /** All AI configs */
        all: ['ai'] as const,
        /** Organization AI config (mode, template, learned patterns) */
        orgConfig: () => ['ai', 'orgConfig'] as const,
        /** Stage configs for a board */
        stageConfigs: (boardId: string | undefined) => ['ai', 'stageConfigs', boardId] as const,
        /** Config for a specific stage */
        stageConfig: (stageId: string | undefined) => ['ai', 'stageConfig', stageId] as const,
        /** AI conversation logs */
        logs: (conversationId: string) => ['ai', 'logs', conversationId] as const,
        /** Pending stage advances (HITL) */
        pendingAdvances: (dealId?: string) => ['ai', 'pendingAdvances', dealId] as const,
        /** Pending advances count */
        pendingAdvanceCount: () => ['ai', 'pendingAdvances', 'count'] as const,
        /** Meeting briefing for a deal */
        briefing: (dealId: string) => ['ai', 'briefing', dealId] as const,
        /** AI metrics for dashboard */
        metrics: (orgId: string) => ['ai', 'metrics', orgId] as const,
        /** Learned patterns from few-shot learning */
        learnedPatterns: ['ai', 'learnedPatterns'] as const,
    },

    /**
     * AI qualification templates query keys.
     */
    aiTemplates: createExtendedQueryKeys('aiTemplates', base => ({
        /** System templates only */
        system: () => [...base.all, 'system'] as const,
        /** Custom templates only */
        custom: () => [...base.all, 'custom'] as const,
    })),


    /**
     * Instance-level feature flags (operator-controlled, read-only for orgs).
     */
    instanceFlags: {
        all: ['instanceFlags'] as const,
        byOrg: (orgId: string) => ['instanceFlags', orgId] as const,
    },

    /**
     * Lifecycle stages query keys.
     */
    lifecycleStages: createQueryKeys('lifecycleStages'),

    /**
     * Products / catalog query keys.
     */
    products: createQueryKeys('products'),

    /**
     * Org-level + user settings query keys.
     */
    orgSettings: createQueryKeys('orgSettings'),
};

/**
 * Constante para a query key da view de deals (DealView[]).
 * Esta é a ÚNICA fonte de verdade para deals no Kanban e outras UIs.
 * Todos os pontos de escrita (mutations, Realtime, otimismo) devem usar esta key.
 * 
 * @example
 * ```typescript
 * // Leitura
 * const { data } = useQuery({ queryKey: DEALS_VIEW_KEY, ... });
 * 
 * // Escrita
 * queryClient.setQueryData<DealView[]>(DEALS_VIEW_KEY, ...);
 * ```
 */
export const DEALS_VIEW_KEY = [...queryKeys.deals.lists(), 'view'] as const;

import { z } from 'zod';

// Define Zod schemas for runtime validation
export const StageSchema = z.object({
    id: z.string(),
    name: z.string(),
});

export const AgentOptionsSchema = z.object({
    view: z.object({
        type: z.enum(['kanban', 'list', 'details', 'cockpit', 'global']),
        name: z.string().optional(),
        url: z.string().optional(),
    }).optional(),

    activeObject: z.object({
        type: z.enum(['deal', 'contact', 'board']),
        id: z.string(),
        name: z.string().optional(),
        status: z.string().optional(),
        value: z.number().optional(),
        metadata: z.object({
            boardId: z.string().optional(),
            stages: z.array(StageSchema).optional(),
            columns: z.string().optional(),
        }).catchall(z.any()).optional(),
    }).optional(),

    filters: z.record(z.string(), z.any()).optional(),
});

// Infer TypeScript types from Zod schemas
export type AgentOptions = z.infer<typeof AgentOptionsSchema>;
export type Stage = z.infer<typeof StageSchema>;

// Re-export ToolInvocation for convenience
export interface ToolInvocation {
    state: 'partial-call' | 'call' | 'result';
    toolCallId: string;
    toolName: string;
    args: any;
    result?: any;
}

// Call options for AI context
export interface CallOptions {
    user?: {
        id: string;
        name?: string;
        role?: string;
    };
    view?: {
        type: 'kanban' | 'list' | 'details' | 'cockpit' | 'global';
        name?: string;
        url?: string;
    };
    activeObject?: {
        type: 'deal' | 'contact' | 'board';
        id: string;
        name?: string;
        status?: string;
        value?: number;
        metadata?: Record<string, any>;
    };
    filters?: Record<string, any>;
    [key: string]: any;
}

// ============= AI SDK v6 Call Options Schema =============
// Schema for ToolLoopAgent's callOptionsSchema - type-safe context!
export const CRMCallOptionsSchema = z.object({
    // Multi-tenant security (REQUIRED): always injected server-side from profile
    // NEVER trust organizationId from the client.
    organizationId: z.string().uuid(),

    // Core IDs
    boardId: z.string().optional(),
    dealId: z.string().optional(),
    contactId: z.string().optional(),

    // Board Context (from useBoardsController)
    boardName: z.string().optional(),
    stages: z.array(StageSchema).optional(),

    // Metrics (for smarter AI responses)
    dealCount: z.number().optional(),
    pipelineValue: z.number().optional(),
    stagnantDeals: z.number().optional(),
    overdueDeals: z.number().optional(),

    // Board Config
    wonStage: z.string().optional(),
    lostStage: z.string().optional(),

    // Cockpit Context (snapshot rico vindo do painel/cockpit)
    // Mantido como any para evoluir sem quebrar compatibilidade.
    cockpitSnapshot: z.any().optional(),

    // User context
    userId: z.string().optional(),
    userName: z.string().optional(),
    userRole: z.enum(['admin', 'vendedor']).optional(),
});

// Infer type from schema for type-safety
export type CRMCallOptions = z.infer<typeof CRMCallOptionsSchema>;

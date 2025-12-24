import { z } from 'zod';

// Contratos (schemas) das rotas em `/api/ai/tasks/*`.

export const AnalyzeLeadOutputSchema = z.object({
  action: z.string().max(50),
  reason: z.string().max(80),
  actionType: z.enum(['CALL', 'MEETING', 'EMAIL', 'TASK', 'WHATSAPP']),
  urgency: z.enum(['low', 'medium', 'high']),
  probabilityScore: z.number().min(0).max(100),
});

export const DealForAnalysisInputSchema = z.object({
  title: z.string().optional(),
  value: z.number().optional(),
  status: z.string().optional(),
  probability: z.number().optional(),
  priority: z.any().optional(),
});

export const AnalyzeLeadInputSchema = z.object({
  deal: DealForAnalysisInputSchema,
  stageLabel: z.string().optional(),
});

export const GenerateEmailDraftInputSchema = z.object({
  deal: z.object({
    title: z.string().optional(),
    value: z.number().optional(),
    status: z.string().optional(),
    contactName: z.string().optional(),
    companyName: z.string().optional(),
  }),
  stageLabel: z.string().optional(),
});

export const GenerateTextOutputSchema = z.object({
  text: z.string(),
});

export const GenerateObjectionResponseInputSchema = z.object({
  deal: z.object({
    title: z.string().optional(),
    value: z.number().optional(),
  }),
  objection: z.string().min(1),
});

export const ObjectionResponseOutputSchema = z.object({
  responses: z.array(z.string()),
});

export const BoardStageSchema = z.object({
  name: z.string(),
  description: z.string(),
  color: z.string(),
  linkedLifecycleStage: z.string(),
  estimatedDuration: z.string().optional(),
});

export const BoardStructureOutputSchema = z.object({
  boardName: z.string(),
  description: z.string(),
  stages: z.array(BoardStageSchema),
  automationSuggestions: z.array(z.string()),
});

export const GenerateBoardStructureInputSchema = z.object({
  description: z.string().min(1),
  lifecycleStages: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .optional()
    .default([]),
});

export const BoardStrategyOutputSchema = z.object({
  goal: z.object({
    description: z.string(),
    kpi: z.string(),
    targetValue: z.string(),
  }),
  agentPersona: z.object({
    name: z.string(),
    role: z.string(),
    behavior: z.string(),
  }),
  entryTrigger: z.string(),
});

export const GenerateBoardStrategyInputSchema = z.object({
  boardData: z.object({
    boardName: z.string(),
    description: z.string().optional(),
    stages: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        color: z.string(),
        linkedLifecycleStage: z.string(),
        estimatedDuration: z.string().optional(),
      })
    ),
    automationSuggestions: z.array(z.string()).optional().default([]),
  }),
});

export const RefineBoardInputSchema = z.object({
  currentBoard: z.any(),
  userInstruction: z.string().min(1),
  chatHistory: z
    .array(z.object({ role: z.enum(['user', 'ai']), content: z.string() }))
    .optional(),
});

export const RefineBoardOutputSchema = z.object({
  message: z.string(),
  board: BoardStructureOutputSchema.nullable(),
});

export const GenerateDailyBriefingInputSchema = z.object({
  radarData: z.any(),
});

export const GenerateSalesScriptInputSchema = z.object({
  deal: z.object({
    title: z.string().optional(),
  }),
  scriptType: z.string().optional(),
  context: z.string().optional(),
});

export const SalesScriptOutputSchema = z.object({
  script: z.string(),
  scriptType: z.string().optional(),
  generatedFor: z.string().optional(),
});

/**
 * @fileoverview AI Agent Module
 *
 * Agente autônomo de vendas para o NossoCRM.
 * Processa mensagens automaticamente e move leads pelo funil.
 *
 * @module lib/ai/agent
 */

// Types
export type {
  StageAIConfig,
  StageAISettings,
  AIConversationLog,
  AIAction,
  LeadContext,
  AgentDecision,
  AgentProcessResult,
  AgentConfig,
  PromptParams,
} from './types';

export { DEFAULT_AGENT_CONFIG } from './types';

// Context Builder
export { buildLeadContext, formatContextForPrompt } from './context-builder';
export type { BuildContextParams } from './context-builder';

// Agent Service
export { processIncomingMessage } from './agent.service';
export type { ProcessMessageParams } from './agent.service';

// Stage Evaluator
export { evaluateStageAdvancement, StageAdvancementSchema } from './stage-evaluator';
export type {
  StageAdvancementEvaluation,
  EvaluateAdvancementParams,
  EvaluationResult,
} from './stage-evaluator';

// Secure Tools (Contextual Tool Collections pattern)
export {
  createSecureToolCollection,
  createAgentPermissions,
  createUserPermissions,
  ToolPermissionError,
  SearchDealsSchema,
  AdvanceStageSchema,
  SendMessageSchema,
  GetDealContextSchema,
  SearchContactsSchema,
} from './secure-tools';
export type {
  ToolContext,
  UserPermissions,
  ToolDefinition,
  UserEdits,
  ToolExecutionResult,
  SecureToolCollection,
} from './secure-tools';

// Adaptive Context (Adaptive Context Building pattern)
export {
  buildAdaptiveContext,
  getTimeOfDay,
  isWithinBusinessHours,
  createDefaultImplicitSignals,
} from './adaptive-context';
export type {
  ExplicitSignals,
  ImplicitSignals,
  ContextSignals,
  AdaptiveAgentContext,
  BuildAdaptiveContextParams,
} from './adaptive-context';

// Human-in-the-Loop (HITL) for stage advancement
export {
  determineHITLDecision,
  createPendingAdvance,
  resolvePendingAdvance,
  getPendingAdvances,
  countPendingAdvances,
  expireOldPendingAdvances,
  StageAdvanceSuggestionSchema,
  UserEditsSchema,
  PendingAdvanceSchema,
  DEFAULT_HITL_CONFIG,
} from './hitl-stage-advance';
export type {
  StageAdvanceSuggestion,
  UserEdits as HITLUserEdits,
  PendingAdvance,
  HITLConfig,
  HITLDecision,
  CreatePendingAdvanceParams,
  ResolvePendingAdvanceParams,
} from './hitl-stage-advance';

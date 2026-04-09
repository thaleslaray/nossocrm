/**
 * @fileoverview Structured Logging for AI Agent
 *
 * Logs AI agent events as JSON for parsing by Vercel Logs.
 * Format: console.info(JSON.stringify({ event, ...fields }))
 *
 * @module lib/ai/agent/structured-logger
 */

interface StructuredLogEvent {
  event: string;
  org_id?: string;
  conversation_id?: string;
  deal_id?: string;
  message_id?: string;
  action?: string;
  tokens_used?: number;
  model?: string;
  latency_ms?: number;
  error_code?: string;
  error_message?: string;
  reason?: string;
  retry_after_ms?: number;
  tokens_limit?: number;
  evaluation_confidence?: number;
  new_stage_id?: string;
  decision?: string;
  [key: string]: unknown;
}

/**
 * Log AI agent events as structured JSON.
 * Output format is compatible with Vercel Logs parsing.
 *
 * @example
 * logStructured({
 *   event: 'ai.response_generated',
 *   org_id: orgId,
 *   conversation_id: convId,
 *   deal_id: dealId,
 *   action: 'responded',
 *   tokens_used: 150,
 *   model: 'gemini-2.0-flash',
 *   latency_ms: 1234,
 * });
 */
export function logStructured(event: StructuredLogEvent): void {
  const now = new Date().toISOString();
  const log = {
    timestamp: now,
    ...event,
  };

  console.info(JSON.stringify(log));
}

/**
 * Log AI error with structured context.
 * @internal Used by agent.service.ts to track failures.
 */
export function logAIError(
  org_id: string,
  conversation_id: string,
  error_code: string,
  error_message: string,
  context?: Record<string, unknown>
): void {
  logStructured({
    event: 'ai.error',
    org_id,
    conversation_id,
    error_code,
    error_message,
    ...context,
  });
}

/**
 * Log successful AI response with metrics.
 * @internal Used by agent.service.ts after generateResponse succeeds.
 */
export function logAIResponse(
  org_id: string,
  conversation_id: string,
  deal_id: string,
  message_id: string | undefined,
  action: string,
  tokens_used: number | undefined,
  model: string,
  latency_ms: number,
  reason?: string
): void {
  logStructured({
    event: 'ai.response',
    org_id,
    conversation_id,
    deal_id,
    message_id,
    action,
    tokens_used,
    model,
    latency_ms,
    reason,
  });
}

/**
 * Log rate limit hit.
 * @internal Used by agent.service.ts on rate check failure.
 */
export function logRateLimit(
  org_id: string,
  conversation_id: string,
  retry_after_ms: number
): void {
  logStructured({
    event: 'ai.rate_limited',
    org_id,
    conversation_id,
    retry_after_ms,
  });
}

/**
 * Log token budget exhaustion.
 * @internal Used by agent.service.ts on budget check failure.
 */
export function logTokenBudgetExceeded(
  org_id: string,
  tokens_used: number,
  tokens_limit: number
): void {
  logStructured({
    event: 'ai.budget_exceeded',
    org_id,
    tokens_used,
    tokens_limit,
  });
}

/**
 * Log stage advancement evaluation.
 * @internal Used by stage-evaluator.ts after evaluation.
 */
export function logStageEvaluation(
  org_id: string,
  conversation_id: string,
  deal_id: string,
  evaluation_confidence: number,
  decision: 'advanced' | 'pending_confirmation' | 'skipped',
  new_stage_id?: string,
  tokens_used?: number
): void {
  logStructured({
    event: 'ai.stage_evaluation',
    org_id,
    conversation_id,
    deal_id,
    decision,
    evaluation_confidence,
    new_stage_id,
    tokens_used,
  });
}

/**
 * Log handoff to human.
 * @internal Used by agent.service.ts when handoff is triggered.
 */
export function logHandoff(
  org_id: string,
  conversation_id: string,
  deal_id: string,
  reason: string
): void {
  logStructured({
    event: 'ai.handoff',
    org_id,
    conversation_id,
    deal_id,
    reason,
  });
}

/**
 * Log AI initialization/configuration issues.
 * @internal Used by agent.service.ts on config failures.
 */
export function logAIInitError(
  org_id: string,
  error_code: string,
  error_message: string
): void {
  logStructured({
    event: 'ai.init_error',
    org_id,
    error_code,
    error_message,
  });
}

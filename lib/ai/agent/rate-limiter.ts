/**
 * @fileoverview Database-backed rate limiter for AI calls.
 *
 * Uses ai_conversation_log as source of truth instead of an in-memory Map,
 * making it safe for Vercel serverless where each invocation may run on a
 * different instance.
 *
 * The legacy in-memory helpers (checkRateLimit / recordRateCall) are preserved
 * for backward compatibility but are no longer used by agent.service.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_MAX_CALLS = 5;

// =============================================================================
// Database-backed implementation (production)
// =============================================================================

/**
 * Check if a conversation has exceeded the rate limit using ai_conversation_log
 * as the source of truth. Safe across Vercel serverless instances.
 *
 * @param supabase - Supabase client (service-role or anon with RLS)
 * @param conversationId - The conversation to check
 * @param maxCallsPerMinute - Maximum AI calls allowed per minute (default 5)
 * @returns { allowed, remainingCalls } — remainingCalls is 0 when not allowed
 */
export async function checkConversationRateLimit(
  supabase: SupabaseClient,
  conversationId: string,
  maxCallsPerMinute = DEFAULT_MAX_CALLS
): Promise<{ allowed: boolean; remainingCalls: number }> {
  const { count, error } = await supabase
    .from('ai_conversation_log')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .gte('created_at', new Date(Date.now() - 60 * 1000).toISOString());

  if (error) {
    // Fail open: if we can't read the log, allow the call
    console.error('[RateLimiter] Failed to read ai_conversation_log:', error);
    return { allowed: true, remainingCalls: maxCallsPerMinute };
  }

  const callsInWindow = count ?? 0;

  if (callsInWindow >= maxCallsPerMinute) {
    return { allowed: false, remainingCalls: 0 };
  }

  return { allowed: true, remainingCalls: maxCallsPerMinute - callsInWindow };
}

// =============================================================================
// Legacy in-memory helpers (kept for test compatibility only)
// =============================================================================

const DEFAULT_WINDOW_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const callTimestamps = new Map<string, number[]>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of callTimestamps.entries()) {
      const fresh = timestamps.filter(
        (t) => now - t < DEFAULT_WINDOW_MS * 2
      );
      if (fresh.length === 0) {
        callTimestamps.delete(key);
      } else {
        callTimestamps.set(key, fresh);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * @deprecated Use checkConversationRateLimit() with a Supabase client instead.
 * Kept for unit test compatibility.
 */
export function checkRateLimit(
  conversationId: string,
  maxCalls = DEFAULT_MAX_CALLS,
  windowMs = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterMs?: number } {
  ensureCleanupTimer();

  const now = Date.now();
  const timestamps = callTimestamps.get(conversationId) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxCalls) {
    const oldestInWindow = recent[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}

/**
 * @deprecated Use checkConversationRateLimit() which reads directly from the DB log.
 * Kept for unit test compatibility.
 */
export function recordRateCall(
  conversationId: string,
  windowMs = DEFAULT_WINDOW_MS
): void {
  const now = Date.now();
  const timestamps = callTimestamps.get(conversationId) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);
  recent.push(now);
  callTimestamps.set(conversationId, recent);
}

/**
 * @fileoverview Simple in-memory rate limiter for AI calls.
 *
 * Uses a sliding window per conversation to prevent spam.
 * Acceptable for single-process deployments (MVP).
 */

const DEFAULT_MAX_CALLS = 5;
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const callTimestamps = new Map<string, number[]>();

// Periodic cleanup of stale entries
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

  // Don't block process exit
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check if a conversation has exceeded the rate limit.
 * Does NOT record the call — call `recordRateCall()` after successful processing.
 *
 * @returns `{ allowed: true }` if OK, `{ allowed: false, retryAfterMs }` if rate limited
 */
export function checkRateLimit(
  conversationId: string,
  maxCalls = DEFAULT_MAX_CALLS,
  windowMs = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterMs?: number } {
  ensureCleanupTimer();

  const now = Date.now();
  const timestamps = callTimestamps.get(conversationId) || [];

  // Filter to only timestamps within the window
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxCalls) {
    const oldestInWindow = recent[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}

/**
 * Record a successful AI call for rate limiting purposes.
 * Call this AFTER the AI generation succeeds to avoid exhausting the limit on failures.
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

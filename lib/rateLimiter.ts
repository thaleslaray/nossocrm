/**
 * In-memory sliding-window rate limiter for the Public API.
 *
 * Keyed by API key ID. Not distributed — counts are per Vercel instance.
 * Acceptable for single-tenant CRM MVP; upgrade to Upstash Redis if
 * multi-instance coordination becomes necessary.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;  // 60 req/min per API key

interface WindowEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, WindowEntry>();
let lastCleanup = Date.now();

function maybeCleanup(now: number): void {
  if (now - lastCleanup < 5 * 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. Only meaningful when allowed === false. */
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  maybeCleanup(now);

  const entry = store.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    const retryAfterMs = WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

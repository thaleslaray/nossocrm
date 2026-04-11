/**
 * In-memory TTL cache for messaging_conversations.
 *
 * Problem: app/api/messaging/messages/route.ts queries messaging_conversations
 * on every send to get channel info and external_contact_id (~150ms).
 * For active conversations this query is redundant — the data rarely changes.
 *
 * Solution: Cache conversation + channel data in a Node.js module-level Map.
 * Subsequent sends to the same conversation skip the DB query entirely.
 *
 * TTL: 5 minutes. Conversations can be invalidated explicitly on mutation.
 */

interface CachedConversation {
  id: string;
  organization_id: string;
  external_contact_id: string;
  channel: {
    id: string;
    channel_type: string;
    provider: string;
  };
  cachedAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

// Module-level Map — persists across requests within the same Node.js instance.
const cache = new Map<string, CachedConversation>();

/** Returns a cached conversation, or undefined on miss/expiry. */
export function getConversationCache(
  conversationId: string,
  orgId: string,
): CachedConversation | undefined {
  const entry = cache.get(conversationId);
  if (!entry) return undefined;

  // Evict if expired or if the org doesn't match (defense-in-depth)
  if (Date.now() - entry.cachedAt > TTL_MS || entry.organization_id !== orgId) {
    cache.delete(conversationId);
    return undefined;
  }

  return entry;
}

/** Stores a conversation in the cache. */
export function setConversationCache(entry: Omit<CachedConversation, 'cachedAt'>): void {
  cache.set(entry.id, { ...entry, cachedAt: Date.now() });
}

/** Removes a conversation from the cache (call on update/delete). */
export function invalidateConversationCache(conversationId: string): void {
  cache.delete(conversationId);
}

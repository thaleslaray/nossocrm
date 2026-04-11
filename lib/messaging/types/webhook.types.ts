/**
 * @fileoverview Messaging Webhook Types
 *
 * Types for webhook event storage and processing.
 * Webhooks are used to receive events from messaging providers.
 *
 * @module lib/messaging/types/webhook
 */

// =============================================================================
// DATABASE INTERFACES (snake_case)
// =============================================================================

/**
 * Database representation of a webhook event.
 */
export interface DbMessagingWebhookEvent {
  id: string;
  channel_id: string;
  event_type: string;
  external_event_id: string | null;
  payload: unknown;
  processed: boolean;
  processed_at: string | null;
  error: string | null;
  retry_count: number;
  created_at: string;
}

// =============================================================================
// APP INTERFACES (camelCase)
// =============================================================================

/**
 * App-level representation of a webhook event.
 */
export interface MessagingWebhookEvent {
  id: string;
  channelId: string;
  eventType: string;
  externalEventId?: string;
  payload: unknown;
  processed: boolean;
  processedAt?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
}

/**
 * Webhook processing status.
 */
export type WebhookProcessingStatus =
  | 'pending'    // Waiting to be processed
  | 'processing' // Currently being processed
  | 'completed'  // Successfully processed
  | 'failed'     // Failed to process
  | 'skipped';   // Skipped (duplicate, invalid, etc.)

/**
 * Webhook processing result.
 */
export interface WebhookProcessingResult {
  status: WebhookProcessingStatus;
  /** ID of created/updated conversation */
  conversationId?: string;
  /** ID of created message */
  messageId?: string;
  /** Error message if failed */
  error?: string;
  /** Whether to retry on failure */
  shouldRetry?: boolean;
}

// =============================================================================
// TRANSFORMATION FUNCTIONS
// =============================================================================

/**
 * Transform database webhook event to app webhook event.
 */
export function transformWebhookEvent(db: DbMessagingWebhookEvent): MessagingWebhookEvent {
  return {
    id: db.id,
    channelId: db.channel_id,
    eventType: db.event_type,
    externalEventId: db.external_event_id ?? undefined,
    payload: db.payload,
    processed: db.processed,
    processedAt: db.processed_at ?? undefined,
    error: db.error ?? undefined,
    retryCount: db.retry_count,
    createdAt: db.created_at,
  };
}

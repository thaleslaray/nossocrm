/**
 * @fileoverview Lead Routing Rules Types
 *
 * Types for configuring automatic lead/deal creation when messages arrive.
 * Maps channels → boards/stages for automatic deal creation.
 */

// =============================================================================
// DATABASE TYPES
// =============================================================================

/**
 * Database row shape for lead_routing_rules table.
 */
export interface DbLeadRoutingRule {
  id: string;
  organization_id: string;
  channel_id: string;
  board_id: string | null;
  stage_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// APPLICATION TYPES
// =============================================================================

/**
 * Lead routing rule with camelCase properties.
 */
export interface LeadRoutingRule {
  id: string;
  organizationId: string;
  channelId: string;
  boardId: string | null;
  stageId: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lead routing rule with denormalized data for UI display.
 */
export interface LeadRoutingRuleView extends LeadRoutingRule {
  // Channel info
  channelName: string;
  channelType: string;
  channelExternalId: string;

  // Business Unit info (from channel)
  businessUnitId: string;
  businessUnitName: string;

  // Board info (if configured)
  boardName: string | null;

  // Stage info (if configured)
  stageName: string | null;
  stagePosition: number | null;
}

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Input for creating a new lead routing rule.
 */
export interface CreateLeadRoutingRuleInput {
  channelId: string;
  boardId?: string | null;
  stageId?: string | null;
  enabled?: boolean;
}

/**
 * Input for updating an existing lead routing rule.
 */
export interface UpdateLeadRoutingRuleInput {
  boardId?: string | null;
  stageId?: string | null;
  enabled?: boolean;
}

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Filters for querying lead routing rules.
 */
export interface LeadRoutingRuleFilters {
  channelId?: string;
  businessUnitId?: string;
  enabled?: boolean;
}

// =============================================================================
// TRANSFORMERS
// =============================================================================

/**
 * Transform database row to application type.
 */
export function transformLeadRoutingRule(db: DbLeadRoutingRule): LeadRoutingRule {
  return {
    id: db.id,
    organizationId: db.organization_id,
    channelId: db.channel_id,
    boardId: db.board_id,
    stageId: db.stage_id,
    enabled: db.enabled,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

/**
 * Transform application type to database row (for inserts/updates).
 */
export function transformLeadRoutingRuleToDb(
  rule: CreateLeadRoutingRuleInput | UpdateLeadRoutingRuleInput
): Partial<DbLeadRoutingRule> {
  const db: Partial<DbLeadRoutingRule> = {};

  if ('channelId' in rule && rule.channelId !== undefined) {
    db.channel_id = rule.channelId;
  }
  if (rule.boardId !== undefined) {
    db.board_id = rule.boardId;
  }
  if (rule.stageId !== undefined) {
    db.stage_id = rule.stageId;
  }
  if (rule.enabled !== undefined) {
    db.enabled = rule.enabled;
  }

  return db;
}

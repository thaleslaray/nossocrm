/**
 * @fileoverview Business Unit Types
 *
 * Types for business units (organizational segmentation).
 * Business units segment the organization into logical groups
 * (e.g., "Vendas", "Suporte", "Marketing").
 *
 * @module lib/business-units/types
 */

// =============================================================================
// DATABASE INTERFACES (snake_case - match DB schema)
// =============================================================================

/**
 * Database representation of a business unit.
 */
export interface DbBusinessUnit {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  description: string | null;
  auto_create_deal: boolean;
  default_board_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Database representation of a business unit member.
 */
export interface DbBusinessUnitMember {
  id: string;
  business_unit_id: string;
  user_id: string;
  created_at: string;
}

// =============================================================================
// APP INTERFACES (camelCase - for React components)
// =============================================================================

/**
 * App-level representation of a business unit.
 */
export interface BusinessUnit {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  description?: string;
  autoCreateDeal: boolean;
  defaultBoardId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  /** Member count (when fetched with counts) */
  memberCount?: number;
  /** Channel count (when fetched with counts) */
  channelCount?: number;
}

/**
 * Business unit member with profile info.
 */
export interface BusinessUnitMember {
  id: string;
  businessUnitId: string;
  userId: string;
  createdAt: string;
  /** Profile info (when joined) */
  profile?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    role: string;
  };
}

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Input for creating a new business unit.
 */
export interface CreateBusinessUnitInput {
  key: string;
  name: string;
  description?: string;
  autoCreateDeal?: boolean;
  defaultBoardId?: string;
}

/**
 * Input for updating a business unit.
 */
export interface UpdateBusinessUnitInput {
  key?: string;
  name?: string;
  description?: string;
  autoCreateDeal?: boolean;
  defaultBoardId?: string;
}

// =============================================================================
// TRANSFORMATION FUNCTIONS
// =============================================================================

/**
 * Transform database business unit to app business unit.
 */
export function transformBusinessUnit(
  db: DbBusinessUnit & { member_count?: number; channel_count?: number }
): BusinessUnit {
  return {
    id: db.id,
    organizationId: db.organization_id,
    key: db.key,
    name: db.name,
    description: db.description ?? undefined,
    autoCreateDeal: db.auto_create_deal,
    defaultBoardId: db.default_board_id ?? undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deletedAt: db.deleted_at ?? undefined,
    memberCount: db.member_count,
    channelCount: db.channel_count,
  };
}

/**
 * Transform app input to database format.
 */
export function transformBusinessUnitToDb(
  input: CreateBusinessUnitInput | UpdateBusinessUnitInput,
  organizationId?: string
): Partial<DbBusinessUnit> {
  const db: Partial<DbBusinessUnit> = {};

  if ('key' in input && input.key !== undefined) {
    db.key = input.key;
  }
  if ('name' in input && input.name !== undefined) {
    db.name = input.name;
  }
  if ('description' in input) {
    db.description = input.description ?? null;
  }
  if ('autoCreateDeal' in input && input.autoCreateDeal !== undefined) {
    db.auto_create_deal = input.autoCreateDeal;
  }
  if ('defaultBoardId' in input) {
    db.default_board_id = input.defaultBoardId ?? null;
  }
  if (organizationId) {
    db.organization_id = organizationId;
  }

  return db;
}

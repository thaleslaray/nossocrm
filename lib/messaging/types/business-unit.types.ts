/**
 * @fileoverview Business Unit Types
 *
 * Types for business units - organizational segments that own
 * messaging channels and conversations.
 *
 * @module lib/messaging/types/business-unit
 */

// =============================================================================
// DATABASE INTERFACES (snake_case)
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
// APP INTERFACES (camelCase)
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
}

/**
 * Business unit with additional info for display.
 */
export interface BusinessUnitView extends BusinessUnit {
  /** Number of members */
  memberCount: number;
  /** Number of channels */
  channelCount: number;
  /** Number of open conversations */
  openConversationCount: number;
  /** Default board name */
  defaultBoardName?: string;
}

/**
 * Business unit member.
 */
export interface BusinessUnitMember {
  id: string;
  businessUnitId: string;
  userId: string;
  createdAt: string;
  /** Denormalized user info */
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
}

// =============================================================================
// INPUT/FORM TYPES
// =============================================================================

/**
 * Input for creating a business unit.
 */
export interface CreateBusinessUnitInput {
  key: string;
  name: string;
  description?: string;
  autoCreateDeal?: boolean;
  defaultBoardId?: string;
  /** Initial member user IDs */
  memberIds?: string[];
}

/**
 * Input for updating a business unit.
 */
export interface UpdateBusinessUnitInput {
  key?: string;
  name?: string;
  description?: string | null;
  autoCreateDeal?: boolean;
  defaultBoardId?: string | null;
}

/**
 * Input for managing business unit members.
 */
export interface ManageMembersInput {
  businessUnitId: string;
  addUserIds?: string[];
  removeUserIds?: string[];
}

// =============================================================================
// TRANSFORMATION FUNCTIONS
// =============================================================================

/**
 * Transform database business unit to app business unit.
 */
export function transformBusinessUnit(db: DbBusinessUnit): BusinessUnit {
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
  };
}

/**
 * Transform app business unit input to database format.
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

/**
 * Validate business unit key (slug).
 * Must be lowercase, alphanumeric with hyphens, 2-50 chars.
 */
export function validateBusinessUnitKey(key: string): { valid: boolean; error?: string } {
  if (!key || key.length < 2) {
    return { valid: false, error: 'Key deve ter no mínimo 2 caracteres' };
  }
  if (key.length > 50) {
    return { valid: false, error: 'Key deve ter no máximo 50 caracteres' };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
    return {
      valid: false,
      error: 'Key deve conter apenas letras minúsculas, números e hífens',
    };
  }
  return { valid: true };
}

/**
 * Generate a slug from a name.
 */
export function generateBusinessUnitKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, '')         // Remove leading/trailing hyphens
    .slice(0, 50);                   // Max 50 chars
}

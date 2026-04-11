/**
 * @fileoverview Messaging Template Types
 *
 * Types for WhatsApp message templates (HSM - Highly Structured Messages).
 * Templates must be pre-approved by Meta before use outside the 24h window.
 *
 * @module lib/messaging/types/template
 */

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

/**
 * Template category (affects pricing and approval).
 */
export type TemplateCategory = 'marketing' | 'utility' | 'authentication';

/**
 * Template approval status.
 */
export type TemplateStatus = 'pending' | 'approved' | 'rejected' | 'paused';

/**
 * Human-readable labels for template categories (PT-BR).
 */
export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  marketing: 'Marketing',
  utility: 'Utilidade',
  authentication: 'Autenticação',
} as const;

/**
 * Human-readable labels for template statuses (PT-BR).
 */
export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  paused: 'Pausado',
} as const;

/**
 * Colors for template status badges.
 */
export const TEMPLATE_STATUS_COLORS: Record<TemplateStatus, string> = {
  pending: 'bg-yellow-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  paused: 'bg-gray-500',
} as const;

// =============================================================================
// DATABASE INTERFACES (snake_case)
// =============================================================================

/**
 * Database representation of a message template.
 */
export interface DbMessagingTemplate {
  id: string;
  channel_id: string;
  external_id: string | null;
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
  status: TemplateStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// APP INTERFACES (camelCase)
// =============================================================================

/**
 * App-level representation of a message template.
 */
export interface MessagingTemplate {
  id: string;
  channelId: string;
  externalId?: string;
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
  status: TemplateStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Template component (header, body, footer, buttons).
 */
export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: TemplateExample;
  buttons?: TemplateButton[];
}

/**
 * Template example (for variable placeholders).
 */
export interface TemplateExample {
  headerText?: string[];
  bodyText?: string[][];
  headerHandle?: string[];
}

/**
 * Template button.
 */
export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';
  text: string;
  url?: string;
  phoneNumber?: string;
  example?: string[];
}

// =============================================================================
// INPUT/FORM TYPES
// =============================================================================

/**
 * Input for creating a template (for future use - templates are synced from Meta).
 */
export interface CreateTemplateInput {
  channelId: string;
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
}

/**
 * Parameters for sending a template.
 */
export interface SendTemplateInput {
  conversationId: string;
  templateId: string;
  /** Parameter values for each component */
  parameters: TemplateParameterValues;
}

/**
 * Parameter values grouped by component type.
 */
export interface TemplateParameterValues {
  header?: TemplateParameterValue[];
  body?: TemplateParameterValue[];
  buttons?: { index: number; parameters: TemplateParameterValue[] }[];
}

/**
 * Single parameter value.
 */
export interface TemplateParameterValue {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { code: string; amount: number };
  dateTime?: { fallbackValue: string };
  image?: { link: string };
  document?: { link: string; filename?: string };
  video?: { link: string };
}

// =============================================================================
// TRANSFORMATION FUNCTIONS
// =============================================================================

/**
 * Transform database template to app template.
 */
export function transformTemplate(db: DbMessagingTemplate): MessagingTemplate {
  return {
    id: db.id,
    channelId: db.channel_id,
    externalId: db.external_id ?? undefined,
    name: db.name,
    language: db.language,
    category: db.category,
    components: db.components,
    status: db.status,
    rejectionReason: db.rejection_reason ?? undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

/**
 * Count template variables in text.
 * Variables are in format {{1}}, {{2}}, etc.
 */
export function countTemplateVariables(text: string): number {
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

/**
 * Replace template variables with values.
 */
export function replaceTemplateVariables(text: string, values: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, index) => {
    const i = parseInt(index, 10) - 1; // Variables are 1-indexed
    return values[i] ?? `{{${index}}}`;
  });
}

/**
 * Get preview text for a template.
 */
export function getTemplatePreview(template: MessagingTemplate): string {
  const bodyComponent = template.components.find((c) => c.type === 'BODY');
  if (bodyComponent?.text) {
    return bodyComponent.text.slice(0, 150);
  }
  return `[Template: ${template.name}]`;
}

/**
 * Check if template requires parameters.
 */
export function templateRequiresParameters(template: MessagingTemplate): boolean {
  return template.components.some((c) => {
    if (c.text && countTemplateVariables(c.text) > 0) return true;
    if (c.format && c.format !== 'TEXT') return true;
    return false;
  });
}

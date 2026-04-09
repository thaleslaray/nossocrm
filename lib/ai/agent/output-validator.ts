/**
 * @fileoverview Output Validator for AI Agent
 *
 * Validates LLM-generated responses before sending to leads via WhatsApp/Instagram.
 * Checks for: system prompt leakage, PII exposure, excessive length, and safety issues.
 *
 * @module lib/ai/agent/output-validator
 */

import type { LeadContext } from './types';
import { logStructured } from './structured-logger';

// =============================================================================
// Constants
// =============================================================================

/** WhatsApp message character limit */
const MAX_RESPONSE_LENGTH = 4096;

/** Generic fallback when output is deemed unsafe */
const FALLBACK_RESPONSE = 'Obrigado pelo contato! Nossa equipe retornará em breve.';

// =============================================================================
// Leakage Detection Patterns
// =============================================================================

/**
 * Patterns that suggest the LLM leaked its system prompt or revealed it is an AI.
 * These catch common phrasings in Portuguese and English.
 */
const LEAKAGE_PATTERNS: Array<[RegExp, string]> = [
  // System prompt leakage
  [/minha[s]?\s+(instrução|instruções|regra|regras|diretiva|prompt)\s+(é|são|diz|dizem)/iu, 'leaked_instructions_pt'],
  [/my\s+(instructions?|rules?|directives?|prompt)\s+(is|are|says?|tells?)/iu, 'leaked_instructions_en'],
  [/fui\s+(programado|configurado|instruído)\s+(para|a)\s/iu, 'revealed_programming_pt'],
  [/i\s+(was|am)\s+(programmed|configured|instructed)\s+to\s/iu, 'revealed_programming_en'],
  [/como\s+(uma?\s+)?(IA|inteligência\s+artificial|modelo\s+de\s+linguagem|LLM|chatbot|assistente\s+virtual)/iu, 'revealed_ai_identity_pt'],
  [/as\s+an?\s+(AI|artificial\s+intelligence|language\s+model|LLM|chatbot|virtual\s+assistant)/iu, 'revealed_ai_identity_en'],
  [/sou\s+(uma?\s+)?(IA|inteligência\s+artificial|robô|bot|modelo|programa)/iu, 'declared_ai_pt'],
  [/i\s+am\s+an?\s+(AI|artificial\s+intelligence|robot|bot|model|program)/iu, 'declared_ai_en'],
  [/não\s+(sou|tenho)\s+(humano|pessoa|sentimentos)/iu, 'denied_humanity_pt'],

  // Prompt/instruction dump (detects blocks of rules being repeated)
  [/REGRA[S]?\s+(IMPORTANTE|DE\s+SEGURANÇA)[S]?.*:/iu, 'rules_dump_pt'],
  [/(IMPORTANT|SECURITY)\s+RULES?.*:/iu, 'rules_dump_en'],
  [/INSTRUÇÃO\s+ESPECÍFICA.*:/iu, 'instruction_dump_pt'],
];

// =============================================================================
// PII Detection
// =============================================================================

/**
 * Check if the response exposes PII from the lead context verbatim.
 * We only flag PII that comes from the CONTEXT (not from what the lead themselves sent).
 * E.g., if the AI response repeats the lead's email from context, that's a leak.
 */
function detectPIILeak(
  response: string,
  context: LeadContext
): string[] {
  const leaks: string[] = [];

  const contact = context.contact;
  if (!contact) return leaks;

  // Check email leak (only if present in context)
  if (contact.email) {
    // Exact match of email in response
    if (response.toLowerCase().includes(contact.email.toLowerCase())) {
      leaks.push(`email:${maskPII(contact.email)}`);
    }
  }

  // Check phone leak (normalize both for comparison)
  if (contact.phone) {
    const normalizedPhone = contact.phone.replace(/[\s\-\(\)+]/g, '');
    const normalizedResponse = response.replace(/[\s\-\(\)+]/g, '');
    // Only flag if the full phone number (7+ digits) appears
    if (normalizedPhone.length >= 7 && normalizedResponse.includes(normalizedPhone)) {
      leaks.push(`phone:${maskPII(contact.phone)}`);
    }
  }

  // Check deal value leak (only flag if it's a specific number, not generic)
  if (context.deal?.value && context.deal.value > 0) {
    const valueStr = context.deal.value.toString();
    // Only flag values with 3+ digits to avoid false positives on short numbers
    if (valueStr.length >= 3 && response.includes(valueStr)) {
      leaks.push(`deal_value:${valueStr.substring(0, 2)}***`);
    }
  }

  return leaks;
}

/**
 * Mask PII for logging — show only first 3 chars.
 */
function maskPII(value: string): string {
  if (value.length <= 3) return '***';
  return value.substring(0, 3) + '***';
}

// =============================================================================
// Public API
// =============================================================================

export interface ValidationResult {
  /** Whether the response passed all safety checks */
  safe: boolean;
  /** The response to use (original if safe, fallback if not) */
  response: string;
  /** Reasons the response was flagged (empty if safe) */
  issues: string[];
}

/**
 * Validates an AI-generated response before it is sent to a lead.
 *
 * Checks:
 * 1. System prompt / AI identity leakage
 * 2. Maximum length (WhatsApp limit)
 * 3. PII from context appearing verbatim in response
 * 4. Empty or nonsensical response
 *
 * @param response  Raw LLM output text
 * @param context   Lead context used to generate the response (for PII check)
 * @param meta      Optional metadata for structured logging
 * @returns         Validation result with safe flag and usable response
 */
export function validateAIOutput(
  response: string,
  context: LeadContext,
  meta?: { org_id?: string; conversation_id?: string }
): ValidationResult {
  const issues: string[] = [];

  // Check 0: Empty or whitespace-only
  if (!response || response.trim().length === 0) {
    issues.push('empty_response');
    return logAndReturn(issues, FALLBACK_RESPONSE, meta);
  }

  // Check 1: System prompt / AI identity leakage
  for (const [pattern, label] of LEAKAGE_PATTERNS) {
    if (pattern.test(response)) {
      issues.push(`leakage:${label}`);
    }
  }

  // Check 2: Length limit
  if (response.length > MAX_RESPONSE_LENGTH) {
    issues.push(`length_exceeded:${response.length}/${MAX_RESPONSE_LENGTH}`);
  }

  // Check 3: PII leak from context
  const piiLeaks = detectPIILeak(response, context);
  if (piiLeaks.length > 0) {
    issues.push(...piiLeaks.map((l) => `pii_leak:${l}`));
  }

  // Decision: if any issue found, use fallback
  if (issues.length > 0) {
    return logAndReturn(issues, FALLBACK_RESPONSE, meta);
  }

  return { safe: true, response, issues: [] };
}

// =============================================================================
// Internal
// =============================================================================

function logAndReturn(
  issues: string[],
  fallback: string,
  meta?: { org_id?: string; conversation_id?: string }
): ValidationResult {
  logStructured({
    event: 'ai.output_validator.unsafe_response',
    org_id: meta?.org_id,
    conversation_id: meta?.conversation_id,
    issues,
    fallback_used: true,
  });

  return { safe: false, response: fallback, issues };
}

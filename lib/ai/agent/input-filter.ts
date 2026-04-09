/**
 * @fileoverview Input Filter for AI Agent
 *
 * Sanitizes incoming messages from leads to neutralize prompt injection attempts.
 * Does NOT block messages entirely (to avoid losing real leads), only strips/neutralizes
 * injection patterns so the LLM treats them as literal text.
 *
 * @module lib/ai/agent/input-filter
 */

import { logStructured } from './structured-logger';

// =============================================================================
// Injection Patterns
// =============================================================================

/**
 * Patterns that indicate prompt injection attempts.
 * Each entry: [regex, label for logging].
 * Flags: case-insensitive, unicode-aware.
 */
const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  // --- Direct instruction override (EN) ---
  [/ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)/iu, 'ignore_instructions_en'],
  [/disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/iu, 'disregard_instructions_en'],
  [/override\s+(all\s+)?(safety|system|previous)\s+(rules?|instructions?|prompts?)/iu, 'override_rules_en'],
  [/new\s+instructions?:?\s/iu, 'new_instructions_en'],
  [/forget\s+(everything|all|your)\s+(you\s+)?(know|were\s+told|instructions?)/iu, 'forget_instructions_en'],

  // --- Direct instruction override (PT-BR) ---
  [/ignore\s+(todas?\s+)?(as\s+)?(instruções?\s*(anteriores?)?|regras?|prompts?)/iu, 'ignore_instructions_pt'],
  [/desconsidere\s+(todas?\s+)?(as\s+)?(instruções?|regras?)/iu, 'disregard_instructions_pt'],
  [/novas?\s+instruções?:?\s/iu, 'new_instructions_pt'],
  [/esqueça\s+(tudo|todas?\s+as\s+instruções?)/iu, 'forget_instructions_pt'],
  [/substitua\s+(suas?\s+)?(instruções?|regras?|prompt)/iu, 'replace_instructions_pt'],

  // --- Role manipulation ---
  [/you\s+are\s+now\s+/iu, 'role_change_en'],
  [/act\s+as\s+(if\s+you\s+are\s+|a\s+|an?\s+)/iu, 'act_as_en'],
  [/pretend\s+(you\s+are|to\s+be)\s+/iu, 'pretend_en'],
  [/você\s+é\s+agora\s+/iu, 'role_change_pt'],
  [/finja\s+(que\s+)?(é|ser|você\s+é)\s+/iu, 'pretend_pt'],
  [/assuma\s+(o\s+)?papel\s+de\s+/iu, 'assume_role_pt'],
  [/aja\s+como\s+(se\s+fosse\s+|um\s+)/iu, 'act_as_pt'],

  // --- System prompt extraction ---
  [/system\s*prompt/iu, 'system_prompt_probe'],
  [/reveal\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?)/iu, 'reveal_prompt_en'],
  [/show\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions?|rules?|configuration)/iu, 'show_prompt_en'],
  [/print\s+(your\s+)?(system\s+)?(prompt|instructions?)/iu, 'print_prompt_en'],
  [/what\s+are\s+your\s+(system\s+)?(instructions?|rules?|prompts?)/iu, 'what_instructions_en'],
  [/revele\s+(seu\s+)?(prompt|instruções?|regras?)/iu, 'reveal_prompt_pt'],
  [/mostre\s+(suas?\s+)?(instruções?|regras?|prompt|configuração)/iu, 'show_prompt_pt'],
  [/quais?\s+(são\s+)?(suas?\s+)?(instruções?|regras?|prompt)/iu, 'what_instructions_pt'],

  // --- Jailbreak patterns ---
  [/\bDAN\b.*\bmode\b/iu, 'dan_jailbreak'],
  [/\bjailbreak\b/iu, 'jailbreak_keyword'],
  [/developer\s+mode/iu, 'developer_mode'],
  [/modo\s+(desenvolvedor|dev|irrestrito|sem\s+restrições)/iu, 'dev_mode_pt'],

  // --- Encoded injection (common Base64 of "ignore") ---
  [/SWdub3Jl/u, 'base64_ignore'],
  [/\{\\u00[0-9a-fA-F]{2}/u, 'unicode_escape_sequence'],

  // --- Delimiter escape attempts ---
  [/<\/?(system|user|assistant|lead_message|instruction)/iu, 'xml_tag_injection'],
  [/```\s*(system|instruction|prompt)/iu, 'code_block_injection'],
];

// =============================================================================
// Public API
// =============================================================================

export interface SanitizeResult {
  /** Sanitized text safe for prompt interpolation */
  text: string;
  /** Whether any injection pattern was detected */
  injectionDetected: boolean;
  /** Labels of matched patterns (for logging) */
  matchedPatterns: string[];
}

/**
 * Sanitizes an incoming message from a lead, neutralizing prompt injection patterns.
 *
 * Strategy:
 * - Wrap matched substrings in brackets so the LLM sees them as quoted text, not instructions.
 * - Does NOT drop the message — the lead might be a real customer whose message
 *   happens to contain trigger words.
 * - Logs the attempt for security auditing.
 *
 * @param text  Raw incoming message from WhatsApp/Instagram/Email
 * @param meta  Optional metadata for structured logging (org_id, conversation_id)
 * @returns     Sanitized text + detection metadata
 */
export function sanitizeIncomingMessage(
  text: string,
  meta?: { org_id?: string; conversation_id?: string }
): SanitizeResult {
  if (!text || text.trim().length === 0) {
    return { text: '', injectionDetected: false, matchedPatterns: [] };
  }

  const matchedPatterns: string[] = [];
  let sanitized = text;

  for (const [pattern, label] of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      matchedPatterns.push(label);
      // Neutralize: wrap matched content in brackets so LLM reads it as quoted text
      sanitized = sanitized.replace(pattern, (match) => `[${match}]`);
    }
  }

  if (matchedPatterns.length > 0) {
    logStructured({
      event: 'ai.input_filter.injection_detected',
      org_id: meta?.org_id,
      conversation_id: meta?.conversation_id,
      matched_patterns: matchedPatterns,
      original_length: text.length,
      sanitized_length: sanitized.length,
    });
  }

  return {
    text: sanitized,
    injectionDetected: matchedPatterns.length > 0,
    matchedPatterns,
  };
}

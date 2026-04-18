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
 * Flags: g (global — neutralize ALL occurrences), i (case-insensitive), u (unicode).
 * Without `g`, String.replace only substitutes the first occurrence per call,
 * allowing attackers to bypass by repeating the injection phrase.
 */
const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  // --- Direct instruction override (EN) ---
  [/ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directives?)/giu, 'ignore_instructions_en'],
  [/disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/giu, 'disregard_instructions_en'],
  [/override\s+(all\s+)?(safety|system|previous)\s+(rules?|instructions?|prompts?)/giu, 'override_rules_en'],
  [/new\s+instructions?:?\s/giu, 'new_instructions_en'],
  [/forget\s+(everything|all|your)\s+(you\s+)?(know|were\s+told|instructions?)/giu, 'forget_instructions_en'],

  // --- Direct instruction override (PT-BR) ---
  [/ignore\s+(todas?\s+)?(as\s+)?(instruções?\s*(anteriores?)?|regras?|prompts?)/giu, 'ignore_instructions_pt'],
  [/desconsidere\s+(todas?\s+)?(as\s+)?(instruções?|regras?)/giu, 'disregard_instructions_pt'],
  [/novas?\s+instruções?:?\s/giu, 'new_instructions_pt'],
  [/esqueça\s+(tudo|todas?\s+as\s+instruções?)/giu, 'forget_instructions_pt'],
  [/substitua\s+(suas?\s+)?(instruções?|regras?|prompt)/giu, 'replace_instructions_pt'],

  // --- Role manipulation ---
  [/you\s+are\s+now\s+/giu, 'role_change_en'],
  [/act\s+as\s+(if\s+you\s+are\s+|a\s+|an?\s+)/giu, 'act_as_en'],
  [/pretend\s+(you\s+are|to\s+be)\s+/giu, 'pretend_en'],
  [/você\s+é\s+agora\s+/giu, 'role_change_pt'],
  [/finja\s+(que\s+)?(é|ser|você\s+é)\s+/giu, 'pretend_pt'],
  [/assuma\s+(o\s+)?papel\s+de\s+/giu, 'assume_role_pt'],
  [/aja\s+como\s+(se\s+fosse\s+|um\s+)/giu, 'act_as_pt'],

  // --- System prompt extraction ---
  [/system\s*prompt/giu, 'system_prompt_probe'],
  [/reveal\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?)/giu, 'reveal_prompt_en'],
  [/show\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions?|rules?|configuration)/giu, 'show_prompt_en'],
  [/print\s+(your\s+)?(system\s+)?(prompt|instructions?)/giu, 'print_prompt_en'],
  [/what\s+are\s+your\s+(system\s+)?(instructions?|rules?|prompts?)/giu, 'what_instructions_en'],
  [/revele\s+(seu\s+)?(prompt|instruções?|regras?)/giu, 'reveal_prompt_pt'],
  [/mostre\s+(suas?\s+)?(instruções?|regras?|prompt|configuração)/giu, 'show_prompt_pt'],
  [/quais?\s+(são\s+)?(suas?\s+)?(instruções?|regras?|prompt)/giu, 'what_instructions_pt'],

  // --- Jailbreak patterns ---
  [/\bDAN\b.*\bmode\b/giu, 'dan_jailbreak'],
  [/\bjailbreak\b/giu, 'jailbreak_keyword'],
  [/developer\s+mode/giu, 'developer_mode'],
  [/modo\s+(desenvolvedor|dev|irrestrito|sem\s+restrições)/giu, 'dev_mode_pt'],

  // --- Encoded injection (common Base64 of "ignore") ---
  [/SWdub3Jl/gu, 'base64_ignore'],
  [/\{\\u00[0-9a-fA-F]{2}/gu, 'unicode_escape_sequence'],

  // --- Delimiter escape attempts ---
  [/<\/?(system|user|assistant|lead_message|instruction)/giu, 'xml_tag_injection'],
  [/```\s*(system|instruction|prompt)/giu, 'code_block_injection'],
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
    // Reset lastIndex before test() — global regexes are stateful between calls
    pattern.lastIndex = 0;
    if (pattern.test(sanitized)) {
      matchedPatterns.push(label);
      pattern.lastIndex = 0;
      // Neutralize ALL occurrences (global flag): wrap in brackets so LLM reads as quoted text
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

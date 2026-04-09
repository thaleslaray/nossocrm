/**
 * @fileoverview Security sanitization utilities
 *
 * Functions for sanitizing user input before interpolation into
 * PostgREST filters and for validating external URLs.
 */

/**
 * Strips PostgREST special characters from a user-supplied value
 * so it can be safely interpolated into `.or()` / `.filter()` strings.
 *
 * Characters removed and why:
 *   `,`  — separates conditions in `.or()` / `.and()` — primary injection vector
 *   `(`  — opens grouping operators like `and(...)`, `not(...)`
 *   `)`  — closes grouping operators
 *   `*`  — PostgREST full-text wildcard (different from ILIKE `%`)
 *   `\`  — escape character (no PostgREST escaping, so strip it)
 *
 * `.` is intentionally NOT removed: inside a `%value%` ilike pattern the dot
 * is a literal character and cannot escape the value boundary. Removing it
 * would break email and domain searches (e.g. "user@example.com").
 */
export function sanitizePostgrestValue(value: string): string {
  return value.replace(/[,()*\\]/g, '');
}

const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:']);

/**
 * Validates that a URL uses a safe scheme (http/https).
 * Returns the original URL if safe, or an empty string otherwise.
 *
 * This prevents `javascript:`, `data:`, `vbscript:`, and other
 * dangerous schemes from being rendered in `<img src>` or `<a href>`.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    if (ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
      return url;
    }
  } catch {
    // Invalid URL
  }

  return '';
}

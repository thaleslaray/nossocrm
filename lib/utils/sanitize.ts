/**
 * @fileoverview Security sanitization utilities
 *
 * Functions for sanitizing user input before interpolation into
 * PostgREST filters and for validating external URLs.
 */

/**
 * Escapes PostgREST special characters in a user-supplied value
 * so it can be safely interpolated into `.or()` / `.filter()` strings.
 *
 * PostgREST uses `,` to separate conditions, `.` to separate field/operator/value,
 * and `(` / `)` for grouping. `%` and `*` are wildcards.
 * Backslash-escaping is not supported by PostgREST, so we strip these characters.
 */
export function sanitizePostgrestValue(value: string): string {
  // Remove characters that have structural meaning in PostgREST filter syntax
  return value.replace(/[,.()*\\]/g, '');
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

/**
 * ASCII-ish slugify helper (URL-safe, stable).
 *
 * - Avoids Unicode property escapes (\p{L}) for broader browser compatibility (Safari).
 * - Normalizes accents via NFD + diacritics removal.
 * - Keeps only [a-z0-9-].
 */
export function slugify(input: string) {
  const ascii = (input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return ascii
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}


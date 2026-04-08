/**
 * Escapa caracteres especiais de um valor antes de interpolá-lo em
 * filtros PostgREST (ex.: `supabase.from(...).or('name.ilike.%input%')`).
 *
 * Motivo: o método `.or()` do supabase-js recebe uma string bruta que é
 * enviada ao PostgREST sem parametrização. Caracteres como vírgula, parênteses
 * ou os wildcards `%` / `_` do LIKE alteram a semântica do filtro e permitem
 * "quebra" do filtro para injetar condições arbitrárias (ex.: `q=,stage.eq.X`
 * introduz uma nova condição).
 *
 * Este helper aplica:
 *   - Escape do wildcard LIKE: `%` → `\%` e `_` → `\_`
 *   - Escape do metacaractere PostgREST: `,` `(` `)` `*` → prefixado com `\`
 *   - Escape da barra invertida primeiro para não ser duplamente escapada
 *
 * Usar APENAS para valores vindos do usuário que vão dentro de filtros
 * `.or(...)`, `.ilike(...)`, `.like(...)`. Filtros estruturados como
 * `.eq()`, `.in()` já são parametrizados pelo supabase-js e não precisam.
 *
 * @example
 * ```ts
 * const safe = escapePostgrestFilter(q);
 * query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`);
 * ```
 */
export function escapePostgrestFilter(input: string): string {
  if (!input) return '';
  return input
    // Backslash primeiro (senão os outros escapes viram barras duplas)
    .replace(/\\/g, '\\\\')
    // Wildcards LIKE
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    // Metacaracteres do parser de filtros PostgREST
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\*/g, '\\*');
}

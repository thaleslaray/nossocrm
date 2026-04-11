/**
 * Mitigação simples de CSRF para endpoints autenticados por cookies.
 *
 * Ideia: em requests vindos do browser, o header `Origin` aparece em cenários cross-site.
 * Para rotas que dependem de cookies, negar quando `Origin` não bate com o host atual.
 *
 * - Se `Origin` estiver ausente (ex: server-to-server), não bloqueia.
 * - Usa x-forwarded-* quando disponível (Vercel/reverse proxies).
 */

export function getExpectedOrigin(req: Request): string | null {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) return null;

  const proto =
    req.headers.get('x-forwarded-proto') ??
    (process.env.NODE_ENV === 'development' ? 'http' : 'https');

  return `${proto}://${host}`;
}

/**
 * Função pública `isAllowedOrigin` do projeto.
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {boolean} Retorna um valor do tipo `boolean`.
 */
export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;

  const expected = getExpectedOrigin(req);
  if (!expected) return true;

  return origin === expected;
}

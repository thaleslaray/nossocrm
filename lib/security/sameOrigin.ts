/**
 * Mitigação de CSRF para endpoints autenticados por cookies.
 *
 * Estratégia:
 * 1. Se `Origin` está presente → precisa bater com o host atual.
 * 2. Se `Origin` ausente (ex.: GET navegacional, server-to-server) → tenta
 *    validar via `Referer` como fallback.
 * 3. Para métodos mutantes (POST/PUT/PATCH/DELETE), exige Origin OU Referer
 *    válido — não aceita request sem nenhum dos dois.
 * 4. GETs idempotentes continuam permitidos quando nem Origin nem Referer
 *    estão presentes (ex.: navegação direta/bookmark).
 *
 * Usa x-forwarded-* quando disponível (Vercel/reverse proxies).
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function getExpectedOrigin(req: Request): string | null {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) return null;

  const proto =
    req.headers.get('x-forwarded-proto') ??
    (process.env.NODE_ENV === 'development' ? 'http' : 'https');

  return `${proto}://${host}`;
}

function refererMatchesExpected(req: Request, expected: string): boolean {
  const referer = req.headers.get('referer');
  if (!referer) return false;
  try {
    const refererOrigin = new URL(referer).origin;
    return refererOrigin === expected;
  } catch {
    return false;
  }
}

/**
 * Valida se a request é originada do mesmo host (proteção CSRF).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {boolean} `true` se a request pode prosseguir.
 */
export function isAllowedOrigin(req: Request): boolean {
  const expected = getExpectedOrigin(req);
  if (!expected) {
    // Sem host header confiável — não conseguimos validar; deixa passar
    // apenas se for método idempotente (GET/HEAD/OPTIONS).
    return !MUTATING_METHODS.has(req.method.toUpperCase());
  }

  const origin = req.headers.get('origin');
  if (origin) return origin === expected;

  // Sem Origin → tenta Referer como fallback.
  if (refererMatchesExpected(req, expected)) return true;

  // Nem Origin nem Referer: para GET/HEAD/OPTIONS (idempotente) permite;
  // para métodos mutantes bloqueia.
  return !MUTATING_METHODS.has(req.method.toUpperCase());
}

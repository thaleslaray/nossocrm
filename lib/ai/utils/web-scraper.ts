/**
 * web-scraper.ts — Extrai conteúdo de qualquer URL como Markdown limpo.
 *
 * Usa r.jina.ai como mecanismo principal:
 * - Roda headless browser no lado deles → funciona com SPAs (React, Next.js, Vue)
 * - Aplica Mozilla Readability → extrai conteúdo principal
 * - Retorna Markdown limpo, pronto para LLM
 * - Zero config, sem API key, gratuito (até ~50 req/min)
 *
 * Fallback: extração básica via regex para sites que bloqueiam Jina.
 */

const JINA_BASE_URL = 'https://r.jina.ai/';
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 4_000;

// ── Fallback: strip HTML básico ────────────────────────────────────────────

const NOISE_BLOCK_RE =
  /<(script|style|nav|header|footer|aside|iframe|noscript|svg|button|form)[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_TAG_RE = /<[^>]+>/g;
const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
  '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
};

function decodeEntities(text: string) {
  return text.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e);
}

function extractTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
}

async function fallbackScrape(url: string, maxChars: number) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'NossoCRM-Bot/1.0', 'Accept': 'text/html' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const title = decodeEntities(extractTitle(html));
  const text = decodeEntities(
    html
      .replace(NOISE_BLOCK_RE, ' ')
      .replace(HTML_TAG_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).slice(0, maxChars);
  return { text, title };
}

// ── Principal: Jina Reader ─────────────────────────────────────────────────

export interface ScrapeResult {
  markdown: string;
  title: string;
  url: string;
  source: 'jina' | 'fallback';
}

/**
 * Scrapes a URL and returns clean Markdown for LLM consumption.
 * Uses r.jina.ai (handles SPAs) with regex fallback.
 */
export async function scrapeUrl(
  url: string,
  maxChars = DEFAULT_MAX_CHARS
): Promise<ScrapeResult | null> {
  // ── Tentativa 1: Jina Reader ──
  try {
    const jinaUrl = `${JINA_BASE_URL}${url}`;
    const res = await fetch(jinaUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
      },
    });

    if (res.ok) {
      const raw = await res.text();
      // Jina inclui metadados no topo — extrair título e URL
      const titleMatch = raw.match(/^Title:\s*(.+)$/m);
      const title = titleMatch?.[1]?.trim() ?? '';

      // Truncar preservando boundary de palavra
      const markdown = raw.length > maxChars
        ? raw.slice(0, maxChars).replace(/\s+\S*$/, '') + '…'
        : raw;

      console.log('[WebScraper] Jina OK — %s, title: "%s", %d chars', url, title, markdown.length);
      return { markdown, title, url, source: 'jina' };
    }

    console.warn('[WebScraper] Jina returned %d for %s', res.status, url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[WebScraper] Jina failed for %s: %s — trying fallback', url, msg);
  }

  // ── Tentativa 2: Fallback básico ──
  try {
    const result = await fallbackScrape(url, maxChars);
    if (result) {
      console.log('[WebScraper] Fallback OK — %s, %d chars', url, result.text.length);
      return { markdown: result.text, title: result.title, url, source: 'fallback' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[WebScraper] Fallback also failed for %s: %s', url, msg);
  }

  return null;
}

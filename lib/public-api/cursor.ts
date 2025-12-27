export function parseLimit(value: string | null, opts?: { defaultLimit?: number; max?: number }) {
  const max = opts?.max ?? 250;
  const def = opts?.defaultLimit ?? 50;
  const raw = (value ?? '').trim();
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

export function decodeOffsetCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const offset = Number(json?.offset ?? 0);
    return Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
  } catch {
    return 0;
  }
}

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}


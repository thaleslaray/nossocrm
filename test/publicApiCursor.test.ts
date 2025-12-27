import { describe, expect, it } from 'vitest';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';

describe('Public API cursor', () => {
  it('encodes/decodes offset cursors', () => {
    const c = encodeOffsetCursor(123);
    expect(decodeOffsetCursor(c)).toBe(123);
  });

  it('handles invalid cursors safely', () => {
    expect(decodeOffsetCursor('not-a-cursor')).toBe(0);
  });

  it('parses limits with bounds', () => {
    expect(parseLimit(null)).toBe(50);
    expect(parseLimit('10')).toBe(10);
    expect(parseLimit('999')).toBe(250);
    expect(parseLimit('0')).toBe(1);
  });
});


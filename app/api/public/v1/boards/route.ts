import { NextResponse } from 'next/server';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const key = (url.searchParams.get('key') || '').trim();
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = decodeOffsetCursor(url.searchParams.get('cursor'));
  const from = offset;
  const to = offset + limit - 1;

  const sb = createStaticAdminClient();
  let query = sb
    .from('boards')
    .select('id,key,name,description,position,is_default,created_at,updated_at', { count: 'exact' })
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (key) query = query.eq('key', key);
  if (q) query = query.or(`name.ilike.%${q}%,key.ilike.%${q}%`);

  const { data, count, error } = await query.range(from, to);
  if (error) {
    console.error('[API] Database error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'DB_ERROR' }, { status: 500 });
  }

  const total = count ?? 0;
  const nextOffset = to + 1;
  const nextCursor = nextOffset < total ? encodeOffsetCursor(nextOffset) : null;

  return NextResponse.json({
    data: (data || []).map((b: any) => ({
      id: b.id,
      key: b.key ?? null,
      name: b.name,
      description: b.description ?? null,
      position: b.position ?? 0,
      is_default: !!b.is_default,
    })),
    nextCursor,
  });
}


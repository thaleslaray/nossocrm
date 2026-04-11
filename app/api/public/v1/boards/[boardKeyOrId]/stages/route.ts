import { NextResponse } from 'next/server';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { isValidUUID } from '@/lib/supabase/utils';

export const runtime = 'nodejs';

export async function GET(request: Request, ctx: { params: Promise<{ boardKeyOrId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { boardKeyOrId } = await ctx.params;
  const value = String(boardKeyOrId || '').trim();
  if (!value) return NextResponse.json({ error: 'Missing board identifier', code: 'BAD_REQUEST' }, { status: 400 });

  const sb = createStaticAdminClient();

  const { data: board, error: boardError } = await sb
    .from('boards')
    .select('id')
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null)
    .match(isValidUUID(value) ? { id: value } : { key: value })
    .maybeSingle();

  if (boardError) return NextResponse.json({ error: boardError.message, code: 'DB_ERROR' }, { status: 500 });
  if (!board?.id) return NextResponse.json({ error: 'Board not found', code: 'NOT_FOUND' }, { status: 404 });

  const { data, error } = await sb
    .from('board_stages')
    .select('id,label,name,color,order')
    .eq('organization_id', auth.organizationId)
    .eq('board_id', board.id)
    .order('order', { ascending: true });

  if (error) {
    console.error('[API] Database error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'DB_ERROR' }, { status: 500 })
  }

  return NextResponse.json({
    data: (data || []).map((s: any) => ({
      id: s.id,
      label: s.label || s.name,
      color: s.color ?? null,
      order: s.order ?? 0,
    })),
  });
}


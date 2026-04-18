/**
 * GET/PUT/DELETE /api/ai/board-config/[boardId]
 *
 * GET: retorna board_ai_config ou null se não configurado
 * PUT: upsert board_ai_config (onboarding wizard ou toggle inline)
 * DELETE: remove board_ai_config (desliga o agente para o board)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAuth(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle();
  return profile;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  if (!UUID_RE.test(boardId)) return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });

  const supabase = await createClient();
  const profile = await requireAuth(supabase);
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('board_ai_config')
    .select('*')
    .eq('board_id', boardId)
    .maybeSingle();

  if (error) {
    console.error('[BoardConfig] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  if (!UUID_RE.test(boardId)) return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });

  const supabase = await createClient();
  const profile = await requireAuth(supabase);
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Verify the board belongs to the caller's org — prevents cross-tenant config poisoning
  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('id', boardId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const allowedFields = [
    'agent_name', 'business_context', 'agent_goal', 'persona_prompt',
    'knowledge_store_id', 'knowledge_store_name',
    'agent_mode', 'circuit_breaker_threshold',
    'hitl_threshold', 'hitl_min_confidence', 'hitl_expiration_hours',
    'handoff_keywords', 'max_messages_before_handoff', 'response_delay_seconds',
  ];
  const payload: Record<string, unknown> = { board_id: boardId, organization_id: profile.organization_id };
  for (const field of allowedFields) {
    if (field in body) payload[field] = body[field];
  }

  const { data, error } = await supabase
    .from('board_ai_config')
    .upsert(payload, { onConflict: 'board_id' })
    .select()
    .single();

  if (error) {
    console.error('[BoardConfig] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }

  console.log('[BoardConfig] upserted for board %s, mode=%s', boardId, payload.agent_mode);
  return NextResponse.json({ config: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  if (!UUID_RE.test(boardId)) return NextResponse.json({ error: 'Invalid boardId' }, { status: 400 });

  const supabase = await createClient();
  const profile = await requireAuth(supabase);
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('board_ai_config')
    .delete()
    .eq('board_id', boardId)
    .eq('organization_id', profile.organization_id);

  if (error) {
    console.error('[BoardConfig] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete config' }, { status: 500 });
  }

  console.log('[BoardConfig] deleted for board %s', boardId);
  return NextResponse.json({ ok: true });
}

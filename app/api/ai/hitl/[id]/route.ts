/**
 * @fileoverview HITL API - Resolve Pending Advance
 *
 * POST /api/ai/hitl/[id]
 * Resolve um pending advance (aprovar, rejeitar, ou aprovar com edições).
 *
 * Body (UserEdits):
 * - approved: boolean - Se o avanço foi aprovado
 * - targetStageId?: string - Estágio de destino (se editado)
 * - reason?: string - Motivo (se editado)
 * - additionalNotes?: string - Notas adicionais
 *
 * @module app/api/ai/hitl/[id]/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolvePendingAdvance, UserEditsSchema } from '@/lib/ai/agent/hitl-stage-advance';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: pendingAdvanceId } = await context.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!pendingAdvanceId || !uuidRegex.test(pendingAdvanceId)) {
      return NextResponse.json({ error: 'Invalid or missing pending advance ID' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verificar autenticação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar profile para organization_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.organization_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Parse e validar body
    const body = await request.json();
    const parseResult = UserEditsSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const userEdits = parseResult.data;

    // Verificar se o pending advance pertence à organização do usuário
    const { data: pendingAdvance, error: fetchError } = await supabase
      .from('ai_pending_stage_advances')
      .select('organization_id')
      .eq('id', pendingAdvanceId)
      .single();

    if (fetchError || !pendingAdvance) {
      return NextResponse.json({ error: 'Pending advance not found' }, { status: 404 });
    }

    if (pendingAdvance.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolver o pending advance
    const result = await resolvePendingAdvance({
      supabase,
      pendingAdvanceId,
      userId: user.id,
      userEdits,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      newStageId: result.newStageId,
      approved: userEdits.approved,
    });
  } catch (error) {
    console.error('[API /ai/hitl/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * @fileoverview HITL (Human-in-the-Loop) API - List Pending Advances
 *
 * GET /api/ai/hitl
 * Lista pending advances da organização do usuário autenticado.
 *
 * Query params:
 * - dealId: Filtrar por deal específico
 * - status: 'pending' (default) ou 'all'
 *
 * @module app/api/ai/hitl/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPendingAdvances } from '@/lib/ai/agent/hitl-stage-advance';

export async function GET(request: NextRequest) {
  try {
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

    // Parse query params (use URL constructor for testability — request.nextUrl is Next.js-only)
    const searchParams = new URL(request.url).searchParams;
    const dealId = searchParams.get('dealId') || undefined;
    const status = searchParams.get('status') as 'pending' | 'all' | null;

    // Buscar pending advances
    const pendingAdvances = await getPendingAdvances(supabase, profile.organization_id, {
      dealId,
      status: status || 'pending',
    });

    return NextResponse.json({ pendingAdvances });
  } catch (error) {
    console.error('[API /ai/hitl] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

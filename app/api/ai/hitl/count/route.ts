/**
 * @fileoverview HITL API - Count Pending Advances
 *
 * GET /api/ai/hitl/count
 * Retorna contagem de pending advances não resolvidos.
 *
 * @module app/api/ai/hitl/count/route
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { countPendingAdvances } from '@/lib/ai/agent/hitl-stage-advance';

export async function GET() {
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

    // Contar pending advances
    const count = await countPendingAdvances(supabase, profile.organization_id);

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[API /ai/hitl/count] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

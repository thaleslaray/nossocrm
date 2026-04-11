/**
 * @fileoverview Generate Stage Prompts API
 *
 * POST /api/ai/generate-stage-prompts
 *
 * Usa a LLM configurada da organização para gerar prompts
 * profissionais para cada estágio de um board.
 *
 * Não salva nada — retorna os prompts para preview no client.
 *
 * @module app/api/ai/generate-stage-prompts
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;
import { generateStagePrompts } from '@/lib/ai/agent/generate-prompts.service';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Get org
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 });
    }

    // Parse body
    const body = await req.json();
    const { boardId, businessDescription } = body as {
      boardId?: string;
      businessDescription?: string;
    };

    if (!boardId || !businessDescription?.trim()) {
      return NextResponse.json(
        { error: 'boardId e businessDescription são obrigatórios' },
        { status: 400 }
      );
    }

    if (businessDescription.trim().length < 10) {
      return NextResponse.json(
        { error: 'Descrição muito curta. Descreva seu negócio em pelo menos algumas palavras.' },
        { status: 400 }
      );
    }

    // Verify board belongs to org
    const { data: board } = await supabase
      .from('boards')
      .select('id')
      .eq('id', boardId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (!board) {
      return NextResponse.json({ error: 'Board não encontrado' }, { status: 404 });
    }

    // Generate
    const result = await generateStagePrompts({
      supabase,
      organizationId: profile.organization_id,
      boardId,
      businessDescription: businessDescription.trim(),
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      stages: result.stages,
      tokensUsed: result.tokensUsed,
    });
  } catch (error) {
    console.error('[GenerateStagePrompts] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Erro interno ao gerar prompts' },
      { status: 500 }
    );
  }
}

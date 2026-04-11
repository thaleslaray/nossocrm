/**
 * @fileoverview AI Learning API
 *
 * POST /api/ai/learn
 * Aprende padrões de conversas selecionadas.
 *
 * Body:
 * - conversationIds: string[] - IDs das conversas para aprender
 *
 * @module app/api/ai/learn/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';

export const maxDuration = 60;
import {
  fetchConversationsForLearning,
  learnFromConversations,
  saveLearnedPatterns,
  getLearnedPatterns,
} from '@/lib/ai/agent/few-shot-learner';
import { mergeLearnedPatterns } from '@/lib/ai/agent/generative-schema';

// =============================================================================
// POST - Learn from conversations
// =============================================================================

export async function POST(request: NextRequest) {
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

    const organizationId = profile.organization_id;

    // Parse body
    const body = await request.json();
    const { conversationIds } = body as { conversationIds: string[] };

    if (!conversationIds || !Array.isArray(conversationIds) || conversationIds.length < 2) {
      return NextResponse.json(
        { error: 'Mínimo de 2 conversas necessárias para aprendizado' },
        { status: 400 }
      );
    }

    if (conversationIds.length > 10) {
      return NextResponse.json(
        { error: 'Máximo de 10 conversas por vez' },
        { status: 400 }
      );
    }

    // Buscar configuração AI
    const aiConfig = await getOrgAIConfig(supabase, organizationId);

    if (!aiConfig) {
      return NextResponse.json(
        { error: 'Configuração de AI não encontrada. Configure uma chave de API primeiro.' },
        { status: 400 }
      );
    }

    // Buscar conversas
    const conversations = await fetchConversationsForLearning(
      supabase,
      conversationIds,
      organizationId
    );

    if (conversations.length < 2) {
      return NextResponse.json(
        { error: 'Conversas não encontradas ou sem mensagens suficientes' },
        { status: 400 }
      );
    }

    // Aprender padrões
    const newPatterns = await learnFromConversations(conversations, aiConfig);

    // Buscar padrões existentes para merge
    const existingPatterns = await getLearnedPatterns(supabase, organizationId);

    // Merge ou usar novos padrões
    const finalPatterns = existingPatterns
      ? mergeLearnedPatterns(existingPatterns, newPatterns)
      : newPatterns;

    // Salvar padrões
    await saveLearnedPatterns(supabase, organizationId, finalPatterns);

    return NextResponse.json({
      success: true,
      patterns: {
        criteriaCount: finalPatterns.learnedCriteria.length,
        questionPatternsCount: finalPatterns.questionPatterns.length,
        conversationsUsed: finalPatterns.extractedFrom.length,
        tone: finalPatterns.tone,
        learnedAt: finalPatterns.learnedAt,
      },
    });
  } catch (error) {
    console.error('[API /ai/learn] Error:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// GET - Get current learned patterns
// =============================================================================

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

    // Buscar padrões aprendidos
    const patterns = await getLearnedPatterns(supabase, profile.organization_id);

    if (!patterns) {
      return NextResponse.json({ patterns: null });
    }

    return NextResponse.json({
      patterns: {
        greetingStyle: patterns.greetingStyle,
        questionPatterns: patterns.questionPatterns,
        objectionHandling: patterns.objectionHandling,
        closingTechniques: patterns.closingTechniques,
        tone: patterns.tone,
        learnedCriteria: patterns.learnedCriteria,
        conversationsUsed: patterns.extractedFrom.length,
        learnedAt: patterns.learnedAt,
        modelVersion: patterns.modelVersion,
      },
    });
  } catch (error) {
    console.error('[API /ai/learn] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// DELETE - Clear learned patterns
// =============================================================================

export async function DELETE() {
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

    // Limpar padrões
    const { error } = await supabase
      .from('organization_settings')
      .update({
        ai_learned_patterns: {},
        ai_config_mode: 'zero_config', // Voltar para Zero Config
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', profile.organization_id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /ai/learn] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

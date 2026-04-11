/**
 * @fileoverview AI Modes Test Endpoint
 *
 * Endpoint temporário para testar todos os modos de IA.
 * NÃO usar em produção - apenas para debug.
 *
 * GET /api/test/ai-modes - Lista estado atual
 * POST /api/test/ai-modes - Executa teste de um modo
 *
 * @module app/api/test/ai-modes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from 'ai';
import { getModel } from '@/lib/ai/config';
import {
  buildSystemPromptFromPatterns,
  getDefaultLearnedPatterns,
} from '@/lib/ai/agent/generative-schema';
import type { LearnedPattern } from '@/lib/ai/agent/few-shot-learner';

// =============================================================================
// GET - Status atual
// =============================================================================

export async function GET() {
  try {
    const supabase = await createClient();

    // Get user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 404 });
    }

    // Get org settings
    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select(
        'ai_config_mode, ai_template_id, ai_learned_patterns, ai_model, ai_google_key, ai_enabled'
      )
      .eq('organization_id', profile.organization_id)
      .single();

    // Get stage configs
    const { data: stageConfigs } = await supabase
      .from('stage_ai_config')
      .select('id, stage_id, enabled, stage_goal, advancement_criteria')
      .eq('organization_id', profile.organization_id)
      .eq('enabled', true);

    // Get templates
    const { data: templates } = await supabase
      .from('ai_qualification_templates')
      .select('id, name, is_system, display_name');

    // Get conversations count
    const { count: conversationsCount } = await supabase
      .from('messaging_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id);

    // Get deals count
    const { count: dealsCount } = await supabase
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id);

    // Check learned patterns
    const hasLearnedPatterns =
      orgSettings?.ai_learned_patterns &&
      typeof orgSettings.ai_learned_patterns === 'object' &&
      Object.keys(orgSettings.ai_learned_patterns as object).length > 0 &&
      'learnedCriteria' in (orgSettings.ai_learned_patterns as object);

    // Check API key
    const hasApiKey = !!orgSettings?.ai_google_key;

    return NextResponse.json({
      status: 'ok',
      organizationId: profile.organization_id,
      config: {
        mode: orgSettings?.ai_config_mode || 'not_set',
        templateId: orgSettings?.ai_template_id,
        hasLearnedPatterns,
        learnedPatternsKeys: hasLearnedPatterns
          ? Object.keys(orgSettings?.ai_learned_patterns as object)
          : [],
        provider: 'google',
        model: orgSettings?.ai_model,
        hasApiKey,
        enabled: orgSettings?.ai_enabled !== false,
      },
      stageConfigs: {
        count: stageConfigs?.length || 0,
        stages: stageConfigs?.map((s) => ({
          id: s.id,
          stageId: s.stage_id,
          goal: s.stage_goal?.substring(0, 50) + '...',
          criteriaCount: s.advancement_criteria?.length || 0,
        })),
      },
      templates: templates?.map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.display_name,
        isSystem: t.is_system,
      })),
      data: {
        conversations: conversationsCount || 0,
        deals: dealsCount || 0,
      },
      modes: {
        zero_config: {
          description: 'BANT automático, sem configuração',
          ready: hasApiKey && (stageConfigs?.length || 0) > 0,
        },
        template: {
          description: 'Usar template (BANT, SPIN, MEDDIC, etc)',
          ready: hasApiKey && !!orgSettings?.ai_template_id,
        },
        auto_learn: {
          description: 'Aprender com conversas de sucesso',
          ready: hasApiKey && hasLearnedPatterns,
        },
        advanced: {
          description: 'Configuração manual por estágio',
          ready: hasApiKey && (stageConfigs?.length || 0) > 0,
        },
      },
    });
  } catch (error) {
    console.error('[TestAIModes] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST - Testar um modo
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { mode, testMessage } = body as {
      mode: 'zero_config' | 'template' | 'auto_learn' | 'advanced';
      testMessage?: string;
    };

    // Get user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 404 });
    }

    // Get org settings
    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .single();

    if (!orgSettings) {
      return NextResponse.json({ error: 'No org settings' }, { status: 404 });
    }

    // Get API key
    const provider = orgSettings.ai_provider || 'google';
    let apiKey = '';
    switch (provider) {
      case 'google':
        apiKey = orgSettings.ai_google_key || '';
        break;
      case 'openai':
        apiKey = orgSettings.ai_openai_key || '';
        break;
      case 'anthropic':
        apiKey = orgSettings.ai_anthropic_key || '';
        break;
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'No API key configured' }, { status: 400 });
    }

    const modelId = orgSettings.ai_model || 'gemini-2.0-flash';
    const model = getModel(provider, apiKey, modelId);

    const message = testMessage || 'Olá! Vi que vocês oferecem serviços de CRM. Gostaria de saber mais.';

    let systemPrompt = '';
    let modeInfo = {};

    switch (mode) {
      case 'zero_config': {
        // Usa prompts BANT default
        systemPrompt = `Você é um consultor de vendas especializado.

CONTEXTO:
Este é o PRIMEIRO contato com o lead. Ele acabou de chegar.

SEU OBJETIVO:
1. Criar uma conexão inicial positiva
2. Descobrir O QUE motivou o contato
3. Entender SE há uma necessidade real

TÉCNICA - ABERTURA CONSULTIVA:
- Agradeça o contato de forma genuína
- Faça UMA pergunta aberta para entender o contexto
- Demonstre interesse real na resposta

REGRAS:
1. Máximo 2-3 frases por mensagem
2. Sempre termine com UMA pergunta
3. Seja caloroso mas profissional
4. NUNCA mencione preços neste estágio
5. NUNCA revele que você é uma IA`;
        modeInfo = { source: 'BANT default prompts' };
        break;
      }

      case 'template': {
        // Buscar template selecionado
        const templateId = orgSettings.ai_template_id;
        if (!templateId) {
          return NextResponse.json({ error: 'No template selected' }, { status: 400 });
        }

        const { data: template } = await supabase
          .from('ai_qualification_templates')
          .select('*')
          .eq('id', templateId)
          .single();

        if (!template) {
          return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        // Usar primeiro estágio do template
        const firstStage = template.stages?.[0];
        systemPrompt = `Você é um consultor de vendas usando a metodologia ${template.name}.

OBJETIVO DO ESTÁGIO:
${firstStage?.goal || 'Qualificação inicial'}

PERGUNTAS ESTRATÉGICAS:
${firstStage?.prompt_template || 'Faça perguntas para entender as necessidades do lead.'}

CRITÉRIOS DE AVANÇO:
${firstStage?.criteria?.map((c: string) => `- ${c}`).join('\n') || '- Lead demonstrou interesse'}

REGRAS:
1. Máximo 2-3 frases por mensagem
2. Sempre termine com UMA pergunta
3. NUNCA revele que é IA`;

        modeInfo = { template: template.name, stage: firstStage?.name };
        break;
      }

      case 'auto_learn': {
        // Usar padrões aprendidos
        let patterns: LearnedPattern;

        if (
          orgSettings.ai_learned_patterns &&
          typeof orgSettings.ai_learned_patterns === 'object' &&
          Object.keys(orgSettings.ai_learned_patterns as object).length > 0 &&
          'learnedCriteria' in (orgSettings.ai_learned_patterns as object)
        ) {
          patterns = orgSettings.ai_learned_patterns as LearnedPattern;
          modeInfo = { source: 'learned_patterns', extractedFrom: patterns.extractedFrom };
        } else {
          // Fallback para padrões default
          patterns = getDefaultLearnedPatterns();
          modeInfo = { source: 'default_patterns', note: 'No learned patterns found, using defaults' };
        }

        systemPrompt = buildSystemPromptFromPatterns(patterns);
        break;
      }

      case 'advanced': {
        // Buscar stage config específico
        const { data: stageConfig } = await supabase
          .from('stage_ai_config')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .eq('enabled', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        if (!stageConfig) {
          return NextResponse.json({ error: 'No stage config found' }, { status: 400 });
        }

        systemPrompt = `${stageConfig.system_prompt}

OBJETIVO DESTE ESTÁGIO:
${stageConfig.stage_goal || 'Qualificação'}

PARA AVANÇAR O LEAD:
${stageConfig.advancement_criteria?.map((c: string) => `- ${c}`).join('\n') || '- Critérios não definidos'}`;

        modeInfo = { stageId: stageConfig.stage_id, goal: stageConfig.stage_goal };
        break;
      }
    }

    // Generate response
    const startTime = Date.now();
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: `O lead disse: "${message}"

Responda de forma natural e consultiva.`,
      maxRetries: 2,
    });
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      mode,
      modeInfo,
      input: message,
      response: result.text,
      metrics: {
        duration,
        tokens: result.usage?.totalTokens,
        model: modelId,
        provider,
      },
      systemPromptPreview: systemPrompt.substring(0, 500) + '...',
    });
  } catch (error) {
    console.error('[TestAIModes] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

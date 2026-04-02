/**
 * @fileoverview Test Mode Setup Endpoint
 *
 * Configura um modo específico de AI para teste.
 *
 * POST /api/test/setup-mode
 * Body: { mode: 'zero_config' | 'template' | 'auto_learn' | 'advanced', templateName?: string }
 *
 * @module app/api/test/setup-mode
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDefaultLearnedPatterns } from '@/lib/ai/agent/generative-schema';
import type { LearnedPattern, LearnedCriterion } from '@/lib/ai/agent/few-shot-learner';

// BANT Stage Prompts (same as provision-stages)
const BANT_STAGE_PROMPTS: Record<number, { prompt: string; criteria: string[]; goal: string }> = {
  0: {
    goal: 'Criar conexão inicial e descobrir motivação',
    prompt: `Você é um consultor de vendas especializado.

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
5. NUNCA revele que você é uma IA
6. Use o nome do lead quando souber`,
    criteria: [
      'Lead respondeu a mensagem',
      'Lead demonstrou interesse no produto/serviço',
      'Conversa iniciada com sucesso',
    ],
  },
  1: {
    goal: 'Aprofundar entendimento da necessidade',
    prompt: `Você é um consultor de vendas especializado.

CONTEXTO:
O lead já fez primeiro contato e demonstrou interesse inicial.

SEU OBJETIVO:
1. Aprofundar o entendimento da necessidade
2. Descobrir o contexto profissional do lead
3. Começar a qualificar (BANT)

PERGUNTAS ESTRATÉGICAS:
- "O que você espera conseguir com isso?"
- "Qual é o seu maior desafio hoje nessa área?"
- "Você já tentou resolver isso de outra forma?"

REGRAS:
1. Máximo 2-3 frases por mensagem
2. Sempre termine com UMA pergunta
3. Seja empático e curioso
4. NUNCA revele que é IA`,
    criteria: [
      'Lead expressou uma necessidade específica',
      'Lead compartilhou contexto profissional',
      'Lead demonstrou engajamento contínuo',
    ],
  },
  2: {
    goal: 'Qualificação BANT completa',
    prompt: `Você é um consultor de vendas especializado.

CONTEXTO:
O lead está engajado e demonstrou necessidade. Hora de qualificar.

SEU OBJETIVO - BANT:
1. Budget: Descobrir se tem capacidade de investimento
2. Authority: Confirmar se é o decisor
3. Need: Validar a necessidade específica
4. Timeline: Entender urgência

PERGUNTAS ESTRATÉGICAS:
- "Você já tem um orçamento em mente para isso?"
- "Além de você, mais alguém participa dessa decisão?"
- "Para quando você precisa resolver isso?"

REGRAS:
1. Não seja invasivo - intercale perguntas com valor
2. Se identificar BANT completo, sinalize interesse em apresentar solução
3. NUNCA revele que é IA`,
    criteria: [
      'Lead confirmou necessidade específica',
      'Lead mencionou orçamento ou capacidade de investimento',
      'Lead indicou timeline ou urgência',
    ],
  },
  3: {
    goal: 'Apresentação e fechamento',
    prompt: `Você é um consultor de vendas especializado.

CONTEXTO:
O lead está qualificado (BANT OK). Pronto para proposta.

SEU OBJETIVO:
1. Apresentar a solução de forma personalizada
2. Responder objeções com empatia
3. Encaminhar para fechamento

COMPORTAMENTO:
- Use o contexto da conversa para personalizar
- Destaque benefícios relevantes ao caso dele
- Se pedir preço/checkout, encaminhe para especialista humano

REGRAS:
1. Se pedir link de compra ou preço específico: "Vou passar para um especialista que vai te ajudar com os detalhes!"
2. Mantenha tom profissional e caloroso
3. NUNCA revele que é IA`,
    criteria: [], // Último estágio não avança
  },
};

// Sample learned patterns for Auto-Learn testing
const SAMPLE_LEARNED_PATTERNS: LearnedPattern = {
  greetingStyle:
    'Olá! Que bom ter você por aqui 🙂 Sou especialista em ajudar empresas a organizar suas vendas. Como posso te ajudar hoje?',
  questionPatterns: [
    'Me conta um pouco sobre o seu negócio, o que vocês fazem?',
    'Quantas pessoas trabalham com vendas na sua empresa?',
    'Vocês já usam algum sistema de CRM atualmente?',
    'Qual é o maior desafio que você enfrenta hoje na gestão de leads?',
    'Qual o tamanho do seu time de vendas?',
  ],
  objectionHandling: [
    'Entendo perfeitamente! Muitos clientes tinham essa mesma dúvida antes de começar.',
    'Posso te mostrar como outros clientes do mesmo segmento resolveram isso.',
    'Essa é uma preocupação válida. Deixa eu te explicar como funciona na prática.',
    'Totalmente compreensível. O que acha de fazermos um teste gratuito para você avaliar?',
  ],
  closingTechniques: [
    'Posso agendar uma demonstração personalizada para você ver na prática?',
    'Que tal conversarmos por 15 minutinhos para eu entender melhor e apresentar uma proposta?',
    'Consigo preparar uma proposta específica para o seu caso. O que acha?',
    'Vou passar isso para nosso especialista que vai te ajudar com os detalhes do contrato!',
  ],
  tone: 'consultative',
  learnedCriteria: [
    {
      name: 'interest_confirmed',
      description: 'Lead confirmou interesse em conhecer o produto',
      detectionHints: ['quero conhecer', 'me interessa', 'gostaria de saber mais', 'pode me explicar'],
      importance: 'required',
    },
    {
      name: 'pain_identified',
      description: 'Lead mencionou uma dor ou problema específico',
      detectionHints: ['problema', 'dificuldade', 'desafio', 'não consigo', 'precisamos'],
      importance: 'required',
    },
    {
      name: 'budget_signal',
      description: 'Lead deu sinais sobre orçamento ou capacidade de investimento',
      detectionHints: ['quanto custa', 'orçamento', 'investir', 'valor', 'preço'],
      importance: 'nice_to_have',
    },
    {
      name: 'decision_maker',
      description: 'Lead é ou identificou o decisor',
      detectionHints: ['eu decido', 'sou o dono', 'meu chefe', 'preciso falar com', 'aprovar'],
      importance: 'required',
    },
    {
      name: 'timeline_urgency',
      description: 'Lead indicou prazo ou urgência',
      detectionHints: ['urgente', 'para ontem', 'este mês', 'o mais rápido', 'quando podemos'],
      importance: 'nice_to_have',
    },
  ] as LearnedCriterion[],
  extractedFrom: ['sample-conversation-1', 'sample-conversation-2', 'sample-conversation-3'],
  learnedAt: new Date().toISOString(),
  modelVersion: 'test-sample-v1',
};

export async function POST(request: NextRequest) {
  // Safety check - only in development with explicit opt-in flag
  if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_TEST_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const body = await request.json();
    const { mode, templateName } = body as {
      mode: 'zero_config' | 'template' | 'auto_learn' | 'advanced';
      templateName?: string;
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

    const orgId = profile.organization_id;
    const results: Record<string, unknown> = { mode };

    // 1. Reset previous mode
    await supabase
      .from('stage_ai_config')
      .update({ enabled: false })
      .eq('organization_id', orgId);

    // 2. Set mode in organization_settings
    const updateData: Record<string, unknown> = {
      ai_config_mode: mode,
      updated_at: new Date().toISOString(),
    };

    // 3. Mode-specific setup
    switch (mode) {
      case 'zero_config': {
        // Provision stage configs with BANT
        const { data: boards } = await supabase
          .from('boards')
          .select('id, name')
          .eq('organization_id', orgId)
          .is('deleted_at', null);

        if (!boards?.length) {
          return NextResponse.json({ error: 'No boards found' }, { status: 404 });
        }

        let totalCreated = 0;
        for (const board of boards) {
          const { data: stages } = await supabase
            .from('board_stages')
            .select('id, name, "order"')
            .eq('board_id', board.id)
            .order('"order"', { ascending: true });

          if (!stages?.length) continue;

          for (const stage of stages) {
            const templateIndex = Math.min(stage.order, 3);
            const template = BANT_STAGE_PROMPTS[templateIndex];

            // Upsert config
            const { data: existing } = await supabase
              .from('stage_ai_config')
              .select('id')
              .eq('stage_id', stage.id)
              .single();

            if (existing) {
              await supabase
                .from('stage_ai_config')
                .update({
                  enabled: true,
                  system_prompt: template.prompt,
                  stage_goal: template.goal,
                  advancement_criteria: template.criteria,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
            } else {
              await supabase.from('stage_ai_config').insert({
                stage_id: stage.id,
                board_id: board.id,
                organization_id: orgId,
                enabled: true,
                system_prompt: template.prompt,
                stage_goal: template.goal,
                advancement_criteria: template.criteria,
              });
              totalCreated++;
            }
          }
        }
        results.stageConfigsCreated = totalCreated;
        results.boards = boards.length;
        break;
      }

      case 'template': {
        // Find and set template
        const tplName = templateName || 'BANT';
        const { data: template } = await supabase
          .from('ai_qualification_templates')
          .select('id, name, stages')
          .ilike('name', tplName)
          .single();

        if (!template) {
          return NextResponse.json({ error: `Template ${tplName} not found` }, { status: 404 });
        }

        updateData.ai_template_id = template.id;
        results.template = template.name;

        // Provision stages based on template
        const { data: boards } = await supabase
          .from('boards')
          .select('id')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .limit(1)
          .single();

        if (boards) {
          const { data: stages } = await supabase
            .from('board_stages')
            .select('id, "order"')
            .eq('board_id', boards.id)
            .order('"order"', { ascending: true });

          if (stages) {
            for (const stage of stages) {
              const templateStage = template.stages?.[stage.order] || template.stages?.[0];
              if (templateStage) {
                const { data: existing } = await supabase
                  .from('stage_ai_config')
                  .select('id')
                  .eq('stage_id', stage.id)
                  .single();

                const configData = {
                  enabled: true,
                  system_prompt: templateStage.prompt_template,
                  stage_goal: templateStage.goal || templateStage.name,
                  advancement_criteria: templateStage.criteria || [],
                  updated_at: new Date().toISOString(),
                };

                if (existing) {
                  await supabase.from('stage_ai_config').update(configData).eq('id', existing.id);
                } else {
                  await supabase.from('stage_ai_config').insert({
                    ...configData,
                    stage_id: stage.id,
                    board_id: boards.id,
                    organization_id: orgId,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case 'auto_learn': {
        // Set sample learned patterns
        updateData.ai_learned_patterns = SAMPLE_LEARNED_PATTERNS;
        results.learnedPatterns = {
          criteriaCount: SAMPLE_LEARNED_PATTERNS.learnedCriteria.length,
          questionPatterns: SAMPLE_LEARNED_PATTERNS.questionPatterns.length,
          extractedFrom: SAMPLE_LEARNED_PATTERNS.extractedFrom,
        };

        // Also provision stage configs (needed for stage advancement)
        const { data: boards } = await supabase
          .from('boards')
          .select('id')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .limit(1)
          .single();

        if (boards) {
          const { data: stages } = await supabase
            .from('board_stages')
            .select('id, "order"')
            .eq('board_id', boards.id)
            .order('"order"', { ascending: true });

          if (stages) {
            for (const stage of stages) {
              const templateIndex = Math.min(stage.order, 3);
              const template = BANT_STAGE_PROMPTS[templateIndex];

              const { data: existing } = await supabase
                .from('stage_ai_config')
                .select('id')
                .eq('stage_id', stage.id)
                .single();

              const configData = {
                enabled: true,
                system_prompt: template.prompt,
                stage_goal: template.goal,
                advancement_criteria: template.criteria,
              };

              if (existing) {
                await supabase
                  .from('stage_ai_config')
                  .update({ ...configData, updated_at: new Date().toISOString() })
                  .eq('id', existing.id);
              } else {
                await supabase.from('stage_ai_config').insert({
                  ...configData,
                  stage_id: stage.id,
                  board_id: boards.id,
                  organization_id: orgId,
                });
              }
            }
          }
        }
        break;
      }

      case 'advanced': {
        // Same as zero_config but mark as advanced
        // User would configure manually in production
        const { data: boards } = await supabase
          .from('boards')
          .select('id')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .limit(1)
          .single();

        if (boards) {
          const { data: stages } = await supabase
            .from('board_stages')
            .select('id, "order"')
            .eq('board_id', boards.id)
            .order('"order"', { ascending: true });

          if (stages) {
            for (const stage of stages) {
              const templateIndex = Math.min(stage.order, 3);
              const template = BANT_STAGE_PROMPTS[templateIndex];

              const { data: existing } = await supabase
                .from('stage_ai_config')
                .select('id')
                .eq('stage_id', stage.id)
                .single();

              const configData = {
                enabled: true,
                system_prompt: template.prompt,
                stage_goal: template.goal,
                advancement_criteria: template.criteria,
              };

              if (existing) {
                await supabase
                  .from('stage_ai_config')
                  .update({ ...configData, updated_at: new Date().toISOString() })
                  .eq('id', existing.id);
              } else {
                await supabase.from('stage_ai_config').insert({
                  ...configData,
                  stage_id: stage.id,
                  board_id: boards.id,
                  organization_id: orgId,
                });
              }
            }
          }
        }
        results.note = 'Advanced mode setup with BANT defaults. Customize in production.';
        break;
      }
    }

    // Update organization settings
    const { error: updateError } = await supabase
      .from('organization_settings')
      .update(updateData)
      .eq('organization_id', orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mode,
      organizationId: orgId,
      setup: results,
      message: `Mode ${mode} configured successfully. Ready for testing.`,
    });
  } catch (error) {
    console.error('[SetupMode] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

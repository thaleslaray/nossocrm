/**
 * @fileoverview Provision Stage AI Configs API
 *
 * Cria automaticamente stage_ai_config para todos os estágios de todos os boards
 * da organização, usando prompts BANT padrão.
 *
 * POST /api/ai/provision-stages
 *
 * Chamado quando usuário seleciona modo "Automático" (zero_config).
 *
 * @module app/api/ai/provision-stages
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 120;

// =============================================================================
// BANT Stage Templates
// =============================================================================

const BANT_STAGE_PROMPTS: Record<number, { prompt: string; criteria: string[]; goal: string }> = {
  // Primeiro estágio (ordem 0)
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
  // Segundo estágio (ordem 1)
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
  // Terceiro estágio (ordem 2)
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
  // Quarto estágio em diante (ordem 3+)
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

// =============================================================================
// Route Handler
// =============================================================================

export async function POST() {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const organizationId = profile.organization_id;

    // Get all boards for this organization
    const { data: boards, error: boardsError } = await supabase
      .from('boards')
      .select('id, name')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (boardsError) {
      console.error('[ProvisionStages] Failed to fetch boards:', boardsError);
      return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 });
    }

    if (!boards || boards.length === 0) {
      return NextResponse.json({ error: 'No boards found' }, { status: 404 });
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    const errors: string[] = [];

    // Process each board
    for (const board of boards) {
      // Get stages for this board
      const { data: stages, error: stagesError } = await supabase
        .from('board_stages')
        .select('id, name, "order"')
        .eq('board_id', board.id)
        .order('"order"', { ascending: true });

      if (stagesError) {
        errors.push(`Board ${board.name}: Failed to fetch stages`);
        continue;
      }

      if (!stages || stages.length === 0) {
        continue;
      }

      // Create/update config for each stage
      for (const stage of stages) {
        // Get appropriate template based on order (cap at 3 for last template)
        const templateIndex = Math.min(stage.order, 3);
        const template = BANT_STAGE_PROMPTS[templateIndex];

        // Check if config already exists
        const { data: existing } = await supabase
          .from('stage_ai_config')
          .select('id')
          .eq('stage_id', stage.id)
          .single();

        if (existing) {
          // Update existing - only if not customized (check if prompt is still default-ish)
          const { error: updateError } = await supabase
            .from('stage_ai_config')
            .update({
              enabled: true,
              system_prompt: template.prompt,
              stage_goal: template.goal,
              advancement_criteria: template.criteria,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updateError) {
            errors.push(`Stage ${stage.name}: Update failed`);
          } else {
            totalUpdated++;
          }
        } else {
          // Create new config
          const { error: insertError } = await supabase.from('stage_ai_config').insert({
            stage_id: stage.id,
            board_id: board.id,
            organization_id: organizationId,
            enabled: true,
            system_prompt: template.prompt,
            stage_goal: template.goal,
            advancement_criteria: template.criteria,
          });

          if (insertError) {
            errors.push(`Stage ${stage.name}: Insert failed - ${insertError.message}`);
          } else {
            totalCreated++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Provisioned ${totalCreated} new configs, updated ${totalUpdated} existing`,
      created: totalCreated,
      updated: totalUpdated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[ProvisionStages] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

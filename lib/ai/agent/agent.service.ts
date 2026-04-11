/**
 * @fileoverview AI Agent Service
 *
 * Serviço principal do agente autônomo de vendas.
 * Processa mensagens recebidas e gera respostas automaticamente.
 *
 * @module lib/ai/agent/agent.service
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { type AIProvider } from '../config';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from '../defaults';
import { generateWithFailover, buildProviderList } from './provider-failover';
import { checkRateLimit, recordRateCall } from './rate-limiter';
import { checkTokenBudget } from './token-budget';
import { buildLeadContext, formatContextForPrompt } from './context-builder';
import { getChannelRouter } from '@/lib/messaging/channel-router.service';
import { evaluateStageAdvancement } from './stage-evaluator';
import { extractAndUpdateBANT } from '../extraction/extraction.service';
import {
  buildConversationalPromptFromPatterns,
} from './generative-schema';
import type { LearnedPattern } from './few-shot-learner';
import type {
  StageAIConfig,
  LeadContext,
  AgentDecision,
  AgentProcessResult,
} from './types';

/**
 * Prompt base padrão do agente — usado quando a organização não configurou
 * um prompt próprio em organization_settings.ai_base_system_prompt.
 * Edite via Settings > IA > Prompt Base para customizar por organização.
 */
const DEFAULT_BASE_SYSTEM_PROMPT = `Você é um assistente de vendas profissional.
Seu objetivo é ajudar leads a avançar no funil de vendas de forma natural e consultiva.

REGRAS IMPORTANTES:
1. Seja cordial e profissional, mas não robótico
2. Use o nome do lead quando apropriado
3. Faça perguntas para entender as necessidades
4. Nunca invente informações sobre produtos/serviços
5. Se não souber responder algo, diga que vai verificar
6. Mantenha respostas concisas (máximo 3-4 frases)
7. Use emojis com moderação (máximo 1 por mensagem)
8. NUNCA revele que você é uma IA`;

// =============================================================================
// Organization AI Config
// =============================================================================

export type AIConfigMode = 'zero_config' | 'template' | 'auto_learn' | 'advanced';

export interface OrgAIConfig {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
  hitlThreshold: number;
  /** Min confidence to surface a stage-advance suggestion. DB: ai_hitl_min_confidence. Default 0.70. */
  hitlMinConfidence: number;
  /** Hours before a pending HITL advance expires. DB: ai_hitl_expiration_hours. Default 24. */
  hitlExpirationHours: number;
  configMode: AIConfigMode;
  learnedPatterns: LearnedPattern | null;
  templateId: string | null;
  takeoverEnabled: boolean;
  takeoverMinutes: number;
  /** Org-level base system prompt (rules, tone, identity). DB: ai_base_system_prompt. Null → use built-in default. */
  baseSystemPrompt: string | null;
  /** Org timezone. DB: timezone. Default 'America/Sao_Paulo'. */
  timezone: string;
}

/**
 * Busca as configurações de AI da organização no banco de dados.
 */
export async function getOrgAIConfig(
  supabase: SupabaseClient,
  organizationId: string
): Promise<OrgAIConfig | null> {
  const { data: orgSettings, error } = await supabase
    .from('organization_settings')
    .select(
      'ai_enabled, ai_provider, ai_model, ai_google_key, ai_hitl_threshold, ai_hitl_min_confidence, ai_hitl_expiration_hours, ai_config_mode, ai_learned_patterns, ai_template_id, ai_takeover_enabled, ai_takeover_minutes, ai_base_system_prompt, timezone'
    )
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    console.error('[AIAgent] Error fetching org AI config:', error);
    return null;
  }

  if (!orgSettings) {
    console.warn('[AIAgent] No AI settings found for organization:', organizationId);
    return null;
  }

  const provider = (orgSettings.ai_provider || AI_DEFAULT_PROVIDER) as AIProvider;

  const apiKey = orgSettings.ai_google_key || '';

  if (!apiKey) {
    console.warn('[AIAgent] No API key configured for provider:', provider);
    return null;
  }

  // Parse learned patterns - pode ser {} vazio, null, ou objeto válido
  let learnedPatterns: LearnedPattern | null = null;
  if (
    orgSettings.ai_learned_patterns &&
    typeof orgSettings.ai_learned_patterns === 'object' &&
    Object.keys(orgSettings.ai_learned_patterns as object).length > 0 &&
    'learnedCriteria' in (orgSettings.ai_learned_patterns as object)
  ) {
    learnedPatterns = orgSettings.ai_learned_patterns as LearnedPattern;
  }

  return {
    enabled: orgSettings.ai_enabled !== false, // default true
    provider,
    model: orgSettings.ai_model || AI_DEFAULT_MODELS[provider],
    apiKey,
    hitlThreshold: orgSettings.ai_hitl_threshold ?? 0.85,
    hitlMinConfidence: orgSettings.ai_hitl_min_confidence ?? 0.70,
    hitlExpirationHours: orgSettings.ai_hitl_expiration_hours ?? 24,
    configMode: (orgSettings.ai_config_mode as AIConfigMode) || 'zero_config',
    learnedPatterns,
    templateId: orgSettings.ai_template_id || null,
    takeoverEnabled: orgSettings.ai_takeover_enabled === true,
    takeoverMinutes: orgSettings.ai_takeover_minutes ?? 15,
    baseSystemPrompt: orgSettings.ai_base_system_prompt || null,
    timezone: orgSettings.timezone || 'America/Sao_Paulo',
  };
}

// =============================================================================
// Types
// =============================================================================

export interface ProcessMessageParams {
  supabase: SupabaseClient;
  conversationId: string;
  organizationId: string;
  incomingMessage: string;
  messageId?: string;
  /** Simulation mode: skips actual channel delivery, marks message as sent directly. */
  simulationMode?: boolean;
}

// =============================================================================
// Agent Service
// =============================================================================

/**
 * Processa uma mensagem recebida e decide a ação do AI Agent.
 *
 * Fluxo:
 * 1. Busca deal associado à conversa
 * 2. Busca deal e stage
 * 3. Busca configuração de AI do estágio
 * 4. Busca configuração de AI da organização (chaves do banco)
 * 5. Monta contexto do lead
 * 6. Verifica limite de mensagens
 * 7. Verifica handoff keywords
 * 8. Verifica horário comercial
 * 9. Gera resposta com AI (usando chaves do banco)
 * 10. Envia resposta via ChannelRouter
 * 11. Log da interação
 */
export async function processIncomingMessage(
  params: ProcessMessageParams
): Promise<AgentProcessResult> {
  const { supabase, conversationId, organizationId, incomingMessage, messageId } = params;

  console.log('[AIAgent] Processing message:', { conversationId, messageId });

  // 0a. Rate limit check (per-conversation)
  const rateCheck = checkRateLimit(conversationId);
  if (!rateCheck.allowed) {
    console.warn('[AIAgent] Rate limited for conversation:', conversationId);
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: `Rate limit: aguarde ${Math.ceil((rateCheck.retryAfterMs || 0) / 1000)}s`,
      },
    };
  }

  // 1. Buscar deal associado à conversa para pegar o stage + assignment
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('metadata, assigned_user_id, assigned_at, contact_id')
    .eq('id', conversationId)
    .single();

  // 0b. Check if AI is paused for this conversation (metadata) or contact
  const conversationMetadata = (conversation?.metadata || {}) as Record<string, unknown>;
  if (conversationMetadata.ai_paused === true) {
    console.log('[AIAgent] AI paused for this conversation:', conversationId);
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'AI pausado para esta conversa',
      },
    };
  }

  // 0c. Check if AI is paused at the contact level (cross-channel)
  if (conversation?.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('ai_paused')
      .eq('id', conversation.contact_id)
      .maybeSingle();
    if (contact?.ai_paused) {
      console.log('[AIAgent] AI paused for contact:', conversation.contact_id);
      return {
        success: true,
        decision: {
          action: 'skipped',
          reason: 'AI pausado para este contato',
        },
      };
    }
  }

  const dealId = conversationMetadata.deal_id as string | undefined;

  if (!dealId) {
    console.log('[AIAgent] No deal associated, skipping AI processing');
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'Conversa não tem deal associado',
      },
    };
  }

  // 2. Buscar deal e stage
  const { data: deal } = await supabase
    .from('deals')
    .select('id, stage_id, board_id')
    .eq('id', dealId)
    .single();

  if (!deal?.stage_id) {
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'Deal sem estágio definido',
      },
    };
  }

  // 3. Buscar config do AI para este estágio
  const { data: stageConfig } = await supabase
    .from('stage_ai_config')
    .select('*')
    .eq('stage_id', deal.stage_id)
    .eq('enabled', true)
    .single();

  if (!stageConfig) {
    console.log('[AIAgent] AI not enabled for this stage');
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'AI não habilitado para este estágio',
      },
    };
  }

  const config = stageConfig as StageAIConfig;

  // 3b. Verificar escopo do agente (agent_goal_stage_id)
  // Se o deal está além do estágio limite configurado no board, o agente não age.
  if (deal.board_id) {
    const { data: board } = await supabase
      .from('boards')
      .select('agent_goal_stage_id')
      .eq('id', deal.board_id)
      .maybeSingle();

    if (board?.agent_goal_stage_id) {
      // Buscar a ordem do estágio atual e do estágio limite em paralelo
      const [currentStageResult, goalStageResult] = await Promise.all([
        supabase
          .from('board_stages')
          .select('"order"')
          .eq('id', deal.stage_id)
          .maybeSingle(),
        supabase
          .from('board_stages')
          .select('"order"')
          .eq('id', board.agent_goal_stage_id)
          .maybeSingle(),
      ]);

      const currentOrder = currentStageResult.data?.order ?? null;
      const goalOrder = goalStageResult.data?.order ?? null;

      if (currentOrder !== null && goalOrder !== null && currentOrder > goalOrder) {
        console.log('[AIAgent] Deal beyond agent scope (stage order %d > goal %d)', currentOrder, goalOrder);
        return {
          success: true,
          decision: {
            action: 'skipped',
            reason: 'Fora do escopo do agente (estágio além do limite configurado)',
          },
        };
      }
    }
  }

  // 4. Buscar configuração de AI e token budget em paralelo
  const [aiConfig, budgetCheck] = await Promise.all([
    getOrgAIConfig(supabase, organizationId),
    checkTokenBudget(supabase, organizationId),
  ]);

  if (!aiConfig) {
    console.log('[AIAgent] No AI config found for organization');
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'Configuração de AI não encontrada para a organização',
      },
    };
  }

  if (!aiConfig.enabled) {
    console.log('[AIAgent] AI is disabled for organization');
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'AI desabilitado para esta organização',
      },
    };
  }

  // 4a-2. Token budget check (já resolvido acima via Promise.all)
  if (!budgetCheck.allowed) {
    console.warn('[AIAgent] Token budget exceeded:', budgetCheck);
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: `Limite mensal de tokens excedido (${budgetCheck.used.toLocaleString()}/${budgetCheck.limit.toLocaleString()})`,
      },
    };
  }

  // 4b. Verificar inatividade do operador (AI Takeover)
  if (aiConfig.takeoverEnabled && conversation?.assigned_user_id) {
    const operatorActive = await isOperatorActive(
      supabase,
      conversationId,
      conversation.assigned_at,
      aiConfig.takeoverMinutes
    );

    if (operatorActive) {
      console.log('[AIAgent] Operator is active, skipping AI response');
      return {
        success: true,
        decision: {
          action: 'skipped',
          reason: `Operador ativo (última mensagem há menos de ${aiConfig.takeoverMinutes} min)`,
        },
      };
    }

    console.log(`[AIAgent] Operator inactive for >${aiConfig.takeoverMinutes}min, AI taking over`);
  }

  // 5. Montar contexto do lead
  const context = await buildLeadContext({
    supabase,
    conversationId,
    organizationId,
  });

  if (!context) {
    return {
      success: false,
      decision: {
        action: 'skipped',
        reason: 'Falha ao montar contexto',
      },
      error: {
        code: 'CONTEXT_BUILD_FAILED',
        message: 'Não foi possível montar o contexto do lead',
      },
    };
  }

  // 6. Verificar limite de mensagens
  if (context.stats.ai_messages_count >= config.settings.max_messages_per_conversation) {
    const handoffDecision = await handleHandoff(supabase, conversationId, organizationId, context, 'Limite de mensagens atingido', incomingMessage);
    await logAIInteraction({ supabase, organizationId, conversationId, messageId, stageId: deal.stage_id, context, decision: handoffDecision });
    return { success: true, decision: handoffDecision };
  }

  // 7. Verificar handoff keywords
  const handoffKeyword = checkHandoffKeywords(incomingMessage, config.settings.handoff_keywords);
  if (handoffKeyword) {
    const handoffDecision = await handleHandoff(
      supabase,
      conversationId,
      organizationId,
      context,
      `Keyword de handoff detectada: "${handoffKeyword}"`,
      incomingMessage,
    );
    await logAIInteraction({ supabase, organizationId, conversationId, messageId, stageId: deal.stage_id, context, decision: handoffDecision });
    return { success: true, decision: handoffDecision };
  }

  // 7.5. Verificar notify_team — handoff automático por configuração de estágio
  if (config.notify_team) {
    const handoffDecision = await handleHandoff(
      supabase,
      conversationId,
      organizationId,
      context,
      'Estágio configurado para notificar equipe (notify_team)',
      incomingMessage,
    );
    await logAIInteraction({ supabase, organizationId, conversationId, messageId, stageId: deal.stage_id, context, decision: handoffDecision });
    return { success: true, decision: handoffDecision };
  }

  // 8. Verificar horário comercial
  if (config.settings.business_hours_only && !isBusinessHours(config.settings.business_hours)) {
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'Fora do horário comercial',
      },
    };
  }

  // 8.5. Aplicar delay de resposta (simula tempo humano de digitação)
  if (config.settings.response_delay_seconds > 0) {
    await new Promise<void>((r) => setTimeout(r, config.settings.response_delay_seconds * 1000));
  }

  // 9. Gerar resposta usando configuração de AI do banco
  const decision = await generateResponse({
    context,
    stageConfig: config,
    incomingMessage,
    aiConfig,
  });

  // Record rate call only on actual AI response (not on skipped/handoff)
  if (decision.action === 'responded') {
    recordRateCall(conversationId);
  }

  // 10. Se deve responder, enviar mensagem
  if (decision.action === 'responded' && decision.response) {
    const sendResult = await sendAIResponse({
      supabase,
      conversationId,
      response: decision.response,
      simulationMode: params.simulationMode,
    });

    if (!sendResult.success) {
      return {
        success: false,
        decision,
        error: sendResult.error,
      };
    }

    // 11. Log da interação
    await logAIInteraction({
      supabase,
      organizationId,
      conversationId,
      messageId,
      stageId: deal.stage_id,
      context,
      decision,
    });

    // 12. Extrair campos BANT automaticamente (fire-and-forget)
    extractAndUpdateBANT({
      supabase,
      dealId,
      conversationId,
      organizationId,
      triggerMessageId: messageId,
    }).catch((err) => {
      console.error('[AIAgent] BANT extraction failed:', err);
    });

    // 13. Avaliar avanço de estágio (após resposta bem-sucedida)
    let stageAdvanced = false;
    let newStageId: string | undefined;

    if (config.advancement_criteria && config.advancement_criteria.length > 0) {
      // Montar histórico da conversa para avaliação
      const conversationHistory = await getConversationHistory(supabase, conversationId);

      const evalResult = await evaluateStageAdvancement({
        supabase,
        context,
        stageConfig: config,
        conversationHistory,
        aiConfig: {
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
        },
        organizationId,
        hitlThreshold: aiConfig.hitlThreshold,
        hitlMinConfidence: aiConfig.hitlMinConfidence,
        hitlExpirationHours: aiConfig.hitlExpirationHours,
        conversationId,
      });

      if (evalResult.advanced && evalResult.newStageId) {
        stageAdvanced = true;
        newStageId = evalResult.newStageId;
        console.log('[AIAgent] Deal advanced to stage:', newStageId);
      } else if (evalResult.requiresConfirmation && evalResult.pendingAdvanceId) {
        console.log('[AIAgent] Stage advancement requires HITL confirmation:', evalResult.pendingAdvanceId);
      }
    }

    return {
      success: true,
      decision: {
        ...decision,
        stage_advanced: stageAdvanced,
        new_stage_id: newStageId,
      },
      message_sent: {
        id: sendResult.messageId!,
      },
    };
  }

  return {
    success: true,
    decision,
  };
}

// =============================================================================
// Response Generation
// =============================================================================

interface GenerateResponseParams {
  context: LeadContext;
  stageConfig: StageAIConfig;
  incomingMessage: string;
  aiConfig: OrgAIConfig;
}

async function generateResponse(params: GenerateResponseParams): Promise<AgentDecision> {
  const { context, stageConfig, incomingMessage, aiConfig } = params;

  const systemPrompt = buildSystemPrompt(
    context,
    stageConfig,
    aiConfig.learnedPatterns,
    aiConfig.configMode,
    aiConfig.baseSystemPrompt
  );
  const contextText = formatContextForPrompt(context);

  const userPrompt = `
${contextText}

---

A última mensagem do lead foi:
"${incomingMessage}"

Responda de forma natural, seguindo as instruções do sistema.
`;

  try {
    // Usar model do stage se definido, senão usar config da organização
    const modelId = stageConfig.ai_model || aiConfig.model;

    // Build provider list with failover (primary first, then others with keys)
    const providers = buildProviderList({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: modelId,
    });

    const result = await generateWithFailover({
      providers,
      system: systemPrompt,
      prompt: userPrompt,
      maxRetries: 2,
    });

    return {
      action: 'responded',
      response: result.text.trim(),
      reason: 'Resposta gerada com sucesso',
      tokens_used: result.usage?.totalTokens,
      model_used: result.modelUsed || modelId,
    };
  } catch (error) {
    console.error('[AIAgent] All providers failed:', error);
    return {
      action: 'skipped',
      reason: `Erro na geração: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

function buildSystemPrompt(
  context: LeadContext,
  config: StageAIConfig,
  learnedPatterns: LearnedPattern | null,
  configMode: AIConfigMode,
  orgBasePrompt: string | null
): string {
  // Usa prompt base da org (editável em Settings > IA) ou o padrão embutido
  const basePrompt = orgBasePrompt || DEFAULT_BASE_SYSTEM_PROMPT;

  // Se modo Auto-Learn e tem padrões aprendidos, usar sistema de padrões
  if (configMode === 'auto_learn' && learnedPatterns) {
    console.log('[AIAgent] Using learned patterns for response generation');

    const learnedPrompt = buildConversationalPromptFromPatterns(learnedPatterns);

    return `${learnedPrompt}

## Contexto da Organização
Você está representando: ${context.organization.name}

${config.stage_goal ? `
## Objetivo deste Estágio
${config.stage_goal}
` : ''}

${config.advancement_criteria.length > 0 ? `
## Para Avançar o Lead
${config.advancement_criteria.map((c) => `- ${c}`).join('\n')}
` : ''}

## Instruções Adicionais
${config.system_prompt}
`;
  }

  // Modo padrão (zero_config, template, advanced)
  const stageSection = `
## Contexto
Você está representando: ${context.organization.name}

${config.stage_goal ? `OBJETIVO DESTE ESTÁGIO:\n${config.stage_goal}\n` : ''}
${config.advancement_criteria.length > 0 ? `PARA AVANÇAR O LEAD, VOCÊ PRECISA:\n${config.advancement_criteria.map((c) => `- ${c}`).join('\n')}\n` : ''}`;

  return `${basePrompt}

${stageSection}

INSTRUÇÕES ESPECÍFICAS:
${config.system_prompt}
`;
}

// =============================================================================
// Message Sending
// =============================================================================

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: { code: string; message: string };
}

async function sendAIResponse(params: {
  supabase: SupabaseClient;
  conversationId: string;
  response: string;
  simulationMode?: boolean;
}): Promise<SendResult> {
  const { supabase, conversationId, response, simulationMode } = params;

  // Buscar dados da conversa e canal
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('channel_id, external_contact_id')
    .eq('id', conversationId)
    .single();

  if (!conversation?.channel_id) {
    return {
      success: false,
      error: { code: 'NO_CHANNEL', message: 'Conversa sem canal associado' },
    };
  }

  if (!conversation.external_contact_id) {
    return {
      success: false,
      error: { code: 'NO_CONTACT', message: 'Conversa sem contato externo' },
    };
  }

  // Inserir mensagem no banco com status pending
  const { data: message, error: insertError } = await supabase
    .from('messaging_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'outbound',
      content_type: 'text',
      content: { type: 'text', text: response },
      status: 'pending',
      sender_type: 'ai',
      metadata: { sent_by_ai: true },
    })
    .select('id')
    .single();

  if (insertError) {
    return {
      success: false,
      error: { code: 'INSERT_FAILED', message: insertError.message },
    };
  }

  // Simulation mode: skip channel delivery, mark message as sent directly
  if (simulationMode) {
    await supabase
      .from('messaging_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', message.id);
    return { success: true, messageId: message.id };
  }

  // Enviar via ChannelRouter
  try {
    const router = getChannelRouter();
    const sendResult = await router.sendMessage(conversation.channel_id, {
      conversationId,
      to: conversation.external_contact_id,
      content: { type: 'text', text: response },
    });

    if (sendResult.success) {
      // Atualizar mensagem com external_id e status sent
      await supabase
        .from('messaging_messages')
        .update({
          external_id: sendResult.externalMessageId,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', message.id);

      return {
        success: true,
        messageId: message.id,
      };
    } else {
      // Marcar mensagem como falha
      await supabase
        .from('messaging_messages')
        .update({
          status: 'failed',
          error_code: sendResult.error?.code || 'SEND_FAILED',
          error_message: sendResult.error?.message || 'Unknown error',
          failed_at: new Date().toISOString(),
        })
        .eq('id', message.id);

      return {
        success: false,
        messageId: message.id,
        error: {
          code: sendResult.error?.code || 'SEND_FAILED',
          message: sendResult.error?.message || 'Falha ao enviar mensagem',
        },
      };
    }
  } catch (error) {
    console.error('[AIAgent] Error sending via provider:', error);

    // Marcar mensagem como falha
    await supabase
      .from('messaging_messages')
      .update({
        status: 'failed',
        error_code: 'PROVIDER_ERROR',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        failed_at: new Date().toISOString(),
      })
      .eq('id', message.id);

    return {
      success: false,
      messageId: message.id,
      error: {
        code: 'PROVIDER_ERROR',
        message: error instanceof Error ? error.message : 'Erro ao enviar',
      },
    };
  }
}

// =============================================================================
// Handoff
// =============================================================================

async function handleHandoff(
  supabase: SupabaseClient,
  conversationId: string,
  organizationId: string,
  context: LeadContext,
  reason: string,
  lastMessage?: string,
): Promise<AgentDecision> {
  const now = new Date().toISOString();

  // Fetch existing metadata to merge (never overwrite)
  const { data: existing } = await supabase
    .from('messaging_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();

  const existingMetadata = (existing?.metadata as Record<string, unknown>) ?? {};

  // Atualizar conversa para marcar handoff pendente
  await supabase
    .from('messaging_conversations')
    .update({
      metadata: {
        ...existingMetadata,
        ai_handoff_pending: true,
        ai_handoff_reason: reason,
        ai_handoff_at: now,
      },
    })
    .eq('id', conversationId);

  // Log handoff as deal activity
  if (context.deal?.id) {
    await supabase.from('deal_activities').insert({
      deal_id: context.deal.id,
      organization_id: organizationId,
      type: 'ai_handoff',
      description: `AI encaminhou conversa para operador humano: ${reason}`,
      metadata: {
        ai_handoff: true,
        reason,
        conversationId,
      },
    }).then(({ error }) => {
      if (error) console.error('[AIAgent] Failed to log handoff activity:', error);
    });
  }

  // Broadcast handoff notification via Supabase Realtime
  const channel = supabase.channel(`org:${organizationId}:notifications`);
  try {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 5000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    await channel.send({
      type: 'broadcast',
      event: 'ai_handoff',
      payload: {
        conversationId,
        dealId: context.deal?.id,
        contactName: context.contact?.name || 'Desconhecido',
        reason,
        timestamp: now,
      },
    });
  } catch (err) {
    console.error('[AIAgent] Failed to broadcast handoff notification:', err);
  } finally {
    supabase.removeChannel(channel);
  }

  // Send Telegram notification (fire-and-forget)
  if (lastMessage) {
    const { data: orgTelegram } = await supabase
      .from('organization_settings')
      .select('telegram_bot_token, telegram_chat_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (orgTelegram?.telegram_bot_token && orgTelegram?.telegram_chat_id) {
      const { sendTelegramMessage, formatHandoffMessage } = await import('@/lib/notifications/telegram');
      const message = formatHandoffMessage({
        contactName: context.contact?.name ?? 'Lead',
        dealTitle: context.deal?.title ?? 'Deal',
        stageName: context.stage.name,
        lastMessage,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
        dealId: context.deal?.id,
      });
      await sendTelegramMessage(
        orgTelegram.telegram_bot_token,
        orgTelegram.telegram_chat_id,
        message
      ).catch((err: unknown) => {
        console.error('[AIAgent] Failed to send Telegram handoff notification:', err);
      });
    }
  }

  return {
    action: 'handoff',
    reason,
  };
}

// =============================================================================
// Logging
// =============================================================================

async function logAIInteraction(params: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  messageId?: string;
  stageId: string;
  context: LeadContext;
  decision: AgentDecision;
}): Promise<void> {
  const { supabase, organizationId, conversationId, messageId, stageId, context, decision } = params;

  // Logging is fire-and-forget — a failure here must NOT propagate to the caller
  // and disrupt message processing or webhook acknowledgment.
  try {
    const { error } = await supabase.from('ai_conversation_log').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      message_id: messageId,
      stage_id: stageId,
      context_snapshot: context ?? {},
      ai_response: decision.response || '',
      tokens_used: decision.tokens_used,
      model_used: decision.model_used,
      action_taken: decision.action,
      action_reason: decision.reason,
    });
    if (error) {
      console.error('[AI] logAIInteraction insert failed (non-fatal):', error.message);
    }
  } catch (err) {
    console.error('[AI] logAIInteraction unexpected error (non-fatal):', err);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Verifica se o operador atribuído enviou mensagem recentemente.
 * Compara o tempo desde a última mensagem outbound do operador (ou assignment)
 * contra o limiar de takeover.
 */
async function isOperatorActive(
  supabase: SupabaseClient,
  conversationId: string,
  assignedAt: string | null,
  takeoverMinutes: number
): Promise<boolean> {
  const { data: lastUserMessage } = await supabase
    .from('messaging_messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('sender_type', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const referenceTime = lastUserMessage?.created_at || assignedAt;

  if (!referenceTime) {
    return false; // Nunca respondeu e não tem assignment → inativo
  }

  const minutesSince = (Date.now() - new Date(referenceTime).getTime()) / 60000;
  return minutesSince < takeoverMinutes;
}

function checkHandoffKeywords(message: string, keywords: string[]): string | null {
  const lowerMessage = message.toLowerCase();
  for (const keyword of keywords) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}

function isBusinessHours(hours?: { start: string; end: string; timezone: string; daysOfWeek?: number[] }): boolean {
  if (!hours) return true;

  try {
    const now = new Date();

    // Check day of week (0=Sunday, 6=Saturday)
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: hours.timezone,
      weekday: 'short',
    });
    const dayStr = dayFormatter.format(now);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dayMap[dayStr] ?? now.getDay();

    // Default: Mon-Fri (1-5) if daysOfWeek not specified
    const allowedDays = hours.daysOfWeek ?? [1, 2, 3, 4, 5];
    if (!allowedDays.includes(currentDay)) {
      return false;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: hours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const [hourStr, minuteStr] = formatter.format(now).split(':');
    const currentMinutes = parseInt(hourStr) * 60 + parseInt(minuteStr);

    const [startHour, startMin] = hours.start.split(':').map(Number);
    const [endHour, endMin] = hours.end.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true; // Em caso de erro, permite
  }
}

/**
 * Busca o histórico da conversa para avaliação de avanço.
 * Retorna as últimas mensagens no formato esperado pelo evaluator.
 */
async function getConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number = 10
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  // Fetch most recent messages (DESC) then reverse for chronological order
  const { data: messages } = await supabase
    .from('messaging_messages')
    .select('direction, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!messages || messages.length === 0) {
    return [];
  }

  // Reverse to chronological order (oldest first)
  messages.reverse();

  return messages.map((msg) => ({
    role: msg.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content:
      typeof msg.content === 'object' && msg.content !== null
        ? (msg.content as { text?: string }).text || JSON.stringify(msg.content)
        : String(msg.content),
  }));
}

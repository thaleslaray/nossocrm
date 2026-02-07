/**
 * @fileoverview AI Agent Service
 *
 * Serviço principal do agente autônomo de vendas.
 * Processa mensagens recebidas e gera respostas automaticamente.
 *
 * @module lib/ai/agent/agent.service
 */

import { generateText } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getModel, type AIProvider } from '../config';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from '../defaults';
import { buildLeadContext, formatContextForPrompt } from './context-builder';
import { getChannelRouter } from '@/lib/messaging/channel-router.service';
import { evaluateStageAdvancement } from './stage-evaluator';
import type {
  StageAIConfig,
  LeadContext,
  AgentDecision,
  AgentProcessResult,
} from './types';

// =============================================================================
// Organization AI Config
// =============================================================================

export interface OrgAIConfig {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
  hitlThreshold: number;
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
    .select('ai_enabled, ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key, ai_hitl_threshold')
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

  // Selecionar a chave correta baseado no provider
  const getApiKey = () => {
    switch (provider) {
      case 'google': return orgSettings.ai_google_key || '';
      case 'openai': return orgSettings.ai_openai_key || '';
      case 'anthropic': return orgSettings.ai_anthropic_key || '';
      default: return '';
    }
  };

  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn('[AIAgent] No API key configured for provider:', provider);
    return null;
  }

  return {
    enabled: orgSettings.ai_enabled !== false, // default true
    provider,
    model: orgSettings.ai_model || AI_DEFAULT_MODELS[provider],
    apiKey,
    hitlThreshold: orgSettings.ai_hitl_threshold ?? 0.85, // default 0.85
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

  // 1. Buscar deal associado à conversa para pegar o stage
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();

  const dealId = (conversation?.metadata as Record<string, unknown>)?.deal_id as string | undefined;

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
    .select('id, stage_id')
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

  // 4. Buscar configuração de AI da organização
  const aiConfig = await getOrgAIConfig(supabase, organizationId);

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
    return {
      success: true,
      decision: await handleHandoff(supabase, conversationId, context, 'Limite de mensagens atingido'),
    };
  }

  // 7. Verificar handoff keywords
  const handoffKeyword = checkHandoffKeywords(incomingMessage, config.settings.handoff_keywords);
  if (handoffKeyword) {
    return {
      success: true,
      decision: await handleHandoff(
        supabase,
        conversationId,
        context,
        `Keyword de handoff detectada: "${handoffKeyword}"`
      ),
    };
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

  // 9. Gerar resposta usando configuração de AI do banco
  const decision = await generateResponse({
    context,
    stageConfig: config,
    incomingMessage,
    aiConfig,
  });

  // 10. Se deve responder, enviar mensagem
  if (decision.action === 'responded' && decision.response) {
    const sendResult = await sendAIResponse({
      supabase,
      conversationId,
      response: decision.response,
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

    // 12. Avaliar avanço de estágio (após resposta bem-sucedida)
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

  const systemPrompt = buildSystemPrompt(context, stageConfig);
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

    const model = getModel(
      aiConfig.provider,
      aiConfig.apiKey,
      modelId
    );

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      maxRetries: 3,
    });

    return {
      action: 'responded',
      response: result.text.trim(),
      reason: 'Resposta gerada com sucesso',
      tokens_used: result.usage?.totalTokens,
      model_used: modelId,
    };
  } catch (error) {
    console.error('[AIAgent] Error generating response:', error);
    return {
      action: 'skipped',
      reason: `Erro na geração: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

function buildSystemPrompt(context: LeadContext, config: StageAIConfig): string {
  const basePrompt = `
Você é um assistente de vendas da ${context.organization.name}.
Seu objetivo é ajudar leads a avançar no funil de vendas de forma natural e consultiva.

REGRAS IMPORTANTES:
1. Seja cordial e profissional, mas não robótico
2. Use o nome do lead quando apropriado
3. Faça perguntas para entender as necessidades
4. Nunca invente informações sobre produtos/serviços
5. Se não souber responder algo, diga que vai verificar
6. Mantenha respostas concisas (máximo 3-4 frases)
7. Use emojis com moderação (máximo 1 por mensagem)
8. NUNCA revele que você é uma IA

${config.stage_goal ? `
OBJETIVO DESTE ESTÁGIO:
${config.stage_goal}
` : ''}

${config.advancement_criteria.length > 0 ? `
PARA AVANÇAR O LEAD, VOCÊ PRECISA:
${config.advancement_criteria.map((c) => `- ${c}`).join('\n')}
` : ''}
`;

  // Adicionar prompt customizado do estágio
  return `${basePrompt}

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
}): Promise<SendResult> {
  const { supabase, conversationId, response } = params;

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
  context: LeadContext,
  reason: string
): Promise<AgentDecision> {
  // Atualizar conversa para marcar handoff pendente
  await supabase
    .from('messaging_conversations')
    .update({
      metadata: {
        ...(context.deal ? {} : {}),
        ai_handoff_pending: true,
        ai_handoff_reason: reason,
        ai_handoff_at: new Date().toISOString(),
      },
    })
    .eq('id', conversationId);

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

  await supabase.from('ai_conversation_log').insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    message_id: messageId,
    stage_id: stageId,
    context_snapshot: context,
    ai_response: decision.response || '',
    tokens_used: decision.tokens_used,
    model_used: decision.model_used,
    action_taken: decision.action,
    action_reason: decision.reason,
  });
}

// =============================================================================
// Helpers
// =============================================================================

function checkHandoffKeywords(message: string, keywords: string[]): string | null {
  const lowerMessage = message.toLowerCase();
  for (const keyword of keywords) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}

function isBusinessHours(hours?: { start: string; end: string; timezone: string }): boolean {
  if (!hours) return true;

  try {
    const now = new Date();
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
  limit: number = 20
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const { data: messages } = await supabase
    .from('messaging_messages')
    .select('direction, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!messages || messages.length === 0) {
    return [];
  }

  return messages.map((msg) => ({
    role: msg.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content:
      typeof msg.content === 'object' && msg.content !== null
        ? (msg.content as { text?: string }).text || JSON.stringify(msg.content)
        : String(msg.content),
  }));
}

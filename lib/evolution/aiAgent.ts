/**
 * WhatsApp AI Agent v2 - Autonomous Intelligence
 *
 * This module orchestrates the complete AI agent pipeline:
 *
 * 1. Receive incoming WhatsApp message
 * 2. Check if AI should respond (active, working hours, etc.)
 * 3. Run Intelligence Engine (extract intents, memories, score, labels)
 * 4. Save extracted memories
 * 5. Update lead score
 * 6. Auto-assign labels
 * 7. Schedule smart follow-ups if needed
 * 8. Smart-pause if needed (customer wants human, negative sentiment)
 * 9. Build context from conversation history + CRM data + MEMORIES
 * 10. Generate AI response via configured provider
 * 11. Send response back via Evolution API
 * 12. Auto-create CRM contacts/deals if configured
 * 13. Generate conversation summary periodically
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppConversation, WhatsAppAIConfig, WhatsAppMessage, ChatMemory } from '@/types/whatsapp';
import {
  getMessages,
  insertMessage,
  insertAILog,
  getAIConfig,
  updateConversation,
} from '@/lib/supabase/whatsapp';
import {
  getMemories,
  saveExtractedMemories,
  upsertLeadScore,
  assignLabelByName,
  ensureDefaultLabels,
  createFollowUp,
  countActiveFollowUps,
  insertSummary,
} from '@/lib/supabase/whatsappIntelligence';
import { analyzeMessage } from '@/lib/evolution/intelligence';
import * as evolution from '@/lib/evolution/client';

interface AIAgentContext {
  supabase: SupabaseClient;
  conversation: WhatsAppConversation;
  instance: {
    id: string;
    evolution_instance_name: string;
    instance_token: string;
    organization_id: string;
    evolution_api_url: string;
  };
  incomingMessage: WhatsAppMessage;
}

// =============================================================================
// WORKING HOURS
// =============================================================================

function isWithinWorkingHours(config: WhatsAppAIConfig): boolean {
  if (!config.working_hours_start || !config.working_hours_end) return true;

  const now = new Date();
  const day = now.getDay();

  if (!config.working_days.includes(day)) return false;

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return currentTime >= config.working_hours_start && currentTime <= config.working_hours_end;
}

// =============================================================================
// CONTEXT BUILDERS
// =============================================================================

async function buildConversationContext(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 20,
): Promise<string> {
  const messages = await getMessages(supabase, conversationId, { limit });

  return messages
    .map((msg) => {
      const sender = msg.from_me ? 'Assistente' : 'Cliente';
      const content = msg.text_body || `[${msg.message_type}]`;
      return `${sender}: ${content}`;
    })
    .join('\n');
}

async function buildCRMContext(
  supabase: SupabaseClient,
  conversation: WhatsAppConversation,
): Promise<string> {
  const parts: string[] = [];

  if (conversation.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, email, phone, status, stage, total_value, notes, last_interaction')
      .eq('id', conversation.contact_id)
      .single();

    if (contact) {
      parts.push(`CONTATO CRM: ${contact.name || 'Sem nome'}`);
      if (contact.email) parts.push(`Email: ${contact.email}`);
      if (contact.status) parts.push(`Status: ${contact.status}`);
      if (contact.total_value) parts.push(`Valor total: R$ ${contact.total_value}`);
      if (contact.notes) parts.push(`Notas: ${contact.notes}`);
    }

    const { data: deals } = await supabase
      .from('deals')
      .select('title, value, priority, tags, ai_summary, board_stages(label)')
      .eq('contact_id', conversation.contact_id)
      .eq('is_won', false)
      .eq('is_lost', false)
      .limit(5);

    if (deals && deals.length > 0) {
      parts.push('\nNEGOCIOS ABERTOS:');
      for (const deal of deals) {
        const stage = (deal.board_stages as { label?: string } | null)?.label ?? 'N/A';
        parts.push(`- ${deal.title} | R$ ${deal.value ?? 0} | Estagio: ${stage} | Prioridade: ${deal.priority ?? 'N/A'}`);
      }
    }
  }

  return parts.join('\n');
}

function buildMemoryContext(memories: ChatMemory[]): string {
  if (memories.length === 0) return '';

  const parts = ['\nMEMORIAS DO CONTATO (use estas informacoes na conversa):'];

  const grouped = new Map<string, ChatMemory[]>();
  for (const mem of memories) {
    const group = grouped.get(mem.memory_type) || [];
    group.push(mem);
    grouped.set(mem.memory_type, group);
  }

  const typeLabels: Record<string, string> = {
    family: 'Familia',
    preference: 'Preferencias',
    budget: 'Orcamento',
    interest: 'Interesses',
    timeline: 'Prazos/Datas',
    objection: 'Objecoes levantadas',
    personal: 'Info pessoal',
    fact: 'Fatos',
    interaction: 'Estilo de comunicacao',
  };

  for (const [type, mems] of grouped.entries()) {
    parts.push(`\n${typeLabels[type] || type}:`);
    for (const m of mems) {
      parts.push(`  - ${m.key}: ${m.value}`);
    }
  }

  return parts.join('\n');
}

// =============================================================================
// AI RESPONSE GENERATOR
// =============================================================================

async function generateAIResponse(
  supabase: SupabaseClient,
  organizationId: string,
  config: WhatsAppAIConfig,
  conversationHistory: string,
  crmContext: string,
  memoryContext: string,
  incomingText: string,
): Promise<string> {
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key')
    .eq('organization_id', organizationId)
    .single();

  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key')
    .eq('user_id', organizationId)
    .maybeSingle();

  const provider = orgSettings?.ai_provider ?? 'google';
  const model = orgSettings?.ai_model ?? 'gemini-2.5-flash';

  let apiKey: string | undefined;
  if (provider === 'google') apiKey = orgSettings?.ai_google_key || userSettings?.ai_google_key;
  else if (provider === 'openai') apiKey = orgSettings?.ai_openai_key || userSettings?.ai_openai_key;
  else if (provider === 'anthropic') apiKey = orgSettings?.ai_anthropic_key || userSettings?.ai_anthropic_key;

  if (!apiKey) {
    return config.transfer_message || 'Um atendente humano ira continuar o atendimento.';
  }

  const systemPrompt = [
    config.system_prompt,
    '',
    `Seu nome: ${config.agent_name}`,
    `Seu papel: ${config.agent_role || 'Atendente virtual'}`,
    `Tom: ${config.agent_tone}`,
    '',
    'REGRAS:',
    '- Responda APENAS em texto simples (sem markdown, sem HTML)',
    '- Seja conciso: mensagens de WhatsApp devem ser curtas',
    '- Maximo de 3 paragrafos curtos por resposta',
    '- Se nao souber a resposta, informe que ira encaminhar para um atendente',
    '- Nunca invente informacoes sobre produtos ou precos',
    '- USE AS MEMORIAS DO CONTATO para personalizar a conversa',
    '- Se o cliente mencionou o nome de alguem (esposo, filha, etc), use o nome na conversa',
    '- Seja natural e humano, nao robotico',
    crmContext ? `\nCONTEXTO CRM:\n${crmContext}` : '',
    memoryContext || '',
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...(conversationHistory
      ? conversationHistory.split('\n').map((line) => {
          const isAssistant = line.startsWith('Assistente:');
          return {
            role: isAssistant ? ('assistant' as const) : ('user' as const),
            content: line.replace(/^(Assistente|Cliente): /, ''),
          };
        })
      : []),
    { role: 'user' as const, content: incomingText },
  ];

  const { generateText } = await import('ai');

  let modelInstance;
  if (provider === 'google') {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const google = createGoogleGenerativeAI({ apiKey });
    modelInstance = google(model);
  } else if (provider === 'openai') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const openai = createOpenAI({ apiKey });
    modelInstance = openai(model);
  } else {
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const anthropic = createAnthropic({ apiKey });
    modelInstance = anthropic(model);
  }

  const result = await generateText({
    model: modelInstance,
    messages,
    maxOutputTokens: 500,
  });

  return result.text || config.transfer_message || 'Desculpe, nao consegui processar sua mensagem.';
}

// =============================================================================
// AUTO-CREATE CRM ENTITIES
// =============================================================================

async function autoCreateContact(
  supabase: SupabaseClient,
  conversation: WhatsAppConversation,
  config: WhatsAppAIConfig,
): Promise<string | null> {
  if (!config.auto_create_contact) return null;
  if (conversation.contact_id) return conversation.contact_id;

  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', conversation.phone)
    .eq('organization_id', conversation.organization_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('whatsapp_conversations')
      .update({ contact_id: existing.id })
      .eq('id', conversation.id);
    return existing.id;
  }

  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      name: conversation.contact_name || conversation.phone,
      phone: conversation.phone,
      organization_id: conversation.organization_id,
      source: 'whatsapp',
      status: 'ACTIVE',
    })
    .select('id')
    .single();

  if (error || !newContact) return null;

  await supabase
    .from('whatsapp_conversations')
    .update({ contact_id: newContact.id })
    .eq('id', conversation.id);

  await insertAILog(supabase, {
    conversation_id: conversation.id,
    organization_id: conversation.organization_id,
    action: 'contact_created',
    details: { contact_id: newContact.id, phone: conversation.phone },
    triggered_by: 'ai',
  });

  return newContact.id;
}

async function autoCreateDeal(
  supabase: SupabaseClient,
  conversation: WhatsAppConversation,
  contactId: string,
  config: WhatsAppAIConfig,
): Promise<void> {
  if (!config.auto_create_deal || !config.default_board_id) return;

  const { data: existingDeal } = await supabase
    .from('deals')
    .select('id')
    .eq('contact_id', contactId)
    .eq('board_id', config.default_board_id)
    .eq('is_won', false)
    .eq('is_lost', false)
    .maybeSingle();

  if (existingDeal) return;

  let stageId = config.default_stage_id;
  if (!stageId) {
    const { data: firstStage } = await supabase
      .from('board_stages')
      .select('id')
      .eq('board_id', config.default_board_id)
      .order('order', { ascending: true })
      .limit(1)
      .single();
    if (!firstStage) return;
    stageId = firstStage.id;
  }

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      title: `WhatsApp - ${conversation.contact_name || conversation.phone}`,
      board_id: config.default_board_id,
      stage_id: stageId,
      contact_id: contactId,
      organization_id: conversation.organization_id,
      tags: config.default_tags ?? [],
      priority: 'medium',
    })
    .select('id')
    .single();

  if (error || !deal) return;

  await insertAILog(supabase, {
    conversation_id: conversation.id,
    organization_id: conversation.organization_id,
    action: 'deal_created',
    details: { deal_id: deal.id, board_id: config.default_board_id },
    triggered_by: 'ai',
  });
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

export async function processIncomingMessage(ctx: AIAgentContext): Promise<void> {
  const { supabase, conversation, instance, incomingMessage } = ctx;

  const config = await getAIConfig(supabase, instance.id);
  if (!config) return;

  if (!conversation.ai_active) return;

  // Check working hours
  if (!isWithinWorkingHours(config)) {
    if (config.outside_hours_message) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('conversation_id', conversation.id)
        .eq('from_me', true)
        .eq('text_body', config.outside_hours_message)
        .gte('created_at', `${today}T00:00:00`)
        .limit(1);

      if (!existingMsg || existingMsg.length === 0) {
        await sendAIReply(supabase, instance, conversation, config.outside_hours_message);
      }
    }
    return;
  }

  // Auto-create contact
  const contactId = await autoCreateContact(supabase, conversation, config);

  // Auto-create deal
  if (contactId) {
    await autoCreateDeal(supabase, conversation, contactId, config);
  }

  // =========================================================================
  // INTELLIGENCE ENGINE - The magic happens here
  // =========================================================================

  const incomingText = incomingMessage.text_body || '';

  // Only run intelligence on text messages
  if (incomingText) {
    const conversationHistory = await buildConversationContext(supabase, conversation.id);
    const existingMemories = await getMemories(supabase, conversation.id);

    const intelligence = await analyzeMessage(
      supabase,
      instance.organization_id,
      conversationHistory,
      incomingText,
      existingMemories,
      config,
    );

    // 1. Save extracted memories
    if (config.memory_enabled && intelligence.memories.length > 0) {
      await saveExtractedMemories(
        supabase,
        conversation.id,
        instance.organization_id,
        contactId ?? undefined,
        intelligence.memories,
        incomingMessage.id,
      );

      await insertAILog(supabase, {
        conversation_id: conversation.id,
        organization_id: instance.organization_id,
        action: 'memory_extracted',
        details: { count: intelligence.memories.length, keys: intelligence.memories.map((m) => m.key) },
        message_id: incomingMessage.id,
        triggered_by: 'ai',
      });
    }

    // 2. Update lead score
    if (config.lead_scoring_enabled && intelligence.lead_score_delta !== 0) {
      const score = await upsertLeadScore(
        supabase,
        conversation.id,
        instance.organization_id,
        contactId ?? undefined,
        intelligence.lead_score_delta,
        undefined,
        intelligence.buying_stage,
      );

      await insertAILog(supabase, {
        conversation_id: conversation.id,
        organization_id: instance.organization_id,
        action: 'lead_score_updated',
        details: {
          delta: intelligence.lead_score_delta,
          new_score: score.score,
          temperature: score.temperature,
        },
        triggered_by: 'ai',
      });
    }

    // 3. Auto-assign labels
    if (config.auto_label_enabled && intelligence.suggested_labels.length > 0) {
      await ensureDefaultLabels(supabase, instance.organization_id);

      for (const labelName of intelligence.suggested_labels) {
        const assigned = await assignLabelByName(
          supabase,
          conversation.id,
          instance.organization_id,
          labelName,
          'ai',
          `Intent: ${intelligence.intents.map((i) => i.intent).join(', ')}`,
        );

        if (assigned) {
          await insertAILog(supabase, {
            conversation_id: conversation.id,
            organization_id: instance.organization_id,
            action: 'label_assigned',
            details: { label: labelName },
            triggered_by: 'ai',
          });
        }
      }
    }

    // 4. Schedule follow-ups
    if (config.follow_up_enabled) {
      const followUpIntents = intelligence.intents.filter(
        (i) => i.follow_up_delay_minutes && i.follow_up_delay_minutes > 0,
      );

      if (followUpIntents.length > 0) {
        const activeCount = await countActiveFollowUps(supabase, conversation.id);
        const maxFollowUps = config.follow_up_max_per_conversation ?? 3;

        if (activeCount < maxFollowUps) {
          // Use the highest-confidence intent for the follow-up
          const primaryIntent = followUpIntents.sort((a, b) => b.confidence - a.confidence)[0];
          const delayMinutes = primaryIntent.follow_up_delay_minutes ?? config.follow_up_default_delay_minutes ?? 30;

          const triggerAt = new Date(Date.now() + delayMinutes * 60 * 1000);

          await createFollowUp(supabase, {
            conversation_id: conversation.id,
            organization_id: instance.organization_id,
            instance_id: instance.id,
            trigger_at: triggerAt.toISOString(),
            follow_up_type: 'smart',
            detected_intent: primaryIntent.intent,
            intent_confidence: primaryIntent.confidence,
            context: {
              ...primaryIntent.context,
              customer_name: conversation.contact_name || '',
              context_for_message: intelligence.summary || '',
            },
            original_customer_message: incomingText,
            original_message_id: incomingMessage.id,
          });

          await insertAILog(supabase, {
            conversation_id: conversation.id,
            organization_id: instance.organization_id,
            action: 'follow_up_scheduled',
            details: {
              intent: primaryIntent.intent,
              trigger_at: triggerAt.toISOString(),
              delay_minutes: delayMinutes,
            },
            message_id: incomingMessage.id,
            triggered_by: 'ai',
          });
        }
      }
    }

    // 5. Smart pause
    if (config.smart_pause_enabled && intelligence.should_pause) {
      await updateConversation(supabase, conversation.id, {
        ai_active: false,
        ai_pause_reason: intelligence.pause_reason || 'smart_pause',
      } as Parameters<typeof updateConversation>[2]);

      if (config.transfer_message) {
        await sendAIReply(supabase, instance, conversation, config.transfer_message);
      }

      await insertAILog(supabase, {
        conversation_id: conversation.id,
        organization_id: instance.organization_id,
        action: 'smart_paused',
        details: { reason: intelligence.pause_reason },
        triggered_by: 'ai',
      });

      return; // Don't send AI response, human will handle
    }
  }

  // =========================================================================
  // RESPONSE GENERATION
  // =========================================================================

  // Check message limit
  if (config.max_messages_per_conversation) {
    const { count } = await supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('sent_by', 'ai_agent');

    if (count && count >= config.max_messages_per_conversation) {
      await updateConversation(supabase, conversation.id, {
        ai_active: false,
        ai_pause_reason: 'message_limit_reached',
      } as Parameters<typeof updateConversation>[2]);

      if (config.transfer_message) {
        await sendAIReply(supabase, instance, conversation, config.transfer_message);
      }

      await insertAILog(supabase, {
        conversation_id: conversation.id,
        organization_id: instance.organization_id,
        action: 'escalated',
        details: { reason: 'message_limit_reached' },
        triggered_by: 'ai',
      });
      return;
    }
  }

  // Build context (with memories!)
  const conversationHistory = await buildConversationContext(supabase, conversation.id);
  const crmContext = await buildCRMContext(supabase, conversation);
  const memories = await getMemories(supabase, conversation.id);
  const memoryContext = buildMemoryContext(memories);

  // Check if greeting
  const { count: msgCount } = await supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('from_me', false);

  if (msgCount === 1 && config.greeting_message) {
    await sendAIReply(supabase, instance, conversation, config.greeting_message);
    return;
  }

  // Generate AI response with FULL context (memories included!)
  const messageText = incomingMessage.text_body || `[Mensagem do tipo: ${incomingMessage.message_type}]`;

  try {
    const aiResponse = await generateAIResponse(
      supabase,
      instance.organization_id,
      config,
      conversationHistory,
      crmContext,
      memoryContext,
      messageText,
    );

    if (config.reply_delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.reply_delay_ms));
    }

    const msg = await sendAIReply(supabase, instance, conversation, aiResponse);

    await insertAILog(supabase, {
      conversation_id: conversation.id,
      organization_id: instance.organization_id,
      action: 'replied',
      details: { response_length: aiResponse.length },
      message_id: msg?.id,
      triggered_by: 'ai',
    });

    // Generate summary periodically (every 10 messages)
    if (config.summary_enabled && msgCount && msgCount % 10 === 0) {
      generateAndSaveSummary(supabase, conversation, instance.organization_id, conversationHistory, memories).catch(
        (err) => console.error('[ai-agent] Summary generation failed:', err),
      );
    }
  } catch (err) {
    await insertAILog(supabase, {
      conversation_id: conversation.id,
      organization_id: instance.organization_id,
      action: 'error',
      details: { error: err instanceof Error ? err.message : String(err) },
      triggered_by: 'ai',
    });
  }
}

// =============================================================================
// SEND REPLY
// =============================================================================

async function sendAIReply(
  supabase: SupabaseClient,
  instance: AIAgentContext['instance'],
  conversation: WhatsAppConversation,
  text: string,
): Promise<WhatsAppMessage | null> {
  const creds: evolution.EvolutionCredentials = {
    baseUrl: instance.evolution_api_url,
    apiKey: instance.instance_token,
    instanceName: instance.evolution_instance_name,
  };

  try {
    const response = await evolution.sendText(creds, {
      number: conversation.phone,
      text,
    });

    const msg = await insertMessage(supabase, {
      conversation_id: conversation.id,
      organization_id: instance.organization_id,
      evolution_message_id: response.key?.id || undefined,
      from_me: true,
      message_type: 'text',
      text_body: text,
      status: 'sent',
      sent_by: 'ai_agent',
      whatsapp_timestamp: new Date().toISOString(),
    } as Parameters<typeof insertMessage>[1]);

    // Update conversation metadata so the list reflects the AI reply
    await updateConversation(supabase, conversation.id, {
      last_message_text: text.slice(0, 255),
      last_message_at: new Date().toISOString(),
      last_message_from_me: true,
    } as Parameters<typeof updateConversation>[2]);

    return msg;
  } catch {
    return null;
  }
}

// =============================================================================
// SUMMARY GENERATOR
// =============================================================================

async function generateAndSaveSummary(
  supabase: SupabaseClient,
  conversation: WhatsAppConversation,
  organizationId: string,
  conversationHistory: string,
  memories: ChatMemory[],
): Promise<void> {
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key')
    .eq('organization_id', organizationId)
    .single();

  const provider = orgSettings?.ai_provider ?? 'google';
  const model = orgSettings?.ai_model ?? 'gemini-2.5-flash';

  let apiKey: string | undefined;
  if (provider === 'google') apiKey = orgSettings?.ai_google_key;
  else if (provider === 'openai') apiKey = orgSettings?.ai_openai_key;
  else if (provider === 'anthropic') apiKey = orgSettings?.ai_anthropic_key;

  if (!apiKey) return;

  const prompt = `Resuma esta conversa de WhatsApp em 2-3 frases. Identifique pontos-chave e proximas acoes recomendadas.

MEMORIAS:
${memories.map((m) => `- ${m.key}: ${m.value}`).join('\n')}

CONVERSA:
${conversationHistory}

Responda em JSON:
{"summary":"...","key_points":["..."],"next_actions":["..."],"sentiment":"positive|neutral|negative"}`;

  try {
    const { generateText } = await import('ai');

    let modelInstance;
    if (provider === 'google') {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      modelInstance = createGoogleGenerativeAI({ apiKey })(model);
    } else if (provider === 'openai') {
      const { createOpenAI } = await import('@ai-sdk/openai');
      modelInstance = createOpenAI({ apiKey })(model);
    } else {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      modelInstance = createAnthropic({ apiKey })(model);
    }

    const result = await generateText({
      model: modelInstance,
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 500,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);

    await insertSummary(supabase, {
      conversation_id: conversation.id,
      organization_id: organizationId,
      summary: parsed.summary || 'Sem resumo disponivel.',
      key_points: parsed.key_points || [],
      next_actions: parsed.next_actions || [],
      customer_sentiment: parsed.sentiment || 'neutral',
      trigger_reason: 'periodic',
    });
  } catch {
    // Summary is non-critical, ignore errors
  }
}

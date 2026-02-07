/**
 * @fileoverview Lead Context Builder
 *
 * Monta o contexto completo do lead para o AI Agent.
 * Coleta dados do CRM, histórico de mensagens e informações do deal.
 *
 * @module lib/ai/agent/context-builder
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadContext } from './types';

// =============================================================================
// Constants
// =============================================================================

/** Número máximo de mensagens a incluir no contexto */
const MAX_MESSAGES_IN_CONTEXT = 20;

// =============================================================================
// Context Builder
// =============================================================================

export interface BuildContextParams {
  supabase: SupabaseClient;
  conversationId: string;
  organizationId: string;
}

/**
 * Monta o contexto completo do lead para o AI Agent.
 *
 * Inclui:
 * - Dados do contato
 * - Deal associado (se houver)
 * - Histórico de mensagens
 * - Estatísticas da conversa
 */
export async function buildLeadContext(
  params: BuildContextParams
): Promise<LeadContext | null> {
  const { supabase, conversationId, organizationId } = params;

  // 1. Buscar conversa com dados relacionados
  const { data: conversation, error: convError } = await supabase
    .from('messaging_conversations')
    .select(`
      id,
      contact_id,
      external_contact_name,
      message_count,
      created_at,
      last_message_at,
      metadata,
      channel:messaging_channels!inner(
        id,
        name,
        organization_id
      )
    `)
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    console.error('[ContextBuilder] Conversation not found:', convError);
    return null;
  }

  // 2. Buscar contato (se vinculado)
  let contact: LeadContext['contact'] = null;
  if (conversation.contact_id) {
    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, name, email, phone, company, position, custom_fields')
      .eq('id', conversation.contact_id)
      .single();

    if (contactData) {
      contact = {
        id: contactData.id,
        name: contactData.name,
        email: contactData.email,
        phone: contactData.phone,
        company: contactData.company,
        position: contactData.position,
        custom_fields: contactData.custom_fields as Record<string, unknown> | undefined,
      };
    }
  }

  // Se não tem contato vinculado, usar dados da conversa
  if (!contact) {
    contact = {
      id: conversationId, // usar conversation id como fallback
      name: conversation.external_contact_name,
      email: null,
      phone: null,
      company: null,
      position: null,
    };
  }

  // 3. Buscar deal associado via metadata
  let deal: LeadContext['deal'] = null;
  const dealId = (conversation.metadata as Record<string, unknown>)?.deal_id as string | undefined;

  if (dealId) {
    const { data: dealData } = await supabase
      .from('deals')
      .select(`
        id,
        title,
        value,
        ai_summary,
        created_at,
        stage:board_stages!inner(
          id,
          name
        )
      `)
      .eq('id', dealId)
      .single();

    if (dealData) {
      // Stage from join can be object or array depending on Supabase types
      const stageData = dealData.stage as unknown as { id: string; name: string } | null;
      deal = {
        id: dealData.id,
        title: dealData.title,
        value: dealData.value,
        stage_id: stageData?.id || '',
        stage_name: stageData?.name || 'Sem estágio',
        notes: dealData.ai_summary, // Using ai_summary as notes
        created_at: dealData.created_at,
      };
    }
  }

  // 4. Buscar stage config (se tiver deal)
  let stage: LeadContext['stage'];
  if (deal) {
    const { data: stageData } = await supabase
      .from('board_stages')
      .select('id, name')
      .eq('name', deal.stage_name)
      .single();

    const { data: stageConfig } = await supabase
      .from('stage_ai_config')
      .select('stage_goal, advancement_criteria')
      .eq('stage_id', stageData?.id)
      .single();

    stage = {
      id: stageData?.id || '',
      name: deal.stage_name,
      goal: stageConfig?.stage_goal || null,
      advancement_criteria: (stageConfig?.advancement_criteria as string[]) || [],
    };
  } else {
    // Sem deal, usar estágio padrão
    stage = {
      id: '',
      name: 'Novo Lead',
      goal: 'Qualificar interesse e coletar informações básicas',
      advancement_criteria: [],
    };
  }

  // 5. Buscar histórico de mensagens
  const { data: messagesData } = await supabase
    .from('messaging_messages')
    .select('direction, content, created_at, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MAX_MESSAGES_IN_CONTEXT);

  const messages: LeadContext['messages'] = (messagesData || [])
    .reverse() // Ordenar do mais antigo para mais recente
    .map((msg) => {
      const metadata = msg.metadata as Record<string, unknown> | null;
      const isAI = metadata?.sent_by_ai === true;

      return {
        role: msg.direction === 'inbound' ? 'lead' : isAI ? 'agent' : 'human',
        content: extractTextContent(msg.content as Record<string, unknown>),
        timestamp: msg.created_at,
      };
    });

  // 6. Contar mensagens do AI
  const aiMessagesCount = messages.filter((m) => m.role === 'agent').length;

  // 7. Buscar organização
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .single();

  // 8. Montar contexto final
  const context: LeadContext = {
    contact,
    deal,
    stage,
    messages,
    organization: {
      name: orgData?.name || 'Empresa',
    },
    stats: {
      total_messages: conversation.message_count || messages.length,
      ai_messages_count: aiMessagesCount,
      conversation_started_at: conversation.created_at,
      last_message_at: conversation.last_message_at || conversation.created_at,
    },
  };

  return context;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extrai texto do conteúdo da mensagem.
 */
function extractTextContent(content: Record<string, unknown>): string {
  if (typeof content === 'string') {
    return content;
  }

  // Formato padrão: { type: 'text', text: '...' }
  if (content.text && typeof content.text === 'string') {
    return content.text;
  }

  // Fallback para outros tipos
  if (content.type === 'image') {
    return '[Imagem]';
  }
  if (content.type === 'audio') {
    return '[Áudio]';
  }
  if (content.type === 'video') {
    return '[Vídeo]';
  }
  if (content.type === 'document') {
    return `[Documento: ${content.filename || 'arquivo'}]`;
  }

  return '[Mensagem]';
}

/**
 * Formata o contexto como texto para o prompt.
 */
export function formatContextForPrompt(context: LeadContext): string {
  const lines: string[] = [];

  // Informações do lead
  lines.push('## Sobre o Lead');
  if (context.contact) {
    if (context.contact.name) lines.push(`Nome: ${context.contact.name}`);
    if (context.contact.email) lines.push(`Email: ${context.contact.email}`);
    if (context.contact.phone) lines.push(`Telefone: ${context.contact.phone}`);
    if (context.contact.company) lines.push(`Empresa: ${context.contact.company}`);
    if (context.contact.position) lines.push(`Cargo: ${context.contact.position}`);
  }
  lines.push('');

  // Deal
  if (context.deal) {
    lines.push('## Deal Atual');
    lines.push(`Título: ${context.deal.title}`);
    if (context.deal.value) lines.push(`Valor: R$ ${context.deal.value.toLocaleString('pt-BR')}`);
    lines.push(`Estágio: ${context.deal.stage_name}`);
    if (context.deal.notes) lines.push(`Notas: ${context.deal.notes}`);
    lines.push('');
  }

  // Objetivo do estágio
  lines.push('## Objetivo Atual');
  lines.push(`Estágio: ${context.stage.name}`);
  if (context.stage.goal) lines.push(`Meta: ${context.stage.goal}`);
  if (context.stage.advancement_criteria.length > 0) {
    lines.push('Critérios para avançar:');
    context.stage.advancement_criteria.forEach((c) => lines.push(`- ${c}`));
  }
  lines.push('');

  // Estatísticas
  lines.push('## Estatísticas');
  lines.push(`Total de mensagens: ${context.stats.total_messages}`);
  lines.push(`Mensagens do AI: ${context.stats.ai_messages_count}`);
  lines.push(`Conversa iniciada: ${new Date(context.stats.conversation_started_at).toLocaleDateString('pt-BR')}`);
  lines.push('');

  // Histórico
  lines.push('## Histórico da Conversa');
  context.messages.forEach((msg) => {
    const roleLabel = msg.role === 'lead' ? 'Lead' : msg.role === 'agent' ? 'AI' : 'Vendedor';
    const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    lines.push(`[${time}] ${roleLabel}: ${msg.content}`);
  });

  return lines.join('\n');
}

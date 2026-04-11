/**
 * @fileoverview Adaptive Context Building
 *
 * Implementa o padrão Lightfield "Adaptive Context Building":
 * - Sinais EXPLÍCITOS: data-parts enviados pelo client (currentDealId, selectedConversation)
 * - Sinais IMPLÍCITOS: inferidos do app state (currentPage, recentActions, timeOfDay)
 *
 * O contexto é construído progressivamente baseado nos sinais disponíveis,
 * permitindo que o AI Agent tenha visão apropriada sem precisar de tudo.
 *
 * @module lib/ai/agent/adaptive-context
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadContext, StageAIConfig } from './types';
import { buildLeadContext } from './context-builder';

// =============================================================================
// Types
// =============================================================================

/**
 * Sinais explícitos enviados pelo client (data-parts).
 * Estes são os dados que o usuário/sistema explicitamente quer que o agent considere.
 */
export interface ExplicitSignals {
  /** ID do deal que o usuário está visualizando */
  currentDealId?: string;
  /** ID do contato que o usuário está visualizando */
  currentContactId?: string;
  /** ID da conversa selecionada no inbox */
  selectedConversationId?: string;
  /** Query/pergunta do usuário (para agentic search) */
  userQuery?: string;
  /** ID da mensagem que triggou o agent */
  triggerMessageId?: string;
  /** Canal que originou a interação */
  channelId?: string;
}

/**
 * Sinais implícitos inferidos do estado da aplicação.
 * Estes complementam os sinais explícitos com contexto adicional.
 */
export interface ImplicitSignals {
  /** Página atual do usuário no app */
  currentPage?: 'inbox' | 'boards' | 'contacts' | 'settings' | 'dashboard' | 'deal_detail';
  /** Últimas ações do usuário (para entender intenção) */
  recentActions?: string[];
  /** Período do dia (afeta tom da resposta) */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Role do usuário atual */
  userRole?: 'admin' | 'user' | 'agent';
  /** Se está em horário comercial */
  isBusinessHours?: boolean;
  /** Timezone do usuário */
  timezone?: string;
}

/**
 * Sinais combinados para construção de contexto.
 */
export interface ContextSignals {
  explicit: ExplicitSignals;
  implicit: ImplicitSignals;
}

/**
 * Contexto adaptativo construído para o agent.
 * Estende LeadContext com informações adicionais.
 */
export interface AdaptiveAgentContext {
  /** Contexto base do lead (contact, deal, messages, etc.) */
  leadContext: LeadContext | null;
  /** Configuração de AI do estágio atual */
  stageConfig: StageAIConfig | null;
  /** Conversas recentes não resolvidas (para inbox) */
  unresolvedConversations?: Array<{
    id: string;
    contactName: string;
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
  }>;
  /** Histórico relevante encontrado via search */
  relevantHistory?: Array<{
    type: 'message' | 'note' | 'activity';
    content: string;
    date: string;
    relevanceScore: number;
  }>;
  /** Metadados sobre como o contexto foi construído */
  meta: {
    /** Quais sinais foram usados */
    signalsUsed: string[];
    /** Se tem contexto completo ou parcial */
    completeness: 'full' | 'partial' | 'minimal';
    /** Timestamp de quando foi construído */
    builtAt: string;
  };
}

// =============================================================================
// Context Builder
// =============================================================================

export interface BuildAdaptiveContextParams {
  supabase: SupabaseClient;
  organizationId: string;
  signals: ContextSignals;
}

/**
 * Constrói contexto adaptativo baseado em sinais explícitos e implícitos.
 *
 * Prioridade de sinais:
 * 1. selectedConversationId - se tem, usa diretamente
 * 2. currentDealId - busca deal e deriva conversa
 * 3. currentContactId - busca contato e derive deal/conversa
 * 4. Sinais implícitos - complementam com dados adicionais
 *
 * @param params - Parâmetros incluindo supabase, orgId e sinais
 * @returns Contexto adaptativo construído
 */
export async function buildAdaptiveContext(
  params: BuildAdaptiveContextParams
): Promise<AdaptiveAgentContext> {
  const { supabase, organizationId, signals } = params;
  const { explicit, implicit } = signals;

  const signalsUsed: string[] = [];
  let leadContext: LeadContext | null = null;
  let stageConfig: StageAIConfig | null = null;

  // =========================================================================
  // 1. Processar sinais explícitos (prioridade)
  // =========================================================================

  // Caso 1: Conversa selecionada diretamente
  if (explicit.selectedConversationId) {
    signalsUsed.push('selectedConversationId');

    leadContext = await buildLeadContext({
      supabase,
      conversationId: explicit.selectedConversationId,
      organizationId,
    });
  }

  // Caso 2: Deal específico (buscar conversa associada)
  if (!leadContext && explicit.currentDealId) {
    signalsUsed.push('currentDealId');

    const dealContext = await buildContextFromDeal(supabase, explicit.currentDealId, organizationId);
    leadContext = dealContext.leadContext;
    stageConfig = dealContext.stageConfig;
  }

  // Caso 3: Contato específico (buscar deal mais recente)
  if (!leadContext && explicit.currentContactId) {
    signalsUsed.push('currentContactId');

    const contactContext = await buildContextFromContact(
      supabase,
      explicit.currentContactId,
      organizationId
    );
    leadContext = contactContext.leadContext;
    stageConfig = contactContext.stageConfig;
  }

  // Caso 4: Mensagem trigger (buscar conversa da mensagem)
  if (!leadContext && explicit.triggerMessageId) {
    signalsUsed.push('triggerMessageId');

    const conversationId = await getConversationFromMessage(
      supabase,
      explicit.triggerMessageId,
      organizationId
    );
    if (conversationId) {
      leadContext = await buildLeadContext({
        supabase,
        conversationId,
        organizationId,
      });
    }
  }

  // =========================================================================
  // 2. Buscar stage config se não foi carregada ainda
  // =========================================================================

  if (leadContext?.deal?.stage_id && !stageConfig) {
    stageConfig = await getStageConfig(supabase, leadContext.deal.stage_id);
  }

  // =========================================================================
  // 3. Processar sinais implícitos (complementam)
  // =========================================================================

  let unresolvedConversations: AdaptiveAgentContext['unresolvedConversations'];

  // Se usuário está no inbox e não tem contexto específico, buscar conversas pending
  if (implicit.currentPage === 'inbox' && !leadContext) {
    signalsUsed.push('implicitInbox');
    unresolvedConversations = await fetchUnresolvedConversations(supabase, organizationId);
  }

  // =========================================================================
  // 4. Agentic search para contexto adicional
  // =========================================================================

  let relevantHistory: AdaptiveAgentContext['relevantHistory'];

  if (explicit.userQuery && leadContext?.contact?.id) {
    signalsUsed.push('userQuery');
    relevantHistory = await searchRelevantHistory(
      supabase,
      explicit.userQuery,
      leadContext.contact.id,
      organizationId
    );
  }

  // =========================================================================
  // 5. Determinar completude do contexto
  // =========================================================================

  let completeness: 'full' | 'partial' | 'minimal';

  if (leadContext?.deal && stageConfig && leadContext.messages.length > 0) {
    completeness = 'full';
  } else if (leadContext?.contact || unresolvedConversations) {
    completeness = 'partial';
  } else {
    completeness = 'minimal';
  }

  return {
    leadContext,
    stageConfig,
    unresolvedConversations,
    relevantHistory,
    meta: {
      signalsUsed,
      completeness,
      builtAt: new Date().toISOString(),
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Constrói contexto a partir de um deal específico.
 */
async function buildContextFromDeal(
  supabase: SupabaseClient,
  dealId: string,
  organizationId: string
): Promise<{ leadContext: LeadContext | null; stageConfig: StageAIConfig | null }> {
  // Buscar deal com relacionamentos
  const { data: deal } = await supabase
    .from('deals')
    .select(
      `
      id,
      title,
      value,
      stage_id,
      contact_id,
      ai_summary,
      created_at,
      board_stages!inner (id, name)
    `
    )
    .eq('id', dealId)
    .eq('organization_id', organizationId)
    .single();

  if (!deal) {
    return { leadContext: null, stageConfig: null };
  }

  // Buscar conversa associada ao deal (via metadata)
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .contains('metadata', { deal_id: dealId })
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  let leadContext: LeadContext | null = null;

  if (conversation) {
    leadContext = await buildLeadContext({
      supabase,
      conversationId: conversation.id,
      organizationId,
    });
  }

  // Buscar stage config
  const stageConfig = await getStageConfig(supabase, deal.stage_id);

  return { leadContext, stageConfig };
}

/**
 * Constrói contexto a partir de um contato específico.
 */
async function buildContextFromContact(
  supabase: SupabaseClient,
  contactId: string,
  organizationId: string
): Promise<{ leadContext: LeadContext | null; stageConfig: StageAIConfig | null }> {
  // Buscar deal mais recente do contato
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('contact_id', contactId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (deal) {
    return buildContextFromDeal(supabase, deal.id, organizationId);
  }

  // Se não tem deal, buscar conversa mais recente
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('id')
    .eq('contact_id', contactId)
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (conversation) {
    const leadContext = await buildLeadContext({
      supabase,
      conversationId: conversation.id,
      organizationId,
    });
    return { leadContext, stageConfig: null };
  }

  return { leadContext: null, stageConfig: null };
}

/**
 * Busca o ID da conversa a partir de uma mensagem.
 */
async function getConversationFromMessage(
  supabase: SupabaseClient,
  messageId: string,
  organizationId: string
): Promise<string | null> {
  const { data: message } = await supabase
    .from('messaging_messages')
    .select(
      `
      conversation_id,
      messaging_conversations!inner (organization_id)
    `
    )
    .eq('id', messageId)
    .single();

  if (!message) return null;

  // Verificar se conversa pertence à organização
  const conv = message.messaging_conversations as unknown as { organization_id: string };
  if (conv?.organization_id !== organizationId) return null;

  return message.conversation_id;
}

/**
 * Busca configuração de AI do estágio.
 */
async function getStageConfig(
  supabase: SupabaseClient,
  stageId: string
): Promise<StageAIConfig | null> {
  const { data } = await supabase
    .from('stage_ai_config')
    .select('*')
    .eq('stage_id', stageId)
    .eq('enabled', true)
    .single();

  if (!data) return null;

  return {
    ...data,
    advancement_criteria: (data.advancement_criteria as string[]) || [],
    settings: data.settings as StageAIConfig['settings'],
  };
}

/**
 * Busca conversas não resolvidas (para contexto de inbox).
 */
async function fetchUnresolvedConversations(
  supabase: SupabaseClient,
  organizationId: string
): Promise<AdaptiveAgentContext['unresolvedConversations']> {
  const { data: conversations } = await supabase
    .from('messaging_conversations')
    .select(
      `
      id,
      external_contact_name,
      last_message_at,
      unread_count
    `
    )
    .eq('organization_id', organizationId)
    .eq('status', 'open')
    .gt('unread_count', 0)
    .order('last_message_at', { ascending: false })
    .limit(10);

  if (!conversations) return [];

  // Buscar última mensagem de cada conversa
  const results = await Promise.all(
    conversations.map(async (conv) => {
      const { data: lastMessage } = await supabase
        .from('messaging_messages')
        .select('content')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const content = lastMessage?.content as Record<string, unknown> | null;
      const messageText =
        typeof content === 'string' ? content : (content?.text as string) || '[Mensagem]';

      return {
        id: conv.id,
        contactName: conv.external_contact_name || 'Contato',
        lastMessage: messageText.substring(0, 100),
        lastMessageAt: conv.last_message_at,
        unreadCount: conv.unread_count,
      };
    })
  );

  return results;
}

/**
 * Busca histórico relevante via pesquisa textual.
 * Padrão Lightfield: "Agentic Search" para recuperar contexto adicional.
 */
async function searchRelevantHistory(
  supabase: SupabaseClient,
  query: string,
  contactId: string,
  organizationId: string
): Promise<AdaptiveAgentContext['relevantHistory']> {
  // Por ora, faz busca simples por texto.
  // Pode ser evoluído para vector search no futuro.

  const results: AdaptiveAgentContext['relevantHistory'] = [];

  // 1. Buscar em mensagens do contato
  const { data: messages } = await supabase
    .from('messaging_messages')
    .select(
      `
      content,
      created_at,
      messaging_conversations!inner (contact_id)
    `
    )
    .eq('messaging_conversations.contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (messages) {
    // Filter messages client-side since content is JSONB (textSearch doesn't work on JSONB)
    const queryLower = query.toLowerCase();
    for (const msg of messages) {
      const content = msg.content as Record<string, unknown> | null;
      const text = typeof content === 'string' ? content : (content?.text as string) || '';

      if (text.toLowerCase().includes(queryLower)) {
        results.push({
          type: 'message',
          content: text.substring(0, 200),
          date: msg.created_at,
          relevanceScore: 0.8,
        });
        if (results.length >= 5) break;
      }
    }
  }

  // 2. Buscar em notas de deals (client-side filter — no tsvector index on deal_notes)
  const { data: notes } = await supabase
    .from('deal_notes')
    .select(
      `
      content,
      created_at,
      deals!inner (contact_id)
    `
    )
    .eq('deals.contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (notes) {
    const queryLower = query.toLowerCase();
    for (const note of notes) {
      const noteContent = (note.content as string) || '';
      if (noteContent.toLowerCase().includes(queryLower)) {
        results.push({
          type: 'note',
          content: noteContent.substring(0, 200),
          date: note.created_at,
          relevanceScore: 0.7,
        });
        if (results.filter((r) => r.type === 'note').length >= 3) break;
      }
    }
  }

  // Ordenar por relevância
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Determina período do dia baseado na hora atual.
 * @param timezone IANA timezone string. Deve vir de organization_settings.timezone.
 *   Default 'America/Sao_Paulo' usado apenas como fallback — prefira sempre passar o valor do banco.
 */
export function getTimeOfDay(timezone = 'America/Sao_Paulo'): ImplicitSignals['timeOfDay'] {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  });
  const hour = parseInt(formatter.format(now), 10);

  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Verifica se está em horário comercial.
 * @param timezone IANA timezone. Deve vir de organization_settings.timezone.
 * @param startHour Hora de início (0-23). Configurável em stage_ai_config.settings.business_hours.
 * @param endHour Hora de fim (0-23). Configurável em stage_ai_config.settings.business_hours.
 */
export function isWithinBusinessHours(
  timezone = 'America/Sao_Paulo',
  startHour = 9,
  endHour = 18
): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  });
  const hour = parseInt(formatter.format(now), 10);

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  });
  const day = dayFormatter.format(now);

  // Fim de semana
  if (day === 'Sat' || day === 'Sun') return false;

  // Horário comercial
  return hour >= startHour && hour < endHour;
}

/**
 * Cria sinais implícitos padrão.
 * @param timezone IANA timezone. Passe organization_settings.timezone para comportamento correto.
 */
export function createDefaultImplicitSignals(timezone = 'America/Sao_Paulo'): ImplicitSignals {
  return {
    timeOfDay: getTimeOfDay(timezone),
    isBusinessHours: isWithinBusinessHours(timezone),
    timezone,
  };
}

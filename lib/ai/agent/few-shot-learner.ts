/**
 * @fileoverview Few-Shot Learner
 *
 * Extrai padrões de conversas de sucesso para personalizar o AI Agent.
 * Segue o padrão Lightfield de "Generative Tool Schemas" onde a AI
 * aprende critérios de qualificação das conversas do usuário.
 *
 * @module lib/ai/agent/few-shot-learner
 */

import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getModel } from '@/lib/ai/config';
import type { OrgAIConfig } from './agent.service';

// =============================================================================
// Types
// =============================================================================

export interface LearnedCriterion {
  /** Nome curto do critério (ex: 'budget_confirmed') */
  name: string;
  /** Descrição do critério (ex: 'Lead mencionou valor de investimento') */
  description: string;
  /** Palavras-chave que indicam esse critério */
  detectionHints: string[];
  /** Se é obrigatório ou opcional */
  importance: 'required' | 'nice_to_have';
}

export interface LearnedPattern {
  /** Estilo de saudação do vendedor */
  greetingStyle: string;
  /** Padrões de perguntas para qualificação */
  questionPatterns: string[];
  /** Como objeções foram tratadas */
  objectionHandling: string[];
  /** Técnicas de fechamento */
  closingTechniques: string[];
  /** Tom geral da comunicação */
  tone: 'formal' | 'casual' | 'consultative';
  /** Critérios de qualificação aprendidos */
  learnedCriteria: LearnedCriterion[];
  /** IDs das conversas usadas para aprendizado */
  extractedFrom: string[];
  /** Data do aprendizado */
  learnedAt: string;
  /** Versão do modelo usado */
  modelVersion: string;
}

export interface ConversationForLearning {
  id: string;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
  outcome: 'won' | 'lost' | 'in_progress';
  dealValue?: number;
  stagesVisited?: string[];
}

// =============================================================================
// Schema for AI Output
// =============================================================================

const LearnedCriterionSchema = z.object({
  name: z.string().describe('Nome curto em snake_case (ex: budget_confirmed)'),
  description: z.string().describe('Descrição clara do critério'),
  detectionHints: z.array(z.string()).describe('Palavras-chave que indicam o critério'),
  importance: z.enum(['required', 'nice_to_have']).describe('Importância do critério'),
});

const LearnedPatternSchema = z.object({
  greetingStyle: z.string().describe('Estilo típico de saudação usado'),
  questionPatterns: z.array(z.string()).describe('Perguntas comuns feitas para qualificação'),
  objectionHandling: z.array(z.string()).describe('Técnicas usadas para lidar com objeções'),
  closingTechniques: z.array(z.string()).describe('Técnicas de fechamento identificadas'),
  tone: z.enum(['formal', 'casual', 'consultative']).describe('Tom geral da comunicação'),
  learnedCriteria: z.array(LearnedCriterionSchema).describe('Critérios de qualificação identificados'),
});

// =============================================================================
// System Prompt
// =============================================================================

const FEW_SHOT_EXTRACTION_PROMPT = `Você é um especialista em análise de conversas de vendas.

Sua tarefa é analisar conversas bem-sucedidas de vendas e extrair padrões que possam ser usados para treinar um AI Agent de vendas.

IMPORTANTE:
- Foque em padrões CONSISTENTES que aparecem em múltiplas conversas
- Identifique critérios de qualificação que o vendedor SEMPRE tenta descobrir
- Note o tom e estilo de comunicação predominante
- Extraia técnicas específicas, não genéricas

Para os critérios de qualificação:
- Use nomes em snake_case (ex: budget_confirmed, decision_maker_identified)
- Forneça descrições claras e acionáveis
- Inclua palavras-chave que ajudem a detectar quando o critério foi atendido
- Marque como 'required' critérios que SEMPRE são verificados
- Marque como 'nice_to_have' critérios que aparecem ocasionalmente

Para padrões de comportamento:
- Extraia o estilo de saudação predominante
- Liste as perguntas de qualificação mais comuns
- Identifique como objeções são tratadas
- Note técnicas de fechamento usadas`;

// =============================================================================
// Conversation Fetcher
// =============================================================================

export async function fetchConversationsForLearning(
  supabase: SupabaseClient,
  conversationIds: string[],
  organizationId: string
): Promise<ConversationForLearning[]> {
  // Buscar conversas com mensagens
  const { data: conversations, error: convError } = await supabase
    .from('messaging_conversations')
    .select(`
      id,
      contact:contacts(name, email),
      deal:deals(id, title, value, stage_id, status),
      created_at
    `)
    .in('id', conversationIds)
    .eq('organization_id', organizationId);

  if (convError) {
    throw new Error(`Failed to fetch conversations: ${convError.message}`);
  }

  if (!conversations || conversations.length === 0) {
    throw new Error('No conversations found');
  }

  // Buscar mensagens para cada conversa
  const result: ConversationForLearning[] = [];

  for (const conv of conversations) {
    const { data: messages, error: msgError } = await supabase
      .from('messaging_messages')
      .select('id, direction, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error(`[FewShotLearner] Error fetching messages for ${conv.id}:`, msgError);
      continue;
    }

    // Supabase retorna objetos ou arrays dependendo da relação
    const dealData = conv.deal as unknown;
    const contactData = conv.contact as unknown;

    // Extrair primeiro item se for array, ou usar o objeto diretamente
    const deal = Array.isArray(dealData) ? dealData[0] : dealData;
    const contact = Array.isArray(contactData) ? contactData[0] : contactData;

    const dealInfo = deal as { id?: string; title?: string; value?: number; status?: string } | null;
    const contactInfo = contact as { name?: string; email?: string } | null;

    result.push({
      id: conv.id,
      title: dealInfo?.title || contactInfo?.name || 'Conversa',
      messages: (messages || []).map((m) => {
        const raw = m.content as Record<string, unknown> | string | null;
        const text = typeof raw === 'string' ? raw : (raw?.text as string) || '';
        return {
          role: m.direction === 'outbound' ? 'assistant' as const : 'user' as const,
          content: text,
          timestamp: m.created_at,
        };
      }),
      outcome: dealInfo?.status === 'won' ? 'won' : dealInfo?.status === 'lost' ? 'lost' : 'in_progress',
      dealValue: dealInfo?.value,
    });
  }

  return result;
}

// =============================================================================
// Pattern Learner
// =============================================================================

function formatConversationsForPrompt(conversations: ConversationForLearning[]): string {
  return conversations
    .map((conv, index) => {
      const header = `\n--- CONVERSA ${index + 1}: ${conv.title} (${conv.outcome}) ---\n`;
      const messages = conv.messages
        .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n');
      return header + messages;
    })
    .join('\n\n');
}

export async function learnFromConversations(
  conversations: ConversationForLearning[],
  aiConfig: OrgAIConfig
): Promise<LearnedPattern> {
  if (conversations.length < 2) {
    throw new Error('Mínimo de 2 conversas necessárias para aprendizado');
  }

  if (conversations.length > 10) {
    // Limitar a 10 conversas para não estourar contexto
    conversations = conversations.slice(0, 10);
  }

  const model = getModel(aiConfig.provider, aiConfig.apiKey, aiConfig.model);

  const { output } = await generateText({
    model,
    output: Output.object({ schema: LearnedPatternSchema }),
    system: FEW_SHOT_EXTRACTION_PROMPT,
    prompt: `Analise estas ${conversations.length} conversas bem-sucedidas e extraia os padrões:

${formatConversationsForPrompt(conversations)}

Extraia:
1. PADRÕES DE COMPORTAMENTO:
   - Estilo de saudação usado
   - Padrões de perguntas para qualificação
   - Como objeções foram tratadas
   - Técnicas de fechamento
   - Tom geral (formal/casual/consultivo)

2. CRITÉRIOS DE QUALIFICAÇÃO:
   Identifique quais informações o vendedor SEMPRE tentou descobrir.
   Para cada critério:
   - Nome curto em snake_case
   - Descrição clara
   - Palavras-chave que indicam esse critério
   - Se é obrigatório ou opcional`,
  });

  if (!output) {
    throw new Error('AI não retornou padrões válidos');
  }

  return {
    ...output,
    extractedFrom: conversations.map((c) => c.id),
    learnedAt: new Date().toISOString(),
    modelVersion: aiConfig.model,
  };
}

// =============================================================================
// Save Learned Patterns
// =============================================================================

export async function saveLearnedPatterns(
  supabase: SupabaseClient,
  organizationId: string,
  patterns: LearnedPattern
): Promise<void> {
  const { error } = await supabase
    .from('organization_settings')
    .update({
      ai_config_mode: 'auto_learn',
      ai_learned_patterns: patterns,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to save patterns: ${error.message}`);
  }
}

// =============================================================================
// Get Learned Patterns
// =============================================================================

export async function getLearnedPatterns(
  supabase: SupabaseClient,
  organizationId: string
): Promise<LearnedPattern | null> {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('ai_learned_patterns')
    .eq('organization_id', organizationId)
    .single();

  if (error || !data?.ai_learned_patterns) {
    return null;
  }

  const patterns = data.ai_learned_patterns;

  // Verificar se é objeto vazio (default do JSONB)
  if (typeof patterns !== 'object' || patterns === null) {
    return null;
  }

  // Verificar com validação completa ao invés de cast direto
  if (!validateLearnedPatterns(patterns)) {
    return null;
  }

  return patterns as LearnedPattern;
}

// =============================================================================
// Validate Patterns
// =============================================================================

export function validateLearnedPatterns(patterns: unknown): patterns is LearnedPattern {
  if (!patterns || typeof patterns !== 'object') return false;

  const p = patterns as Record<string, unknown>;

  return (
    typeof p.greetingStyle === 'string' &&
    Array.isArray(p.questionPatterns) &&
    Array.isArray(p.objectionHandling) &&
    Array.isArray(p.closingTechniques) &&
    ['formal', 'casual', 'consultative'].includes(p.tone as string) &&
    Array.isArray(p.learnedCriteria) &&
    Array.isArray(p.extractedFrom) &&
    typeof p.learnedAt === 'string'
  );
}

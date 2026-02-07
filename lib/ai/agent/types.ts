/**
 * @fileoverview AI Agent Types
 *
 * Tipos para o agente autônomo de vendas.
 *
 * @module lib/ai/agent/types
 */

// =============================================================================
// Database Types
// =============================================================================

export interface StageAIConfig {
  id: string;
  organization_id: string;
  board_id: string;
  stage_id: string;
  enabled: boolean;
  system_prompt: string;
  stage_goal: string | null;
  advancement_criteria: string[];
  settings: StageAISettings;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageAISettings {
  /** Máximo de mensagens automáticas por conversa antes de handoff */
  max_messages_per_conversation: number;
  /** Delay em segundos antes de responder (mais natural) */
  response_delay_seconds: number;
  /** Keywords que trigam handoff para humano */
  handoff_keywords: string[];
  /** Só responde em horário comercial */
  business_hours_only: boolean;
  /** Horário comercial (se business_hours_only = true) */
  business_hours?: {
    start: string; // "09:00"
    end: string; // "18:00"
    timezone: string; // "America/Sao_Paulo"
  };
}

export interface AIConversationLog {
  id: string;
  organization_id: string;
  conversation_id: string;
  message_id: string | null;
  stage_id: string | null;
  context_snapshot: LeadContext;
  ai_response: string;
  tokens_used: number | null;
  model_used: string | null;
  action_taken: AIAction;
  action_reason: string | null;
  created_at: string;
}

export type AIAction = 'responded' | 'advanced_stage' | 'handoff' | 'skipped';

// =============================================================================
// Context Types
// =============================================================================

export interface LeadContext {
  /** Informações do contato */
  contact: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    position: string | null;
    custom_fields?: Record<string, unknown>;
  } | null;

  /** Deal atual */
  deal: {
    id: string;
    title: string;
    value: number | null;
    stage_id: string;
    stage_name: string;
    notes: string | null;
    created_at: string;
  } | null;

  /** Configuração do estágio */
  stage: {
    id: string;
    name: string;
    goal: string | null;
    advancement_criteria: string[];
  };

  /** Histórico de mensagens (últimas N) */
  messages: Array<{
    role: 'lead' | 'agent' | 'human';
    content: string;
    timestamp: string;
  }>;

  /** Metadata da organização */
  organization: {
    name: string;
    business_type?: string;
  };

  /** Estatísticas da conversa */
  stats: {
    total_messages: number;
    ai_messages_count: number;
    conversation_started_at: string;
    last_message_at: string;
  };
}

// =============================================================================
// Agent Types
// =============================================================================

export interface AgentDecision {
  /** Ação a tomar */
  action: AIAction;
  /** Resposta gerada (se action = 'responded') */
  response?: string;
  /** Razão da decisão */
  reason: string;
  /** Deve mover para próximo estágio? */
  should_advance?: boolean;
  /** Lead foi avançado para próximo estágio automaticamente */
  stage_advanced?: boolean;
  /** ID do novo estágio (se avançou) */
  new_stage_id?: string;
  /** Tokens usados */
  tokens_used?: number;
  /** Modelo usado */
  model_used?: string;
}

export interface AgentProcessResult {
  success: boolean;
  decision: AgentDecision;
  message_sent?: {
    id: string;
    external_id?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// =============================================================================
// Config Types
// =============================================================================

export interface AgentConfig {
  /** Modelo padrão */
  default_model: string;
  /** Provider padrão */
  default_provider: 'google' | 'openai' | 'anthropic';
  /** Máximo de tokens na resposta */
  max_tokens: number;
  /** Temperatura (criatividade) */
  temperature: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  default_model: 'gemini-2.0-flash',
  default_provider: 'google',
  max_tokens: 500,
  temperature: 0.7,
};

// =============================================================================
// Prompt Types
// =============================================================================

export interface PromptParams {
  context: LeadContext;
  stage_prompt: string;
  last_message: string;
}

/**
 * Tipos para o Goal-Oriented Agent (Messaging).
 */

export interface BoardAIConfig {
  id: string;
  board_id: string;
  organization_id: string;

  agent_name: string;
  business_context: string | null;
  agent_goal: string | null;
  persona_prompt: string | null;

  knowledge_store_id: string | null;
  knowledge_store_name: string | null;

  agent_mode: 'observe' | 'respond';

  circuit_breaker_threshold: number;
  hitl_threshold: number;
  hitl_min_confidence: number;
  hitl_expiration_hours: number;

  handoff_keywords: string[];
  max_messages_before_handoff: number;

  response_delay_seconds: number;

  created_at: string;
  updated_at: string;
}

export interface CircuitBreakerState {
  isOpen: boolean;
  consecutiveErrors: number;
  threshold: number;
}

-- Migration: board_ai_config + consecutive_ai_errors
-- Feature: Goal-Oriented Agent
-- Ref: docs/superpowers/specs/2026-04-09-goal-oriented-agent-design.md

-- 1. Tabela board_ai_config: uma config de agente por board
CREATE TABLE IF NOT EXISTS board_ai_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- Identidade do agente
  agent_name      text NOT NULL DEFAULT 'Assistente',
  business_context text,         -- "Escritório de advocacia, clientes são CEOs..."
  agent_goal      text,          -- "Qualificar leads, agendar reunião com o sócio..."
  persona_prompt  text,          -- Gerado automaticamente a partir de business_context

  -- Base de conhecimento (Google File Search Store)
  knowledge_store_id   text,     -- ID do File Search Store no Google
  knowledge_store_name text,     -- Display name

  -- Modo de operação
  agent_mode text NOT NULL DEFAULT 'observe'
    CHECK (agent_mode IN ('observe', 'respond')),

  -- Safety
  circuit_breaker_threshold int NOT NULL DEFAULT 3,
  hitl_threshold            numeric NOT NULL DEFAULT 0.85,
  hitl_min_confidence       numeric NOT NULL DEFAULT 0.70,
  hitl_expiration_hours     int NOT NULL DEFAULT 24,

  -- Handoff
  handoff_keywords             text[] NOT NULL DEFAULT '{}',
  max_messages_before_handoff  int NOT NULL DEFAULT 10,

  -- Delay de resposta
  response_delay_seconds int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (board_id)
);

-- RLS
ALTER TABLE board_ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_ai_config: org members read"
  ON board_ai_config FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "board_ai_config: admin write"
  ON board_ai_config FOR ALL
  USING (organization_id = get_user_org_id());

-- Índice para lookup rápido por board
CREATE INDEX IF NOT EXISTS board_ai_config_board_id_idx ON board_ai_config (board_id);

-- 2. Circuit breaker: coluna de erros consecutivos em messaging_conversations
ALTER TABLE messaging_conversations
  ADD COLUMN IF NOT EXISTS consecutive_ai_errors int NOT NULL DEFAULT 0;

-- 3. Trigger updated_at em board_ai_config
CREATE OR REPLACE FUNCTION update_board_ai_config_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS board_ai_config_updated_at ON board_ai_config;
CREATE TRIGGER board_ai_config_updated_at
  BEFORE UPDATE ON board_ai_config
  FOR EACH ROW EXECUTE FUNCTION update_board_ai_config_updated_at();

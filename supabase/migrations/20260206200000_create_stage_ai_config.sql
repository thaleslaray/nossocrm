-- ============================================================================
-- Stage AI Configuration
-- ============================================================================
-- Configura o AI Agent por estágio do funil.
-- Cada stage pode ter seu próprio prompt e comportamento.
-- ============================================================================

-- Tabela principal de configuração
CREATE TABLE stage_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES board_stages(id) ON DELETE CASCADE,

  -- Configuração
  enabled BOOLEAN NOT NULL DEFAULT false,

  -- Prompt do sistema para este estágio
  system_prompt TEXT NOT NULL,

  -- Objetivo do estágio (exibido na UI)
  stage_goal TEXT,

  -- Critérios para mover para próximo estágio (JSON array de strings)
  advancement_criteria JSONB DEFAULT '[]',

  -- Configurações de comportamento
  settings JSONB NOT NULL DEFAULT '{
    "max_messages_per_conversation": 10,
    "response_delay_seconds": 5,
    "handoff_keywords": ["falar com humano", "atendente", "pessoa real"],
    "business_hours_only": false
  }',

  -- Modelo de AI a usar (null = usa default da org)
  ai_model TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Um config por stage
  UNIQUE (stage_id)
);

-- Índices
CREATE INDEX idx_stage_ai_config_org ON stage_ai_config(organization_id);
CREATE INDEX idx_stage_ai_config_board ON stage_ai_config(board_id);
CREATE INDEX idx_stage_ai_config_enabled ON stage_ai_config(organization_id, enabled) WHERE enabled = true;

-- RLS
ALTER TABLE stage_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_ai_config FORCE ROW LEVEL SECURITY;

-- Admins podem gerenciar
CREATE POLICY "Admins manage stage AI config"
  ON stage_ai_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = stage_ai_config.organization_id
        AND role = 'admin'
    )
  );

-- Todos na org podem ver (para o agent funcionar)
CREATE POLICY "Org members view stage AI config"
  ON stage_ai_config FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- AI Conversation Log (tracking de interações)
-- ============================================================================

CREATE TABLE ai_conversation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES messaging_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messaging_messages(id) ON DELETE SET NULL,

  -- Contexto usado
  stage_id UUID REFERENCES board_stages(id) ON DELETE SET NULL,
  context_snapshot JSONB NOT NULL, -- Snapshot do contexto enviado à AI

  -- Resposta
  ai_response TEXT NOT NULL,
  tokens_used INTEGER,
  model_used TEXT,

  -- Resultado
  action_taken TEXT CHECK (action_taken IN (
    'responded',      -- AI respondeu normalmente
    'advanced_stage', -- AI moveu para próximo estágio
    'handoff',        -- AI passou para humano
    'skipped'         -- AI decidiu não responder
  )),
  action_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_ai_log_conversation ON ai_conversation_log(conversation_id);
CREATE INDEX idx_ai_log_org_date ON ai_conversation_log(organization_id, created_at DESC);

-- RLS
ALTER TABLE ai_conversation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation_log FORCE ROW LEVEL SECURITY;

CREATE POLICY "Org members view AI logs"
  ON ai_conversation_log FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Insert apenas via service role (webhooks)
CREATE POLICY "Service role inserts AI logs"
  ON ai_conversation_log FOR INSERT TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Trigger para updated_at
-- ============================================================================

CREATE TRIGGER trigger_stage_ai_config_updated
  BEFORE UPDATE ON stage_ai_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comentários
-- ============================================================================

COMMENT ON TABLE stage_ai_config IS 'Configuração do AI Agent por estágio do funil';
COMMENT ON TABLE ai_conversation_log IS 'Log de todas as interações do AI Agent';
COMMENT ON COLUMN stage_ai_config.system_prompt IS 'Prompt do sistema que define comportamento da AI neste estágio';
COMMENT ON COLUMN stage_ai_config.advancement_criteria IS 'Critérios que indicam que lead está pronto para próximo estágio';
COMMENT ON COLUMN stage_ai_config.settings IS 'Configurações de comportamento: max_messages, delay, handoff_keywords, etc';

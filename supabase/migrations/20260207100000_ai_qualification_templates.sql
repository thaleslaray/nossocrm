-- ============================================================================
-- AI Qualification Templates
-- ============================================================================
-- Templates pré-definidos de metodologias de vendas (BANT, SPIN, MEDDIC, etc.)
-- Permite configuração simplificada do AI Agent através de 4 modos:
-- 1. Zero Config (BANT padrão)
-- 2. Template Selection (escolher metodologia)
-- 3. Auto-Learn (few-shot learning)
-- 4. Advanced (manual, config existente)
-- ============================================================================

-- ============================================================================
-- 1. Tabela de Templates
-- ============================================================================

CREATE TABLE ai_qualification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  name TEXT NOT NULL,                    -- 'bant', 'spin', 'meddic', etc.
  display_name TEXT NOT NULL,            -- 'BANT', 'SPIN Selling', 'MEDDIC'
  description TEXT,                       -- Descrição para exibição

  -- Configuração de estágios (JSON array)
  -- Formato:
  -- [
  --   {
  --     "name": "Qualificação",
  --     "order": 1,
  --     "goal": "Identificar budget e autoridade",
  --     "criteria": ["Budget confirmado", "Autoridade identificada"],
  --     "prompt_template": "Você está qualificando o lead usando BANT..."
  --   },
  --   ...
  -- ]
  stages JSONB NOT NULL,

  -- Metadados
  is_system BOOLEAN NOT NULL DEFAULT true,        -- Templates do sistema vs custom
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = global

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint: templates de sistema não têm org
  CONSTRAINT chk_system_template_no_org
    CHECK ((is_system = true AND organization_id IS NULL) OR is_system = false)
);

-- Índices
CREATE INDEX idx_ai_templates_system ON ai_qualification_templates(is_system) WHERE is_system = true;
CREATE INDEX idx_ai_templates_org ON ai_qualification_templates(organization_id) WHERE organization_id IS NOT NULL;

-- Unique: nome único por organização (para custom) ou globalmente (para system)
CREATE UNIQUE INDEX idx_ai_templates_name_unique
  ON ai_qualification_templates(name)
  WHERE is_system = true;

CREATE UNIQUE INDEX idx_ai_templates_org_name_unique
  ON ai_qualification_templates(organization_id, name)
  WHERE organization_id IS NOT NULL;

-- RLS
ALTER TABLE ai_qualification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_qualification_templates FORCE ROW LEVEL SECURITY;

-- Todos podem ver templates do sistema
CREATE POLICY "Anyone can view system templates"
  ON ai_qualification_templates FOR SELECT
  USING (is_system = true);

-- Membros da org podem ver templates custom da org
CREATE POLICY "Org members view custom templates"
  ON ai_qualification_templates FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Admins podem gerenciar templates custom da org
CREATE POLICY "Admins manage custom templates"
  ON ai_qualification_templates FOR ALL TO authenticated
  USING (
    is_system = false AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = ai_qualification_templates.organization_id
        AND role = 'admin'
    )
  );

-- ============================================================================
-- 2. Extensão de organization_settings para AI Config Mode
-- ============================================================================

-- Modo de configuração de AI
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS ai_config_mode TEXT
  DEFAULT 'zero_config'
  CHECK (ai_config_mode IN ('zero_config', 'template', 'auto_learn', 'advanced'));

-- Template selecionado (quando modo = 'template')
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS ai_template_id UUID
  REFERENCES ai_qualification_templates(id) ON DELETE SET NULL;

-- Padrões aprendidos via few-shot (quando modo = 'auto_learn')
-- Formato:
-- {
--   "greeting_style": "...",
--   "question_patterns": [...],
--   "objection_handling": [...],
--   "closing_techniques": [...],
--   "tone": "formal|casual|consultative",
--   "learned_criteria": [
--     {
--       "name": "budget_confirmed",
--       "description": "Lead mencionou valor de investimento",
--       "detection_hints": ["orçamento", "budget", "quanto custa"],
--       "importance": "required|nice_to_have"
--     }
--   ],
--   "extracted_from": ["conv_id_1", "conv_id_2"]
-- }
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS ai_learned_patterns JSONB DEFAULT '{}';

-- HITL threshold (confidence abaixo disso requer confirmação humana)
-- Default: 0.85 (85%) - acima disso é automático
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS ai_hitl_threshold NUMERIC(3,2) DEFAULT 0.85
  CHECK (ai_hitl_threshold >= 0.5 AND ai_hitl_threshold <= 1.0);

-- ============================================================================
-- 3. Tabela de Pending Stage Advances (HITL)
-- ============================================================================
-- Quando AI sugere avanço de estágio mas confidence < threshold,
-- a sugestão fica pendente para aprovação humana.

CREATE TABLE ai_pending_stage_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES messaging_conversations(id) ON DELETE SET NULL,

  -- Estágio atual e sugerido
  current_stage_id UUID NOT NULL REFERENCES board_stages(id) ON DELETE CASCADE,
  suggested_stage_id UUID NOT NULL REFERENCES board_stages(id) ON DELETE CASCADE,

  -- Dados da sugestão
  confidence NUMERIC(3,2) NOT NULL,
  reason TEXT NOT NULL,
  criteria_evaluation JSONB NOT NULL,
  -- Formato:
  -- [
  --   { "criterion": "Budget confirmado", "met": true, "confidence": 0.9, "evidence": "..." },
  --   { "criterion": "Autoridade identificada", "met": false, "confidence": 0.3, "evidence": null }
  -- ]

  -- Resolução
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'auto_approved')),
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Se usuário editou a sugestão
  user_edits JSONB,
  -- Formato (se editado):
  -- {
  --   "original_stage_id": "...",
  --   "edited_stage_id": "...",
  --   "edited_reason": "...",
  --   "additional_notes": "..."
  -- }

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Índices
CREATE INDEX idx_pending_advances_org_status
  ON ai_pending_stage_advances(organization_id, status)
  WHERE status = 'pending';

CREATE INDEX idx_pending_advances_deal
  ON ai_pending_stage_advances(deal_id);

CREATE INDEX idx_pending_advances_expires
  ON ai_pending_stage_advances(expires_at)
  WHERE status = 'pending';

-- RLS
ALTER TABLE ai_pending_stage_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pending_stage_advances FORCE ROW LEVEL SECURITY;

-- Membros da org podem ver pending advances
CREATE POLICY "Org members view pending advances"
  ON ai_pending_stage_advances FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Membros da org podem resolver (aprovar/rejeitar)
CREATE POLICY "Org members resolve pending advances"
  ON ai_pending_stage_advances FOR UPDATE TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Service role pode inserir (via AI agent)
CREATE POLICY "Service role inserts pending advances"
  ON ai_pending_stage_advances FOR INSERT TO service_role
  WITH CHECK (true);

-- ============================================================================
-- 4. Função para expirar pending advances antigos
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_old_pending_advances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_pending_stage_advances
  SET
    status = 'expired',
    resolved_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$;

-- ============================================================================
-- 5. Trigger para updated_at
-- ============================================================================

CREATE TRIGGER trigger_ai_templates_updated
  BEFORE UPDATE ON ai_qualification_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. Comentários
-- ============================================================================

COMMENT ON TABLE ai_qualification_templates IS
  'Templates de metodologias de vendas para configuração simplificada do AI Agent';

COMMENT ON COLUMN ai_qualification_templates.stages IS
  'Array JSON de estágios com name, order, goal, criteria, prompt_template';

COMMENT ON COLUMN ai_qualification_templates.is_system IS
  'true = template global do sistema; false = template custom da organização';

COMMENT ON COLUMN organization_settings.ai_config_mode IS
  'Modo de configuração: zero_config (BANT auto), template (metodologia), auto_learn (few-shot), advanced (manual)';

COMMENT ON COLUMN organization_settings.ai_learned_patterns IS
  'Padrões extraídos via few-shot learning de conversas de sucesso';

COMMENT ON COLUMN organization_settings.ai_hitl_threshold IS
  'Threshold de confiança para HITL: abaixo deste valor requer aprovação humana (0.5-1.0)';

COMMENT ON TABLE ai_pending_stage_advances IS
  'Sugestões de avanço de estágio pendentes de aprovação humana (HITL)';

-- ============================================================================
-- Lead Routing Rules
-- ============================================================================
-- Configura para onde os leads vão quando chegam mensagens em cada canal.
-- Substitui os campos auto_create_deal e default_board_id da business_units.

CREATE TABLE lead_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Origem: qual canal dispara a regra
  channel_id UUID NOT NULL REFERENCES messaging_channels(id) ON DELETE CASCADE,

  -- Destino: para onde o deal vai (null = não criar deal)
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES board_stages(id) ON DELETE SET NULL,

  -- Controle
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uma regra por canal
  UNIQUE (channel_id)
);

-- Índices
CREATE INDEX idx_lead_routing_rules_org ON lead_routing_rules(organization_id);
CREATE INDEX idx_lead_routing_rules_channel ON lead_routing_rules(channel_id);
CREATE INDEX idx_lead_routing_rules_board ON lead_routing_rules(board_id) WHERE board_id IS NOT NULL;

-- RLS
ALTER TABLE lead_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_routing_rules FORCE ROW LEVEL SECURITY;

-- Admins podem gerenciar regras
CREATE POLICY "Admins can manage lead routing rules"
  ON lead_routing_rules FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND organization_id = lead_routing_rules.organization_id
        AND role = 'admin'
    )
  );

-- Todos da org podem ver regras (para o webhook funcionar)
CREATE POLICY "Org members can view lead routing rules"
  ON lead_routing_rules FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Trigger para updated_at
CREATE TRIGGER set_lead_routing_rules_updated_at
  BEFORE UPDATE ON lead_routing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migrar configurações existentes de business_units para lead_routing_rules
-- ============================================================================

-- Para cada canal que tem business_unit com auto_create_deal = true e default_board_id definido,
-- criar uma regra de roteamento
INSERT INTO lead_routing_rules (organization_id, channel_id, board_id, stage_id, enabled)
SELECT
  c.organization_id,
  c.id as channel_id,
  bu.default_board_id as board_id,
  (
    -- Pegar o primeiro estágio do board
    SELECT s.id FROM board_stages s
    WHERE s.board_id = bu.default_board_id
    ORDER BY s."order" ASC
    LIMIT 1
  ) as stage_id,
  true as enabled
FROM messaging_channels c
JOIN business_units bu ON c.business_unit_id = bu.id
WHERE bu.auto_create_deal = true
  AND bu.default_board_id IS NOT NULL
  AND c.deleted_at IS NULL;

-- ============================================================================
-- Comentário: Após validar que tudo funciona, podemos remover os campos
-- auto_create_deal e default_board_id da tabela business_units em uma
-- migration futura. Por enquanto mantemos para backward compatibility.
-- ============================================================================

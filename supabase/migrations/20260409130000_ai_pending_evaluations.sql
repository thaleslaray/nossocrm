-- ============================================================================
-- ai_pending_evaluations
-- ============================================================================
-- Fila persistente de avaliações de avanço de estágio.
--
-- Motivação: a avaliação de estágio requer um segundo LLM call (~2-4s) após
-- o envio da resposta. Se essa chamada ficar dentro da mesma função Vercel,
-- ela pode ser silenciosamente cancelada por timeout. Esta tabela desacopla
-- o trabalho: o agente insere aqui, o cron /api/cron/stage-evaluations processa.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_pending_evaluations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id  UUID        NOT NULL,
  deal_id          UUID        REFERENCES deals(id) ON DELETE SET NULL,
  message_id       UUID,
  message_text     TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts         INTEGER     NOT NULL DEFAULT 0,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ
);

-- Índice parcial para o cron: só rows pendentes, ordenadas por criação (FIFO)
CREATE INDEX IF NOT EXISTS idx_ai_pending_evaluations_pending
  ON ai_pending_evaluations (created_at)
  WHERE status = 'pending';

-- Índice para lookup por conversa (útil para dedup futuro)
CREATE INDEX IF NOT EXISTS idx_ai_pending_evaluations_conversation
  ON ai_pending_evaluations (conversation_id, status);

-- RLS
ALTER TABLE ai_pending_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pending_evaluations FORCE ROW LEVEL SECURITY;

-- O agente escreve via service-role (sem RLS) nos webhooks/edge functions.
-- Acesso direto de usuários autenticados não é necessário nesta tabela.
-- Mantemos a policy mínima: a própria organização pode ler suas rows.
CREATE POLICY "Org members can read own pending evaluations"
  ON ai_pending_evaluations FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

COMMENT ON TABLE ai_pending_evaluations IS
  'Fila de avaliações de avanço de estágio pendentes. '
  'Inserida pelo AI agent após envio de resposta; '
  'processada pelo cron /api/cron/stage-evaluations a cada minuto.';

COMMENT ON COLUMN ai_pending_evaluations.status IS
  'pending: aguardando processamento; '
  'processing: sendo processado pelo cron (lock otimista via UPDATE); '
  'completed: avaliação concluída; '
  'failed: falhou após max tentativas (3).';

COMMENT ON COLUMN ai_pending_evaluations.attempts IS
  'Número de tentativas de processamento. Máximo: 3.';

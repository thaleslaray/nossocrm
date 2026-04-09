-- ============================================================================
-- HITL Pending Stage Advances Alerting System
-- ============================================================================
-- Configura pg_cron job para alertar quando pending_advances ficam > 24h sem revisão
-- Cria eventos em deal_activities para rastreabilidade
--
-- Fluxo:
-- 1. Job roda a cada 6 horas
-- 2. Encontra ai_pending_stage_advances com status='pending' criados há >24h
-- 3. Para cada uma, cria entry em deal_activities com tipo 'hitl_alert'
-- 4. Sets alert_triggered_at flag na pending_advance
--
-- ============================================================================

-- ============================================================================
-- 1. Extensão deal_activities: adicionar tipo 'hitl_alert'
-- ============================================================================

-- Atualizar CHECK constraint para incluir 'hitl_alert'
ALTER TABLE deal_activities
  DROP CONSTRAINT IF EXISTS deal_activities_type_check;

ALTER TABLE deal_activities
  ADD CONSTRAINT deal_activities_type_check
  CHECK (type IN (
    'created',
    'updated',
    'contacted',
    'qualified',
    'proposal_sent',
    'negotiation',
    'won',
    'lost',
    'note',
    'assigned',
    'unassigned',
    'stage_changed',
    'ai_response',
    'ai_stage_advanced',
    'hitl_pending_created',
    'hitl_pending_approved',
    'hitl_pending_rejected',
    'hitl_alert'
  ));

COMMENT ON COLUMN deal_activities.type IS
  'Tipo de atividade: hitl_alert = alerta de HITL pending sem revisão há 24h+';

-- ============================================================================
-- 2. Extensão ai_pending_stage_advances: flag de alerta disparado
-- ============================================================================

ALTER TABLE ai_pending_stage_advances
  ADD COLUMN IF NOT EXISTS alert_triggered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pending_advances_alert_triggered
  ON ai_pending_stage_advances(organization_id, alert_triggered_at)
  WHERE status = 'pending' AND alert_triggered_at IS NULL;

COMMENT ON COLUMN ai_pending_stage_advances.alert_triggered_at IS
  'Timestamp do último alerta disparado. NULL = nenhum alerta ainda.';

-- ============================================================================
-- 3. Function: trigger_hitl_alerts()
-- ============================================================================
-- Verifica pending_advances antigos (>24h) e cria entries em deal_activities

CREATE OR REPLACE FUNCTION public.trigger_hitl_alerts()
  RETURNS TABLE(alert_count BIGINT, affected_deals BIGINT) AS $$
DECLARE
  v_alert_count BIGINT := 0;
  v_affected_deals BIGINT := 0;
  v_pending_advance RECORD;
BEGIN
  -- Validação: extensão pg_cron disponível?
  -- Se não tiver, a função roda manualmente

  -- Buscar all pending_advances com:
  -- 1. status = 'pending'
  -- 2. created_at < NOW() - 24 horas
  -- 3. alert_triggered_at IS NULL (não foi alertado ainda)
  FOR v_pending_advance IN
    SELECT
      id,
      organization_id,
      deal_id,
      conversation_id,
      confidence,
      created_at,
      expires_at
    FROM public.ai_pending_stage_advances
    WHERE
      status = 'pending'
      AND created_at < (NOW() - INTERVAL '24 hours')
      AND alert_triggered_at IS NULL
    ORDER BY created_at ASC
  LOOP
    -- Criar activity entry para alertar
    INSERT INTO public.deal_activities (
      organization_id,
      deal_id,
      type,
      description,
      metadata,
      created_by_id
    ) VALUES (
      v_pending_advance.organization_id,
      v_pending_advance.deal_id,
      'hitl_alert',
      'HITL pending advance sem revisão há ' ||
        FLOOR(EXTRACT(EPOCH FROM (NOW() - v_pending_advance.created_at)) / 3600)::TEXT ||
        ' horas. ID: ' || v_pending_advance.id::TEXT,
      jsonb_build_object(
        'pending_advance_id', v_pending_advance.id::TEXT,
        'confidence', v_pending_advance.confidence,
        'created_at', v_pending_advance.created_at,
        'hours_pending', FLOOR(EXTRACT(EPOCH FROM (NOW() - v_pending_advance.created_at)) / 3600),
        'expires_at', v_pending_advance.expires_at,
        'alert_type', 'pending_timeout'
      ),
      NULL  -- created_by_id = NULL (sistema)
    );

    -- Marcar que alert foi disparado
    UPDATE public.ai_pending_stage_advances
      SET alert_triggered_at = NOW()
      WHERE id = v_pending_advance.id;

    v_alert_count := v_alert_count + 1;
  END LOOP;

  -- Contar deals únicos afetados
  SELECT COUNT(DISTINCT deal_id) INTO v_affected_deals
    FROM public.deal_activities
    WHERE
      type = 'hitl_alert'
      AND created_at >= (NOW() - INTERVAL '6 hours');

  RETURN QUERY SELECT v_alert_count, v_affected_deals;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.trigger_hitl_alerts() IS
  'Encontra ai_pending_stage_advances antigos (>24h pending) e cria alerts em deal_activities.
   Retorna (alert_count, affected_deals).
   Pode ser chamada manualmente ou via pg_cron.';

-- ============================================================================
-- 4. Function: expire_old_pending_advances()
-- ============================================================================
-- Marca como 'expired' as pending_advances além de 24h

CREATE OR REPLACE FUNCTION public.expire_old_pending_advances()
  RETURNS TABLE(expired_count BIGINT) AS $$
DECLARE
  v_expired_count BIGINT := 0;
BEGIN
  UPDATE public.ai_pending_stage_advances
    SET status = 'expired'
    WHERE
      status = 'pending'
      AND expires_at < NOW();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RETURN QUERY SELECT v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.expire_old_pending_advances() IS
  'Expira ai_pending_stage_advances que ultrapassaram o tempo limite.
   Retorna contagem de registros expirados.';

-- ============================================================================
-- 5. pg_cron Jobs (se extensão disponível)
-- ============================================================================
-- Jobs para:
-- - Trigger alerts a cada 6 horas
-- - Expire old records a cada 12 horas

-- Verificar se pg_cron está disponível
DO $$
BEGIN
  -- Job 1: trigger_hitl_alerts a cada 6 horas (00:00, 06:00, 12:00, 18:00 UTC)
  PERFORM cron.schedule(
    'hitl-pending-alerts',
    '0 */6 * * *',
    'SELECT public.trigger_hitl_alerts();'
  );
  RAISE NOTICE 'Created cron job: hitl-pending-alerts (every 6 hours)';

  -- Job 2: expire_old_pending_advances a cada 12 horas
  PERFORM cron.schedule(
    'expire-hitl-pending',
    '0 */12 * * *',
    'SELECT public.expire_old_pending_advances();'
  );
  RAISE NOTICE 'Created cron job: expire-hitl-pending (every 12 hours)';
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'pg_cron extension not available. Jobs must be triggered manually.
    Call trigger_hitl_alerts() and expire_old_pending_advances() from application code.';
END $$;

-- ============================================================================
-- 6. RLS Policies for deal_activities (hitl_alert type)
-- ============================================================================

-- Org members podem ver hitl_alert activities de deals da sua org
DROP POLICY IF EXISTS "Org members view hitl_alerts" ON deal_activities;

CREATE POLICY "Org members view hitl_alerts"
  ON deal_activities FOR SELECT TO authenticated
  USING (
    type = 'hitl_alert'
    AND organization_id = (
      SELECT organization_id FROM profiles WHERE id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 7. Views para monitoramento de HITL
-- ============================================================================

-- View: pending_advances_by_age
-- Agrupa pending_advances por idade (<6h, 6-12h, 12-24h, >24h)
DROP VIEW IF EXISTS public.vw_hitl_pending_by_age CASCADE;

CREATE VIEW public.vw_hitl_pending_by_age AS
SELECT
  organization_id,
  COUNT(*) as pending_count,
  COUNT(CASE WHEN created_at > (NOW() - INTERVAL '6 hours') THEN 1 END) as age_0_6h,
  COUNT(CASE WHEN created_at BETWEEN (NOW() - INTERVAL '12 hours') AND (NOW() - INTERVAL '6 hours') THEN 1 END) as age_6_12h,
  COUNT(CASE WHEN created_at BETWEEN (NOW() - INTERVAL '24 hours') AND (NOW() - INTERVAL '12 hours') THEN 1 END) as age_12_24h,
  COUNT(CASE WHEN created_at < (NOW() - INTERVAL '24 hours') THEN 1 END) as age_gt_24h,
  MAX(created_at) as oldest_pending_at
FROM public.ai_pending_stage_advances
WHERE status = 'pending'
GROUP BY organization_id;

COMMENT ON VIEW public.vw_hitl_pending_by_age IS
  'Análise de pending_advances por idade. Mostra quantos registros estão em cada faixa etária.';

-- ============================================================================
-- 8. Log/Comment para auditoria
-- ============================================================================

COMMENT ON TABLE public.ai_pending_stage_advances IS
  'HITL (Human-in-the-Loop) pending stage advances com alerting automático.
   - Functions: trigger_hitl_alerts(), expire_old_pending_advances()
   - View: vw_hitl_pending_by_age
   - pg_cron jobs (se disponível): hitl-pending-alerts (6h), expire-hitl-pending (12h)
   - Activity logging: type=''hitl_alert'' em deal_activities quando >24h sem revisão';

-- Migration: Messaging Metrics Columns
-- Adiciona sender tracking em mensagens, FRT em conversas, e RPC de métricas.

-- =============================================================================
-- 1. Colunas em messaging_messages
-- =============================================================================

ALTER TABLE messaging_messages
  ADD COLUMN IF NOT EXISTS sender_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_type TEXT CHECK (sender_type IN ('user', 'ai', 'agent', 'system'));

-- Índice composto para query de métricas (outbound only)
CREATE INDEX IF NOT EXISTS idx_msgs_metrics
  ON messaging_messages (conversation_id, direction, created_at, sender_user_id, sender_type)
  WHERE direction = 'outbound';

-- =============================================================================
-- 2. Colunas em messaging_conversations
-- =============================================================================

ALTER TABLE messaging_conversations
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_seconds INTEGER;

-- =============================================================================
-- 3. Trigger: First Response Time (com race condition guard)
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_first_response_time()
RETURNS TRIGGER AS $$
DECLARE
  v_first_inbound_at TIMESTAMPTZ;
BEGIN
  -- Só processar outbound de user/ai/agent (não system/voice)
  IF NEW.direction != 'outbound' OR COALESCE(NEW.sender_type, '') = 'system' THEN
    RETURN NEW;
  END IF;

  -- Buscar primeira msg inbound da conversa
  SELECT MIN(created_at) INTO v_first_inbound_at
  FROM messaging_messages
  WHERE conversation_id = NEW.conversation_id
    AND direction = 'inbound';

  -- Se não tem inbound, não é uma "resposta"
  IF v_first_inbound_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Atomic update com guard: só atualiza se ainda não tem FRT
  UPDATE messaging_conversations
  SET
    first_response_at = NEW.created_at,
    first_response_seconds = EXTRACT(EPOCH FROM (NEW.created_at - v_first_inbound_at))::INTEGER
  WHERE id = NEW.conversation_id
    AND first_response_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger se existir (idempotente)
DROP TRIGGER IF EXISTS trg_calculate_frt ON messaging_messages;

CREATE TRIGGER trg_calculate_frt
  AFTER INSERT ON messaging_messages
  FOR EACH ROW
  EXECUTE FUNCTION calculate_first_response_time();

-- =============================================================================
-- 4. RPC: get_messaging_metrics
-- =============================================================================

CREATE OR REPLACE FUNCTION get_messaging_metrics(
  p_org_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ DEFAULT NOW(),
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_messages_total INTEGER DEFAULT 0;
  v_messages_by_user JSONB DEFAULT '[]'::jsonb;
  v_responses_by_type JSONB DEFAULT '{}'::jsonb;
  v_new_contacts INTEGER DEFAULT 0;
  v_follow_ups INTEGER DEFAULT 0;
  v_avg_frt INTEGER DEFAULT 0;
  v_conversations_with_frt INTEGER DEFAULT 0;
  v_conversations_total INTEGER DEFAULT 0;
  v_conversations_with_response INTEGER DEFAULT 0;
  v_response_rate NUMERIC DEFAULT 0;
BEGIN
  -- Verificar org membership do caller
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Cap p_start_date: máximo 365 dias atrás
  IF p_start_date < NOW() - INTERVAL '365 days' THEN
    p_start_date := NOW() - INTERVAL '365 days';
  END IF;

  -- Mensagens outbound por tipo
  SELECT
    COALESCE(SUM(type_count), 0),
    COALESCE(jsonb_object_agg(sender_type_key, type_count), '{}'::jsonb)
  INTO v_messages_total, v_responses_by_type
  FROM (
    SELECT
      COALESCE(m.sender_type, 'unknown') as sender_type_key,
      COUNT(*) as type_count
    FROM messaging_messages m
    JOIN messaging_conversations c ON m.conversation_id = c.id
    WHERE c.organization_id = p_org_id
      AND m.direction = 'outbound'
      AND m.created_at >= p_start_date
      AND m.created_at <= p_end_date
      AND (p_user_id IS NULL OR m.sender_user_id = p_user_id)
    GROUP BY COALESCE(m.sender_type, 'unknown')
  ) sub;

  -- Mensagens por vendedor (top 50)
  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  INTO v_messages_by_user
  FROM (
    SELECT
      m.sender_user_id as user_id,
      COALESCE(p.name, 'Não atribuído') as name,
      COUNT(*) as count
    FROM messaging_messages m
    JOIN messaging_conversations c ON m.conversation_id = c.id
    LEFT JOIN profiles p ON m.sender_user_id = p.id
    WHERE c.organization_id = p_org_id
      AND m.direction = 'outbound'
      AND m.created_at >= p_start_date
      AND m.created_at <= p_end_date
      AND (p_user_id IS NULL OR m.sender_user_id = p_user_id)
    GROUP BY m.sender_user_id, p.name
    ORDER BY count DESC
    LIMIT 50
  ) sub;

  -- Novos contatos vs Follow-ups (exclui conversas sem contact_id)
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE cnt.created_at >= p_start_date AND cnt.created_at <= p_end_date), 0),
    COALESCE(COUNT(*) FILTER (WHERE cnt.created_at < p_start_date), 0)
  INTO v_new_contacts, v_follow_ups
  FROM messaging_conversations conv
  JOIN contacts cnt ON conv.contact_id = cnt.id
  WHERE conv.organization_id = p_org_id
    AND conv.created_at >= p_start_date
    AND conv.created_at <= p_end_date;

  -- SLA: First Response Time
  SELECT
    COALESCE(AVG(first_response_seconds)::INTEGER, 0),
    COUNT(*)
  INTO v_avg_frt, v_conversations_with_frt
  FROM messaging_conversations
  WHERE organization_id = p_org_id
    AND first_response_at >= p_start_date
    AND first_response_at <= p_end_date
    AND first_response_seconds IS NOT NULL;

  -- Taxa de Resposta: % de conversas com inbound que tiveram outbound no período
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM messaging_messages m2
      WHERE m2.conversation_id = conv.id
        AND m2.direction = 'outbound'
        AND m2.created_at >= p_start_date
    ))
  INTO v_conversations_total, v_conversations_with_response
  FROM messaging_conversations conv
  WHERE conv.organization_id = p_org_id
    AND conv.created_at >= p_start_date
    AND conv.created_at <= p_end_date
    AND EXISTS (
      SELECT 1 FROM messaging_messages m
      WHERE m.conversation_id = conv.id
        AND m.direction = 'inbound'
    );

  v_response_rate := CASE
    WHEN v_conversations_total > 0
    THEN ROUND((v_conversations_with_response::NUMERIC / v_conversations_total) * 100, 1)
    ELSE 0
  END;

  -- Montar resultado
  v_result := jsonb_build_object(
    'messagesSent', jsonb_build_object(
      'total', v_messages_total,
      'byUser', v_messages_by_user,
      'byType', v_responses_by_type
    ),
    'contacts', jsonb_build_object(
      'new', v_new_contacts,
      'followUp', v_follow_ups
    ),
    'sla', jsonb_build_object(
      'avgFirstResponseSeconds', v_avg_frt,
      'conversationsWithFRT', v_conversations_with_frt
    ),
    'responseRate', jsonb_build_object(
      'rate', v_response_rate,
      'responded', v_conversations_with_response,
      'total', v_conversations_total
    )
  );

  RETURN v_result;
END;
$$;

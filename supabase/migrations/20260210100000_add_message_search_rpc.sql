-- Migration: add_message_search_rpc
-- Cria RPC para busca full-text em mensagens de uma conversa.
-- Usa SECURITY INVOKER para respeitar RLS + escapa wildcards ILIKE.

CREATE OR REPLACE FUNCTION public.search_messages(
  p_conversation_id UUID,
  p_query TEXT,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  direction TEXT,
  content_type TEXT,
  content JSONB,
  status TEXT,
  external_message_id TEXT,
  sender_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_safe_query TEXT;
BEGIN
  -- Escape SQL ILIKE wildcards to prevent wildcard injection
  v_safe_query := replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.direction,
    m.content_type,
    m.content,
    m.status,
    m.external_message_id,
    m.sender_name,
    m.created_at
  FROM messaging_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.content_type = 'text'
    AND m.content->>'text' ILIKE '%' || v_safe_query || '%'
  ORDER BY m.created_at DESC
  LIMIT LEAST(p_limit, 100);
END;
$$;

-- SECURITY INVOKER respeita RLS policies.
-- API route também valida org ownership antes de chamar esta função.

-- =============================================================================
-- Fix search_messages: broken column reference + REVOKE FROM PUBLIC
--
-- Audit finding P2-04: function referenced m.external_message_id which does
-- not exist. The correct column name is m.external_id.
-- Also adds REVOKE FROM PUBLIC as defense-in-depth (SECURITY INVOKER means
-- RLS applies, but explicit revoke prevents anon access attempts).
-- =============================================================================

REVOKE ALL ON FUNCTION public.search_messages(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_messages(UUID, TEXT, INT) TO authenticated;

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
  external_id TEXT,
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
    m.external_id,
    m.sender_name,
    m.created_at
  FROM public.messaging_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.content_type = 'text'
    AND m.content->>'text' ILIKE '%' || v_safe_query || '%'
  ORDER BY m.created_at DESC
  LIMIT LEAST(p_limit, 100);
END;
$$;

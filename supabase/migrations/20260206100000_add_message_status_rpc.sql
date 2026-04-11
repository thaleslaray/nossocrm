-- Migration: Add RPC function for atomic message status updates
-- This prevents duplicate status updates and ensures status only advances (never downgrades)

-- Status order: pending(0) → queued(1) → sent(2) → delivered(3) → read(4) | failed(5)
-- Failed is special: can transition from any status

CREATE OR REPLACE FUNCTION public.update_message_status_if_newer(
  p_external_id TEXT,
  p_new_status TEXT,
  p_timestamp TIMESTAMPTZ,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_message_id UUID;
  v_updated BOOLEAN := false;
  v_status_order JSONB := '{"pending":0,"queued":1,"sent":2,"delivered":3,"read":4,"failed":5}'::JSONB;
  v_current_order INT;
  v_new_order INT;
BEGIN
  -- Lock row to prevent race condition
  SELECT id, status INTO v_message_id, v_current_status
  FROM public.messaging_messages
  WHERE external_id = p_external_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'updated', false,
      'reason', 'message_not_found',
      'external_id', p_external_id
    );
  END IF;

  -- Get status order values
  v_current_order := COALESCE((v_status_order->>v_current_status)::INT, -1);
  v_new_order := COALESCE((v_status_order->>p_new_status)::INT, -1);

  -- Determine if we should update:
  -- 1. Failed always updates (can come from any status)
  -- 2. Other statuses only update if new order > current order
  IF p_new_status = 'failed' OR v_new_order > v_current_order THEN

    UPDATE public.messaging_messages
    SET
      status = p_new_status,
      sent_at = CASE WHEN p_new_status = 'sent' AND sent_at IS NULL THEN p_timestamp ELSE sent_at END,
      delivered_at = CASE WHEN p_new_status = 'delivered' AND delivered_at IS NULL THEN p_timestamp ELSE delivered_at END,
      read_at = CASE WHEN p_new_status = 'read' AND read_at IS NULL THEN p_timestamp ELSE read_at END,
      failed_at = CASE WHEN p_new_status = 'failed' THEN p_timestamp ELSE failed_at END,
      error_code = CASE WHEN p_new_status = 'failed' THEN p_error_code ELSE error_code END,
      error_message = CASE WHEN p_new_status = 'failed' THEN p_error_message ELSE error_message END
    WHERE id = v_message_id;

    v_updated := true;
  END IF;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'message_id', v_message_id,
    'previous_status', v_current_status,
    'new_status', p_new_status,
    'reason', CASE
      WHEN v_updated THEN 'status_upgraded'
      WHEN v_new_order <= v_current_order THEN 'status_not_newer'
      ELSE 'unknown'
    END
  );
END;
$$;

-- Grant execute to service_role (used by edge functions)
GRANT EXECUTE ON FUNCTION public.update_message_status_if_newer TO service_role;

-- Comment for documentation
COMMENT ON FUNCTION public.update_message_status_if_newer IS
'Atomically updates message status only if the new status is "newer" in the progression order.
Status order: pending(0) → queued(1) → sent(2) → delivered(3) → read(4).
Failed(5) is special and can be set from any status.
Uses FOR UPDATE to prevent race conditions from concurrent webhook deliveries.';

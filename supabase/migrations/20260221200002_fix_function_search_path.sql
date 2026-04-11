-- Fix function_search_path_mutable: Add SET search_path = '' to all public functions.
-- With search_path = '', only pg_catalog is implicit.
-- All table refs must use public. prefix, extension functions use extensions. prefix.
-- Ref: https://supabase.com/docs/guides/database/database-linter#0011_function_search_path_mutable

-- ============================================================
-- Group A: Functions that need body update (unqualified names)
-- ============================================================

-- _api_key_make_token: gen_random_bytes → extensions.gen_random_bytes
CREATE OR REPLACE FUNCTION public._api_key_make_token()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  token TEXT;
BEGIN
  token := 'ncrm_' || regexp_replace(
    replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'),
    '=',
    '',
    'g'
  );
  RETURN token;
END;
$$;

-- _api_key_sha256_hex: digest → extensions.digest
CREATE OR REPLACE FUNCTION public._api_key_sha256_hex(token text)
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT encode(extensions.digest(token, 'sha256'), 'hex');
$$;

-- calculate_first_response_time: qualify messaging_messages, messaging_conversations
CREATE OR REPLACE FUNCTION public.calculate_first_response_time()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_first_inbound_at TIMESTAMPTZ;
BEGIN
  IF NEW.direction != 'outbound' OR COALESCE(NEW.sender_type, '') = 'system' THEN
    RETURN NEW;
  END IF;

  SELECT MIN(created_at) INTO v_first_inbound_at
  FROM public.messaging_messages
  WHERE conversation_id = NEW.conversation_id
    AND direction = 'inbound';

  IF v_first_inbound_at IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.messaging_conversations
  SET
    first_response_at = NEW.created_at,
    first_response_seconds = EXTRACT(EPOCH FROM (NEW.created_at - v_first_inbound_at))::INTEGER
  WHERE id = NEW.conversation_id
    AND first_response_at IS NULL;

  RETURN NEW;
END;
$$;

-- cascade_soft_delete_activities_by_contact: qualify activities
CREATE OR REPLACE FUNCTION public.cascade_soft_delete_activities_by_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE public.activities SET deleted_at = NEW.deleted_at WHERE contact_id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- cascade_soft_delete_deals: qualify deals
CREATE OR REPLACE FUNCTION public.cascade_soft_delete_deals()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE public.deals SET deleted_at = NEW.deleted_at WHERE board_id = NEW.id AND deleted_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- check_deal_duplicate: qualify deals, board_stages
CREATE OR REPLACE FUNCTION public.check_deal_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    existing_deal RECORD;
BEGIN
    IF NEW.contact_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT d.id, d.title, bs.label as stage_name
    INTO existing_deal
    FROM public.deals d
    LEFT JOIN public.board_stages bs ON d.stage_id = bs.id
    WHERE d.contact_id = NEW.contact_id
      AND d.stage_id = NEW.stage_id
      AND d.deleted_at IS NULL
      AND d.is_won = FALSE
      AND d.is_lost = FALSE
      AND NEW.is_won = FALSE
      AND NEW.is_lost = FALSE
      AND (TG_OP = 'INSERT' OR d.id != NEW.id)
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Já existe um negócio para este contato no estágio "%". Mova o negócio existente ou escolha outro estágio.',
            COALESCE(existing_deal.stage_name, 'desconhecido')
        USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- expire_old_pending_advances: qualify ai_pending_stage_advances
CREATE OR REPLACE FUNCTION public.expire_old_pending_advances()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ai_pending_stage_advances
  SET
    status = 'expired',
    resolved_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$;

-- get_contact_stage_counts: qualify contacts
CREATE OR REPLACE FUNCTION public.get_contact_stage_counts()
RETURNS TABLE(stage TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    stage,
    COUNT(*)::BIGINT as count
  FROM public.contacts
  WHERE deleted_at IS NULL
  GROUP BY stage;
$$;

-- ============================================================
-- Group B: Functions that only need SET search_path = ''
-- (all table refs already use public. prefix)
-- ============================================================

ALTER FUNCTION public.create_api_key(text) SET search_path = '';
ALTER FUNCTION public.get_dashboard_stats() SET search_path = '';
ALTER FUNCTION public.get_messaging_unread_count() SET search_path = '';
ALTER FUNCTION public.handle_new_organization() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.handle_user_email_update() SET search_path = '';
ALTER FUNCTION public.is_instance_initialized() SET search_path = '';
ALTER FUNCTION public.mark_conversation_read(uuid) SET search_path = '';
ALTER FUNCTION public.mark_deal_lost(uuid, text) SET search_path = '';
ALTER FUNCTION public.mark_deal_won(uuid) SET search_path = '';
ALTER FUNCTION public.notify_deal_stage_changed() SET search_path = '';
ALTER FUNCTION public.reopen_deal(uuid) SET search_path = '';
ALTER FUNCTION public.revoke_api_key(uuid) SET search_path = '';
ALTER FUNCTION public.update_conversation_on_message() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.validate_api_key(text) SET search_path = '';

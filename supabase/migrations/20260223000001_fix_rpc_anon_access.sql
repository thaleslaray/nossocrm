-- =============================================================================
-- Security Fix: RPC functions callable by anon role (PUBLIC default)
--
-- Root cause: PostgreSQL grants EXECUTE to PUBLIC by default on all functions.
-- The migrations issued GRANT TO authenticated but never REVOKE FROM PUBLIC.
-- Only 3 functions had the correct revoke: create_api_key, revoke_api_key,
-- validate_api_key. All others inherited anon access via the PUBLIC default.
--
-- This migration covers findings from the RPC audit NOT already addressed by
-- 20260223000000_fix_security_anon_exposure.sql (get_dashboard_stats,
-- get_contact_stage_counts, get_singleton_organization_id).
--
-- Audit date: 2026-02-23
-- Confirmed live: HTTP 204 on mark_deal_won/lost/reopen (anon key), UUID
--   returned from log_audit_event (audit trail poisoning confirmed)
-- =============================================================================

-- =============================================================================
-- STEP 1: REVOKE PUBLIC (removes anon inheritance for all affected functions)
-- =============================================================================

-- P0: Deal state mutations — data corruption risk
REVOKE ALL ON FUNCTION public.mark_deal_won(UUID)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_deal_lost(UUID, TEXT)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_deal(UUID)           FROM PUBLIC;

-- P1: Internal helpers — must never be accessible externally
REVOKE ALL ON FUNCTION public.cleanup_rate_limits(INTEGER)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public._api_key_make_token()           FROM PUBLIC;
REVOKE ALL ON FUNCTION public._api_key_sha256_hex(TEXT)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event(TEXT, TEXT, UUID, JSONB, TEXT) FROM PUBLIC;

-- P2: Workflow and messaging integrity
REVOKE ALL ON FUNCTION public.expire_old_pending_advances()                          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_message_status_if_newer(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_conversation_read(UUID)                           FROM PUBLIC;


-- =============================================================================
-- STEP 2: Re-grant to correct roles
-- =============================================================================

-- Deal mutations: only authenticated users (org check inside function body)
GRANT EXECUTE ON FUNCTION public.mark_deal_won(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_deal_lost(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_deal(UUID)          TO authenticated;

-- rate limit cleanup: cron job / service role only — no client access
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits(INTEGER) TO service_role;

-- API key internals: used only by create_api_key which runs as authenticated
GRANT EXECUTE ON FUNCTION public._api_key_make_token()      TO authenticated;
GRANT EXECUTE ON FUNCTION public._api_key_sha256_hex(TEXT)  TO authenticated;

-- Audit logging: authenticated (logs NULL user_id for anon would be misleading)
GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, UUID, JSONB, TEXT) TO authenticated;

-- HITL expiry: cron job only
GRANT EXECUTE ON FUNCTION public.expire_old_pending_advances() TO service_role;

-- Message status update: webhook handlers run as service_role
GRANT EXECUTE ON FUNCTION public.update_message_status_if_newer(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

-- mark_conversation_read: authenticated only
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;


-- =============================================================================
-- STEP 3: Add auth.uid() guards to P0 functions (defense-in-depth)
--
-- Even with REVOKE FROM PUBLIC, SECURITY DEFINER functions bypass RLS.
-- An explicit auth guard ensures that even if a future migration accidentally
-- re-opens access, the function itself rejects unauthenticated callers.
-- =============================================================================

-- mark_deal_won: add auth guard + org ownership check
CREATE OR REPLACE FUNCTION public.mark_deal_won(deal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Verify caller owns this deal (same org)
    SELECT d.organization_id INTO v_org_id
    FROM public.deals d
    WHERE d.id = deal_id AND d.deleted_at IS NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Deal not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_org_id != (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    UPDATE public.deals
    SET
        is_won = TRUE,
        is_lost = FALSE,
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = deal_id;
END;
$$;

-- mark_deal_lost: add auth guard + org ownership check
CREATE OR REPLACE FUNCTION public.mark_deal_lost(deal_id UUID, reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT d.organization_id INTO v_org_id
    FROM public.deals d
    WHERE d.id = deal_id AND d.deleted_at IS NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Deal not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_org_id != (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    UPDATE public.deals
    SET
        is_lost = TRUE,
        is_won = FALSE,
        loss_reason = COALESCE(reason, loss_reason),
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = deal_id;
END;
$$;

-- reopen_deal: add auth guard + org ownership check
CREATE OR REPLACE FUNCTION public.reopen_deal(deal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT d.organization_id INTO v_org_id
    FROM public.deals d
    WHERE d.id = deal_id AND d.deleted_at IS NULL;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Deal not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_org_id != (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    UPDATE public.deals
    SET
        is_won = FALSE,
        is_lost = FALSE,
        closed_at = NULL,
        updated_at = NOW()
    WHERE id = deal_id;
END;
$$;

-- log_audit_event: add auth guard to prevent audit trail poisoning
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}',
    p_severity TEXT DEFAULT 'info'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_log_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- Reject unauthenticated callers — never store NULL user_id audit records
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.audit_logs (
        user_id, action, resource_type, resource_id, details, severity
    ) VALUES (
        v_user_id, p_action, p_resource_type, p_resource_id, p_details, p_severity
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- mark_conversation_read: add explicit NULL guard (currently relies on implicit NULL propagation)
-- Fetching the latest version from the most recent migration that defines it
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.messaging_conversations
    SET
        unread_count = 0,
        updated_at = NOW()
    WHERE id = p_conversation_id
      AND organization_id = (
          SELECT organization_id
          FROM public.profiles
          WHERE id = auth.uid()
      );
END;
$$;

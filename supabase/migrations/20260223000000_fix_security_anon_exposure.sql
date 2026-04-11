-- =============================================================================
-- Security Fix: Anon exposure via SECURITY DEFINER functions and missing
-- TO authenticated clauses on SELECT policies
--
-- Audit date: 2026-02-23
-- Severity: P0 (3 functions), P1 (4 policies), P2 (1 INSERT policy)
-- =============================================================================

-- =============================================================================
-- P0: Revoke anon EXECUTE on SECURITY DEFINER functions that bypass RLS
--
-- Root cause: GRANT EXECUTE TO authenticated does NOT implicitly revoke from
-- anon/public. PostgREST can call these functions with just the publishable
-- key (anon role), bypassing all RLS checks because they run as the function
-- owner (postgres/superuser).
-- =============================================================================

-- get_dashboard_stats: returned real business data (deals=3, pipeline=389,995)
REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

-- get_contact_stage_counts: returned contact stage breakdown
REVOKE ALL ON FUNCTION public.get_contact_stage_counts() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contact_stage_counts() TO authenticated;

-- get_singleton_organization_id: returned org UUID (25f0f6fa-...)
REVOKE ALL ON FUNCTION public.get_singleton_organization_id() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_singleton_organization_id() TO authenticated;

-- Defense-in-depth: add auth.uid() guards inside each function body
-- so that even if future GRANTs accidentally re-open access, the function
-- itself validates the caller is authenticated.

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    v_org_id UUID;
BEGIN
    -- Auth guard: reject unauthenticated callers
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Scope to the caller's organization
    SELECT p.organization_id INTO v_org_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'User has no organization' USING ERRCODE = '42501';
    END IF;

    SELECT json_build_object(
        'total_deals',      (SELECT COUNT(*) FROM public.deals WHERE organization_id = v_org_id AND deleted_at IS NULL),
        'pipeline_value',   (SELECT COALESCE(SUM(value), 0) FROM public.deals WHERE organization_id = v_org_id AND is_won = FALSE AND is_lost = FALSE AND deleted_at IS NULL),
        'total_contacts',   (SELECT COUNT(*) FROM public.contacts WHERE organization_id = v_org_id AND deleted_at IS NULL),
        'total_companies',  (SELECT COUNT(*) FROM public.crm_companies WHERE organization_id = v_org_id AND deleted_at IS NULL),
        'won_deals',        (SELECT COUNT(*) FROM public.deals WHERE organization_id = v_org_id AND is_won = TRUE AND deleted_at IS NULL),
        'won_value',        (SELECT COALESCE(SUM(value), 0) FROM public.deals WHERE organization_id = v_org_id AND is_won = TRUE AND deleted_at IS NULL),
        'lost_deals',       (SELECT COUNT(*) FROM public.deals WHERE organization_id = v_org_id AND is_lost = TRUE AND deleted_at IS NULL),
        'activities_today', (SELECT COUNT(*) FROM public.activities WHERE organization_id = v_org_id AND DATE(date) = CURRENT_DATE AND deleted_at IS NULL)
    ) INTO result;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_contact_stage_counts()
RETURNS TABLE (stage TEXT, count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Auth guard: reject unauthenticated callers
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT p.organization_id INTO v_org_id
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'User has no organization' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        c.stage,
        COUNT(*)::BIGINT AS count
    FROM public.contacts c
    WHERE c.organization_id = v_org_id
      AND c.deleted_at IS NULL
    GROUP BY c.stage;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_singleton_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Auth guard: reject unauthenticated callers
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    RETURN v_org_id;
END;
$$;


-- =============================================================================
-- P1: Add TO authenticated to SELECT policies that were missing the clause.
--
-- Root cause: PostgreSQL RLS policies without a TO clause default to applying
-- to ALL roles including anon. The intent was always authenticated-only.
-- =============================================================================

-- lifecycle_stages: global lookup table, should be authenticated-only
DROP POLICY IF EXISTS "lifecycle_stages_readonly" ON public.lifecycle_stages;
CREATE POLICY "lifecycle_stages_readonly" ON public.lifecycle_stages
    FOR SELECT TO authenticated
    USING (true);

-- rate_limits: internal table, currently empty but must not be exposed to anon
DROP POLICY IF EXISTS "rate_limits_readonly" ON public.rate_limits;
CREATE POLICY "rate_limits_readonly" ON public.rate_limits
    FOR SELECT TO authenticated
    USING (true);

-- quick_scripts: the is_system=true branch was accessible to anon
-- (17 system sales scripts exposed). Restore TO authenticated.
DROP POLICY IF EXISTS "quick_scripts_select" ON public.quick_scripts;
CREATE POLICY "quick_scripts_select" ON public.quick_scripts
    FOR SELECT TO authenticated
    USING ((is_system = true) OR (user_id = (SELECT auth.uid())));

-- ai_qualification_templates: the is_system=true branch was accessible to anon
-- (5 AI qualification templates with full system prompts exposed).
DROP POLICY IF EXISTS "ai_qualification_templates_select" ON public.ai_qualification_templates;
CREATE POLICY "ai_qualification_templates_select" ON public.ai_qualification_templates
    FOR SELECT TO authenticated
    USING (
        is_system = true
        OR organization_id = (
            SELECT p.organization_id
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
        )
    );


-- =============================================================================
-- P2: Fix contact_merge_log INSERT policy — add org scoping
--
-- Root cause: WITH CHECK (true) allows any authenticated user to insert merge
-- log records with arbitrary organization_id, enabling cross-org audit log
-- poisoning.
-- =============================================================================

DROP POLICY IF EXISTS "Merge function can insert logs" ON public.contact_merge_log;
CREATE POLICY "contact_merge_log_insert" ON public.contact_merge_log
    FOR INSERT WITH CHECK (
        organization_id = (
            SELECT p.organization_id
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
        )
    );

-- Preserve the SELECT policy (already org-scoped, no changes needed)
-- "contact_merge_log_select" FOR SELECT USING (organization_id = ...)

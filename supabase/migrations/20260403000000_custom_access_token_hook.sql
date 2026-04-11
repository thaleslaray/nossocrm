-- ============================================================
-- Phase 1 Performance: Custom Access Token Hook
--
-- Problem: app/api/messaging/messages/route.ts queries profiles
-- table on every request to get organization_id (~150ms).
--
-- Solution: Inject organization_id into JWT app_metadata at
-- login time. API routes read user.app_metadata.organization_id
-- without a DB round-trip.
--
-- After running this migration, you MUST register the hook in:
-- Supabase Dashboard → Auth → Hooks → Custom Access Token Hook
-- Function: public.custom_access_token_hook
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  claims jsonb;
BEGIN
  -- Look up the user's organization_id from profiles.
  -- This runs once at login, not on every API request.
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- Inject organization_id into app_metadata so it is accessible
  -- via user.app_metadata.organization_id in the JS client.
  IF org_id IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims->'app_metadata', '{}'::jsonb) || jsonb_build_object('organization_id', org_id)
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- The supabase_auth_admin role needs to call this function.
-- Public and anon must not be able to invoke it.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Supabase Auth Hook: injects organization_id into JWT app_metadata at login. '
  'Eliminates the profiles table query on every API request. '
  'Must be registered at: Supabase Dashboard → Auth → Hooks → Custom Access Token Hook.';


-- ============================================================
-- Bonus: Update get_user_org_id() to read JWT first (fallback
-- to profiles). RLS policies benefit immediately even before
-- the hook is registered in the dashboard.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Fast path: read from JWT claim (populated by the hook above)
    (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid,
    -- Slow path: fallback to profiles query (while hook is being set up)
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
$$;

COMMENT ON FUNCTION public.get_user_org_id() IS
  'Returns the organization_id for the currently authenticated user. '
  'Fast path: reads from JWT app_metadata (populated by custom_access_token_hook). '
  'Fallback: queries profiles table if JWT claim is absent. '
  'STABLE + SECURITY DEFINER enables per-statement result caching in RLS policies.';

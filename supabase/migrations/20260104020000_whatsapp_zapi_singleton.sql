-- Enforce singleton Z-API account per organization
--
-- Goal:
-- - Allow only 1 row in whatsapp_accounts per organization for provider='zapi'
-- - Keep data/history by not forcing deletes in the app layer

-- Best-effort dedupe (in case someone already inserted duplicates)
-- Keep the most recently updated/created row per organization, delete the rest.
WITH ranked AS (
  SELECT
    id,
    organization_id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM public.whatsapp_accounts
  WHERE provider = 'zapi'
)
DELETE FROM public.whatsapp_accounts wa
USING ranked r
WHERE wa.id = r.id
  AND r.rn > 1;

-- Hard-enforce: only 1 Z-API account per org
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'whatsapp_accounts_zapi_singleton_per_org'
  ) THEN
    CREATE UNIQUE INDEX whatsapp_accounts_zapi_singleton_per_org
      ON public.whatsapp_accounts(organization_id)
      WHERE provider = 'zapi';
  END IF;
END $$;

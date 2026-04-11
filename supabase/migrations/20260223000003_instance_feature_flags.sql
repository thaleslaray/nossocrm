-- =============================================================================
-- Instance Feature Flags
--
-- Tabela controlada exclusivamente pelo operador do SaaS (service_role).
-- Org admins podem LER seus flags mas não podem escrever.
--
-- Uso: habilitar features que dependem de aprovação externa (ex: WhatsApp
-- Calling API requer aprovação da Meta) sem expor essa capacidade de escrita
-- aos admins das orgs clientes.
--
-- Para habilitar uma org:
--   INSERT INTO instance_feature_flags (organization_id, whatsapp_calling_access)
--   VALUES ('uuid-da-org', true)
--   ON CONFLICT (organization_id) DO UPDATE SET whatsapp_calling_access = true;
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.instance_feature_flags (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- WhatsApp Business Calling API (Meta) — requer aprovação da Meta por org
  whatsapp_calling_access BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instance_feature_flags ENABLE ROW LEVEL SECURITY;

-- Org members can read their own flags (needed for UI gating)
CREATE POLICY "instance_feature_flags_select" ON public.instance_feature_flags
  FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
    )
  );

-- NO INSERT/UPDATE/DELETE policy for authenticated users.
-- Only service_role (bypasses RLS) can write to this table.
-- This is the enforcement mechanism — org admins cannot self-enable features.

-- Seed: insert a default row for existing orgs (all flags false by default)
INSERT INTO public.instance_feature_flags (organization_id)
SELECT id FROM public.organizations WHERE deleted_at IS NULL
ON CONFLICT (organization_id) DO NOTHING;

-- Trigger: auto-create row for new orgs
CREATE OR REPLACE FUNCTION public.create_instance_flags_for_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.instance_feature_flags (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_org_created_create_instance_flags ON public.organizations;
CREATE TRIGGER on_org_created_create_instance_flags
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_instance_flags_for_org();

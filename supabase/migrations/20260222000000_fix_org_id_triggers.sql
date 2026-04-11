-- Migration: fix_org_id_triggers
-- Problema: Vários services fazem INSERT sem incluir organization_id,
-- assumindo que um trigger preencheria automaticamente. O trigger não existia,
-- causando 403 da RLS (policy org_isolate exige organization_id = profile.organization_id).
--
-- Solução: Criar função genérica + triggers BEFORE INSERT em todas as tabelas afetadas.
-- O trigger só age se organization_id vier NULL (não sobrescreve valor explícito).
--
-- NOTA: CREATE TRIGGER IF NOT EXISTS é PG17+. Para PG15 usamos DROP TRIGGER IF EXISTS
-- antes do CREATE TRIGGER (padrão idempotente compatível).

CREATE OR REPLACE FUNCTION set_organization_id_from_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM profiles
    WHERE id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- contacts
DROP TRIGGER IF EXISTS contacts_set_org_id ON contacts;
CREATE TRIGGER contacts_set_org_id
BEFORE INSERT ON contacts
FOR EACH ROW
EXECUTE FUNCTION set_organization_id_from_profile();

-- crm_companies
DROP TRIGGER IF EXISTS crm_companies_set_org_id ON crm_companies;
CREATE TRIGGER crm_companies_set_org_id
BEFORE INSERT ON crm_companies
FOR EACH ROW
EXECUTE FUNCTION set_organization_id_from_profile();

-- activities
DROP TRIGGER IF EXISTS activities_set_org_id ON activities;
CREATE TRIGGER activities_set_org_id
BEFORE INSERT ON activities
FOR EACH ROW
EXECUTE FUNCTION set_organization_id_from_profile();

-- deal_items
DROP TRIGGER IF EXISTS deal_items_set_org_id ON deal_items;
CREATE TRIGGER deal_items_set_org_id
BEFORE INSERT ON deal_items
FOR EACH ROW
EXECUTE FUNCTION set_organization_id_from_profile();

-- board_stages
DROP TRIGGER IF EXISTS board_stages_set_org_id ON board_stages;
CREATE TRIGGER board_stages_set_org_id
BEFORE INSERT ON board_stages
FOR EACH ROW
EXECUTE FUNCTION set_organization_id_from_profile();

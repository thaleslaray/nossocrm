-- Migration: fix_idempotent_constraints
-- Problema: 20260221200003_ai_configurable_defaults.sql usa ADD CONSTRAINT sem
-- guard de idempotência. Em `supabase db reset` ou replay de migrations, o
-- CREATE TABLE já existe e o ADD CONSTRAINT falha com "constraint already exists".
--
-- Solução: dropar as constraints se existirem antes de criá-las novamente.
-- Esse padrão é seguro em PG15 e compatível com Supabase.

-- chk_timezone_not_empty
ALTER TABLE organization_settings
  DROP CONSTRAINT IF EXISTS chk_timezone_not_empty;
ALTER TABLE organization_settings
  ADD CONSTRAINT chk_timezone_not_empty CHECK (timezone <> '');

-- chk_ai_hitl_min_confidence_range
ALTER TABLE organization_settings
  DROP CONSTRAINT IF EXISTS chk_ai_hitl_min_confidence_range;
ALTER TABLE organization_settings
  ADD CONSTRAINT chk_ai_hitl_min_confidence_range
    CHECK (ai_hitl_min_confidence BETWEEN 0.10 AND 0.99);

-- chk_ai_hitl_expiration_hours_range
ALTER TABLE organization_settings
  DROP CONSTRAINT IF EXISTS chk_ai_hitl_expiration_hours_range;
ALTER TABLE organization_settings
  ADD CONSTRAINT chk_ai_hitl_expiration_hours_range
    CHECK (ai_hitl_expiration_hours BETWEEN 1 AND 168);

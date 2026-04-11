-- Migration: AI Takeover Settings
-- Adiciona configuração para AI assumir conversas quando operador ficar inativo.

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS ai_takeover_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_takeover_minutes INTEGER NOT NULL DEFAULT 15;

-- Constraint separada para poder nomear
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_takeover_minutes_range'
  ) THEN
    ALTER TABLE organization_settings
      ADD CONSTRAINT chk_ai_takeover_minutes_range
      CHECK (ai_takeover_minutes >= 5 AND ai_takeover_minutes <= 120);
  END IF;
END$$;

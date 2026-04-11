-- Migration: AI configurable defaults
-- Moves hardcoded values into organization_settings so they can be
-- edited by the user and persisted across sessions.
--
-- Adds:
--   timezone                       - org timezone (replaces 'America/Sao_Paulo' hardcoded in 3 places)
--   ai_hitl_min_confidence         - minimum confidence score to suggest a stage advance (was 0.70)
--   ai_hitl_expiration_hours       - how long a pending HITL advance stays open (was 24)
--
-- Notes:
--   ai_hitl_threshold already exists (0.85 auto-advance threshold)
--   ai_takeover_minutes already exists (15 min default)
--   ai_monthly_token_limit already exists
-- =============================================================================

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS ai_hitl_min_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS ai_hitl_expiration_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS ai_base_system_prompt TEXT;

-- Validation constraints
ALTER TABLE organization_settings
  ADD CONSTRAINT chk_timezone_not_empty
    CHECK (timezone <> ''),
  ADD CONSTRAINT chk_ai_hitl_min_confidence_range
    CHECK (ai_hitl_min_confidence BETWEEN 0.10 AND 0.99),
  ADD CONSTRAINT chk_ai_hitl_expiration_hours_range
    CHECK (ai_hitl_expiration_hours BETWEEN 1 AND 168); -- 1h to 7 days

COMMENT ON COLUMN organization_settings.timezone IS
  'IANA timezone for this organization (e.g. America/Sao_Paulo). Used for business hours and time-of-day context in AI responses.';

COMMENT ON COLUMN organization_settings.ai_hitl_min_confidence IS
  'Minimum AI confidence score (0.10–0.99) required to suggest a stage advance to a human operator. Below this threshold, no suggestion is shown. Default 0.70.';

COMMENT ON COLUMN organization_settings.ai_hitl_expiration_hours IS
  'How many hours a pending HITL stage-advance approval stays open before auto-expiring. Default 24. Max 168 (7 days).';

COMMENT ON COLUMN organization_settings.ai_base_system_prompt IS
  'Base system prompt prepended to every AI response, across all stages. Defines general behavior rules (tone, identity, etc.). If null, the built-in default is used. Customizable per organization.';

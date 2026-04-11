-- Migration: add_ai_token_budget
-- Adiciona coluna de limite mensal de tokens AI nas configurações da organização.

ALTER TABLE public.organization_settings
ADD COLUMN IF NOT EXISTS ai_monthly_token_limit BIGINT DEFAULT 1000000;

COMMENT ON COLUMN public.organization_settings.ai_monthly_token_limit IS
  'Monthly token budget for AI agent. Default: 1M tokens.';

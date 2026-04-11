-- Migration: Add AI-extracted fields to deals
-- Description: Stores automatically extracted BANT data from conversations
-- Date: 2026-02-07

-- Add ai_extracted JSONB column to deals
-- Structure:
-- {
--   "budget": { "value": "R$ 50.000", "confidence": 0.9, "extractedAt": "...", "sourceMessageId": "..." },
--   "authority": { "value": "João Silva - Diretor", "confidence": 0.85, ... },
--   "need": { "value": "Precisa automatizar vendas", "confidence": 0.8, ... },
--   "timeline": { "value": "Q1 2026", "confidence": 0.7, ... },
--   "lastExtractedAt": "2026-02-07T12:00:00Z"
-- }

ALTER TABLE public.deals
ADD COLUMN IF NOT EXISTS ai_extracted JSONB DEFAULT '{}';

-- Add index for querying deals with extracted data
CREATE INDEX IF NOT EXISTS idx_deals_ai_extracted
ON public.deals USING GIN (ai_extracted);

-- Comment for documentation
COMMENT ON COLUMN public.deals.ai_extracted IS 'AI-extracted BANT fields from conversations. Auto-populated, zero config.';

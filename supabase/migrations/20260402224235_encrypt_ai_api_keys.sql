-- This migration marks the AI API key columns in organization_settings
-- as intended for encrypted storage. The application layer will handle
-- encryption and decryption.

-- Add comments to the columns for clarity
COMMENT ON COLUMN public.organization_settings.ai_google_key IS 'Encrypted Google/Gemini API key (ciphertext:iv)';
COMMENT ON COLUMN public.organization_settings.ai_openai_key IS 'Encrypted OpenAI API key (ciphertext:iv)';
COMMENT ON COLUMN public.organization_settings.ai_anthropic_key IS 'Encrypted Anthropic/Claude API key (ciphertext:iv)';

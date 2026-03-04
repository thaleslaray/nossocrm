-- =============================================================================
-- EVOLUTION API MIGRATION - FullHouse CRM
-- =============================================================================
--
-- Migrates from Z-API to Evolution API for WhatsApp integration.
--
-- Changes:
-- 1. Add Evolution API config to organization_settings
-- 2. Remove Z-API columns from organization_settings
-- 3. Rename zapi_message_id → evolution_message_id
-- 4. Add evolution_instance_name to whatsapp_instances
-- 5. Expand AI log action types
-- =============================================================================

-- 1. Add Evolution API settings to organization_settings
ALTER TABLE public.organization_settings
    ADD COLUMN IF NOT EXISTS evolution_api_url TEXT,
    ADD COLUMN IF NOT EXISTS evolution_api_key TEXT;

-- 2. Remove Z-API-specific columns from organization_settings
ALTER TABLE public.organization_settings
    DROP COLUMN IF EXISTS zapi_instance_id,
    DROP COLUMN IF EXISTS zapi_token,
    DROP COLUMN IF EXISTS zapi_client_token;

-- 3. Rename zapi_message_id to evolution_message_id in whatsapp_messages
ALTER TABLE public.whatsapp_messages
    RENAME COLUMN zapi_message_id TO evolution_message_id;

-- 4. Update index for the renamed column
DROP INDEX IF EXISTS idx_whatsapp_messages_zapi_id;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_evolution_id
    ON public.whatsapp_messages(evolution_message_id);

-- 5. Add evolution_instance_name to whatsapp_instances
-- This is the instance name used in Evolution API URL paths.
ALTER TABLE public.whatsapp_instances
    ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT;

-- 6. Expand AI log action types (the intelligence migration added actions
--    that weren't in the original CHECK constraint)
ALTER TABLE public.whatsapp_ai_logs
    DROP CONSTRAINT IF EXISTS whatsapp_ai_logs_action_check;
ALTER TABLE public.whatsapp_ai_logs
    ADD CONSTRAINT whatsapp_ai_logs_action_check CHECK (
        action IN (
            'replied', 'paused', 'resumed', 'escalated',
            'contact_created', 'deal_created', 'stage_changed',
            'tag_added', 'error', 'memory_extracted',
            'follow_up_scheduled', 'follow_up_sent', 'follow_up_cancelled',
            'label_assigned', 'label_removed', 'lead_score_updated',
            'summary_generated', 'intent_detected', 'smart_paused',
            'smart_resumed', 'stage_auto_changed', 'deal_auto_updated'
        )
    );

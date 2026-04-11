-- Migration: Add whatsapp_bsuid column to contacts
--
-- Context: Meta will replace wa_id (phone number) with opaque BSUIDs
-- in WhatsApp webhook events starting June 2026.
-- This column enables dual-lookup (bsuid-first, phone fallback) during
-- the transition period, and full BSUID-based lookups after the cutover.
--
-- @see https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/migrate-existing-wa_id-to-bsuid

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS whatsapp_bsuid TEXT;

-- Partial index for fast BSUID lookups scoped by org
-- (only indexes rows where bsuid is set — avoids bloat during transition)
CREATE INDEX IF NOT EXISTS idx_contacts_org_bsuid
  ON contacts(organization_id, whatsapp_bsuid)
  WHERE whatsapp_bsuid IS NOT NULL;

COMMENT ON COLUMN contacts.whatsapp_bsuid IS
  'WhatsApp Business Scoped User ID (BSUID). '
  'Replaces wa_id (phone number) as primary identifier in WhatsApp webhooks from June 2026. '
  'During transition period, contacts may have both phone and whatsapp_bsuid populated.';

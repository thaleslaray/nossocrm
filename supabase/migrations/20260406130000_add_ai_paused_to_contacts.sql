-- Add ai_paused column to contacts table
-- When true, the AI agent will not respond to this contact on any channel.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN contacts.ai_paused IS
  'When true, the AI agent skips automatic responses for this contact across all messaging channels.';

-- Add notify_team to stage_ai_config
-- When true, the AI agent will trigger a handoff and send a Telegram notification
-- instead of responding to the lead directly.
ALTER TABLE stage_ai_config
  ADD COLUMN IF NOT EXISTS notify_team BOOLEAN NOT NULL DEFAULT false;

-- Add Telegram bot configuration to organization_settings
-- telegram_bot_token: The Bot API token from @BotFather
-- telegram_chat_id: The target chat/group/channel ID
ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

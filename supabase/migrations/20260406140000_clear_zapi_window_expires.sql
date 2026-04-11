-- Clear window_expires_at from conversations on Z-API channels.
-- The 24h response window is a Meta (official API) restriction only.
-- Z-API (unofficial) has no such limitation.

UPDATE messaging_conversations mc
SET window_expires_at = NULL
FROM messaging_channels ch
WHERE mc.channel_id = ch.id
  AND ch.provider = 'z-api'
  AND mc.window_expires_at IS NOT NULL;

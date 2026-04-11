-- Fix: Change unique constraint to partial index that ignores soft-deleted records

-- Drop old constraint
ALTER TABLE messaging_channels DROP CONSTRAINT IF EXISTS messaging_channels_unique;

-- Create partial unique index (only for non-deleted records)
CREATE UNIQUE INDEX messaging_channels_unique
  ON messaging_channels (organization_id, channel_type, external_identifier)
  WHERE deleted_at IS NULL;

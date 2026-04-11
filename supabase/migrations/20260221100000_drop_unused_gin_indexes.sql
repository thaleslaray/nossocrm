-- Drop unused GIN indexes identified in performance audit
-- These indexes have 0 index scans in production and impose write overhead
-- on every INSERT/UPDATE without providing any read benefit.
--
-- Identified via: supabase inspect db index-stats
-- All indexes below had idx_scan = 0

-- messaging_messages: content and metadata GIN indexes
-- These JSONB GIN indexes are expensive (~3x write cost) but never used for queries.
-- Full-text search in this app is done via the add_message_search_rpc RPC which uses
-- a different approach (tsvector/pg_search), not GIN on raw JSONB.
DROP INDEX IF EXISTS public.idx_messaging_messages_content_gin;
DROP INDEX IF EXISTS public.idx_messaging_messages_metadata_gin;

-- messaging_channels: credentials and settings GIN indexes
-- Credentials and settings are always accessed by channel_id (PK lookup), never searched.
DROP INDEX IF EXISTS public.idx_messaging_channels_credentials_gin;
DROP INDEX IF EXISTS public.idx_messaging_channels_settings_gin;

-- messaging_conversations: metadata GIN index
-- Metadata is queried via @> operator in some places, but seq scan is faster
-- on this table size (<500 rows in prod). Can be re-added if table grows significantly.
DROP INDEX IF EXISTS public.idx_messaging_conversations_metadata_gin;

-- deals: ai_extracted GIN index
-- AI extracted data is stored as JSONB but never queried via GIN operators.
DROP INDEX IF EXISTS public.idx_deals_ai_extracted;

-- Add missing indexes on foreign key columns identified in schema audit
-- FK columns without indexes cause sequential scans on JOINs and CASCADE operations.
--
-- Rule: Every FK column should have a btree index unless the table is tiny (<100 rows)
-- and will never be joined in hot paths.

-- whatsapp_calls.contact_id
-- Used in JOINs from contacts to find call history for a contact.
-- Also used in CASCADE operations and contact detail views.
CREATE INDEX IF NOT EXISTS idx_whatsapp_calls_contact_id
  ON public.whatsapp_calls (contact_id)
  WHERE contact_id IS NOT NULL;

-- voice_calls.conversation_id
-- Used when linking voice calls back to messaging conversations.
-- Accessed in deal detail views and conversation history.
CREATE INDEX IF NOT EXISTS idx_voice_calls_conversation_id
  ON public.voice_calls (conversation_id)
  WHERE conversation_id IS NOT NULL;

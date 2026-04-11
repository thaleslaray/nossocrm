-- Migration: Fix reaction messages in conversation trigger
--
-- Problem: Inserting a 'reaction' content_type message was:
--   1. Updating last_message_preview to the string 'reaction'
--   2. Incrementing message_count (reactions are not real messages)
--   3. Extending window_expires_at (reactions should not reset the 24h window)
--   4. Not updating metadata.reactions on the original message
--
-- Fix: When content_type = 'reaction', update the original message's
-- metadata.reactions counter and skip conversation field updates entirely.

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER AS $$
DECLARE
  v_emoji TEXT;
  v_message_id TEXT;
  v_current_count INT;
BEGIN
  -- Reactions are annotations on existing messages, not standalone messages.
  -- Update the original message's metadata.reactions and exit early.
  IF NEW.content_type = 'reaction' THEN
    v_emoji      := NEW.content->>'emoji';
    v_message_id := NEW.content->>'messageId';

    IF v_emoji IS NOT NULL AND v_message_id IS NOT NULL THEN
      -- Atomically increment (or initialize) the emoji counter on the target message.
      -- Two-step jsonb_set: first ensure 'reactions' key exists (jsonb_set silently
      -- ignores nested-path writes when the parent key is absent), then set the counter.
      UPDATE public.messaging_messages
      SET metadata = jsonb_set(
        jsonb_set(
          COALESCE(metadata, '{}'),
          ARRAY['reactions'],
          COALESCE(metadata->'reactions', '{}')
        ),
        ARRAY['reactions', v_emoji],
        to_jsonb(
          COALESCE(
            (metadata->'reactions'->>v_emoji)::int,
            0
          ) + 1
        )
      )
      WHERE external_id = v_message_id;
    END IF;

    RETURN NEW;
  END IF;

  -- Normal (non-reaction) message: update conversation counters as before
  UPDATE public.messaging_conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = CASE
      WHEN NEW.content_type = 'text'     THEN LEFT(NEW.content->>'text', 100)
      WHEN NEW.content_type = 'image'    THEN '[Imagem]'
      WHEN NEW.content_type = 'video'    THEN '[Video]'
      WHEN NEW.content_type = 'audio'    THEN '[Audio]'
      WHEN NEW.content_type = 'document' THEN '[Documento]'
      WHEN NEW.content_type = 'sticker'  THEN '[Sticker]'
      WHEN NEW.content_type = 'location' THEN '[Localização]'
      WHEN NEW.content_type = 'contact'  THEN '[Contato]'
      WHEN NEW.content_type = 'template' THEN '[Template]'
      ELSE '[Mensagem]'
    END,
    last_message_direction = NEW.direction,
    message_count          = message_count + 1,
    unread_count           = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    window_expires_at      = CASE
      WHEN NEW.direction = 'inbound' THEN NOW() + INTERVAL '24 hours'
      ELSE window_expires_at
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix merge_contacts: remove reference to voice_calls table (dropped in voice feature removal)
-- The voice feature was removed in commit 9a4d666 but the merge_contacts function
-- still referenced voice_calls, causing 400 errors on contact merge.

CREATE OR REPLACE FUNCTION merge_contacts(
  p_source_id UUID,
  p_target_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_caller_id UUID;
  v_source RECORD;
  v_target RECORD;
  v_moved JSONB DEFAULT '{}'::jsonb;
  v_count INTEGER;
BEGIN
  v_caller_id := auth.uid();

  -- Guard: source = target
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot merge contact into itself';
  END IF;

  -- Row-level locks (ordered by ID to prevent deadlocks)
  IF p_source_id < p_target_id THEN
    SELECT * INTO v_source FROM contacts WHERE id = p_source_id AND deleted_at IS NULL FOR UPDATE;
    SELECT * INTO v_target FROM contacts WHERE id = p_target_id AND deleted_at IS NULL FOR UPDATE;
  ELSE
    SELECT * INTO v_target FROM contacts WHERE id = p_target_id AND deleted_at IS NULL FOR UPDATE;
    SELECT * INTO v_source FROM contacts WHERE id = p_source_id AND deleted_at IS NULL FOR UPDATE;
  END IF;

  IF v_source IS NULL OR v_target IS NULL THEN
    RAISE EXCEPTION 'Contact not found or already deleted';
  END IF;

  -- Guard: same org
  IF v_source.organization_id != v_target.organization_id THEN
    RAISE EXCEPTION 'Contacts from different organizations';
  END IF;

  v_org_id := v_target.organization_id;

  -- Guard: caller pertence à org
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Guard: source not already merged
  IF v_source.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'Source contact already merged';
  END IF;

  -- Guard: target not already merged
  IF v_target.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'Target contact already merged';
  END IF;

  -- 1. Preencher campos nulos do target com dados do source
  UPDATE contacts SET
    email = COALESCE(email, v_source.email),
    phone = COALESCE(phone, v_source.phone),
    company_name = COALESCE(company_name, v_source.company_name),
    client_company_id = COALESCE(client_company_id, v_source.client_company_id),
    notes = CASE
      WHEN notes IS NULL THEN v_source.notes
      WHEN v_source.notes IS NOT NULL THEN LEFT(notes || E'\n---\n' || v_source.notes, 50000)
      ELSE notes
    END,
    updated_at = NOW()
  WHERE id = p_target_id;

  -- 2. Disable deal duplicate trigger (allows overlapping stages)
  ALTER TABLE deals DISABLE TRIGGER check_deal_duplicate_trigger;

  -- 3. Mover deals
  UPDATE deals SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_moved := v_moved || jsonb_build_object('deals', v_count);

  -- Re-enable deal duplicate trigger
  ALTER TABLE deals ENABLE TRIGGER check_deal_duplicate_trigger;

  -- 4. Mover conversations
  UPDATE messaging_conversations SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_moved := v_moved || jsonb_build_object('conversations', v_count);

  -- 5. Mover activities (contact_id)
  UPDATE activities SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_moved := v_moved || jsonb_build_object('activities', v_count);

  -- 6. Dedup participant_contact_ids arrays (replace + distinct)
  UPDATE activities
  SET participant_contact_ids = (
    SELECT ARRAY(SELECT DISTINCT unnest(
      array_replace(participant_contact_ids, p_source_id, p_target_id)
    ))
  )
  WHERE p_source_id = ANY(participant_contact_ids);

  -- 7. Mover ai_decisions
  UPDATE ai_decisions SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_moved := v_moved || jsonb_build_object('ai_decisions', v_count);

  -- 8. Mover ai_audio_notes
  UPDATE ai_audio_notes SET contact_id = p_target_id WHERE contact_id = p_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_moved := v_moved || jsonb_build_object('ai_audio_notes', v_count);

  -- 9. Mover leads
  UPDATE leads SET converted_to_contact_id = p_target_id
    WHERE converted_to_contact_id = p_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_moved := v_moved || jsonb_build_object('leads', v_count);

  -- 10. Mover webhook_events_in
  UPDATE webhook_events_in SET created_contact_id = p_target_id
    WHERE created_contact_id = p_source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_moved := v_moved || jsonb_build_object('webhook_events', v_count);

  -- 11. Marcar source como merged (soft delete)
  UPDATE contacts SET
    merged_into_id = p_target_id,
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_source_id;

  -- 12. Log do merge
  INSERT INTO contact_merge_log (
    organization_id, source_contact_id, target_contact_id, merged_by,
    source_snapshot, records_moved
  ) VALUES (
    v_org_id, p_source_id, p_target_id, v_caller_id,
    row_to_json(v_source)::jsonb,
    v_moved
  );

  RETURN jsonb_build_object(
    'success', true,
    'targetId', p_target_id,
    'sourceId', p_source_id,
    'recordsMoved', v_moved
  );
END;
$$;

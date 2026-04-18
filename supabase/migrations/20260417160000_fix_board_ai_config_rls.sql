-- Fix board_ai_config RLS: add cross-tenant board ownership check
-- Without this, an admin of org A could INSERT a config row for org B's board
-- by setting board_id=<B_board> and organization_id=<A> (the payload org_id).
-- The old policy only checked organization_id = get_user_org_id() on the row,
-- which passes because the caller controls the organization_id column value.

DROP POLICY IF EXISTS "board_ai_config: admin write" ON board_ai_config;

CREATE POLICY "board_ai_config: admin write"
  ON board_ai_config FOR ALL
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = board_ai_config.board_id
        AND b.organization_id = get_user_org_id()
    )
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = board_ai_config.board_id
        AND b.organization_id = get_user_org_id()
    )
  );

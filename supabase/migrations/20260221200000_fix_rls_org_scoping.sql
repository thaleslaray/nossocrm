-- Fix RLS policies that use USING(true) / WITH CHECK(true)
-- Replace with organization-scoped or user-scoped policies.
-- Pattern: (SELECT auth.uid()) evaluated once per query, not per row.

-- ============================================================
-- Helper: org_id lookup subquery (used throughout)
-- (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
-- ============================================================

-- ============================================================
-- Tables with direct organization_id column
-- ============================================================

-- activities
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.activities;
CREATE POLICY "activities_org_isolate" ON public.activities
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- boards
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.boards;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.boards;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.boards;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.boards;
CREATE POLICY "boards_org_isolate" ON public.boards
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- board_stages
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.board_stages;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.board_stages;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.board_stages;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.board_stages;
CREATE POLICY "board_stages_org_isolate" ON public.board_stages
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- contacts
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.contacts;
CREATE POLICY "contacts_org_isolate" ON public.contacts
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- crm_companies
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.crm_companies;
CREATE POLICY "crm_companies_org_isolate" ON public.crm_companies
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- custom_field_definitions
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.custom_field_definitions;
CREATE POLICY "custom_field_definitions_org_isolate" ON public.custom_field_definitions
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- deals
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.deals;
CREATE POLICY "deals_org_isolate" ON public.deals
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- deal_items
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.deal_items;
CREATE POLICY "deal_items_org_isolate" ON public.deal_items
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- leads
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.leads;
CREATE POLICY "leads_org_isolate" ON public.leads
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- products
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.products;
CREATE POLICY "products_org_isolate" ON public.products
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- tags
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tags;
CREATE POLICY "tags_org_isolate" ON public.tags
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- security_alerts (read-only for org members, writes via service_role)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.security_alerts;
CREATE POLICY "security_alerts_org_select" ON public.security_alerts
  FOR SELECT
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- audit_logs (read-only for org members)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.audit_logs;
CREATE POLICY "audit_logs_org_select" ON public.audit_logs
  FOR SELECT
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- system_notifications
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.system_notifications;
CREATE POLICY "system_notifications_org_isolate" ON public.system_notifications
  FOR ALL
  USING (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));

-- ============================================================
-- Tables scoped to user_id (no organization_id)
-- ============================================================

-- ai_audio_notes
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_audio_notes;
CREATE POLICY "ai_audio_notes_user_isolate" ON public.ai_audio_notes
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ai_conversations
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_conversations;
CREATE POLICY "ai_conversations_user_isolate" ON public.ai_conversations
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ai_decisions
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_decisions;
CREATE POLICY "ai_decisions_user_isolate" ON public.ai_decisions
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ai_suggestion_interactions
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_suggestion_interactions;
CREATE POLICY "ai_suggestion_interactions_user_isolate" ON public.ai_suggestion_interactions
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- user_consents
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.user_consents;
CREATE POLICY "user_consents_user_isolate" ON public.user_consents
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================================
-- Tables scoped via JOIN (no direct org_id)
-- ============================================================

-- deal_files (join through deals)
DROP POLICY IF EXISTS "deal_files_access" ON public.deal_files;
CREATE POLICY "deal_files_org_isolate" ON public.deal_files
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_files.deal_id
        AND d.organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_files.deal_id
        AND d.organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  );

-- deal_notes (join through deals)
DROP POLICY IF EXISTS "deal_notes_access" ON public.deal_notes;
CREATE POLICY "deal_notes_org_isolate" ON public.deal_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_notes.deal_id
        AND d.organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_notes.deal_id
        AND d.organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  );

-- ============================================================
-- System/global tables
-- ============================================================

-- lifecycle_stages: global lookup table, read-only for authenticated
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.lifecycle_stages;
CREATE POLICY "lifecycle_stages_readonly" ON public.lifecycle_stages
  FOR SELECT
  USING (true);

-- rate_limits: system table, only service_role writes
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.rate_limits;
CREATE POLICY "rate_limits_readonly" ON public.rate_limits
  FOR SELECT
  USING (true);

-- Fix 1: Wrap bare auth.uid() with (SELECT auth.uid()) to prevent per-row re-evaluation.
-- Fix 2: Merge multiple permissive SELECT policies into single SELECT + separate write policies.
-- Ref: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ============================================================
-- Group A: Bare auth.uid() fixes (simple wrap)
-- ============================================================

-- contact_merge_log
DROP POLICY IF EXISTS "Users can view merge logs of their org" ON public.contact_merge_log;
CREATE POLICY "contact_merge_log_org_select" ON public.contact_merge_log
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );

-- deal_activities
DROP POLICY IF EXISTS "Users can view own org deal activities" ON public.deal_activities;
CREATE POLICY "deal_activities_org_select" ON public.deal_activities
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert own org deal activities" ON public.deal_activities;
CREATE POLICY "deal_activities_org_insert" ON public.deal_activities
  FOR INSERT WITH CHECK (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );

-- profiles
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- quick_scripts (4 policies)
DROP POLICY IF EXISTS "quick_scripts_delete" ON public.quick_scripts;
CREATE POLICY "quick_scripts_delete" ON public.quick_scripts
  FOR DELETE USING ((user_id = (SELECT auth.uid())) AND (is_system = false));

DROP POLICY IF EXISTS "quick_scripts_insert" ON public.quick_scripts;
CREATE POLICY "quick_scripts_insert" ON public.quick_scripts
  FOR INSERT WITH CHECK ((user_id = (SELECT auth.uid())) AND (is_system = false));

DROP POLICY IF EXISTS "quick_scripts_select" ON public.quick_scripts;
CREATE POLICY "quick_scripts_select" ON public.quick_scripts
  FOR SELECT USING ((is_system = true) OR (user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "quick_scripts_update" ON public.quick_scripts;
CREATE POLICY "quick_scripts_update" ON public.quick_scripts
  FOR UPDATE
  USING ((user_id = (SELECT auth.uid())) AND (is_system = false))
  WITH CHECK ((user_id = (SELECT auth.uid())) AND (is_system = false));

-- user_settings
DROP POLICY IF EXISTS "user_settings_isolate" ON public.user_settings;
CREATE POLICY "user_settings_isolate" ON public.user_settings
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================================
-- Group B: auth.uid() IN (...) fix + Multiple Permissive Policies
-- Pattern: Split "Admins ALL + Members SELECT" into:
--   1 SELECT (all org members, admins included)
--   3 write policies (admin only: INSERT, UPDATE, DELETE)
-- ============================================================

-- ai_feature_flags
DROP POLICY IF EXISTS "Admins can manage ai feature flags" ON public.ai_feature_flags;
DROP POLICY IF EXISTS "Members can view ai feature flags" ON public.ai_feature_flags;
CREATE POLICY "ai_feature_flags_select" ON public.ai_feature_flags
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "ai_feature_flags_insert" ON public.ai_feature_flags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_feature_flags.organization_id AND p.role = 'admin')
  );
CREATE POLICY "ai_feature_flags_update" ON public.ai_feature_flags
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_feature_flags.organization_id AND p.role = 'admin')
  );
CREATE POLICY "ai_feature_flags_delete" ON public.ai_feature_flags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_feature_flags.organization_id AND p.role = 'admin')
  );

-- ai_prompt_templates
DROP POLICY IF EXISTS "Admins can manage ai prompts" ON public.ai_prompt_templates;
DROP POLICY IF EXISTS "Members can view ai prompts" ON public.ai_prompt_templates;
CREATE POLICY "ai_prompt_templates_select" ON public.ai_prompt_templates
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "ai_prompt_templates_insert" ON public.ai_prompt_templates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_prompt_templates.organization_id AND p.role = 'admin')
  );
CREATE POLICY "ai_prompt_templates_update" ON public.ai_prompt_templates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_prompt_templates.organization_id AND p.role = 'admin')
  );
CREATE POLICY "ai_prompt_templates_delete" ON public.ai_prompt_templates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_prompt_templates.organization_id AND p.role = 'admin')
  );

-- ai_qualification_templates (had 3 SELECT policies)
DROP POLICY IF EXISTS "Admins manage custom templates" ON public.ai_qualification_templates;
DROP POLICY IF EXISTS "Anyone can view system templates" ON public.ai_qualification_templates;
DROP POLICY IF EXISTS "Org members view custom templates" ON public.ai_qualification_templates;
CREATE POLICY "ai_qualification_templates_select" ON public.ai_qualification_templates
  FOR SELECT USING (
    is_system = true
    OR organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "ai_qualification_templates_insert" ON public.ai_qualification_templates
  FOR INSERT WITH CHECK (
    is_system = false AND
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_qualification_templates.organization_id AND p.role = 'admin')
  );
CREATE POLICY "ai_qualification_templates_update" ON public.ai_qualification_templates
  FOR UPDATE USING (
    is_system = false AND
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_qualification_templates.organization_id AND p.role = 'admin')
  );
CREATE POLICY "ai_qualification_templates_delete" ON public.ai_qualification_templates
  FOR DELETE USING (
    is_system = false AND
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = ai_qualification_templates.organization_id AND p.role = 'admin')
  );

-- api_keys (single admin-only policy, just fix auth.uid())
DROP POLICY IF EXISTS "Admins can manage api keys" ON public.api_keys;
CREATE POLICY "api_keys_admin" ON public.api_keys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = api_keys.organization_id AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = api_keys.organization_id AND p.role = 'admin')
  );

-- integration_inbound_sources
DROP POLICY IF EXISTS "Admins can manage inbound sources" ON public.integration_inbound_sources;
CREATE POLICY "integration_inbound_sources_admin" ON public.integration_inbound_sources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = integration_inbound_sources.organization_id AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = integration_inbound_sources.organization_id AND p.role = 'admin')
  );

-- integration_outbound_endpoints
DROP POLICY IF EXISTS "Admins can manage outbound endpoints" ON public.integration_outbound_endpoints;
CREATE POLICY "integration_outbound_endpoints_admin" ON public.integration_outbound_endpoints
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = integration_outbound_endpoints.organization_id AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = integration_outbound_endpoints.organization_id AND p.role = 'admin')
  );

-- organization_invites
DROP POLICY IF EXISTS "Admins can manage organization invites" ON public.organization_invites;
DROP POLICY IF EXISTS "Members can view organization invites" ON public.organization_invites;
CREATE POLICY "organization_invites_select" ON public.organization_invites
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "organization_invites_insert" ON public.organization_invites
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = organization_invites.organization_id AND p.role = 'admin')
  );
CREATE POLICY "organization_invites_update" ON public.organization_invites
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = organization_invites.organization_id AND p.role = 'admin')
  );
CREATE POLICY "organization_invites_delete" ON public.organization_invites
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = organization_invites.organization_id AND p.role = 'admin')
  );

-- organization_settings
DROP POLICY IF EXISTS "Admins can manage org settings" ON public.organization_settings;
DROP POLICY IF EXISTS "Members can view org settings" ON public.organization_settings;
CREATE POLICY "organization_settings_select" ON public.organization_settings
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "organization_settings_insert" ON public.organization_settings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = organization_settings.organization_id AND p.role = 'admin')
  );
CREATE POLICY "organization_settings_update" ON public.organization_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = organization_settings.organization_id AND p.role = 'admin')
  );

-- webhook_deliveries
DROP POLICY IF EXISTS "Admins can view deliveries" ON public.webhook_deliveries;
CREATE POLICY "webhook_deliveries_admin_select" ON public.webhook_deliveries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = webhook_deliveries.organization_id AND p.role = 'admin')
  );

-- webhook_events_in
DROP POLICY IF EXISTS "Admins can view inbound webhook events" ON public.webhook_events_in;
CREATE POLICY "webhook_events_in_admin_select" ON public.webhook_events_in
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = webhook_events_in.organization_id AND p.role = 'admin')
  );

-- webhook_events_out
DROP POLICY IF EXISTS "Admins can view outbound webhook events" ON public.webhook_events_out;
CREATE POLICY "webhook_events_out_admin_select" ON public.webhook_events_out
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = webhook_events_out.organization_id AND p.role = 'admin')
  );

-- ============================================================
-- Group C: Fix remaining Multiple Permissive Policies
-- These already use (SELECT auth.uid() AS uid) but have duplicate SELECT
-- ============================================================

-- business_units
DROP POLICY IF EXISTS "Admins manage units" ON public.business_units;
DROP POLICY IF EXISTS "Users view their org units" ON public.business_units;
CREATE POLICY "business_units_select" ON public.business_units
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "business_units_insert" ON public.business_units
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = business_units.organization_id AND p.role = 'admin')
  );
CREATE POLICY "business_units_update" ON public.business_units
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = business_units.organization_id AND p.role = 'admin')
  );
CREATE POLICY "business_units_delete" ON public.business_units
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = business_units.organization_id AND p.role = 'admin')
  );

-- business_unit_members
DROP POLICY IF EXISTS "Admins manage unit members" ON public.business_unit_members;
DROP POLICY IF EXISTS "Users view unit members in org" ON public.business_unit_members;
CREATE POLICY "business_unit_members_select" ON public.business_unit_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.business_units bu
      WHERE bu.id = business_unit_members.business_unit_id
        AND bu.organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  );
CREATE POLICY "business_unit_members_insert" ON public.business_unit_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_units bu
      JOIN public.profiles p ON p.organization_id = bu.organization_id
      WHERE bu.id = business_unit_members.business_unit_id
        AND p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );
CREATE POLICY "business_unit_members_update" ON public.business_unit_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.business_units bu
      JOIN public.profiles p ON p.organization_id = bu.organization_id
      WHERE bu.id = business_unit_members.business_unit_id
        AND p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );
CREATE POLICY "business_unit_members_delete" ON public.business_unit_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.business_units bu
      JOIN public.profiles p ON p.organization_id = bu.organization_id
      WHERE bu.id = business_unit_members.business_unit_id
        AND p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );

-- lead_routing_rules
DROP POLICY IF EXISTS "Admins can manage lead routing rules" ON public.lead_routing_rules;
DROP POLICY IF EXISTS "Org members can view lead routing rules" ON public.lead_routing_rules;
CREATE POLICY "lead_routing_rules_select" ON public.lead_routing_rules
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "lead_routing_rules_insert" ON public.lead_routing_rules
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = lead_routing_rules.organization_id AND p.role = 'admin')
  );
CREATE POLICY "lead_routing_rules_update" ON public.lead_routing_rules
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = lead_routing_rules.organization_id AND p.role = 'admin')
  );
CREATE POLICY "lead_routing_rules_delete" ON public.lead_routing_rules
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = lead_routing_rules.organization_id AND p.role = 'admin')
  );

-- messaging_channels
DROP POLICY IF EXISTS "Admins can manage channels" ON public.messaging_channels;
DROP POLICY IF EXISTS "Users view channels in their org" ON public.messaging_channels;
CREATE POLICY "messaging_channels_select" ON public.messaging_channels
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "messaging_channels_insert" ON public.messaging_channels
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = messaging_channels.organization_id AND p.role = 'admin')
  );
CREATE POLICY "messaging_channels_update" ON public.messaging_channels
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = messaging_channels.organization_id AND p.role = 'admin')
  );
CREATE POLICY "messaging_channels_delete" ON public.messaging_channels
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = messaging_channels.organization_id AND p.role = 'admin')
  );

-- messaging_templates
DROP POLICY IF EXISTS "Admins manage templates" ON public.messaging_templates;
DROP POLICY IF EXISTS "Users view templates for their org channels" ON public.messaging_templates;
CREATE POLICY "messaging_templates_select" ON public.messaging_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messaging_channels c
      WHERE c.id = messaging_templates.channel_id
        AND c.organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  );
CREATE POLICY "messaging_templates_insert" ON public.messaging_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messaging_channels c
      JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = messaging_templates.channel_id
        AND p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );
CREATE POLICY "messaging_templates_update" ON public.messaging_templates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.messaging_channels c
      JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = messaging_templates.channel_id
        AND p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );
CREATE POLICY "messaging_templates_delete" ON public.messaging_templates
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.messaging_channels c
      JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = messaging_templates.channel_id
        AND p.id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );

-- stage_ai_config
DROP POLICY IF EXISTS "Admins manage stage AI config" ON public.stage_ai_config;
DROP POLICY IF EXISTS "Org members view stage AI config" ON public.stage_ai_config;
CREATE POLICY "stage_ai_config_select" ON public.stage_ai_config
  FOR SELECT USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
CREATE POLICY "stage_ai_config_insert" ON public.stage_ai_config
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = stage_ai_config.organization_id AND p.role = 'admin')
  );
CREATE POLICY "stage_ai_config_update" ON public.stage_ai_config
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = stage_ai_config.organization_id AND p.role = 'admin')
  );
CREATE POLICY "stage_ai_config_delete" ON public.stage_ai_config
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.organization_id = stage_ai_config.organization_id AND p.role = 'admin')
  );

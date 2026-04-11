-- Migration: Atualiza políticas RLS para usar get_user_org_id()
--
-- A função get_user_org_id() é STABLE SECURITY DEFINER, avaliada uma vez
-- por statement em vez de uma subquery por linha. Elimina o JOIN em profiles
-- em cada row avaliada pelas políticas RLS.
--
-- Função criada em: 20260224000000_performance_indexes_and_rls_cache.sql


-- Table: activities
DROP POLICY IF EXISTS "activities_org_isolate" ON public.activities;
CREATE POLICY "activities_org_isolate" ON public.activities
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: boards
DROP POLICY IF EXISTS "boards_org_isolate" ON public.boards;
CREATE POLICY "boards_org_isolate" ON public.boards
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: board_stages
DROP POLICY IF EXISTS "board_stages_org_isolate" ON public.board_stages;
CREATE POLICY "board_stages_org_isolate" ON public.board_stages
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: contacts
DROP POLICY IF EXISTS "contacts_org_isolate" ON public.contacts;
CREATE POLICY "contacts_org_isolate" ON public.contacts
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: crm_companies
DROP POLICY IF EXISTS "crm_companies_org_isolate" ON public.crm_companies;
CREATE POLICY "crm_companies_org_isolate" ON public.crm_companies
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: custom_field_definitions
DROP POLICY IF EXISTS "custom_field_definitions_org_isolate" ON public.custom_field_definitions;
CREATE POLICY "custom_field_definitions_org_isolate" ON public.custom_field_definitions
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: deals
DROP POLICY IF EXISTS "deals_org_isolate" ON public.deals;
CREATE POLICY "deals_org_isolate" ON public.deals
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: deal_items
DROP POLICY IF EXISTS "deal_items_org_isolate" ON public.deal_items;
CREATE POLICY "deal_items_org_isolate" ON public.deal_items
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: leads
DROP POLICY IF EXISTS "leads_org_isolate" ON public.leads;
CREATE POLICY "leads_org_isolate" ON public.leads
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: products
DROP POLICY IF EXISTS "products_org_isolate" ON public.products;
CREATE POLICY "products_org_isolate" ON public.products
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: tags
DROP POLICY IF EXISTS "tags_org_isolate" ON public.tags;
CREATE POLICY "tags_org_isolate" ON public.tags
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: security_alerts
DROP POLICY IF EXISTS "security_alerts_org_select" ON public.security_alerts;
CREATE POLICY "security_alerts_org_select" ON public.security_alerts
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: audit_logs
DROP POLICY IF EXISTS "audit_logs_org_select" ON public.audit_logs;
CREATE POLICY "audit_logs_org_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: system_notifications
DROP POLICY IF EXISTS "system_notifications_org_isolate" ON public.system_notifications;
CREATE POLICY "system_notifications_org_isolate" ON public.system_notifications
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: contact_merge_log
DROP POLICY IF EXISTS "contact_merge_log_org_select" ON public.contact_merge_log;
CREATE POLICY "contact_merge_log_org_select" ON public.contact_merge_log
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: deal_activities
DROP POLICY IF EXISTS "deal_activities_org_select" ON public.deal_activities;
CREATE POLICY "deal_activities_org_select" ON public.deal_activities
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "deal_activities_org_insert" ON public.deal_activities;
CREATE POLICY "deal_activities_org_insert" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());


-- Table: ai_feature_flags
DROP POLICY IF EXISTS "ai_feature_flags_select" ON public.ai_feature_flags;
CREATE POLICY "ai_feature_flags_select" ON public.ai_feature_flags
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: ai_prompt_templates
DROP POLICY IF EXISTS "ai_prompt_templates_select" ON public.ai_prompt_templates;
CREATE POLICY "ai_prompt_templates_select" ON public.ai_prompt_templates
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: ai_qualification_templates
DROP POLICY IF EXISTS "ai_qualification_templates_select" ON public.ai_qualification_templates;
CREATE POLICY "ai_qualification_templates_select" ON public.ai_qualification_templates
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR organization_id = public.get_user_org_id()
  );


-- Table: organization_invites
DROP POLICY IF EXISTS "organization_invites_select" ON public.organization_invites;
CREATE POLICY "organization_invites_select" ON public.organization_invites
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: organization_settings
DROP POLICY IF EXISTS "organization_settings_select" ON public.organization_settings;
CREATE POLICY "organization_settings_select" ON public.organization_settings
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: business_units
DROP POLICY IF EXISTS "business_units_select" ON public.business_units;
CREATE POLICY "business_units_select" ON public.business_units
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: lead_routing_rules
DROP POLICY IF EXISTS "lead_routing_rules_select" ON public.lead_routing_rules;
CREATE POLICY "lead_routing_rules_select" ON public.lead_routing_rules
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: messaging_channels
DROP POLICY IF EXISTS "messaging_channels_select" ON public.messaging_channels;
CREATE POLICY "messaging_channels_select" ON public.messaging_channels
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


-- Table: stage_ai_config
DROP POLICY IF EXISTS "stage_ai_config_select" ON public.stage_ai_config;
CREATE POLICY "stage_ai_config_select" ON public.stage_ai_config
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());


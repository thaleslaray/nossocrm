-- =============================================================================
-- Security Hardening — Sprint 1
-- =============================================================================
-- Objetivo: corrigir isolamento multi-tenant das 21 tabelas com policies
-- permissivas (USING (true)) e endurecer SECURITY DEFINER functions contra
-- search_path injection.
--
-- Referência: /home/freedom/.claude/plans/serialized-gathering-ripple.md
-- Auditoria: Sprint 1 do plano de hardening de segurança
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. HELPER — public.current_org_id()
-- =============================================================================
-- Retorna a organization_id do usuário autenticado atual. Usado em policies
-- de tenant isolation. STABLE (pode ser cacheado dentro da mesma query).

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.current_org_id() IS
  'Retorna organization_id do usuário autenticado. Helper para RLS policies de tenant isolation.';

GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;


-- =============================================================================
-- 2. SET search_path nas SECURITY DEFINER functions existentes
-- =============================================================================
-- Previne search_path injection. ALTER FUNCTION ... SET é idempotente e
-- não altera o corpo da função.

ALTER FUNCTION public.is_instance_initialized()               SET search_path = public, pg_temp;
ALTER FUNCTION public.get_dashboard_stats()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.mark_deal_won(UUID)                     SET search_path = public, pg_temp;
ALTER FUNCTION public.mark_deal_lost(UUID, TEXT)              SET search_path = public, pg_temp;
ALTER FUNCTION public.reopen_deal(UUID)                       SET search_path = public, pg_temp;
ALTER FUNCTION public.get_contact_stage_counts()              SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                       SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_organization()               SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_user_email_update()              SET search_path = public, pg_temp;
ALTER FUNCTION public._api_key_make_token()                   SET search_path = public, pg_temp;
ALTER FUNCTION public._api_key_sha256_hex(TEXT)               SET search_path = public, pg_temp;
ALTER FUNCTION public.create_api_key(TEXT)                    SET search_path = public, pg_temp;
ALTER FUNCTION public.revoke_api_key(UUID)                    SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_api_key(TEXT)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_deal_stage_changed()             SET search_path = public, pg_temp;


-- =============================================================================
-- 3. REWRITE RLS POLICIES — tenant isolation por organization_id
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 Tabelas com organization_id direto + deleted_at (soft delete)
-- -----------------------------------------------------------------------------

-- CONTACTS
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.contacts;
CREATE POLICY contacts_tenant_rw ON public.contacts
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND deleted_at IS NULL)
  WITH CHECK (organization_id = public.current_org_id());

-- DEALS
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.deals;
CREATE POLICY deals_tenant_rw ON public.deals
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND deleted_at IS NULL)
  WITH CHECK (organization_id = public.current_org_id());

-- CRM_COMPANIES
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.crm_companies;
CREATE POLICY crm_companies_tenant_rw ON public.crm_companies
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND deleted_at IS NULL)
  WITH CHECK (organization_id = public.current_org_id());

-- BOARDS (tinha 4 policies separadas — SELECT/INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Enable read access for authenticated users"   ON public.boards;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.boards;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.boards;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.boards;
CREATE POLICY boards_tenant_rw ON public.boards
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND deleted_at IS NULL)
  WITH CHECK (organization_id = public.current_org_id());

-- ACTIVITIES
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.activities;
CREATE POLICY activities_tenant_rw ON public.activities
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND deleted_at IS NULL)
  WITH CHECK (organization_id = public.current_org_id());


-- -----------------------------------------------------------------------------
-- 3.2 Tabelas com organization_id direto, SEM deleted_at
-- -----------------------------------------------------------------------------

-- BOARD_STAGES (tinha 4 policies separadas)
DROP POLICY IF EXISTS "Enable read access for authenticated users"   ON public.board_stages;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.board_stages;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.board_stages;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.board_stages;
CREATE POLICY board_stages_tenant_rw ON public.board_stages
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- PRODUCTS
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.products;
CREATE POLICY products_tenant_rw ON public.products
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- DEAL_ITEMS
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.deal_items;
CREATE POLICY deal_items_tenant_rw ON public.deal_items
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- TAGS
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tags;
CREATE POLICY tags_tenant_rw ON public.tags
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- CUSTOM_FIELD_DEFINITIONS
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.custom_field_definitions;
CREATE POLICY custom_field_definitions_tenant_rw ON public.custom_field_definitions
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- LEADS
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.leads;
CREATE POLICY leads_tenant_rw ON public.leads
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- SYSTEM_NOTIFICATIONS
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.system_notifications;
CREATE POLICY system_notifications_tenant_rw ON public.system_notifications
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- AUDIT_LOGS (confirmado com usuário: por-org)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.audit_logs;
CREATE POLICY audit_logs_tenant_ro ON public.audit_logs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
-- Writes via log_audit_event() SECURITY DEFINER — não precisam de policy extra
-- já que a função roda como owner. Sem policy de INSERT, usuários não podem
-- escrever diretamente (defesa em camadas).

-- SECURITY_ALERTS (confirmado com usuário: por-org)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON security_alerts;
CREATE POLICY security_alerts_tenant_ro ON security_alerts
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
-- Alertas são criados pelo sistema (service_role), não por usuários finais.


-- -----------------------------------------------------------------------------
-- 3.3 Tabelas linkadas via deal_id (deal_notes, deal_files)
-- -----------------------------------------------------------------------------
-- Não têm organization_id direto; isolamento via JOIN com deals.

DROP POLICY IF EXISTS "deal_notes_access" ON public.deal_notes;
CREATE POLICY deal_notes_tenant_rw ON public.deal_notes
  FOR ALL TO authenticated
  USING (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE organization_id = public.current_org_id()
        AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE organization_id = public.current_org_id()
        AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "deal_files_access" ON public.deal_files;
CREATE POLICY deal_files_tenant_rw ON public.deal_files
  FOR ALL TO authenticated
  USING (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE organization_id = public.current_org_id()
        AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE organization_id = public.current_org_id()
        AND deleted_at IS NULL
    )
  );


-- -----------------------------------------------------------------------------
-- 3.4 Tabelas user-scoped (não por org; cada user vê só o próprio)
-- -----------------------------------------------------------------------------
-- ai_conversations, ai_decisions, ai_audio_notes, ai_suggestion_interactions

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_conversations;
CREATE POLICY ai_conversations_user_rw ON public.ai_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_decisions;
CREATE POLICY ai_decisions_user_rw ON public.ai_decisions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_audio_notes;
CREATE POLICY ai_audio_notes_user_rw ON public.ai_audio_notes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_suggestion_interactions;
CREATE POLICY ai_suggestion_interactions_user_rw ON public.ai_suggestion_interactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- 3.5 Tabelas especiais
-- -----------------------------------------------------------------------------

-- LIFECYCLE_STAGES — catálogo global; SELECT público, mutações apenas via service_role
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.lifecycle_stages;
CREATE POLICY lifecycle_stages_read_all ON public.lifecycle_stages
  FOR SELECT TO authenticated
  USING (true);
-- Sem policy de INSERT/UPDATE/DELETE → usuários não podem mutar. Apenas service_role
-- bypassa RLS e consegue popular/alterar (via migrations ou admin API).

-- RATE_LIMITS — estado interno; apenas service_role (nenhuma policy = sem acesso)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.rate_limits;
-- Intencionalmente SEM policy de replacement: regulares 'authenticated' ficam sem
-- acesso; service_role continua bypassando. A função cleanup_rate_limits() é
-- SECURITY DEFINER e mantém o comportamento.

-- USER_CONSENTS — escopado por user_id (LGPD, cada user vê só o próprio consent)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.user_consents;
CREATE POLICY user_consents_own ON public.user_consents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


COMMIT;

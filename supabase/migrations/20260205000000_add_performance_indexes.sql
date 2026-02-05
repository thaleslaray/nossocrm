-- ============================================
-- Performance Indexes Migration
-- ============================================
-- Adiciona índices para colunas frequentemente filtradas/ordenadas
-- que estavam faltando no schema original.
--
-- Benefícios:
-- - Queries de deals filtradas por board/stage passam de full scan para index scan
-- - Joins de deals com contacts ficam mais rápidos
-- - Filtros de contatos por estágio do funil otimizados
-- - Ordenação de atividades por data mais eficiente
-- ============================================

-- DEALS: Índices para filtros comuns de pipeline
-- board_id: Filtro mais comum (cada pipeline é um board)
CREATE INDEX IF NOT EXISTS idx_deals_board_id
    ON public.deals (board_id);

-- stage_id: Filtro de coluna do kanban
CREATE INDEX IF NOT EXISTS idx_deals_stage_id
    ON public.deals (stage_id);

-- contact_id: Join frequente com contacts
CREATE INDEX IF NOT EXISTS idx_deals_contact_id
    ON public.deals (contact_id);

-- client_company_id: Join frequente com crm_companies
CREATE INDEX IF NOT EXISTS idx_deals_client_company_id
    ON public.deals (client_company_id);

-- Índice composto para queries de kanban (board + stage + ordenação)
CREATE INDEX IF NOT EXISTS idx_deals_board_stage_created
    ON public.deals (board_id, stage_id, created_at DESC);

-- Índice para deals abertos (não ganhos nem perdidos)
CREATE INDEX IF NOT EXISTS idx_deals_open
    ON public.deals (board_id, stage_id)
    WHERE is_won = false AND is_lost = false;

-- DEAL_ITEMS: Índice para join com deals
CREATE INDEX IF NOT EXISTS idx_deal_items_deal_id
    ON public.deal_items (deal_id);

-- CONTACTS: Índice para filtro por estágio do funil
CREATE INDEX IF NOT EXISTS idx_contacts_stage
    ON public.contacts (stage);

-- Índice para filtro de status
CREATE INDEX IF NOT EXISTS idx_contacts_status
    ON public.contacts (status);

-- Índice composto para queries paginadas comuns
CREATE INDEX IF NOT EXISTS idx_contacts_created_at
    ON public.contacts (created_at DESC);

-- ACTIVITIES: Índice para ordenação por data
CREATE INDEX IF NOT EXISTS idx_activities_date
    ON public.activities (date DESC);

-- Índice para filtro por deal_id
CREATE INDEX IF NOT EXISTS idx_activities_deal_id
    ON public.activities (deal_id);

-- Índice para filtro por contact_id
CREATE INDEX IF NOT EXISTS idx_activities_contact_id
    ON public.activities (contact_id);

-- CRM_COMPANIES: Índice para ordenação
CREATE INDEX IF NOT EXISTS idx_crm_companies_created_at
    ON public.crm_companies (created_at DESC);

-- BOARD_STAGES: Índice para lookup por board
CREATE INDEX IF NOT EXISTS idx_board_stages_board_id
    ON public.board_stages (board_id);

-- Comentário sobre a migração
COMMENT ON INDEX idx_deals_board_id IS 'Performance: filtro de deals por pipeline';
COMMENT ON INDEX idx_deals_stage_id IS 'Performance: filtro de deals por coluna do kanban';
COMMENT ON INDEX idx_deals_contact_id IS 'Performance: join de deals com contacts';
COMMENT ON INDEX idx_deal_items_deal_id IS 'Performance: embedded select de items por deal';
COMMENT ON INDEX idx_contacts_stage IS 'Performance: filtro de contatos por estágio do funil';
COMMENT ON INDEX idx_activities_date IS 'Performance: ordenação de atividades por data';

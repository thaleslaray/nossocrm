-- =============================================================================
-- MIGRATION: Adaptar tabela de contatos para agência de viagens
-- =============================================================================
-- Data: 2026-04-08
-- Objetivo: Remover campos corporativos genéricos (role, company_name) e
--           adicionar campos específicos de viagem ao módulo de contatos.
--
-- NOTA: client_company_id (FK → crm_companies) é mantida intencionalmente.
--       É FK arquitetural do CRM — não se trata de "campo de empresa", mas de
--       relacionamento estrutural entre contato e empresa cliente.
--
-- ATENÇÃO: DROP COLUMN é irreversível. Verifique backup antes de aplicar
--          em ambiente de produção.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PARTE 1: Remover colunas corporativas genéricas
-- -----------------------------------------------------------------------------

ALTER TABLE public.contacts
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS company_name;

-- -----------------------------------------------------------------------------
-- PARTE 2: Adicionar colunas de viagem
-- -----------------------------------------------------------------------------

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS destino_viagem       TEXT,
  ADD COLUMN IF NOT EXISTS data_viagem          DATE,
  ADD COLUMN IF NOT EXISTS quantidade_adultos   INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quantidade_criancas  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idade_criancas       TEXT,
  ADD COLUMN IF NOT EXISTS categoria_viagem     TEXT
    CHECK (categoria_viagem IN ('economica', 'intermediaria', 'premium')),
  ADD COLUMN IF NOT EXISTS urgencia_viagem      TEXT
    CHECK (urgencia_viagem IN ('imediato', 'curto_prazo', 'medio_prazo', 'planejando')),
  ADD COLUMN IF NOT EXISTS origem_lead          TEXT
    CHECK (origem_lead IN ('instagram', 'facebook', 'google', 'site', 'whatsapp', 'indicacao', 'outro')),
  ADD COLUMN IF NOT EXISTS indicado_por         TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_viagem   TEXT;

-- -----------------------------------------------------------------------------
-- PARTE 3: Índices de suporte a filtros comuns de viagem
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_contacts_categoria_viagem
  ON public.contacts (categoria_viagem);

CREATE INDEX IF NOT EXISTS idx_contacts_urgencia_viagem
  ON public.contacts (urgencia_viagem);

CREATE INDEX IF NOT EXISTS idx_contacts_origem_lead
  ON public.contacts (origem_lead);

CREATE INDEX IF NOT EXISTS idx_contacts_destino_viagem
  ON public.contacts (destino_viagem);

/**
 * @fileoverview Definições de Tipos do CRM
 * 
 * Arquivo central de tipos TypeScript para o sistema NossoCRM.
 * Contém interfaces para todas as entidades do domínio.
 * 
 * @module types
 * 
 * Sistema SINGLE-TENANT (migrado em 2025-12-07)
 * 
 * @example
 * ```tsx
 * import { Deal, DealView, Contact, Board } from '@/types';
 * 
 * const deal: Deal = {
 *   title: 'Meu deal',
 *   value: 1000,
 *   // ...
 * };
 * ```
 */

/**
 * @deprecated Use deal.isWon e deal.isLost para verificar status final.
 * O estágio atual é deal.status (UUID do stage no board).
 * Mantido apenas para compatibilidade de código legado.
 */
export enum DealStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  PROPOSAL = 'PROPOSAL',
  NEGOTIATION = 'NEGOTIATION',
  CLOSED_WON = 'CLOSED_WON',
  CLOSED_LOST = 'CLOSED_LOST',
}

// =============================================================================
// TYPE ALIASES (LEGACY - MANTIDOS PARA COMPATIBILIDADE)
// =============================================================================

/**
 * @deprecated Sistema migrado para single-tenant.
 * Mantido apenas para compatibilidade de código legado.
 * Campos organization_id são opcionais e ignorados.
 */
export type OrganizationId = string;

/**
 * Client Company ID - UUID de empresa CLIENTE cadastrada no CRM
 * 
 * @description
 * Este ID representa uma empresa que é cliente/prospect do usuário do CRM.
 * É um relacionamento comercial, não relacionado a segurança.
 * 
 * @origin Selecionado pelo usuário em dropdowns/formulários
 * @optional Pode ser null (contatos podem não ter empresa)
 * 
 * @example
 * ```ts
 * // ✅ Correto: client_company_id vem de seleção do usuário
 * const deal = { 
 *   organization_id: organizationId,     // Do auth (segurança)
 *   client_company_id: selectedCompany,  // Do form (opcional)
 * };
 * ```
 */
export type ClientCompanyId = string;

// =============================================================================
// Core Types
// =============================================================================

// Estágio do Ciclo de Vida (Dinâmico)
export interface LifecycleStage {
  id: string;
  name: string;
  color: string; // Tailwind class or hex
  order: number;
  isDefault?: boolean; // Cannot be deleted
}

// Estágio do Contato no Funil de Carteira
// @deprecated - Use LifecycleStage IDs (strings)
export enum ContactStage {
  LEAD = 'LEAD', // Suspeito - ainda não qualificado
  MQL = 'MQL', // Marketing Qualified Lead
  PROSPECT = 'PROSPECT', // Em negociação ativa
  CUSTOMER = 'CUSTOMER', // Cliente fechado
}

// @deprecated - Use Contact com stage: ContactStage.LEAD
// Mantido apenas para compatibilidade de migração
export interface Lead {
  id: string;
  name: string; // Nome da pessoa
  email: string;
  companyName: string; // Texto solto, ainda não é uma Company
  role?: string;
  source: 'WEBSITE' | 'LINKEDIN' | 'REFERRAL' | 'MANUAL';
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'DISQUALIFIED';
  createdAt: string;
  notes?: string;
}

// =============================================================================
// Organization (Tenant - who pays for SaaS)
// =============================================================================

/**
 * Organization - The SaaS tenant (company paying for the service)
 * Previously named "Company" - renamed to avoid confusion with CRM client companies
 */
export interface Organization {
  id: OrganizationId;
  name: string;
  industry?: string;
  website?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * @deprecated Use Organization instead
 * Kept for backwards compatibility during migration
 */
export type Company = Organization;

// =============================================================================
// CRM Company (Client company in the CRM)
// =============================================================================

/**
 * CRMCompany - A client company record in the CRM
 * This is a company that the user is selling to/managing
 */
export interface CRMCompany {
  id: ClientCompanyId;
  organizationId?: OrganizationId; // Tenant FK (for RLS) - optional during migration
  name: string;
  industry?: string;
  website?: string;
  createdAt: string;
  updatedAt?: string;
}

// =============================================================================
// Contact (Person we talk to)
// =============================================================================

// A Pessoa (Com quem falamos)
export interface Contact {
  id: string;
  organizationId?: OrganizationId; // Tenant FK (for RLS) - optional during migration
  clientCompanyId?: ClientCompanyId; // CRM company this contact belongs to
  name: string;
  role?: string;
  email: string;
  phone: string;
  avatar?: string;
  lastInteraction?: string;
  birthDate?: string; // New field for Agentic AI tasks
  status: 'ACTIVE' | 'INACTIVE' | 'CHURNED';
  stage: string; // ID do LifecycleStage (antes era ContactStage enum)
  source?: 'WEBSITE' | 'LINKEDIN' | 'REFERRAL' | 'MANUAL'; // Origem do contato
  notes?: string; // Anotações gerais
  lastPurchaseDate?: string;
  totalValue?: number; // LTV
  createdAt: string;
  updatedAt?: string; // Última modificação do registro

  // @deprecated - Use clientCompanyId instead
  companyId?: string;
}

// ITEM 3: Produtos e Serviços
export interface Product {
  id: string;
  organizationId?: OrganizationId; // Tenant FK (for RLS) - optional during migration
  name: string;
  description?: string;
  price: number;
  sku?: string;
  /** Se está ativo no catálogo (itens inativos não devem aparecer no dropdown do deal). */
  active?: boolean;
}

export interface DealItem {
  id: string;
  organizationId?: OrganizationId; // Tenant FK (for RLS) - optional during migration
  productId: string;
  name: string; // Snapshot of name
  quantity: number;
  price: number; // Snapshot of price
}

// CUSTOM FIELDS DEFINITION
export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

export interface CustomFieldDefinition {
  id: string;
  key: string; // camelCase identifier
  label: string;
  type: CustomFieldType;
  options?: string[]; // For select type
}

// O Dinheiro/Oportunidade (O que vai no Kanban)
export interface Deal {
  id: string;
  organizationId?: OrganizationId; // Tenant FK (for RLS) - optional during migration
  clientCompanyId?: ClientCompanyId; // CRM company FK
  title: string; // Ex: "Licença Anual"
  contactId: string; // Relacionamento
  boardId: string; // Qual board este deal pertence
  value: number;
  items: DealItem[]; // Lista de Produtos
  status: string; // Stage ID dentro do board (UUID)
  isWon: boolean; // Deal foi ganho?
  isLost: boolean; // Deal foi perdido?
  closedAt?: string; // Quando foi fechado
  createdAt: string;
  updatedAt: string;
  probability: number;
  priority: 'low' | 'medium' | 'high';
  owner: {
    name: string;
    avatar: string;
  };
  ownerId?: string; // ID do usuário responsável
  nextActivity?: {
    type: 'CALL' | 'MEETING' | 'EMAIL' | 'TASK';
    date: string;
    isOverdue?: boolean;
  };
  tags: string[];
  aiSummary?: string;
  customFields?: Record<string, any>; // Dynamic fields storage
  lastStageChangeDate?: string; // For stagnation tracking
  lossReason?: string; // For win/loss analysis

  // @deprecated - Use clientCompanyId instead
  companyId?: string;
}

// Helper Type para Visualização (Desnormalizado)
export interface DealView extends Deal {
  clientCompanyName?: string; // Name of the CRM client company
  contactName: string;
  contactEmail: string;
  /** Nome/label do estágio atual (resolvido a partir do status UUID) */
  stageLabel: string;

  // @deprecated - Use clientCompanyName instead
  companyName?: string;
}

export interface Activity {
  id: string;
  organizationId?: OrganizationId; // Tenant FK (for RLS) - optional during migration
  dealId: string;
  /** ID do contato associado (opcional). Útil para tarefas sem deal. */
  contactId?: string;
  /** ID da empresa CRM associada (opcional). Derivado do deal ou contato. */
  clientCompanyId?: ClientCompanyId;
  /** IDs dos contatos participantes (opcional). */
  participantContactIds?: string[];
  dealTitle: string;
  type: 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'NOTE' | 'STATUS_CHANGE';
  title: string;
  description?: string;
  date: string;
  user: {
    name: string;
    avatar: string;
  };
  completed: boolean;
}

export interface DashboardStats {
  totalDeals: number;
  pipelineValue: number;
  conversionRate: number;
  winRate: number;
}

// Estágio de um Board (etapa do Kanban)
export interface BoardStage {
  id: string;
  organizationId?: OrganizationId; // Tenant FK (for RLS) - optional for templates
  boardId?: string; // Board FK - optional for templates
  label: string;
  color: string;
  linkedLifecycleStage?: string; // ID do LifecycleStage
}

// Metas do Board (Revenue Ops)
export interface BoardGoal {
  description: string; // "Converter 20% dos leads"
  kpi: string; // "Taxa de Conversão"
  targetValue: string; // "20%"
  currentValue?: string; // "15%" (Progresso atual)
  type?: 'currency' | 'number' | 'percentage'; // Explicit type for calculation
}

// Persona do Agente (Quem opera o board)
export interface AgentPersona {
  name: string; // "Dra. Ana (Virtual)"
  role: string; // "Consultora de Beleza"
  behavior: string; // "Empática, usa emojis..."
}

// Board = Kanban configurável (ex: Pipeline de Vendas, Onboarding, etc)
export interface Board {
  id: string;
  organizationId?: OrganizationId; // Tenant FK (for RLS) - optional for templates
  name: string;
  description?: string;
  linkedStage?: ContactStage; // Quando mover para etapa final, atualiza o stage do contato
  linkedLifecycleStage?: string; // Qual lifecycle stage este board gerencia (ex: 'LEAD', 'MQL', 'CUSTOMER')
  nextBoardId?: string; // Quando mover para etapa final (Ganho), cria um card neste board
  wonStageId?: string; // Estágio de Ganho
  lostStageId?: string; // Estágio de Perda
  wonStayInStage?: boolean; // Se true, "Arquiva" na etapa atual (status Won) em vez de mover
  lostStayInStage?: boolean; // Se true, "Arquiva" na etapa atual (status Lost) em vez de mover
  /** Produto padrão sugerido para deals desse board (opcional). */
  defaultProductId?: string;
  stages: BoardStage[];
  isDefault?: boolean;
  template?: 'PRE_SALES' | 'SALES' | 'ONBOARDING' | 'CS' | 'CUSTOM'; // Template usado para criar este board
  automationSuggestions?: string[]; // Sugestões de automação da IA

  // AI Strategy Fields
  goal?: BoardGoal;
  agentPersona?: AgentPersona;
  entryTrigger?: string; // "Quem deve entrar aqui?"

  createdAt: string;
}

// Estágios padrão do board de vendas
export const DEFAULT_BOARD_STAGES: BoardStage[] = [
  { id: DealStatus.NEW, label: 'Novas Oportunidades', color: 'bg-blue-500' },
  { id: DealStatus.CONTACTED, label: 'Contatado', color: 'bg-yellow-500' },
  {
    id: DealStatus.PROPOSAL,
    label: 'Proposta',
    color: 'bg-purple-500',
    linkedLifecycleStage: ContactStage.PROSPECT,
  },
  {
    id: DealStatus.NEGOTIATION,
    label: 'Negociação',
    color: 'bg-orange-500',
    linkedLifecycleStage: ContactStage.PROSPECT,
  },
  {
    id: DealStatus.CLOSED_WON,
    label: 'Ganho',
    color: 'bg-green-500',
    linkedLifecycleStage: ContactStage.CUSTOMER,
  },
];

// @deprecated - Use DEFAULT_BOARD_STAGES
export const PIPELINE_STAGES = DEFAULT_BOARD_STAGES;

// Registry Types
export interface RegistryTemplate {
  id: string;
  path: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
}

export interface RegistryIndex {
  version: string;
  templates: RegistryTemplate[];
}

export interface JourneyDefinition {
  schemaVersion: string;
  name?: string;
  boards: {
    slug: string;
    name: string;
    columns: {
      name: string;
      color?: string;
      linkedLifecycleStage?: string;
    }[];
    strategy?: {
      agentPersona?: AgentPersona;
      goal?: BoardGoal;
      entryTrigger?: string;
    };
  }[];
}

// =============================================================================
// Pagination Types (Server-Side)
// =============================================================================

/**
 * Estado de paginação para controle de navegação.
 * Compatível com TanStack Table.
 * 
 * @example
 * ```ts
 * const [pagination, setPagination] = useState<PaginationState>({
 *   pageIndex: 0,
 *   pageSize: 50,
 * });
 * ```
 */
export interface PaginationState {
  /** Índice da página atual (0-indexed). */
  pageIndex: number;
  /** Quantidade de itens por página. */
  pageSize: number;
}

/** Opções válidas para tamanho de página. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/** Tamanho de página padrão. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Resposta paginada genérica do servidor.
 * 
 * @template T Tipo dos itens retornados.
 * 
 * @example
 * ```ts
 * const response: PaginatedResponse<Contact> = {
 *   data: [...],
 *   totalCount: 10000,
 *   pageIndex: 0,
 *   pageSize: 50,
 *   hasMore: true,
 * };
 * ```
 */
export interface PaginatedResponse<T> {
  /** Array de itens da página atual. */
  data: T[];
  /** Total de registros no banco (para calcular número de páginas). */
  totalCount: number;
  /** Índice da página retornada (0-indexed). */
  pageIndex: number;
  /** Tamanho da página solicitada. */
  pageSize: number;
  /** Se existem mais páginas após esta. */
  hasMore: boolean;
}

/**
 * Filtros de contatos para busca server-side.
 * Extensão dos filtros existentes com suporte a paginação.
 */
export interface ContactsServerFilters {
  /** Busca por nome ou email (case-insensitive). */
  search?: string;
  /** Filtro por estágio do funil. */
  stage?: string | 'ALL';
  /** Filtro por status. */
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'CHURNED' | 'RISK';
  /** Data de início (created_at >= dateStart). */
  dateStart?: string;
  /** Data de fim (created_at <= dateEnd). */
  dateEnd?: string;
  /** ID da empresa cliente (opcional). */
  clientCompanyId?: string;
  /** Campo para ordenação. */
  sortBy?: ContactSortableColumn;
  /** Direção da ordenação. */
  sortOrder?: 'asc' | 'desc';
}

/** Colunas ordenáveis na tabela de contatos. */
export type ContactSortableColumn = 'name' | 'created_at' | 'updated_at' | 'stage';

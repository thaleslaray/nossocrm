/**
 * @fileoverview Serviço Supabase para gerenciamento de deals (negócios/oportunidades).
 * 
 * Este módulo fornece operações CRUD para deals e seus itens,
 * com transformação automática entre o formato do banco e o formato da aplicação.
 * 
 * ## Conceitos de Deal
 * 
 * - Deals são oportunidades de venda em um pipeline/board
 * - `stage_id` define a coluna atual no kanban
 * - `is_won` / `is_lost` indicam se o deal foi fechado
 * - `board_id` é obrigatório e define qual pipeline o deal pertence
 * 
 * @module lib/supabase/deals
 */

import { supabase } from './client';
import { Deal, DealItem, OrganizationId } from '@/types';
import { sanitizeUUID, requireUUID, isValidUUID } from './utils';

// =============================================================================
// Organization inference (client-side, RLS-safe)
// =============================================================================
let cachedOrgId: string | null = null;
let cachedOrgUserId: string | null = null;

async function getCurrentOrganizationId(): Promise<string | null> {
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (cachedOrgUserId === user.id && cachedOrgId) return cachedOrgId;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (error) return null;

  const orgId = sanitizeUUID((profile as any)?.organization_id);
  cachedOrgUserId = user.id;
  cachedOrgId = orgId;
  return orgId;
}

// ============================================
// DEALS SERVICE
// ============================================

/**
 * Representação de deal no banco de dados.
 * 
 * @interface DbDeal
 */
export interface DbDeal {
  /** ID único do deal (UUID). */
  id: string;
  /** ID da organização/tenant. */
  organization_id: string;
  /** Título do deal. */
  title: string;
  /** Valor monetário do deal. */
  value: number;
  /** Probabilidade de fechamento (0-100). */
  probability: number;
  /** Status legado (deprecado, usar stage_id). */
  status: string | null;
  /** Prioridade (low, medium, high). */
  priority: string;
  /** ID do board/pipeline. */
  board_id: string | null;
  /** ID do estágio atual no kanban. */
  stage_id: string | null;
  /** ID do contato associado. */
  contact_id: string | null;
  /** ID da empresa CRM associada. */
  client_company_id: string | null;
  /** Resumo gerado por IA. */
  ai_summary: string | null;
  /** Motivo da perda, se aplicável. */
  loss_reason: string | null;
  /** Tags associadas. */
  tags: string[];
  /** Data da última mudança de estágio. */
  last_stage_change_date: string | null;
  /** Campos customizados. */
  custom_fields: Record<string, any>;
  /** Data de criação. */
  created_at: string;
  /** Data de atualização. */
  updated_at: string;
  /** ID do dono/responsável. */
  owner_id: string | null;
  /** Indica se o deal foi ganho. */
  is_won: boolean;
  /** Indica se o deal foi perdido. */
  is_lost: boolean;
  /** Data de fechamento. */
  closed_at: string | null;
}

/**
 * Representação de item de deal no banco de dados.
 * 
 * @interface DbDealItem
 */
export interface DbDealItem {
  /** ID único do item. */
  id: string;
  /** ID da organização/tenant. */
  organization_id: string;
  /** ID do deal pai. */
  deal_id: string;
  /** ID do produto do catálogo. */
  product_id: string | null;
  /** Nome do item. */
  name: string;
  /** Quantidade. */
  quantity: number;
  /** Preço unitário. */
  price: number;
  /** Data de criação. */
  created_at: string;
}

/**
 * Transforma deal do formato DB para o formato da aplicação.
 * 
 * @param db - Deal no formato do banco.
 * @param items - Itens do deal no formato do banco.
 * @returns Deal no formato da aplicação.
 */
/**
 * Tipo do deal com items aninhados (retornado por embedded select).
 */
interface DbDealWithItems extends DbDeal {
  deal_items: DbDealItem[];
}

const transformDeal = (db: DbDeal | DbDealWithItems, items?: DbDealItem[]): Deal => {
  // Usar stage_id como status (UUID do estágio no kanban)
  // is_won e is_lost indicam se o deal foi fechado
  const stageStatus = db.stage_id || db.status || '';

  // Items podem vir aninhados (embedded select) ou como array separado (legado)
  const dealItems = 'deal_items' in db ? db.deal_items : (items || []);
  // Se vier array separado, filtra por deal_id (compatibilidade)
  const filteredItems = 'deal_items' in db
    ? dealItems
    : dealItems.filter(i => i.deal_id === db.id);

  return {
    id: db.id,
    organizationId: db.organization_id,
    title: db.title,
    value: db.value || 0,
    probability: db.probability || 0,
    status: stageStatus,
    isWon: db.is_won ?? false,
    isLost: db.is_lost ?? false,
    closedAt: db.closed_at || undefined,
    priority: (db.priority as Deal['priority']) || 'medium',
    boardId: db.board_id || '',
    contactId: db.contact_id || '',
    clientCompanyId: db.client_company_id || undefined,
    companyId: db.client_company_id || '', // @deprecated - backwards compatibility
    aiSummary: db.ai_summary || undefined,
    lossReason: db.loss_reason || undefined,
    tags: db.tags || [],
    lastStageChangeDate: db.last_stage_change_date || undefined,
    customFields: db.custom_fields || {},
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    items: filteredItems.map(i => ({
      id: i.id,
      organizationId: i.organization_id,
      productId: i.product_id || '',
      name: i.name,
      quantity: i.quantity,
      price: i.price,
    })),
    owner: { name: 'Sem Dono', avatar: '' }, // Will be enriched later
    ownerId: db.owner_id || undefined,
  };
};

/**
 * Transforma deal do formato da aplicação para o formato DB.
 * 
 * @param deal - Deal parcial no formato da aplicação.
 * @returns Deal parcial no formato do banco.
 */
const transformDealToDb = (deal: Partial<Deal>): Partial<DbDeal> => {
  const db: Partial<DbDeal> = {};

  if (deal.title !== undefined) db.title = deal.title;
  if (deal.value !== undefined) db.value = deal.value;
  if (deal.probability !== undefined) db.probability = deal.probability;

  // Status = stage_id (UUID do estágio no kanban)
  if (deal.status !== undefined && isValidUUID(deal.status)) {
    db.stage_id = deal.status;
  }

  // Campos de fechamento
  if (deal.isWon !== undefined) db.is_won = deal.isWon;
  if (deal.isLost !== undefined) db.is_lost = deal.isLost;
  if (deal.closedAt !== undefined) db.closed_at = deal.closedAt || null;

  if (deal.priority !== undefined) db.priority = deal.priority;
  if (deal.boardId !== undefined) db.board_id = sanitizeUUID(deal.boardId);
  if (deal.contactId !== undefined) db.contact_id = sanitizeUUID(deal.contactId);
  // Support both new clientCompanyId and deprecated companyId
  if (deal.clientCompanyId !== undefined) db.client_company_id = sanitizeUUID(deal.clientCompanyId);
  else if (deal.companyId !== undefined) db.client_company_id = sanitizeUUID(deal.companyId);
  if (deal.aiSummary !== undefined) db.ai_summary = deal.aiSummary || null;
  if (deal.lossReason !== undefined) db.loss_reason = deal.lossReason || null;
  if (deal.tags !== undefined) db.tags = deal.tags;
  if (deal.lastStageChangeDate !== undefined) db.last_stage_change_date = deal.lastStageChangeDate || null;
  if (deal.customFields !== undefined) db.custom_fields = deal.customFields;
  if (deal.ownerId !== undefined) db.owner_id = sanitizeUUID(deal.ownerId);

  return db;
};

/**
 * Serviço de deals do Supabase.
 * 
 * Fornece operações CRUD para a tabela `deals` e `deal_items`.
 * Deals representam oportunidades de venda em diferentes estágios do pipeline.
 * 
 * @example
 * ```typescript
 * // Buscar todos os deals
 * const { data, error } = await dealsService.getAll();
 * 
 * // Criar um novo deal
 * const { data, error } = await dealsService.create(
 *   { title: 'Contrato Anual', value: 50000, boardId: 'board-uuid' },
 *   organizationId
 * );
 * ```
 */
export const dealsService = {
  /**
   * Busca todos os deals da organização com seus itens.
   * 
   * @returns Promise com array de deals ou erro.
   */
  async getAll(): Promise<{ data: Deal[] | null; error: Error | null }> {
    try {
      if (!supabase) {
        return { data: null, error: new Error('Supabase não configurado') };
      }
      // Embedded select: traz deal_items junto com deals em UMA query
      // Elimina N+1: antes carregava TODOS items e filtrava no cliente
      // Agora o Postgres já retorna os items aninhados por deal
      const { data, error } = await supabase
        .from('deals')
        .select(`
          *,
          deal_items (*)
        `)
        .order('created_at', { ascending: false });

      if (error) return { data: null, error };

      const deals = (data || []).map(d => transformDeal(d as DbDealWithItems));
      return { data: deals, error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Busca um deal específico pelo ID.
   * 
   * @param id - ID do deal.
   * @returns Promise com o deal ou erro.
   */
  async getById(id: string): Promise<{ data: Deal | null; error: Error | null }> {
    try {
      if (!supabase) {
        return { data: null, error: new Error('Supabase não configurado') };
      }
      const [dealResult, itemsResult] = await Promise.all([
        supabase.from('deals').select('*').eq('id', id).single(),
        supabase.from('deal_items').select('*').eq('deal_id', id),
      ]);

      if (dealResult.error) return { data: null, error: dealResult.error };

      const deal = transformDeal(dealResult.data as DbDeal, (itemsResult.data || []) as DbDealItem[]);
      return { data: deal, error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Cria um novo deal.
   * 
   * Valida que o board_id existe antes de inserir.
   * 
   * @param deal - Dados do deal (sem id e createdAt).
   * @returns Promise com deal criado ou erro.
   * @throws Error se board_id for inválido ou não existir.
   */
  async create(deal: Omit<Deal, 'id' | 'createdAt'> & { stageId?: string }): Promise<{ data: Deal | null; error: Error | null }> {
    try {
      if (!supabase) {
        return { data: null, error: new Error('Supabase não configurado') };
      }
      // stageId pode vir separado ou ser o mesmo que status
      const stageId = deal.stageId || deal.status || null;

      // Validação: board_id é OBRIGATÓRIO e deve existir
      let boardId: string;
      try {
        boardId = requireUUID(deal.boardId, 'Board ID');
      } catch (e) {
        return { data: null, error: e as Error };
      }

      // organization_id é obrigatório no banco. Se não vier do caller, inferimos pelo board.
      // (Evita deals com organization_id NULL que somem de ferramentas e quebram isolamento multi-tenant.)
      let organizationId: string | null = sanitizeUUID((deal as any).organizationId);

      // Validação: verifica se o board existe antes de inserir
      const { data: boardExists, error: boardCheckError } = await supabase
        .from('boards')
        .select('id, organization_id')
        .eq('id', boardId)
        .single();

      if (boardCheckError || !boardExists) {
        return {
          data: null,
          error: new Error(`Board não encontrado: ${boardId}. Recarregue a página.`)
        };
      }

      if (!organizationId) {
        organizationId = sanitizeUUID((boardExists as any).organization_id);
      }

      if (!organizationId) {
        // Recovery: some boards may have been created without organization_id.
        // Try inferring from current user's profile and repair the board in the background.
        organizationId = await getCurrentOrganizationId();
        if (organizationId) {
          supabase
            .from('boards')
            .update({ organization_id: organizationId })
            .eq('id', boardId)
            // PostgrestBuilder is Promise-like (thenable) but does not expose `.catch` in typings.
            .then(
              () => undefined,
              () => undefined
            );
        }
      }

      if (!organizationId) {
        return {
          data: null,
          error: new Error('Organização não identificada para este deal. Faça logout/login ou recarregue a página e tente novamente.')
        };
      }

      const insertData = {
        organization_id: organizationId,
        title: deal.title,
        value: deal.value || 0,
        probability: deal.probability || 0,
        status: deal.status,
        priority: deal.priority || 'medium',
        board_id: boardId,
        stage_id: sanitizeUUID(stageId),
        contact_id: sanitizeUUID(deal.contactId),
        client_company_id: sanitizeUUID(deal.clientCompanyId || deal.companyId),
        tags: deal.tags || [],
        custom_fields: deal.customFields || {},
        owner_id: sanitizeUUID(deal.ownerId),
        // Importante: deals legados podem ficar com is_won/is_lost = NULL se o schema
        // estiver permissivo ou se defaults não estiverem aplicados. Forçamos valores
        // explícitos para evitar que deals "abertos" sumam de queries que filtram por FALSE.
        is_won: deal.isWon ?? false,
        is_lost: deal.isLost ?? false,
        closed_at: deal.closedAt ?? null,
      };

      const { data, error } = await supabase
        .from('deals')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        // Trata erro de duplicidade do backend
        if (error.code === '23505' || error.message?.includes('unique_violation') || error.message?.includes('Já existe um negócio')) {
          return {
            data: null,
            error: new Error('Já existe um negócio com este título para este contato. Altere o título ou selecione outro contato.')
          };
        }
        return { data: null, error };
      }

      // Create items if any
      if (deal.items && deal.items.length > 0) {
        const itemsToInsert = deal.items.map(item => ({
          deal_id: data.id,
          product_id: item.productId || null,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        }));

        const { error: itemsError } = await supabase
          .from('deal_items')
          .insert(itemsToInsert);

        if (itemsError) return { data: null, error: itemsError };
      }

      // Fetch items
      const { data: items } = await supabase
        .from('deal_items')
        .select('*')
        .eq('deal_id', data.id);

      return {
        data: transformDeal(data as DbDeal, (items || []) as DbDealItem[]),
        error: null
      };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async update(id: string, updates: Partial<Deal>): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      const dbUpdates = transformDealToDb(updates);
      dbUpdates.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('deals')
        .update(dbUpdates)
        .eq('id', id);

      if (error) {
        // Trata erro de duplicidade do backend
        if (error.code === '23505' || error.message?.includes('unique_violation') || error.message?.includes('Já existe um negócio')) {
          return {
            error: new Error('Já existe um negócio com este título para este contato. Altere o título ou selecione outro contato.')
          };
        }
        return { error };
      }

      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      // Items are deleted automatically via CASCADE
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', id);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async deleteByBoardId(boardId: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      // Items are deleted automatically via CASCADE
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('board_id', boardId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async addItem(dealId: string, item: Omit<DealItem, 'id'>): Promise<{ data: DealItem | null; error: Error | null }> {
    try {
      if (!supabase) {
        return { data: null, error: new Error('Supabase não configurado') };
      }
      const { data, error } = await supabase
        .from('deal_items')
        .insert({
          deal_id: sanitizeUUID(dealId),
          product_id: sanitizeUUID(item.productId),
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })
        .select()
        .single();

      if (error) return { data: null, error };

      // Update deal value
      await this.recalculateDealValue(dealId);

      return {
        data: {
          id: data.id,
          productId: data.product_id || '',
          name: data.name,
          quantity: data.quantity,
          price: data.price,
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async removeItem(dealId: string, itemId: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      const { error } = await supabase
        .from('deal_items')
        .delete()
        .eq('id', itemId);

      if (error) return { error };

      // Update deal value
      await this.recalculateDealValue(dealId);

      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async recalculateDealValue(dealId: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      const { data: items } = await supabase
        .from('deal_items')
        .select('price, quantity')
        .eq('deal_id', dealId);

      const newValue = (items || []).reduce((sum, i) => sum + (i.price * i.quantity), 0);

      const { error } = await supabase
        .from('deals')
        .update({ value: newValue, updated_at: new Date().toISOString() })
        .eq('id', dealId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  // Marcar deal como GANHO
  async markAsWon(dealId: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      const { error } = await supabase
        .from('deals')
        .update({
          is_won: true,
          is_lost: false,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  // Marcar deal como PERDIDO
  async markAsLost(dealId: string, lossReason?: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      const updates: Record<string, any> = {
        is_lost: true,
        is_won: false,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (lossReason) {
        updates.loss_reason = lossReason;
      }

      const { error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', dealId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  // Reabrir deal fechado
  async reopen(dealId: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) {
        return { error: new Error('Supabase não configurado') };
      }
      const { error } = await supabase
        .from('deals')
        .update({
          is_won: false,
          is_lost: false,
          closed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },
};

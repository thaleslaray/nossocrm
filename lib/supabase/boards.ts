/**
 * @fileoverview Serviço Supabase para gerenciamento de boards (pipelines kanban).
 * 
 * Este módulo fornece operações CRUD para boards e seus estágios,
 * incluindo ordenação, metas e personas de agente de IA.
 * 
 * ## Conceitos de Board
 * 
 * - Board = Pipeline (ex: "Vendas B2B", "Onboarding de Clientes")
 * - Stage = Coluna do kanban (ex: "Qualificação", "Proposta", "Fechado")
 * - Cada board pode ter metas (goal), persona de IA e gatilhos de automação
 * 
 * @module lib/supabase/boards
 */

import { supabase } from './client';
import { Board, BoardStage, BoardGoal, AgentPersona, OrganizationId } from '@/types';
import { sanitizeUUID, requireUUID } from './utils';
import { slugify } from '@/lib/utils/slugify';

function isMissingColumnInSchemaCache(error: unknown, table: string, column: string): boolean {
  const message = String((error as any)?.message ?? '');
  // PostgREST error example:
  // "Could not find the 'default_product_id' column of 'boards' in the schema cache"
  return (
    message.includes(`Could not find the '${column}' column`) &&
    message.includes(`'${table}'`) &&
    message.includes('schema cache')
  );
}

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
// BOARDS SERVICE
// ============================================

/**
 * Representação de board no banco de dados.
 * 
 * @interface DbBoard
 */
export interface DbBoard {
  /** ID único do board (UUID). */
  id: string;
  /** ID da organização/tenant. */
  organization_id: string;
  /** Identificador humano (slug) para integrações. */
  key?: string | null;
  /** Nome do board. */
  name: string;
  /** Descrição do propósito. */
  description: string | null;
  /** Se é o board padrão. */
  is_default: boolean;
  /** Template base usado. */
  template: string | null;
  /** Estágio de lifecycle vinculado. */
  linked_lifecycle_stage: string | null;
  /** ID do próximo board na jornada. */
  next_board_id: string | null;
  /** ID do estágio de Ganho (Win). */
  won_stage_id: string | null;
  /** ID do estágio de Perda (Lost). */
  lost_stage_id: string | null;
  /** Produto padrão para deals desse board (opcional). */
  default_product_id?: string | null;
  /** Se deve manter no estágio ao ganhar (true) ou mover (false/null). */
  won_stay_in_stage: boolean | null;
  /** Se deve manter no estágio ao perder (true) ou mover (false/null). */
  lost_stay_in_stage: boolean | null;
  /** Descrição da meta. */
  goal_description: string | null;
  /** KPI principal. */
  goal_kpi: string | null;
  /** Valor alvo do KPI. */
  goal_target_value: string | null;
  /** Tipo da meta (currency, percentage, count). */
  goal_type: string | null;
  /** Nome do agente de IA. */
  agent_name: string | null;
  /** Papel/função do agente. */
  agent_role: string | null;
  /** Comportamento do agente. */
  agent_behavior: string | null;
  /** Gatilho de entrada de novos itens. */
  entry_trigger: string | null;
  /** Sugestões de automação. */
  automation_suggestions: string[] | null;
  /** Posição na lista de boards. */
  position: number;
  /** Data de criação. */
  created_at: string;
  /** Data de atualização. */
  updated_at: string;
  /** ID do dono/responsável. */
  owner_id: string | null;
}

/**
 * Representação de estágio de board no banco de dados.
 * 
 * @interface DbBoardStage
 */
export interface DbBoardStage {
  /** ID único do estágio (UUID). */
  id: string;
  /** ID da organização/tenant. */
  organization_id: string;
  /** ID do board pai. */
  board_id: string;
  /** Nome interno do estágio. */
  name: string;
  /** Label exibido na UI. */
  label: string | null;
  /** Cor do estágio (classe Tailwind). */
  color: string | null;
  /** Ordem de exibição. */
  order: number;
  /** Se é estágio padrão. */
  is_default: boolean;
  /** Estágio de lifecycle vinculado. */
  linked_lifecycle_stage: string | null;
  /** Data de criação. */
  created_at: string;
}

/**
 * Transforma estágio do formato DB para o formato da aplicação.
 * 
 * @param db - Estágio no formato do banco.
 * @returns Estágio no formato da aplicação.
 */
const transformStage = (db: DbBoardStage): BoardStage => ({
  id: db.id,
  organizationId: db.organization_id,
  boardId: db.board_id,
  label: db.label || db.name, // label pode ser null, usar name como fallback
  color: db.color || 'bg-gray-500',
  linkedLifecycleStage: db.linked_lifecycle_stage || undefined,
});

/**
 * Transforma board do formato DB para o formato da aplicação.
 * 
 * @param db - Board no formato do banco.
 * @param stages - Estágios no formato do banco.
 * @returns Board no formato da aplicação.
 */
const transformBoard = (db: DbBoard, stages: DbBoardStage[]): Board => {
  const goal: BoardGoal | undefined = db.goal_description ? {
    description: db.goal_description,
    kpi: db.goal_kpi || '',
    targetValue: db.goal_target_value || '',
    type: (db.goal_type as BoardGoal['type']) || undefined,
  } : undefined;

  const agentPersona: AgentPersona | undefined = db.agent_name ? {
    name: db.agent_name,
    role: db.agent_role || '',
    behavior: db.agent_behavior || '',
  } : undefined;

  return {
    id: db.id,
    organizationId: db.organization_id,
    key: (db as any).key || undefined,
    name: db.name,
    description: db.description || undefined,
    isDefault: db.is_default,
    template: (db.template as Board['template']) || undefined,
    linkedLifecycleStage: db.linked_lifecycle_stage || undefined,
    nextBoardId: db.next_board_id || undefined,
    wonStageId: db.won_stage_id || undefined,
    lostStageId: db.lost_stage_id || undefined,
    wonStayInStage: db.won_stay_in_stage || false,
    lostStayInStage: db.lost_stay_in_stage || false,
    defaultProductId: (db as any).default_product_id || undefined,
    goal,
    agentPersona,
    entryTrigger: db.entry_trigger || undefined,
    automationSuggestions: db.automation_suggestions || [],
    stages: stages
      .filter(s => s.board_id === db.id)
      .sort((a, b) => a.order - b.order)
      .map(transformStage),
    createdAt: db.created_at,
  };
};

function normalizeBoardKey(input: string | undefined | null): string | null {
  const s = slugify(String(input ?? ''));
  return s ? s : null;
}

function isUniqueViolationOnIndex(error: unknown, indexName: string): boolean {
  const code = String((error as any)?.code ?? '');
  const message = String((error as any)?.message ?? '');
  const details = String((error as any)?.details ?? '');
  return code === '23505' && (message.includes(indexName) || details.includes(indexName));
}

/**
 * Transforma board do formato da aplicação para o formato DB.
 * 
 * @param board - Board no formato da aplicação.
 * @param order - Posição na lista (opcional).
 * @returns Board parcial no formato do banco.
 */
const transformToDb = (board: Omit<Board, 'id' | 'createdAt'>, order?: number): Partial<DbBoard> => {
  // NOTE: sanitizeUUID returns null (not undefined). If we include a null key for a column that
  // doesn't exist yet (older DB / migrations not applied), PostgREST errors with:
  // "Could not find the '<col>' column of '<table>' in the schema cache".
  // To keep backwards-compat during rollout, we omit optional columns when not set.
  const defaultProductId = sanitizeUUID(board.defaultProductId);

  const db: Partial<DbBoard> = {
    name: board.name,
    description: board.description || null,
    is_default: board.isDefault || false,
    template: board.template || null,
    linked_lifecycle_stage: board.linkedLifecycleStage || null,
    next_board_id: sanitizeUUID(board.nextBoardId),
    won_stage_id: sanitizeUUID(board.wonStageId),
    lost_stage_id: sanitizeUUID(board.lostStageId),
    won_stay_in_stage: board.wonStayInStage || false,
    lost_stay_in_stage: board.lostStayInStage || false,
    goal_description: board.goal?.description || null,
    goal_kpi: board.goal?.kpi || null,
    goal_target_value: board.goal?.targetValue || null,
    goal_type: board.goal?.type || null,
    agent_name: board.agentPersona?.name || null,
    agent_role: board.agentPersona?.role || null,
    agent_behavior: board.agentPersona?.behavior || null,
    entry_trigger: board.entryTrigger || null,
    automation_suggestions: board.automationSuggestions || null,
    position: order ?? 0,
  };

  if (defaultProductId) {
    db.default_product_id = defaultProductId;
  }

  const key = normalizeBoardKey((board as any).key);
  if (key) {
    (db as any).key = key;
  }

  return db;
};

/**
 * Transforma estágio do formato da aplicação para o formato DB.
 * 
 * @param stage - Estágio no formato da aplicação.
 * @param boardId - ID do board pai.
 * @param orderNum - Posição na lista.
 * @returns Estágio parcial no formato do banco.
 */
const transformStageToDb = (
  stage: BoardStage,
  boardId: string,
  orderNum: number,
  organizationId: string
): Partial<DbBoardStage> => ({
  organization_id: organizationId,
  board_id: boardId,
  name: stage.label,
  label: stage.label,
  color: stage.color || 'bg-gray-500',
  order: orderNum,
  linked_lifecycle_stage: stage.linkedLifecycleStage || null,
});

/**
 * Serviço de boards do Supabase.
 * 
 * Fornece operações CRUD para as tabelas `boards` e `board_stages`.
 * 
 * @example
 * ```typescript
 * // Buscar todos os boards
 * const { data, error } = await boardsService.getAll();
 * 
 * // Criar um novo board
 * const { data, error } = await boardsService.create(
 *   { name: 'Vendas B2B', stages: [...] },
 *   organizationId
 * );
 * ```
 */
export const boardsService = {
  /**
   * Busca todos os boards da organização com seus estágios.
   * 
   * @returns Promise com array de boards ou erro.
   */
  async getAll(): Promise<{ data: Board[] | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const [boardsResult, stagesResult] = await Promise.all([
        supabase.from('boards').select('*').order('position', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('board_stages').select('*').order('order', { ascending: true }),
      ]);

      if (boardsResult.error) return { data: null, error: boardsResult.error };
      if (stagesResult.error) return { data: null, error: stagesResult.error };

      const boards = (boardsResult.data || []).map(b =>
        transformBoard(b as DbBoard, stagesResult.data as DbBoardStage[])
      );

      return { data: boards, error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Busca um board específico pelo ID.
   */
  async get(id: string): Promise<Board | null> {
    try {
      if (!id) return null;
      if (!supabase) return null;

      const { data: boardData, error: boardError } = await supabase
        .from('boards')
        .select('*')
        .eq('id', id)
        .single();

      if (boardError || !boardData) return null;

      const { data: stagesData } = await supabase
        .from('board_stages')
        .select('*')
        .eq('board_id', id)
        .order('order');

      return transformBoard(boardData as DbBoard, (stagesData || []) as DbBoardStage[]);
    } catch (e) {
      console.error('Error fetching board:', e);
      return null;
    }
  },

  /**
   * Cria um novo board com seus estágios.
   * 
   * @param board - Dados do board (sem id e createdAt).
   * @param order - Posição na lista (opcional, calculada se não informada).
   * @returns Promise com board criado ou erro.
   */
  async create(board: Omit<Board, 'id' | 'createdAt'>, order?: number): Promise<{ data: Board | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      // Ensure we always set organization_id for boards/stages (prevents downstream deal creation failures).
      const organizationId =
        sanitizeUUID((board as any).organizationId) || (await getCurrentOrganizationId());

      if (!organizationId) {
        return { data: null, error: new Error('Organização não identificada para este board. Recarregue a página e tente novamente.') };
      }

      // Get next order if not provided
      let boardOrder = order;
      if (boardOrder === undefined) {
        const { data: existingBoards } = await supabase
          .from('boards')
          .select('position')
          .order('position', { ascending: false })
          .limit(1);
        boardOrder = existingBoards && existingBoards.length > 0 ? existingBoards[0].position + 1 : 0;
      }

      // 1. Create board
      const baseKey = normalizeBoardKey((board as any).key) || normalizeBoardKey(board.name);
      const boardDataBase: any = {
        ...transformToDb(board, boardOrder),
        organization_id: organizationId,
        // For won/lost stages, we can't save them yet because stages don't exist
        won_stage_id: null,
        lost_stage_id: null,
      };

      // Try insert with a stable key, retrying on unique violations by suffixing.
      let newBoard: any = null;
      let boardError: any = null;

      const MAX_KEY_ATTEMPTS = 20;
      for (let attempt = 0; attempt <= MAX_KEY_ATTEMPTS; attempt += 1) {
        const candidateKey = baseKey
          ? (attempt === 0 ? baseKey : `${baseKey}-${attempt + 1}`)
          : null;

        const boardData: any = { ...boardDataBase };
        if (candidateKey) boardData.key = candidateKey;

        let insert = await supabase
          .from('boards')
          .insert(boardData)
          .select()
          .single();

        // Backwards-compat: DB may not have default_product_id yet (migration not applied).
        if (insert.error && isMissingColumnInSchemaCache(insert.error, 'boards', 'default_product_id')) {
          const retryData = { ...(boardData as any) };
          delete retryData.default_product_id;
          insert = await supabase.from('boards').insert(retryData).select().single();
        }

        // Backwards-compat: DB may not have key yet (migration not applied).
        if (insert.error && isMissingColumnInSchemaCache(insert.error, 'boards', 'key')) {
          const retryData = { ...(boardData as any) };
          delete retryData.key;
          insert = await supabase.from('boards').insert(retryData).select().single();
        }

        newBoard = insert.data as any;
        boardError = insert.error as any;

        if (boardError && isUniqueViolationOnIndex(boardError, 'idx_boards_org_key_unique')) {
          continue;
        }

        break;
      }

      if (boardError) {
        console.error('[boardsService.create] Board insert error:', boardError);
        return { data: null, error: boardError };
      }

      // 2. Create stages and track ID mapping
      const stagesToInsert = (board.stages || []).map((stage, index) => ({
        ...transformStageToDb(stage, newBoard.id, index, organizationId),
      }));

      // Store fetched stages after insert to map IDs
      let insertedStages: DbBoardStage[] = [];

      if (stagesToInsert.length > 0) {
        const { data: stagesData, error: stagesError } = await supabase
          .from('board_stages')
          .insert(stagesToInsert)
          .select();

        if (stagesError) return { data: null, error: stagesError };
        insertedStages = stagesData as DbBoardStage[];
      }

      // 3. Update won/lost stage IDs if necessary
      if (board.wonStageId || board.lostStageId) {
        // Map: Frontend ID (from `board.stages[i].id`) -> Backend ID (`insertedStages[i].id`)
        // Prerequisite: order is preserved in `insert` and `select` implies we need robust mapping.
        // `insert` with multiple values returns rows in random order? Postgres usually preserves order for batch insert but it's not guaranteed by SQL standard.
        // Safer way: match by index if names are unique? Unreliable.
        // Wait, `insertedStages` from Supabase comes back.
        // Let's assume order is preserved for now (common practice), or strictly we should match logic.
        // Actually, matching by index is the best bet here since we just inserted them.

        let realWonStageId: string | null = null;
        let realLostStageId: string | null = null;

        if (board.stages && insertedStages.length === board.stages.length) {
          // Re-sort inserted stages by order to match input order
          const sortedInserted = [...insertedStages].sort((a, b) => a.order - b.order);
          const sortedInput = [...board.stages]; // Assuming they came in ordered or we iterate by index

          const wonIndex = sortedInput.findIndex(s => s.id === board.wonStageId);
          if (wonIndex >= 0) realWonStageId = sortedInserted[wonIndex].id;

          const lostIndex = sortedInput.findIndex(s => s.id === board.lostStageId);
          if (lostIndex >= 0) realLostStageId = sortedInserted[lostIndex].id;
        }

        if (realWonStageId || realLostStageId) {
          await supabase.from('boards').update({
            won_stage_id: realWonStageId,
            lost_stage_id: realLostStageId
          }).eq('id', newBoard.id);

          // Update the local newBoard object to reflect this for response
          if (realWonStageId) (newBoard as DbBoard).won_stage_id = realWonStageId;
          if (realLostStageId) (newBoard as DbBoard).lost_stage_id = realLostStageId;
        }
      }

      // 4. Return complete board
      // Use the inserted stages directly
      const result = {
        data: transformBoard(newBoard as DbBoard, insertedStages),
        error: null
      };
      return result;
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async update(id: string, updates: Partial<Board>): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      // Needed to safely upsert stages with the proper org_id.
      const { data: boardRow } = await supabase
        .from('boards')
        .select('organization_id')
        .eq('id', id)
        .single();
      const organizationId =
        sanitizeUUID((boardRow as any)?.organization_id) || (await getCurrentOrganizationId());

      const dbUpdates: Partial<DbBoard> = {};

      if ((updates as any).key !== undefined) (dbUpdates as any).key = normalizeBoardKey((updates as any).key);
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description || null;
      if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault;
      if (updates.template !== undefined) dbUpdates.template = updates.template || null;
      if (updates.linkedLifecycleStage !== undefined) dbUpdates.linked_lifecycle_stage = updates.linkedLifecycleStage || null;
      if (updates.nextBoardId !== undefined) dbUpdates.next_board_id = updates.nextBoardId || null;
      if (updates.wonStageId !== undefined) dbUpdates.won_stage_id = updates.wonStageId || null;
      if (updates.lostStageId !== undefined) dbUpdates.lost_stage_id = updates.lostStageId || null;
      if (updates.wonStayInStage !== undefined) dbUpdates.won_stay_in_stage = updates.wonStayInStage;
      if (updates.lostStayInStage !== undefined) dbUpdates.lost_stay_in_stage = updates.lostStayInStage;
      if (updates.defaultProductId !== undefined) dbUpdates.default_product_id = sanitizeUUID(updates.defaultProductId as any);
      if (updates.entryTrigger !== undefined) dbUpdates.entry_trigger = updates.entryTrigger || null;
      if (updates.automationSuggestions !== undefined) dbUpdates.automation_suggestions = updates.automationSuggestions || null;


      if (updates.goal !== undefined) {
        dbUpdates.goal_description = updates.goal?.description || null;
        dbUpdates.goal_kpi = updates.goal?.kpi || null;
        dbUpdates.goal_target_value = updates.goal?.targetValue || null;
        dbUpdates.goal_type = updates.goal?.type || null;
      }

      if (updates.agentPersona !== undefined) {
        dbUpdates.agent_name = updates.agentPersona?.name || null;
        dbUpdates.agent_role = updates.agentPersona?.role || null;
        dbUpdates.agent_behavior = updates.agentPersona?.behavior || null;
      }

      dbUpdates.updated_at = new Date().toISOString();

      let { error } = await supabase
        .from('boards')
        .update(dbUpdates)
        .eq('id', id);

      // Backwards-compat: ignore key updates if column isn't present yet.
      if (error && isMissingColumnInSchemaCache(error, 'boards', 'key')) {
        const retryUpdates = { ...(dbUpdates as any) };
        delete retryUpdates.key;
        const retry = await supabase
          .from('boards')
          .update(retryUpdates)
          .eq('id', id);
        error = retry.error as any;
      }

      // Backwards-compat: ignore default_product_id updates if column isn't present yet.
      if (error && isMissingColumnInSchemaCache(error, 'boards', 'default_product_id')) {
        const retryUpdates = { ...(dbUpdates as any) };
        delete retryUpdates.default_product_id;

        const retry = await supabase
          .from('boards')
          .update(retryUpdates)
          .eq('id', id);

        error = retry.error as any;
      }

      if (error) return { error };

      // Update stages if provided
      // Update stages if provided
      if (updates.stages) {
        if (!organizationId) {
          return { error: new Error('Organização não identificada para atualizar estágios deste board. Recarregue a página e tente novamente.') };
        }
        // 1. Upsert provided stages (Update existing + Insert new)
        // We MUST include the ID to update existing records
        const stagesToUpsert = updates.stages.map((stage, index) => ({
          ...transformStageToDb(stage, id, index, organizationId),
          id: stage.id,
        }));

        const { error: upsertError } = await supabase
          .from('board_stages')
          .upsert(stagesToUpsert);

        if (upsertError) return { error: upsertError };

        // 2. Delete removed stages
        // Delete any stage belonging to this board that is NOT in the new list
        const currentStageIds = updates.stages.map(s => s.id);

        // Safety check: ensure we have at least one stage (should shouldn't force delete all if empty list passed by mistake)
        if (currentStageIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('board_stages')
            .delete()
            .eq('board_id', id)
            .not('id', 'in', `(${currentStageIds.join(',')})`);

          // If deletion fails (e.g. FK constraint because stage has deals), 
          // we treat it as a partial success/warning but don't block the update.
          // Ideally we would notify the user "Some stages could not be deleted".
          if (deleteError) {
            console.warn('Could not delete some removed stages (likely due to existing deals):', deleteError);
            // We allow this to pass so the other updates (name, settings) are preserved.
          }
        }
      }

      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async canDelete(boardId: string): Promise<{ canDelete: boolean; dealCount: number; error: Error | null }> {
    try {
      if (!supabase) return { canDelete: false, dealCount: 0, error: new Error('Supabase não configurado') };

      const { count, error } = await supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('board_id', boardId);

      if (error) return { canDelete: false, dealCount: 0, error };

      return {
        canDelete: (count ?? 0) === 0,
        dealCount: count ?? 0,
        error: null,
      };
    } catch (e) {
      return { canDelete: false, dealCount: 0, error: e as Error };
    }
  },

  async moveDealsToBoard(fromBoardId: string, toBoardId: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      // Pega o primeiro stage do board de destino
      const { data: stages, error: stagesError } = await supabase
        .from('board_stages')
        .select('id')
        .eq('board_id', toBoardId)
        .order('order', { ascending: true })
        .limit(1);

      if (stagesError) return { error: stagesError };
      if (!stages || stages.length === 0) {
        return { error: new Error('Board de destino não tem stages') };
      }

      const firstStageId = stages[0].id;

      // Move todos os deals
      const { error } = await supabase
        .from('deals')
        .update({ board_id: toBoardId, stage_id: firstStageId })
        .eq('board_id', fromBoardId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      // Verifica se pode deletar
      const { canDelete, dealCount, error: checkError } = await this.canDelete(id);
      if (checkError) return { error: checkError };

      if (!canDelete) {
        return {
          error: new Error(
            `Não é possível excluir este board. Existem ${dealCount} negócio(s) vinculado(s). Mova ou exclua os negócios primeiro.`
          ),
        };
      }

      // IMPORTANT: boards can reference each other via boards.next_board_id (handoff chain).
      // If any board points to this board, deletion fails with FK boards_next_board_id_fkey.
      // Clear those references before deleting.
      const { error: clearNextError } = await supabase
        .from('boards')
        .update({ next_board_id: null })
        .eq('next_board_id', id);
      if (clearNextError) return { error: clearNextError };

      // Also clear user_settings.active_board_id if it points to the board being deleted.
      const { error: clearActiveBoardError } = await supabase
        .from('user_settings')
        .update({ active_board_id: null })
        .eq('active_board_id', id);
      // user_settings might not exist or might not be writable for this user; treat errors as non-fatal.
      // best-effort: ignore errors
      void clearActiveBoardError;

      // Stages are deleted automatically via CASCADE
      const { error } = await supabase
        .from('boards')
        .delete()
        .eq('id', id);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async deleteWithMoveDeals(boardId: string, targetBoardId: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      // 1. Move os deals primeiro
      const { error: moveError } = await this.moveDealsToBoard(boardId, targetBoardId);
      if (moveError) return { error: moveError };

      // Clear handoff references pointing to this board (boards.next_board_id) before deleting.
      const { error: clearNextError } = await supabase
        .from('boards')
        .update({ next_board_id: null })
        .eq('next_board_id', boardId);
      if (clearNextError) return { error: clearNextError };

      // Clear user_settings.active_board_id if it points to the board being deleted (best-effort).
      const { error: clearActiveBoardError } = await supabase
        .from('user_settings')
        .update({ active_board_id: null })
        .eq('active_board_id', boardId);
      // best-effort: ignore errors
      void clearActiveBoardError;

      // 2. Agora pode deletar
      const { error } = await supabase
        .from('boards')
        .delete()
        .eq('id', boardId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  // Stage operations
  async addStage(boardId: string, stage: Omit<BoardStage, 'id'>): Promise<{ data: BoardStage | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      // Get current max order
      const { data: existingStages } = await supabase
        .from('board_stages')
        .select('order')
        .eq('board_id', boardId)
        .order('order', { ascending: false })
        .limit(1);

      const nextOrder = existingStages && existingStages.length > 0
        ? existingStages[0].order + 1
        : 0;

      const { data, error } = await supabase
        .from('board_stages')
        .insert({
          board_id: boardId,
          label: stage.label,
          color: stage.color || 'bg-gray-500',
          order: nextOrder,
          linked_lifecycle_stage: stage.linkedLifecycleStage || null,
        })
        .select()
        .single();

      if (error) return { data: null, error };

      return { data: transformStage(data as DbBoardStage), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async updateStage(stageId: string, updates: Partial<BoardStage>): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      const dbUpdates: Partial<DbBoardStage> = {};

      if (updates.label !== undefined) dbUpdates.label = updates.label;
      if (updates.color !== undefined) dbUpdates.color = updates.color;
      if (updates.linkedLifecycleStage !== undefined) {
        dbUpdates.linked_lifecycle_stage = updates.linkedLifecycleStage || null;
      }

      const { error } = await supabase
        .from('board_stages')
        .update(dbUpdates)
        .eq('id', stageId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async deleteStage(stageId: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      // Verificar se há deals ativos neste estágio
      const { count, error: countError } = await supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', stageId);

      if (countError) {
        return { error: countError };
      }

      if (count && count > 0) {
        return {
          error: new Error(
            `Não é possível excluir este estágio. Existem ${count} deal(s) nele. Mova os deals para outro estágio primeiro.`
          )
        };
      }

      const { error } = await supabase
        .from('board_stages')
        .delete()
        .eq('id', stageId);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },
};

// ============================================
// BOARD STAGES SERVICE (para lookup de stageLabel)
// ============================================
export const boardStagesService = {
  /** Busca todos os stages */
  async getAll(): Promise<{ data: DbBoardStage[] | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const { data, error } = await supabase
        .from('board_stages')
        .select('*')
        .order('order', { ascending: true });

      return { data: data as DbBoardStage[] | null, error };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /** Busca stages de um board específico */
  async getByBoardId(boardId: string): Promise<{ data: DbBoardStage[] | null; error: Error | null }> {
    try {
      // Guard: return empty array if boardId is empty/invalid
      if (!boardId || boardId.trim() === '') {
        return { data: [], error: null };
      }

      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const { data, error } = await supabase
        .from('board_stages')
        .select('*')
        .eq('board_id', boardId)
        .order('order', { ascending: true });

      return { data: data as DbBoardStage[] | null, error };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },
};

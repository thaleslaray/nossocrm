import { randomUUID } from 'node:crypto';
import { getRunId } from './runId';
import { assertNoSupabaseError, getSupabaseAdminClient, requireSupabaseData, withSupabaseRetry } from './supabaseAdmin';

export type SalesTestUser = {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  nickname: string | null;
};

export type SalesTestBoard = {
  boardId: string;
  stageIds: {
    novo: string;
    proposta: string;
    ganho: string;
    perdido: string;
  };
};

export type SalesTestDealBundle = {
  openDealId: string;
  wonDealId: string;
  lostDealId: string;
  contactId: string;
  contactEmail: string;
  overdueActivityId: string;
  futureActivityId: string;
};

export type SalesTeamFixtureBundle = {
  runId: string;
  organizationId: string;
  mode: 'existing-users' | 'auth-users';
  users: SalesTestUser[];
  boardsByUserId: Record<string, SalesTestBoard>;
  dealsByUserId: Record<string, SalesTestDealBundle>;
  created: {
    organizationCreated: boolean;
    boardIds: string[];
    dealIds: string[];
    contactIds: string[];
    activityIds: string[];
    userIdsCreated: string[];
  };
};

/**
 * Classe `AuthAdminUnavailableError` do projeto.
 */
export class AuthAdminUnavailableError extends Error {
  name = 'AuthAdminUnavailableError';
    /**
   * Constrói uma instância de `AuthAdminUnavailableError`.
   *
   * @param {string} message - Parâmetro `message`.
   * @returns {void} Não retorna valor.
   */
constructor(message: string) {
    super(message);
  }
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function createBoard(params: { organizationId: string; name: string }): Promise<{ boardId: string }> {
  const supabase = getSupabaseAdminClient();
  const res = await supabase
    .from('boards')
    .insert({ organization_id: params.organizationId, name: params.name, is_default: false })
    .select('id')
    .single();
  const row = requireSupabaseData(res, 'insert boards');
  return { boardId: row.id };
}

async function createDefaultStages(params: {
  organizationId: string;
  boardId: string;
}): Promise<SalesTestBoard['stageIds']> {
  const supabase = getSupabaseAdminClient();

  const insert = await supabase
    .from('board_stages')
    .insert([
      { organization_id: params.organizationId, board_id: params.boardId, name: 'Novo', color: '#3b82f6', order: 0 },
      { organization_id: params.organizationId, board_id: params.boardId, name: 'Proposta', color: '#a855f7', order: 1 },
      { organization_id: params.organizationId, board_id: params.boardId, name: 'Ganho', color: '#22c55e', order: 2 },
      { organization_id: params.organizationId, board_id: params.boardId, name: 'Perdido', color: '#ef4444', order: 3 },
    ])
    .select('id, name');

  const rows = requireSupabaseData(insert, 'insert board_stages') as Array<{ id: string; name: string }>;
  const byName = new Map(rows.map((r) => [r.name, r.id]));

  const novo = byName.get('Novo');
  const proposta = byName.get('Proposta');
  const ganho = byName.get('Ganho');
  const perdido = byName.get('Perdido');

  if (!novo || !proposta || !ganho || !perdido) {
    throw new Error('Fixture error: failed to create expected stages');
  }

  return { novo, proposta, ganho, perdido };
}

async function pickExistingSalesTeam(params: {
  minUsers: number;
  strict: boolean;
}): Promise<{ organizationId: string; users: SalesTestUser[] }> {
  const supabase = getSupabaseAdminClient();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, role, first_name, nickname, organization_id')
    .not('organization_id', 'is', null)
    // Pegamos bastante gente para aumentar a chance de encontrar uma org com vários usuários.
    // Em ambientes reais isso ainda pode ser limitado, então há fallback abaixo.
    .limit(5000);

  if (error) {
    throw new AuthAdminUnavailableError(`Falha ao buscar profiles existentes: ${JSON.stringify(error, null, 2)}`);
  }

  const rows = (profiles || []) as Array<{
    id: string;
    email: string | null;
    role: string | null;
    first_name: string | null;
    nickname: string | null;
    organization_id: string | null;
  }>;

  const byOrg = new Map<string, typeof rows>();
  for (const p of rows) {
    if (!p.organization_id) continue;
    const list = byOrg.get(p.organization_id) || [];
    list.push(p);
    byOrg.set(p.organization_id, list);
  }

  const sorted = Array.from(byOrg.entries()).sort((a, b) => b[1].length - a[1].length);
  const best = sorted[0];
  if (!best) {
    throw new AuthAdminUnavailableError(
      `Não encontrei nenhum profile com organization_id em public.profiles (preciso de usuários já existentes).`,
    );
  }

  const [organizationId, list] = best;

  if (params.strict && list.length < params.minUsers) {
    throw new AuthAdminUnavailableError(
      `Encontrei organization_id=${organizationId} com apenas ${list.length} usuários em public.profiles, mas o mínimo exigido é ${params.minUsers} (modo strict).`,
    );
  }

  const take = Math.min(params.minUsers, list.length);
  const picked = list.slice(0, take).map((p) => {
    const email = p.email || `user.${p.id}@unknown`;
    const firstName = (p.first_name || p.nickname || email.split('@')[0] || 'User').trim();
    return {
      userId: p.id,
      email,
      role: p.role || 'user',
      firstName,
      nickname: p.nickname || null,
    } satisfies SalesTestUser;
  });

  return { organizationId, users: picked };
}

// Obs: evitamos criar auth.users aqui porque em alguns projetos o endpoint Admin retorna 500.
// A suíte foca em usar perfis já existentes.

async function createContact(params: {
  organizationId: string;
  ownerId: string;
  name: string;
  email: string;
}): Promise<{ contactId: string; email: string }> {
  const supabase = getSupabaseAdminClient();

  const res = await supabase
    .from('contacts')
    .insert({
      organization_id: params.organizationId,
      owner_id: params.ownerId,
      name: params.name,
      email: params.email,
    })
    .select('id, email')
    .single();

  const row = requireSupabaseData(res, 'insert contacts');
  return { contactId: row.id, email: row.email };
}

async function createDeal(params: {
  organizationId: string;
  boardId: string;
  stageId: string;
  ownerId: string;
  contactId: string;
  title: string;
  value: number;
  updatedAt?: string;
}): Promise<string> {
  const supabase = getSupabaseAdminClient();

  const res = await supabase
    .from('deals')
    .insert({
      organization_id: params.organizationId,
      board_id: params.boardId,
      stage_id: params.stageId,
      owner_id: params.ownerId,
      contact_id: params.contactId,
      title: params.title,
      value: params.value,
      status: 'open',
      priority: 'medium',
      is_won: false,
      is_lost: false,
      updated_at: params.updatedAt ?? new Date().toISOString(),
    })
    .select('id')
    .single();

  const row = requireSupabaseData(res, 'insert deals');
  return row.id;
}

async function createActivity(params: {
  organizationId: string;
  ownerId: string;
  dealId: string;
  title: string;
  date: string;
  completed: boolean;
  type?: 'CALL' | 'MEETING' | 'EMAIL' | 'TASK';
}): Promise<string> {
  const supabase = getSupabaseAdminClient();

  const res = await withSupabaseRetry<{ id: string }>(
    async () =>
      await supabase
        .from('activities')
        .insert({
          organization_id: params.organizationId,
          owner_id: params.ownerId,
          deal_id: params.dealId,
          title: params.title,
          date: params.date,
          completed: params.completed,
          type: params.type ?? 'TASK',
        })
        .select('id')
        .single(),
    'insert activities',
  );

  const row = requireSupabaseData(res, 'insert activities');
  return row.id;
}

/**
 * Função pública `createSalesTeamFixtures` do projeto.
 * @returns {Promise<SalesTeamFixtureBundle>} Retorna um valor do tipo `Promise<SalesTeamFixtureBundle>`.
 */
export async function createSalesTeamFixtures(): Promise<SalesTeamFixtureBundle> {
  const runId = getRunId('sales-team');

  const minUsers = Number(process.env.SALES_TEAM_MIN_USERS || 5);
  const strict = String(process.env.SALES_TEAM_STRICT || '').toLowerCase() === 'true';

  // Construímos de forma incremental para conseguir cleanup best-effort caso algo falhe.
  const fx: SalesTeamFixtureBundle = {
    runId,
    organizationId: '',
    mode: 'existing-users',
    users: [],
    boardsByUserId: {},
    dealsByUserId: {},
    created: {
      organizationCreated: false,
      boardIds: [],
      dealIds: [],
      contactIds: [],
      activityIds: [],
      userIdsCreated: [],
    },
  };

  try {
    const picked = await pickExistingSalesTeam({ minUsers, strict });
    fx.organizationId = picked.organizationId;
    fx.users = picked.users;
    fx.mode = 'existing-users';

    for (const user of fx.users) {
      const { boardId } = await createBoard({
        organizationId: fx.organizationId,
        name: `AI Tools Test Board ${user.firstName} ${runId}`,
      });
      fx.created.boardIds.push(boardId);

      const stageIds = await createDefaultStages({ organizationId: fx.organizationId, boardId });
      fx.boardsByUserId[user.userId] = { boardId, stageIds };

      // Alguns projetos têm restrição de unicidade de (contact, stage) para deals.
      // Para evitar conflito ao criar 3 deals "semente" por vendedor, criamos contatos distintos.
      const openContact = await createContact({
        organizationId: fx.organizationId,
        ownerId: user.userId,
        name: `AI Tools Contato Open ${user.firstName} ${runId}`,
        email: `ai-tools.contact.open.${user.firstName.toLowerCase()}.${runId}.${randomUUID()}@example.com`,
      });
      fx.created.contactIds.push(openContact.contactId);

      const wonContact = await createContact({
        organizationId: fx.organizationId,
        ownerId: user.userId,
        name: `AI Tools Contato Won ${user.firstName} ${runId}`,
        email: `ai-tools.contact.won.${user.firstName.toLowerCase()}.${runId}.${randomUUID()}@example.com`,
      });
      fx.created.contactIds.push(wonContact.contactId);

      const lostContact = await createContact({
        organizationId: fx.organizationId,
        ownerId: user.userId,
        name: `AI Tools Contato Lost ${user.firstName} ${runId}`,
        email: `ai-tools.contact.lost.${user.firstName.toLowerCase()}.${runId}.${randomUUID()}@example.com`,
      });
      fx.created.contactIds.push(lostContact.contactId);

      const openDealId = await createDeal({
        organizationId: fx.organizationId,
        boardId,
        stageId: stageIds.novo,
        ownerId: user.userId,
        contactId: openContact.contactId,
        title: `AI Tools Deal Open ${user.firstName} ${runId}`,
        value: 1000,
        updatedAt: daysAgoIso(10),
      });
      fx.created.dealIds.push(openDealId);

      const wonDealId = await createDeal({
        organizationId: fx.organizationId,
        boardId,
        stageId: stageIds.novo,
        ownerId: user.userId,
        contactId: wonContact.contactId,
        title: `AI Tools Deal WonCandidate ${user.firstName} ${runId}`,
        value: 1500,
        updatedAt: daysAgoIso(1),
      });
      fx.created.dealIds.push(wonDealId);

      const lostDealId = await createDeal({
        organizationId: fx.organizationId,
        boardId,
        stageId: stageIds.novo,
        ownerId: user.userId,
        contactId: lostContact.contactId,
        title: `AI Tools Deal LostCandidate ${user.firstName} ${runId}`,
        value: 800,
        updatedAt: daysAgoIso(1),
      });
      fx.created.dealIds.push(lostDealId);

      const overdueActivityId = await createActivity({
        organizationId: fx.organizationId,
        ownerId: user.userId,
        dealId: openDealId,
        title: `AI Tools Overdue ${user.firstName} ${runId}`,
        date: daysAgoIso(2),
        completed: false,
        type: 'CALL',
      });
      fx.created.activityIds.push(overdueActivityId);

      const futureActivityId = await createActivity({
        organizationId: fx.organizationId,
        ownerId: user.userId,
        dealId: openDealId,
        title: `AI Tools Future ${user.firstName} ${runId}`,
        date: daysFromNowIso(3),
        completed: false,
        type: 'TASK',
      });
      fx.created.activityIds.push(futureActivityId);

      fx.dealsByUserId[user.userId] = {
        openDealId,
        wonDealId,
        lostDealId,
        contactId: openContact.contactId,
        contactEmail: openContact.email,
        overdueActivityId,
        futureActivityId,
      };
    }

    return fx;
  } catch (e) {
    if (fx.organizationId) {
      try {
        await cleanupSalesTeamFixtures(fx);
      } catch {
        // ignore
      }
    }
    throw e;
  }
}

/**
 * Função pública `cleanupSalesTeamFixtures` do projeto.
 *
 * @param {SalesTeamFixtureBundle} fx - Parâmetro `fx`.
 * @returns {Promise<void>} Retorna uma Promise resolvida sem valor.
 */
export async function cleanupSalesTeamFixtures(fx: SalesTeamFixtureBundle): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const boardIds = fx.created.boardIds;

  // ---
  // Cascata segura por boardIds
  // ---
  // As tools do CRM podem criar itens adicionais durante o teste (ex.: createDeal, createTask,
  // logActivity, addDealNote). Para evitar deixar lixo e também evitar erro de FK ao remover
  // stages/boards, apagamos TUDO que estiver ligado aos boards criados neste run.
  let dealIdsByBoard: string[] = [];
  if (boardIds.length) {
    const { data, error } = await supabase
      .from('deals')
      .select('id')
      .eq('organization_id', fx.organizationId)
      .in('board_id', boardIds);

    if (!error && data) {
      dealIdsByBoard = (data as Array<{ id: string }>).map((d) => d.id);
    }
  }

  // Deletar apenas o que foi criado por este teste.
  // Ordem importa por FK.

  // 1) Notas / itens / atividades / deals ligados aos boards criados
  if (dealIdsByBoard.length) {
    // deal_notes
    await supabase
      .from('deal_notes')
      .delete()
      .eq('organization_id', fx.organizationId)
      .in('deal_id', dealIdsByBoard);

    // deal_items pode existir em alguns fluxos; remove por deal_id
    await supabase
      .from('deal_items')
      .delete()
      .eq('organization_id', fx.organizationId)
      .in('deal_id', dealIdsByBoard);

    // activities (tarefas/logs etc)
    await supabase
      .from('activities')
      .delete()
      .eq('organization_id', fx.organizationId)
      .in('deal_id', dealIdsByBoard);

    assertNoSupabaseError(
      await supabase.from('deals').delete().eq('organization_id', fx.organizationId).in('id', dealIdsByBoard),
      'delete deals (by board ids)',
    );
  } else {
    // Fallback (melhor esforço) para os IDs explícitos criados no fixture
    if (fx.created.activityIds.length) {
      await supabase.from('activities').delete().eq('organization_id', fx.organizationId).in('id', fx.created.activityIds);
    }
    if (fx.created.dealIds.length) {
      await supabase.from('deal_items').delete().eq('organization_id', fx.organizationId).in('deal_id', fx.created.dealIds);
      assertNoSupabaseError(
        await supabase.from('deals').delete().eq('organization_id', fx.organizationId).in('id', fx.created.dealIds),
        'delete deals (by ids)',
      );
    }
  }

  // 2) Contatos: apaga tanto os IDs criados no fixture quanto quaisquer contatos com o runId no email
  // (ex.: createContact tool cria contatos extras durante o teste).
  if (fx.created.contactIds.length) {
    await supabase.from('contacts').delete().eq('organization_id', fx.organizationId).in('id', fx.created.contactIds);
  }
  if (fx.runId) {
    await supabase
      .from('contacts')
      .delete()
      .eq('organization_id', fx.organizationId)
      .ilike('email', `%${fx.runId}%`);
    // Contatos criados via tool (ex.: createDeal com contactName) têm o runId no nome, não no email.
    await supabase
      .from('contacts')
      .delete()
      .eq('organization_id', fx.organizationId)
      .ilike('name', `%${fx.runId}%`);
  }

  // 3) Stages + boards criados no fixture
  if (boardIds.length) {
    assertNoSupabaseError(
      await supabase.from('board_stages').delete().eq('organization_id', fx.organizationId).in('board_id', boardIds),
      'delete board_stages (by board ids)',
    );
    assertNoSupabaseError(
      await supabase.from('boards').delete().eq('organization_id', fx.organizationId).in('id', boardIds),
      'delete boards (by ids)',
    );
  }

  // Modo auth-users (legado): se algum dia voltarmos a criar org/usuários, a limpeza abaixo vale.
  if (fx.created.organizationCreated) {
    assertNoSupabaseError(
      await supabase.from('organization_settings').delete().eq('organization_id', fx.organizationId),
      'delete organization_settings',
    );

    for (const id of fx.created.userIdsCreated) {
      const del = await supabase.auth.admin.deleteUser(id);
      if (del.error) console.warn('cleanup: failed to delete auth user', id, del.error);
    }

    await supabase.from('profiles').delete().eq('organization_id', fx.organizationId);

    assertNoSupabaseError(
      await supabase.from('organizations').delete().eq('id', fx.organizationId),
      'delete organizations',
    );
  }
}

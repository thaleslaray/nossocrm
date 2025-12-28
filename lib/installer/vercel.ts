type VercelTeam = {
  id: string;
  name: string;
  slug?: string;
};

type VercelProject = {
  id: string;
  name: string;
  accountId?: string;
  alias?: { domain: string }[];
  targets?: {
    production?: {
      alias?: string[];
    };
  };
};

type VercelEnv = {
  id: string;
  key: string;
  value?: string;
  target?: string[];
  type?: string;
};

type VercelDeployment = {
  id?: string;
  uid?: string;
  name?: string;
  target?: 'production' | 'preview' | 'development';
};

const VERCEL_API_BASE = 'https://api.vercel.com';

type VercelErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    invalidToken?: boolean;
  };
};

function formatVercelError(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as VercelErrorPayload;
    const err = parsed?.error;
    if (!err) return null;

    const message = err.message || '';
    const code = err.code || '';

    if (err.invalidToken || /invalid token/i.test(message)) {
      return 'Token da Vercel invalido ou expirado. Gere um novo token com Full Account.';
    }

    if (code === 'forbidden' || /not authorized/i.test(message)) {
      return 'Token da Vercel sem permissao para este projeto. Gere um token com Full Account.';
    }

    if (code === 'missing_scope' || code === 'insufficient_scope') {
      return 'Token da Vercel sem escopo necessario. Crie um token com Full Account.';
    }

    if (code === 'not_found') {
      return 'Recurso nao encontrado na Vercel para este token.';
    }

    if (message) {
      return `Erro da Vercel: ${message}`;
    }
  } catch {
    return null;
  }

  return null;
}

function buildUrl(path: string, teamId?: string) {
  const url = new URL(`${VERCEL_API_BASE}${path}`);
  if (teamId) url.searchParams.set('teamId', teamId);
  return url.toString();
}

async function vercelFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
  teamId?: string
): Promise<T> {
  const res = await fetch(buildUrl(path, teamId), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    const parsedMessage = text ? formatVercelError(text) : null;
    const message = parsedMessage || text || `Vercel API error (${res.status})`;
    throw new Error(message);
  }

  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Função pública `listVercelTeams` do projeto.
 *
 * @param {string} token - Parâmetro `token`.
 * @returns {Promise<VercelTeam[]>} Retorna um valor do tipo `Promise<VercelTeam[]>`.
 */
export async function listVercelTeams(token: string): Promise<VercelTeam[]> {
  const data = await vercelFetch<{ teams?: VercelTeam[] }>(
    '/v2/teams',
    token
  );
  return data.teams ?? [];
}

/**
 * Função pública `listVercelProjects` do projeto.
 *
 * @param {string} token - Parâmetro `token`.
 * @param {string | undefined} teamId - Identificador do recurso.
 * @returns {Promise<VercelProject[]>} Retorna um valor do tipo `Promise<VercelProject[]>`.
 */
export async function listVercelProjects(
  token: string,
  teamId?: string
): Promise<VercelProject[]> {
  const data = await vercelFetch<{ projects?: VercelProject[] }>(
    '/v9/projects',
    token,
    {},
    teamId
  );
  return data.projects ?? [];
}

async function listProjectEnvs(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelEnv[]> {
  const data = await vercelFetch<{ envs?: VercelEnv[] }>(
    `/v10/projects/${projectId}/env`,
    token,
    {},
    teamId
  );
  return data.envs ?? [];
}

async function updateEnv(
  token: string,
  projectId: string,
  envId: string,
  value: string,
  teamId?: string
) {
  await vercelFetch(
    `/v10/projects/${projectId}/env/${envId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    },
    teamId
  );
}

async function createEnv(
  token: string,
  projectId: string,
  payload: { key: string; value: string; target: string[]; type: 'encrypted' },
  teamId?: string
) {
  await vercelFetch(
    `/v10/projects/${projectId}/env`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    teamId
  );
}

/**
 * Função pública `upsertProjectEnvs` do projeto.
 *
 * @param {string} token - Parâmetro `token`.
 * @param {string} projectId - Identificador do recurso.
 * @param {{ key: string; value: string; targets: string[]; }[]} envs - Parâmetro `envs`.
 * @param {string | undefined} teamId - Identificador do recurso.
 * @returns {Promise<void>} Retorna uma Promise resolvida sem valor.
 */
export async function upsertProjectEnvs(
  token: string,
  projectId: string,
  envs: Array<{ key: string; value: string; targets: string[] }>,
  teamId?: string
) {
  const existing = await listProjectEnvs(token, projectId, teamId);

  for (const env of envs) {
    const handledTargets = new Set<string>();
    const matching = existing.filter((item) => item.key === env.key);

    for (const item of matching) {
      if (item.id) {
        await updateEnv(token, projectId, item.id, env.value, teamId);
        (item.target ?? []).forEach((target) => handledTargets.add(target));
      }
    }

    const targetsToCreate = env.targets.filter(
      (target) => !handledTargets.has(target)
    );

    if (targetsToCreate.length > 0) {
      await createEnv(
        token,
        projectId,
        {
          key: env.key,
          value: env.value,
          target: targetsToCreate,
          type: 'encrypted',
        },
        teamId
      );
    }
  }
}

/**
 * Função pública `triggerProjectRedeploy` do projeto.
 *
 * @param {string} token - Parâmetro `token`.
 * @param {string} projectId - Identificador do recurso.
 * @param {string | undefined} teamId - Identificador do recurso.
 * @returns {Promise<void>} Retorna uma Promise resolvida sem valor.
 */
export async function triggerProjectRedeploy(
  token: string,
  projectId: string,
  teamId?: string
) {
  // Prefer redeploying the latest *production* deployment so NEXT_PUBLIC_* is rebuilt
  // and the production domain starts using the new env vars.
  let data = await vercelFetch<{ deployments?: VercelDeployment[] }>(
    `/v6/deployments?projectId=${projectId}&target=production&limit=1`,
    token,
    {},
    teamId
  );

  let latest = data.deployments?.[0];

  // Fallback: if target filter isn't supported, pick production from recent deployments.
  if (!latest) {
    data = await vercelFetch<{ deployments?: VercelDeployment[] }>(
      `/v6/deployments?projectId=${projectId}&limit=5`,
      token,
      {},
      teamId
    );
    latest = data.deployments?.find((d) => d.target === 'production') ?? data.deployments?.[0];
  }
  // Vercel v13 endpoints generally expect the canonical `id` (e.g. "dpl_...").
  // Some responses also include `uid`; prefer `id` when present.
  const deploymentId = latest?.id ?? latest?.uid;
  if (!deploymentId) {
    throw new Error('No deployments found for this project.');
  }

  // Redeploy via criação de novo deployment (mais compatível do que "/redeploy" em alguns projetos)


  // A Vercel exige `name` no POST /v13/deployments.
  // Preferimos o nome do deployment listado; se não vier, caímos pro nome do projeto.
  let deploymentName = (latest as any)?.name as string | undefined;
  if (!deploymentName) {
    try {
      const proj = await vercelFetch<VercelProject>(`/v9/projects/${projectId}`, token, {}, teamId);
      deploymentName = proj?.name;
    } catch {
      // ignore
    }
  }
  if (!deploymentName) {
    throw new Error('Falha ao preparar redeploy: nome do deployment/projeto ausente.');
  }
  await vercelFetch(
    `/v13/deployments`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ deploymentId, name: deploymentName, target: 'production' }),
    },
    teamId
  );
}

/**
 * Função pública `validateVercelToken` do projeto.
 *
 * @param {string} token - Parâmetro `token`.
 * @returns {Promise<{ ok: true; userId: string; } | { ok: false; error: string; }>} Retorna um valor do tipo `Promise<{ ok: true; userId: string; } | { ok: false; error: string; }>`.
 */
export async function validateVercelToken(
  token: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  try {
    const data = await vercelFetch<{ user?: { id?: string } }>('/v2/user', token);
    const userId = data?.user?.id;
    if (!userId) {
      return { ok: false, error: 'Token invalido' };
    }
    return { ok: true, userId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token invalido';
    return { ok: false, error: message };
  }
}

/**
 * Função pública `getProject` do projeto.
 *
 * @param {string} token - Parâmetro `token`.
 * @param {string} projectId - Identificador do recurso.
 * @param {string | undefined} teamId - Identificador do recurso.
 * @returns {Promise<{ ok: true; project: VercelProject; } | { ok: false; error: string; }>} Retorna um valor do tipo `Promise<{ ok: true; project: VercelProject; } | { ok: false; error: string; }>`.
 */
export async function getProject(
  token: string,
  projectId: string,
  teamId?: string
): Promise<{ ok: true; project: VercelProject } | { ok: false; error: string }> {
  try {
    const project = await vercelFetch<VercelProject>(
      `/v9/projects/${projectId}`,
      token,
      {},
      teamId
    );
    if (!project?.id) {
      return { ok: false, error: 'Projeto nao encontrado' };
    }
    return { ok: true, project };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Projeto nao encontrado';
    return { ok: false, error: message };
  }
}

/**
 * Função pública `findProjectByDomain` do projeto.
 *
 * @param {string} token - Parâmetro `token`.
 * @param {string} domain - Parâmetro `domain`.
 * @returns {Promise<{ ok: true; project: VercelProject; } | { ok: false; error: string; }>} Retorna um valor do tipo `Promise<{ ok: true; project: VercelProject; } | { ok: false; error: string; }>`.
 */
export async function findProjectByDomain(
  token: string,
  domain: string
): Promise<{ ok: true; project: VercelProject } | { ok: false; error: string }> {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

  try {
    const domainResponse = await fetch(
      `${VERCEL_API_BASE}/v6/domains/${normalizedDomain}/config`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (domainResponse.ok) {
      const domainData = (await domainResponse.json()) as { configuredBy?: string };
      if (domainData?.configuredBy) {
        const projectResult = await getProject(token, domainData.configuredBy);
        if (projectResult.ok) {
          return { ok: true, project: projectResult.project };
        }
      }
    }
  } catch {
    // Ignore and fallback to other strategies
  }

  try {
    const projects = await listVercelProjects(token);

    for (const project of projects) {
      const projectAliases =
        project.alias?.map((alias) => alias.domain.toLowerCase()) || [];
      const targetAliases =
        project.targets?.production?.alias?.map((alias) => alias.toLowerCase()) ||
        [];
      const allAliases = [...projectAliases, ...targetAliases];

      if (allAliases.includes(normalizedDomain)) {
        return { ok: true, project };
      }
    }

    for (const project of projects) {
      const vercelDomain = `${project.name.toLowerCase()}.vercel.app`;
      if (normalizedDomain === vercelDomain) {
        return { ok: true, project };
      }
    }

    for (const project of projects) {
      try {
        const res = await fetch(
          `${VERCEL_API_BASE}/v9/projects/${project.id}/domains`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!res.ok) continue;
        const domainsData = (await res.json()) as { domains?: { name: string }[] };
        const domains = (domainsData.domains || []).map((d) =>
          d.name.toLowerCase()
        );
        if (domains.includes(normalizedDomain)) {
          return { ok: true, project };
        }
      } catch {
        // ignore
      }
    }

    if (
      normalizedDomain === 'localhost' ||
      normalizedDomain.startsWith('localhost:') ||
      normalizedDomain === '127.0.0.1' ||
      normalizedDomain.startsWith('127.0.0.1:')
    ) {
      if (projects.length > 0) {
        return { ok: true, project: projects[0] };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar projetos';
    return { ok: false, error: message };
  }

  return { ok: false, error: 'Projeto nao encontrado para este dominio' };
}

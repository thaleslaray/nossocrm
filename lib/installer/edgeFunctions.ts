import path from 'path';
import { promises as fs } from 'fs';

const SUPABASE_API_BASE = 'https://api.supabase.com';

export type SupabaseSecretUpsertResult =
  | { ok: true; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown };

export type SupabaseFunctionDeployResult =
  | { slug: string; ok: true; response: unknown }
  | { slug: string; ok: false; error: string; status?: number; response?: unknown };

type VerifyJwtBySlug = Map<string, boolean>;
type SupabaseApiKeyItem = {
  api_key?: string;
  name?: string;
  type?: string;
};

function safeJsonParse(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function buildManagementUrl(pathname: string): string {
  return `${SUPABASE_API_BASE}${pathname}`;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const asAny = payload as Record<string, unknown>;
  const message = asAny.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  const error = asAny.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return null;
}

async function supabaseManagementFetch(
  pathnameWithQuery: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string; data: unknown }> {
  const url = buildManagementUrl(pathnameWithQuery);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  const parsed = safeJsonParse(text);

  if (!res.ok) {
    const parsedMessage = parsed ? extractErrorMessage(parsed) : null;
    const message = parsedMessage || (typeof text === 'string' && text.trim() ? text.trim() : `Supabase API error (${res.status})`);
    return { ok: false, status: res.status, error: message, data: parsed ?? text };
  }

  return { ok: true, status: res.status, data: parsed ?? (text || {}) };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function getSupabaseProject(params: {
  accessToken: string;
  projectRef: string;
}): Promise<
  | {
      ok: true;
      project: { ref: string; name?: string; status?: string; region?: string; dbHost?: string };
      response: unknown;
    }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}`,
    params.accessToken,
    { method: 'GET' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const data = res.data as any;
  const status =
    typeof data?.status === 'string'
      ? data.status
      : typeof data?.project_status === 'string'
        ? data.project_status
        : typeof data?.projectStatus === 'string'
          ? data.projectStatus
          : undefined;

  const dbHost =
    typeof data?.database?.host === 'string'
      ? data.database.host
      : typeof data?.db_host === 'string'
        ? data.db_host
        : typeof data?.dbHost === 'string'
          ? data.dbHost
          : undefined;

  return {
    ok: true,
    project: {
      ref: params.projectRef,
      name: typeof data?.name === 'string' ? data.name : undefined,
      status,
      region: typeof data?.region === 'string' ? data.region : undefined,
      dbHost: dbHost?.trim() || undefined,
    },
    response: res.data,
  };
}

export async function waitForSupabaseProjectReady(params: {
  accessToken: string;
  projectRef: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<
  | { ok: true; status: string; response?: unknown }
  | { ok: false; error: string; lastStatus?: string; response?: unknown }
> {
  const timeoutMs = typeof params.timeoutMs === 'number' ? params.timeoutMs : 180_000;
  const pollMs = typeof params.pollMs === 'number' ? params.pollMs : 4_000;

  const t0 = Date.now();
  let lastStatus: string | undefined = undefined;
  let lastResponse: unknown | undefined = undefined;

  while (Date.now() - t0 < timeoutMs) {
    const res = await getSupabaseProject({ accessToken: params.accessToken, projectRef: params.projectRef });
    if (!res.ok) {
      // transient 404/5xx during provisioning happens; retry while within timeout
      lastResponse = res.response;
      await sleep(pollMs);
      continue;
    }

    lastResponse = res.response;
    lastStatus = res.project.status || '';
    const normalized = String(lastStatus || '').toUpperCase();
    if (normalized.startsWith('ACTIVE')) {
      return { ok: true, status: String(lastStatus || 'ACTIVE'), response: lastResponse };
    }

    await sleep(pollMs);
  }

  return {
    ok: false,
    error:
      `Projeto Supabase ainda está subindo (${lastStatus || 'status desconhecido'}). ` +
      'Aguarde um pouco e tente novamente.',
    lastStatus,
    response: lastResponse,
  };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts: number; baseDelayMs: number }
): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.maxAttempts) break;
      const jitter = Math.floor(Math.random() * 200);
      const delay = opts.baseDelayMs * Math.pow(2, attempt - 1) + jitter;
      await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Retry failed');
}

type SupabaseProjectListItem = {
  id?: number | string;
  ref?: string;
  name?: string;
  region?: string;
  created_at?: string;
  status?: string;
  organization_slug?: string;
  organizationSlug?: string;
};

type SupabaseOrgListItem = { id?: string; slug?: string; name?: string };
type SupabaseOrganizationDetails = { id?: string; name?: string; plan?: string };

type SupabaseOrgProjectsResponse = {
  projects?: SupabaseProjectListItem[];
  pagination?: { count?: number; limit?: number; offset?: number };
};

export async function listSupabaseProjects(params: { accessToken: string }): Promise<
  | { ok: true; projects: Array<{ ref: string; name: string; region?: string; status?: string; organizationSlug?: string }>; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch('/v1/projects', params.accessToken, { method: 'GET' });
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const items = (Array.isArray(res.data) ? res.data : []) as SupabaseProjectListItem[];
  const projects = items
    .map((p) => ({
      ref: typeof p.ref === 'string' ? p.ref : '',
      name: typeof p.name === 'string' ? p.name : '',
      region: typeof p.region === 'string' ? p.region : undefined,
      status: typeof p.status === 'string' ? p.status : undefined,
      organizationSlug:
        typeof p.organization_slug === 'string'
          ? p.organization_slug
          : typeof p.organizationSlug === 'string'
            ? p.organizationSlug
            : undefined,
    }))
    .filter((p) => p.ref && p.name);

  return { ok: true, projects, response: res.data };
}

export async function listSupabaseOrganizations(params: { accessToken: string }): Promise<
  | { ok: true; organizations: Array<{ slug: string; name: string; id?: string }>; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch('/v1/organizations', params.accessToken, { method: 'GET' });
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const items = (Array.isArray(res.data) ? res.data : []) as SupabaseOrgListItem[];
  const organizations = items
    .map((o) => ({
      slug: typeof o.slug === 'string' ? o.slug : '',
      name: typeof o.name === 'string' ? o.name : '',
      id: typeof o.id === 'string' ? o.id : undefined,
    }))
    .filter((o) => o.slug && o.name);

  return { ok: true, organizations, response: res.data };
}

export async function getSupabaseOrganization(params: {
  accessToken: string;
  organizationSlug: string;
}): Promise<
  | { ok: true; organization: { slug: string; name?: string; id?: string; plan?: string }; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/organizations/${encodeURIComponent(params.organizationSlug)}`,
    params.accessToken,
    { method: 'GET' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const details = res.data as SupabaseOrganizationDetails;
  return {
    ok: true,
    organization: {
      slug: params.organizationSlug,
      id: typeof details?.id === 'string' ? details.id : undefined,
      name: typeof details?.name === 'string' ? details.name : undefined,
      plan: typeof details?.plan === 'string' ? details.plan : undefined,
    },
    response: res.data,
  };
}

export async function listSupabaseOrganizationProjects(params: {
  accessToken: string;
  organizationSlug: string;
  statuses?: string[];
  offset?: number;
  limit?: number;
  search?: string;
}): Promise<
  | {
      ok: true;
      projects: Array<{ ref: string; name: string; region?: string; status?: string; organizationSlug?: string }>;
      pagination?: { count?: number; limit?: number; offset?: number };
      response: unknown;
    }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const qs = new URLSearchParams();
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset));
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.search === 'string' && params.search.trim()) qs.set('search', params.search.trim());
  if (Array.isArray(params.statuses) && params.statuses.length > 0) {
    qs.set('statuses', params.statuses.join(','));
  }

  const res = await supabaseManagementFetch(
    `/v1/organizations/${encodeURIComponent(params.organizationSlug)}/projects${qs.toString() ? `?${qs.toString()}` : ''}`,
    params.accessToken,
    { method: 'GET' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const payload = res.data as SupabaseOrgProjectsResponse;
  const items = (Array.isArray(payload?.projects) ? payload.projects : []) as SupabaseProjectListItem[];
  const projects = items
    .map((p) => ({
      ref: typeof p.ref === 'string' ? p.ref : '',
      name: typeof p.name === 'string' ? p.name : '',
      region: typeof p.region === 'string' ? p.region : undefined,
      status: typeof p.status === 'string' ? p.status : undefined,
      organizationSlug:
        typeof p.organization_slug === 'string'
          ? p.organization_slug
          : typeof p.organizationSlug === 'string'
            ? p.organizationSlug
            : params.organizationSlug,
    }))
    .filter((p) => p.ref && p.name);

  const pagination = payload?.pagination && typeof payload.pagination === 'object'
    ? {
        count: typeof payload.pagination.count === 'number' ? payload.pagination.count : undefined,
        limit: typeof payload.pagination.limit === 'number' ? payload.pagination.limit : undefined,
        offset: typeof payload.pagination.offset === 'number' ? payload.pagination.offset : undefined,
      }
    : undefined;

  return { ok: true, projects, pagination, response: res.data };
}

export async function listAllSupabaseOrganizationProjects(params: {
  accessToken: string;
  organizationSlug: string;
  statuses?: string[];
  search?: string;
}): Promise<
  | {
      ok: true;
      projects: Array<{ ref: string; name: string; region?: string; status?: string; organizationSlug?: string }>;
      response: unknown[];
    }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  // Supabase Management API enforces limit <= 100
  const limit = 100;
  let offset = 0;
  const all: Array<{ ref: string; name: string; region?: string; status?: string; organizationSlug?: string }> = [];
  const responses: unknown[] = [];

  for (let page = 0; page < 50; page++) {
    const res = await listSupabaseOrganizationProjects({
      accessToken: params.accessToken,
      organizationSlug: params.organizationSlug,
      statuses: params.statuses,
      search: params.search,
      limit,
      offset,
    });
    if (!res.ok) return res;
    responses.push(res.response);
    all.push(...res.projects);

    const count = res.pagination?.count;
    const pageSize = res.projects.length;
    if (typeof count === 'number') {
      if (all.length >= count) break;
    }
    if (pageSize < limit) break;
    offset += limit;
  }

  // Dedupe by ref (defensive)
  const seen = new Set<string>();
  const projects = all.filter((p) => {
    if (!p.ref) return false;
    if (seen.has(p.ref)) return false;
    seen.add(p.ref);
    return true;
  });

  return { ok: true, projects, response: responses };
}

export async function createSupabaseProject(params: {
  accessToken: string;
  organizationSlug: string;
  name: string;
  dbPass: string;
  regionSmartGroup?: 'americas' | 'emea' | 'apac';
  regionCode?: string;
}): Promise<
  | { ok: true; projectRef: string; projectName: string; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const body = {
    name: params.name,
    organization_slug: params.organizationSlug,
    db_pass: params.dbPass,
    region_selection: params.regionCode
      ? { type: 'region', code: params.regionCode }
      : params.regionSmartGroup
        ? { type: 'smartGroup', code: params.regionSmartGroup }
        : undefined,
  };

  const res = await supabaseManagementFetch('/v1/projects', params.accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const projectRef = (res.data as any)?.ref;
  const projectName = (res.data as any)?.name;
  if (typeof projectRef !== 'string' || !projectRef.trim() || typeof projectName !== 'string') {
    return { ok: false, error: 'Unexpected response creating project.', status: 500, response: res.data };
  }

  return { ok: true, projectRef: projectRef.trim(), projectName, response: res.data };
}

export async function pauseSupabaseProject(params: {
  accessToken: string;
  projectRef: string;
}): Promise<
  | { ok: true; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/pause`,
    params.accessToken,
    { method: 'POST' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };
  return { ok: true, response: res.data };
}

export async function restoreSupabaseProject(params: {
  accessToken: string;
  projectRef: string;
}): Promise<
  | { ok: true; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/restore`,
    params.accessToken,
    { method: 'POST' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };
  return { ok: true, response: res.data };
}

export async function deleteSupabaseProject(params: {
  accessToken: string;
  projectRef: string;
}): Promise<
  | { ok: true; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}`,
    params.accessToken,
    { method: 'DELETE' }
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };
  return { ok: true, response: res.data };
}

export function extractProjectRefFromSupabaseUrl(supabaseUrl: string): string | null {
  try {
    const url = new URL(supabaseUrl);
    const host = url.hostname.toLowerCase();

    // Most common: https://<ref>.supabase.co
    const m1 = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    if (m1?.[1]) return m1[1];

    // Sometimes: https://<ref>.supabase.in (regional)
    const m2 = host.match(/^([a-z0-9-]+)\.supabase\.in$/i);
    if (m2?.[1]) return m2[1];

    return null;
  } catch {
    return null;
  }
}

function pickApiKey(items: SupabaseApiKeyItem[], acceptedKinds: string[]): string | null {
  const accepted = acceptedKinds.map((k) => k.toLowerCase());

  const keyFromName = items.find((i) => {
    const name = typeof i.name === 'string' ? i.name.toLowerCase() : '';
    const okKind = accepted.some((k) => name.includes(k));
    return (
      okKind &&
      typeof i.api_key === 'string' &&
      i.api_key.trim()
    );
  })?.api_key;

  if (typeof keyFromName === 'string' && keyFromName.trim()) return keyFromName.trim();

  const keyFromType = items.find((i) => {
    const type = typeof i.type === 'string' ? i.type.toLowerCase() : '';
    const okKind = accepted.some((k) => type.includes(k));
    return (
      okKind &&
      typeof i.api_key === 'string' &&
      i.api_key.trim()
    );
  })?.api_key;

  if (typeof keyFromType === 'string' && keyFromType.trim()) return keyFromType.trim();

  return null;
}

export async function resolveSupabaseApiKeys(params: {
  projectRef: string;
  accessToken: string;
}): Promise<
  | {
      ok: true;
      publishableKey: string;
      secretKey: string;
      publishableKeyType: 'publishable' | 'anon';
      secretKeyType: 'secret' | 'service_role';
      response: unknown;
    }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/api-keys?reveal=true`,
    params.accessToken,
    { method: 'GET' }
  );

  if (!res.ok) return { ok: false, error: res.error, status: res.status, response: res.data };

  const items = (Array.isArray(res.data) ? res.data : []) as SupabaseApiKeyItem[];
  const publishableKey = pickApiKey(items, ['publishable', 'anon']);
  const secretKey = pickApiKey(items, ['secret', 'service_role']);

  const publishableKeyType: 'publishable' | 'anon' =
    pickApiKey(items, ['publishable']) ? 'publishable' : 'anon';
  const secretKeyType: 'secret' | 'service_role' =
    pickApiKey(items, ['secret']) ? 'secret' : 'service_role';

  if (!publishableKey || !secretKey) {
    return {
      ok: false,
      error:
        'Could not resolve project API keys (publishable/secret or anon/service_role) via Management API. Please paste them manually.',
      status: 500,
      response: res.data,
    };
  }

  return {
    ok: true,
    publishableKey,
    secretKey,
    publishableKeyType,
    secretKeyType,
    response: res.data,
  };
}

export async function resolveSupabaseDbUrlViaCliLoginRole(params: {
  projectRef: string;
  accessToken: string;
}): Promise<
  | { ok: true; dbUrl: string; role: string; ttlSeconds: number; host: string; response: unknown }
  | { ok: false; error: string; status?: number; response?: unknown }
> {
  const project = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}`,
    params.accessToken,
    { method: 'GET' }
  );
  if (!project.ok) {
    return { ok: false, error: project.error, status: project.status, response: project.data };
  }

  const host =
    (project.data as any)?.database?.host ||
    (project.data as any)?.db_host ||
    (project.data as any)?.dbHost;
  if (typeof host !== 'string' || !host.trim()) {
    return {
      ok: false,
      error: 'Could not resolve database host from project info.',
      status: 500,
      response: project.data,
    };
  }

  const loginRole = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/cli/login-role`,
    params.accessToken,
    { method: 'POST', body: JSON.stringify({ read_only: false }) }
  );
  if (!loginRole.ok) {
    const msg = String(loginRole.error || '');
    const lower = msg.toLowerCase();
    const looksLikeIpv4OnlyIssue =
      lower.includes('not ipv4') ||
      lower.includes('ipv6') ||
      lower.includes('econnrefused') ||
      lower.includes('address is not defined');

    return {
      ok: false,
      error: looksLikeIpv4OnlyIssue
        ? 'Conexão direta do banco parece ser IPv6-only (incompatível com IPv4). Use Connection Pooling (Transaction pooler / porta 6543) ou habilite o add-on de IPv4 no Supabase.'
        : msg,
      status: loginRole.status,
      response: loginRole.data,
    };
  }

  const role = (loginRole.data as any)?.role;
  const password = (loginRole.data as any)?.password;
  const ttlSecondsRaw = (loginRole.data as any)?.ttl_seconds;
  const ttlSeconds = typeof ttlSecondsRaw === 'number' ? ttlSecondsRaw : 0;
  if (typeof role !== 'string' || typeof password !== 'string' || !role.trim() || !password.trim()) {
    return {
      ok: false,
      error: 'Could not resolve CLI login role credentials.',
      status: 500,
      response: loginRole.data,
    };
  }

  // Prefer Transaction Pooler (6543) — helps IPv4-only environments when direct DB is IPv6-only.
  // Keep the role/password generated by the Management API.
  // Prefer Supavisor Transaction Pooler (porta 6543).
  // Doc oficial: postgres://postgres.[PROJECT_REF]:password@aws-0-REGION.pooler.supabase.com:6543/postgres
  // Fonte: https://supabase.com/docs/guides/troubleshooting/how-do-i-update-connection-pool-settings-in-my-dashboard-wAxTJ_

  let poolerHost: string | null = null;
  let poolerPort: number | null = null;
  let poolerDbName: string | null = null;

  const poolerConfig = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/config/database/pooler`,
    params.accessToken,
    { method: 'GET' }
  );

  if (poolerConfig.ok && Array.isArray(poolerConfig.data) && poolerConfig.data.length > 0) {
    const configs = poolerConfig.data as any[];
    const primary =
      configs.find(
        (c) =>
          String(c?.database_type || '').toUpperCase() === 'PRIMARY' &&
          String(c?.pool_mode || '').toLowerCase() === 'transaction'
      ) || configs[0];

    const h = primary?.db_host || primary?.dbHost;
    const pt = primary?.db_port || primary?.dbPort;
    const n = primary?.db_name || primary?.dbName;

    if (typeof h === 'string' && h.trim()) poolerHost = h.trim();
    if (typeof pt === 'number') poolerPort = pt;
    else if (typeof pt === 'string' && /^\d+$/.test(pt)) poolerPort = Number(pt);
    if (typeof n === 'string' && n.trim()) poolerDbName = n.trim();
  }

  // Fallback: usa o host do projeto (db.<ref>.supabase.co) se não conseguir resolver o pooler
  const finalHost = poolerHost || host.trim();
  const finalPort = poolerPort || 6543;
  const finalDbName = poolerDbName || 'postgres';

  // Supavisor exige o projectRef no username: role.projectRef
  const poolerUser = `${role}.${params.projectRef}`;
  const dbUrl = `postgresql://${encodeURIComponent(poolerUser)}:${encodeURIComponent(
    password
  )}@${finalHost}:${finalPort}/${finalDbName}?sslmode=require&pgbouncer=true`;

  return {
    ok: true,
    dbUrl,
    role,
    ttlSeconds,
    host: finalHost,
    response: { project: project.data, pooler: poolerConfig.data, loginRole: loginRole.data },
  };
}


export async function readVerifyJwtBySlug(
  configTomlPath = path.resolve(process.cwd(), 'supabase/config.toml')
): Promise<VerifyJwtBySlug> {
  const map: VerifyJwtBySlug = new Map();
  const raw = await fs.readFile(configTomlPath, 'utf8').catch(() => '');
  if (!raw.trim()) return map;

  let currentSlug: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const sectionMatch = trimmed.match(/^\[functions\.([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      currentSlug = sectionMatch[1].trim();
      continue;
    }

    if (!currentSlug) continue;

    const verifyMatch = trimmed.match(/^verify_jwt\s*=\s*(true|false)\s*$/i);
    if (verifyMatch?.[1]) {
      map.set(currentSlug, verifyMatch[1].toLowerCase() === 'true');
    }
  }

  return map;
}

async function existsFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function listFilesRecursive(
  rootDir: string,
  currentDir: string,
  out: Array<{ absPath: string; relPath: string }>
) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;

    const abs = path.join(currentDir, entry.name);
    const rel = path.relative(rootDir, abs).replaceAll(path.sep, '/');

    if (entry.isDirectory()) {
      await listFilesRecursive(rootDir, abs, out);
      continue;
    }
    if (!entry.isFile()) continue;

    if (entry.name === '.DS_Store') continue;

    out.push({ absPath: abs, relPath: rel });
  }
}

export async function listEdgeFunctionSlugs(
  functionsRootDir = path.resolve(process.cwd(), 'supabase/functions')
): Promise<string[]> {
  const entries = await fs.readdir(functionsRootDir, { withFileTypes: true }).catch(() => []);
  const slugs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const slug = entry.name;
    const dir = path.join(functionsRootDir, slug);

    // Only treat as a function if it has a clear entrypoint at root.
    const hasIndexTs = await existsFile(path.join(dir, 'index.ts'));
    const hasIndexTsx = await existsFile(path.join(dir, 'index.tsx'));
    if (!hasIndexTs && !hasIndexTsx) continue;

    slugs.push(slug);
  }

  return slugs.sort();
}

function buildDeployFormData(input: {
  entrypointPath: string;
  verifyJwt: boolean;
  importMapPath?: string;
}): FormData {
  const form = new FormData();

  const metadata = {
    entrypoint_path: input.entrypointPath,
    verify_jwt: input.verifyJwt,
    ...(input.importMapPath ? { import_map_path: input.importMapPath } : {}),
  };

  form.append('metadata', JSON.stringify(metadata));
  return form;
}

async function addFilesToFormData(form: FormData, functionDir: string) {
  const files: Array<{ absPath: string; relPath: string }> = [];
  await listFilesRecursive(functionDir, functionDir, files);

  for (const file of files) {
    const buf = await fs.readFile(file.absPath);
    const blob = new Blob([buf]);
    form.append('file', blob, file.relPath);
  }
}

export async function setSupabaseEdgeFunctionSecrets(params: {
  projectRef: string;
  accessToken: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<SupabaseSecretUpsertResult> {
  const res = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/secrets`,
    params.accessToken,
    {
      method: 'POST',
      body: JSON.stringify([
        // Supabase Management API rejects secrets starting with `SUPABASE_` (reserved prefix).
        // We use CRM_* and our Edge Functions read these first (with fallback).
        { name: 'CRM_SUPABASE_URL', value: params.supabaseUrl },
        { name: 'CRM_SUPABASE_ANON_KEY', value: params.anonKey },
        { name: 'CRM_SUPABASE_SERVICE_ROLE_KEY', value: params.serviceRoleKey },
      ]),
    }
  );

  if (!res.ok) {
    return { ok: false, error: res.error, status: res.status, response: res.data };
  }

  return { ok: true, response: res.data };
}

export async function deploySupabaseEdgeFunction(params: {
  projectRef: string;
  accessToken: string;
  slug: string;
  functionsRootDir?: string;
  verifyJwtBySlug?: VerifyJwtBySlug;
}): Promise<SupabaseFunctionDeployResult> {
  const functionsRootDir = params.functionsRootDir ?? path.resolve(process.cwd(), 'supabase/functions');
  const functionDir = path.join(functionsRootDir, params.slug);

  const hasIndexTs = await existsFile(path.join(functionDir, 'index.ts'));
  const hasIndexTsx = await existsFile(path.join(functionDir, 'index.tsx'));
  const entrypointPath = hasIndexTs ? 'index.ts' : hasIndexTsx ? 'index.tsx' : null;
  if (!entrypointPath) {
    return { slug: params.slug, ok: false, error: 'Entrypoint not found (expected index.ts or index.tsx)' };
  }

  const hasImportMap = await existsFile(path.join(functionDir, 'import_map.json'));
  const verifyJwt = params.verifyJwtBySlug?.get(params.slug) ?? true;

  const form = buildDeployFormData({
    entrypointPath,
    verifyJwt,
    importMapPath: hasImportMap ? 'import_map.json' : undefined,
  });
  await addFilesToFormData(form, functionDir);

  const deploy = await withRetry(
    async () => {
      const res = await supabaseManagementFetch(
        `/v1/projects/${encodeURIComponent(params.projectRef)}/functions/deploy?slug=${encodeURIComponent(params.slug)}`,
        params.accessToken,
        {
          method: 'POST',
          body: form,
        }
      );
      // Retry only on rate limit or server errors.
      if (!res.ok && (res.status === 429 || res.status >= 500)) {
        throw new Error(res.error);
      }
      return res;
    },
    { maxAttempts: 4, baseDelayMs: 750 }
  );

  if (!deploy.ok) {
    return { slug: params.slug, ok: false, error: deploy.error, status: deploy.status, response: deploy.data };
  }

  return { slug: params.slug, ok: true, response: deploy.data };
}

export async function deployAllSupabaseEdgeFunctions(params: {
  projectRef: string;
  accessToken: string;
  functionsRootDir?: string;
  configTomlPath?: string;
}): Promise<SupabaseFunctionDeployResult[]> {
  const functionsRootDir = params.functionsRootDir ?? path.resolve(process.cwd(), 'supabase/functions');
  const verifyJwtBySlug = await readVerifyJwtBySlug(
    params.configTomlPath ?? path.resolve(process.cwd(), 'supabase/config.toml')
  );
  const slugs = await listEdgeFunctionSlugs(functionsRootDir);

  const concurrency = 3;
  const results: SupabaseFunctionDeployResult[] = new Array(slugs.length);

  let cursor = 0;
  const worker = async () => {
    while (cursor < slugs.length) {
      const idx = cursor++;
      const slug = slugs[idx]!;
      results[idx] = await deploySupabaseEdgeFunction({
        projectRef: params.projectRef,
        accessToken: params.accessToken,
        slug,
        functionsRootDir,
        verifyJwtBySlug,
      });
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, slugs.length) }, () => worker());
  await Promise.all(workers);
  return results.filter(Boolean);
}

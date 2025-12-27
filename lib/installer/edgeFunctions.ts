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
    return { ok: false, error: loginRole.error, status: loginRole.status, response: loginRole.data };
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

  // Default Supabase DB port and name.
  const dbUrl = `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(
    password
  )}@${host.trim()}:5432/postgres?sslmode=require`;

  return { ok: true, dbUrl, role, ttlSeconds, host: host.trim(), response: { project: project.data, loginRole: loginRole.data } };
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
        { name: 'SUPABASE_URL', value: params.supabaseUrl },
        { name: 'SUPABASE_ANON_KEY', value: params.anonKey },
        { name: 'SUPABASE_SERVICE_ROLE_KEY', value: params.serviceRoleKey },
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

  const deploy = await supabaseManagementFetch(
    `/v1/projects/${encodeURIComponent(params.projectRef)}/functions/deploy?slug=${encodeURIComponent(params.slug)}`,
    params.accessToken,
    {
      method: 'POST',
      body: form,
    }
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

  const results: SupabaseFunctionDeployResult[] = [];
  for (const slug of slugs) {
    results.push(
      await deploySupabaseEdgeFunction({
        projectRef: params.projectRef,
        accessToken: params.accessToken,
        slug,
        functionsRootDir,
        verifyJwtBySlug,
      })
    );
  }
  return results;
}


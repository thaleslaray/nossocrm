import { z } from 'zod';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { runSchemaMigration } from '@/lib/installer/migrations';
import { bootstrapInstance } from '@/lib/installer/supabase';
import { triggerProjectRedeploy, upsertProjectEnvs } from '@/lib/installer/vercel';
import {
  deployAllSupabaseEdgeFunctions,
  extractProjectRefFromSupabaseUrl,
  resolveSupabaseApiKeys,
  resolveSupabaseDbUrlViaCliLoginRole,
  setSupabaseEdgeFunctionSecrets,
  type SupabaseFunctionDeployResult,
} from '@/lib/installer/edgeFunctions';

export const maxDuration = 300;
export const runtime = 'nodejs';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const RunSchema = z
  .object({
    installerToken: z.string().optional(),
    vercel: z.object({
      token: z.string().min(1),
      teamId: z.string().optional(),
      projectId: z.string().min(1),
      targets: z.array(z.enum(['production', 'preview'])).min(1),
    }),
    supabase: z.object({
      url: z.string().url(),
      anonKey: z.string().min(1).optional(),
      serviceRoleKey: z.string().min(1).optional(),
      dbUrl: z.string().min(1).optional(),
      accessToken: z.string().optional(),
      projectRef: z.string().optional(),
      deployEdgeFunctions: z.boolean().default(true),
    }),
    admin: z.object({
      companyName: z.string().min(1).max(200),
      email: z.string().email(),
      password: z.string().min(6),
    }),
  })
  .strict();

type StepStatus = 'ok' | 'error' | 'warning' | 'running';
type Step = { id: string; status: StepStatus; message?: string };

function updateStep(steps: Step[], id: string, status: StepStatus, message?: string) {
  const step = steps.find((item) => item.id === id);
  if (step) {
    step.status = status;
    if (message) step.message = message;
  } else {
    steps.push({ id, status, message });
  }
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  if (process.env.INSTALLER_ENABLED === 'false') {
    return json({ error: 'Installer disabled' }, 403);
  }

  const raw = await req.json().catch(() => null);
  const parsed = RunSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const expectedToken = process.env.INSTALLER_TOKEN;
  if (expectedToken && parsed.data.installerToken !== expectedToken) {
    return json({ error: 'Invalid installer token' }, 403);
  }

  const steps: Step[] = [];
  let currentStep: string | null = null;
  let functions: SupabaseFunctionDeployResult[] | undefined;

  const startStep = (id: string) => {
    currentStep = id;
    updateStep(steps, id, 'running', 'Starting');
  };
  const finishStep = (id: string, message: string) => {
    updateStep(steps, id, 'ok', message);
    currentStep = null;
  };
  const finishStepWithStatus = (id: string, status: StepStatus, message: string) => {
    updateStep(steps, id, status, message);
    currentStep = null;
  };

  const { vercel, supabase, admin } = parsed.data;
  const envTargets = vercel.targets;

  try {
    // Magic: if the student provided a PAT, we can resolve missing Supabase fields automatically.
    const resolvedProjectRef =
      supabase.projectRef?.trim() ||
      extractProjectRefFromSupabaseUrl(supabase.url) ||
      '';
    const resolvedAccessToken = supabase.accessToken?.trim() || '';

    let resolvedAnonKey = supabase.anonKey?.trim() || '';
    let resolvedServiceRoleKey = supabase.serviceRoleKey?.trim() || '';
    let resolvedDbUrl = supabase.dbUrl?.trim() || '';

    const needsKeys = !resolvedAnonKey || !resolvedServiceRoleKey;
    const needsDb = !resolvedDbUrl;
    const needsManagementApi = needsKeys || needsDb || supabase.deployEdgeFunctions;

    if (needsManagementApi && (!resolvedAccessToken || !resolvedProjectRef)) {
      const message = !resolvedAccessToken
        ? 'Missing Supabase access token (supabase.accessToken) to auto-resolve installer inputs.'
        : 'Missing Supabase project ref (supabase.projectRef) and could not infer from supabase.url.';
      return json({ ok: false, steps, error: message }, 400);
    }

    if (needsKeys) {
      const keys = await resolveSupabaseApiKeys({
        projectRef: resolvedProjectRef,
        accessToken: resolvedAccessToken,
      });
      if (!keys.ok) {
        return json(
          { ok: false, steps, error: `Failed to resolve Supabase API keys: ${keys.error}` },
          400
        );
      }
      // Prefer modern keys when present: publishable/secret. Fallback to anon/service_role.
      resolvedAnonKey = keys.publishableKey;
      resolvedServiceRoleKey = keys.secretKey;
    }

    if (needsDb) {
      const db = await resolveSupabaseDbUrlViaCliLoginRole({
        projectRef: resolvedProjectRef,
        accessToken: resolvedAccessToken,
      });
      if (!db.ok) {
        return json(
          {
            ok: false,
            steps,
            error:
              `Failed to resolve database connection via Management API: ${db.error}. ` +
              'Please paste a DB connection string manually.',
          },
          400
        );
      }
      resolvedDbUrl = db.dbUrl;
    }

    startStep('vercel_envs');
    await upsertProjectEnvs(
      vercel.token,
      vercel.projectId,
      [
        {
          key: 'NEXT_PUBLIC_SUPABASE_URL',
          value: supabase.url,
          targets: envTargets,
        },
        {
          key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
          value: resolvedAnonKey,
          targets: envTargets,
        },
        {
          key: 'SUPABASE_SERVICE_ROLE_KEY',
          value: resolvedServiceRoleKey,
          targets: envTargets,
        },
        {
          key: 'INSTALLER_ENABLED',
          value: 'false',
          targets: envTargets,
        },
      ],
      vercel.teamId || undefined
    );
    finishStep('vercel_envs', 'Environment variables configured (installer will be disabled).');

    startStep('supabase_migrations');
    await runSchemaMigration(resolvedDbUrl);
    finishStep('supabase_migrations', 'Schema applied.');

    startStep('supabase_edge_functions');
    if (!supabase.deployEdgeFunctions) {
      finishStep('supabase_edge_functions', 'Skipped (deployEdgeFunctions=false).');
    } else {
      const secrets = await setSupabaseEdgeFunctionSecrets({
        projectRef: resolvedProjectRef,
        accessToken: resolvedAccessToken,
        supabaseUrl: supabase.url,
        anonKey: resolvedAnonKey,
        serviceRoleKey: resolvedServiceRoleKey,
      });

      if (!secrets.ok) {
        const message = `Failed to set Edge Function secrets: ${secrets.error}`;
        updateStep(steps, 'supabase_edge_functions', 'error', message);
        currentStep = null;
        return json({ ok: false, steps, error: message }, 500);
      }

      functions = await deployAllSupabaseEdgeFunctions({
        projectRef: resolvedProjectRef,
        accessToken: resolvedAccessToken,
      });
      const failed = functions.filter((f) => !f.ok).length;
      if (failed > 0) {
        finishStepWithStatus(
          'supabase_edge_functions',
          'warning',
          `Deployed with ${failed} failure(s).`
        );
      } else {
        finishStep('supabase_edge_functions', `Deployed ${functions.length} function(s).`);
      }
    }

    startStep('supabase_bootstrap');
    const bootstrap = await bootstrapInstance({
      supabaseUrl: supabase.url,
      serviceRoleKey: resolvedServiceRoleKey,
      companyName: admin.companyName,
      email: admin.email,
      password: admin.password,
    });

    if (!bootstrap.ok) {
      updateStep(steps, 'supabase_bootstrap', 'error', bootstrap.error);
      return json({ ok: false, steps, error: bootstrap.error }, 400);
    }
    finishStep('supabase_bootstrap', `Organization ${bootstrap.organizationId} created.`);

    try {
      await triggerProjectRedeploy(
        vercel.token,
        vercel.projectId,
        vercel.teamId || undefined
      );
      updateStep(steps, 'vercel_redeploy', 'ok', 'Redeploy triggered.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to redeploy via Vercel API';
      updateStep(steps, 'vercel_redeploy', 'warning', message);
    }

    return json({ ok: true, steps, functions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Installer failed';
    if (currentStep) {
      updateStep(steps, currentStep, 'error', message);
    }
    return json({ ok: false, steps, functions, error: message }, 500);
  }
}

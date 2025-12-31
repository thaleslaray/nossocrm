import { z } from 'zod';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { runSchemaMigration } from '@/lib/installer/migrations';
import { bootstrapInstance } from '@/lib/installer/supabase';
import { triggerProjectRedeploy, upsertProjectEnvs, waitForVercelDeploymentReady } from '@/lib/installer/vercel';
import { validateInstallerPassword } from '@/lib/installer/passwordPolicy';
import {
  deployAllSupabaseEdgeFunctions,
  extractProjectRefFromSupabaseUrl,
  listEdgeFunctionSlugs,
  resolveSupabaseApiKeys,
  resolveSupabaseDbUrlViaCliLoginRole,
  setSupabaseEdgeFunctionSecrets,
  waitForSupabaseProjectReady,
  type SupabaseFunctionDeployResult,
} from '@/lib/installer/edgeFunctions';

export const maxDuration = 300;
export const runtime = 'nodejs';

// Health check result schema (from /api/installer/health-check)
const HealthCheckResultSchema = z.object({
  skipWaitProject: z.boolean().default(false),
  skipWaitStorage: z.boolean().default(false),
  skipMigrations: z.boolean().default(false),
  skipBootstrap: z.boolean().default(false),
  estimatedSeconds: z.number().default(120),
}).optional();

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
      password: z.string().superRefine((val, ctx) => {
        const r = validateInstallerPassword(val);
        if (!r.ok) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
        }
      }),
    }),
    // Health check result to skip unnecessary steps
    healthCheck: HealthCheckResultSchema,
  })
  .strict();

// Step definitions for dynamic progress calculation
interface Step {
  id: string;
  phase: PhaseId;
  weight: number; // Relative weight for progress calculation
  skippable: boolean;
}

const ALL_STEPS: Step[] = [
  { id: 'resolve_keys', phase: 'coordinates', weight: 10, skippable: false },
  { id: 'setup_envs', phase: 'coordinates', weight: 10, skippable: false },
  { id: 'wait_project', phase: 'signal', weight: 25, skippable: true },
  { id: 'wait_storage', phase: 'station', weight: 15, skippable: true },
  { id: 'migrations', phase: 'station', weight: 15, skippable: true },
  { id: 'edge_secrets', phase: 'comms', weight: 5, skippable: false },
  { id: 'edge_deploy', phase: 'comms', weight: 10, skippable: false },
  { id: 'bootstrap', phase: 'contact', weight: 5, skippable: true },
  { id: 'redeploy', phase: 'landing', weight: 5, skippable: false },
  { id: 'wait_vercel_deploy', phase: 'landing', weight: 3, skippable: false },
];

// Mapeamento cinematográfico Interstellar
function createCinemaPhases(firstName: string) {
  return {
    coordinates: {
      id: 'coordinates',
      title: 'Calibrando coordenadas',
      subtitle: 'Definindo rota para o destino...',
    },
    signal: {
      id: 'signal',
      title: 'Aguardando sinal',
      subtitle: 'Confirmando conexão com o destino...',
    },
    station: {
      id: 'station',
      title: 'Construindo a estação',
      subtitle: 'Preparando infraestrutura...',
    },
    comms: {
      id: 'comms',
      title: 'Ativando comunicadores',
      subtitle: 'Estabelecendo canais de comunicação...',
    },
    contact: {
      id: 'contact',
      title: 'Primeiro contato',
      subtitle: 'Criando sua identidade no novo mundo...',
    },
    landing: {
      id: 'landing',
      title: 'Preparando pouso',
      subtitle: 'Finalizando a jornada...',
    },
    complete: {
      id: 'complete',
      title: `Missão cumprida, ${firstName}!`,
      subtitle: 'Bem-vindo ao novo mundo.',
    },
  } as const;
}

type PhaseId = 'coordinates' | 'signal' | 'station' | 'comms' | 'contact' | 'landing' | 'complete';

interface StreamEvent {
  type: 'phase' | 'progress' | 'error' | 'complete' | 'skip' | 'retry' | 'step_complete' | 'vercel_deploy';
  phase?: PhaseId;
  title?: string;
  subtitle?: string;
  progress?: number; // 0-100
  error?: string;
  ok?: boolean;
  skipped?: string[]; // List of skipped steps
  stepId?: string;
  retryCount?: number;
  maxRetries?: number;
  deploymentId?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function verifyPasswordLogin(params: {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = params.supabaseUrl.replace(/\/$/, '');
  const url = base + '/auth/v1/token?grant_type=password';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: params.anonKey,
        Authorization: 'Bearer ' + params.anonKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: params.email, password: params.password }),
    });

    if (res.ok) return { ok: true };

    const data = (await res.json().catch(() => null)) as any;
    const msg =
      data?.error_description ||
      data?.msg ||
      data?.message ||
      data?.error ||
      ('HTTP ' + res.status);

    return { ok: false, error: String(msg) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha ao validar login' };
  }
}


// Helper for retry logic
async function withRetry<T>(
  stepId: string,
  fn: () => Promise<T>,
  sendEvent: (event: StreamEvent) => Promise<void>,
  isRetryable: (err: unknown) => boolean = () => true
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      lastError = err;
      
      if (!isRetryable(err) || attempt === MAX_RETRIES) {
        throw err;
      }
      
      console.log(`[run-stream] Step ${stepId} failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
      await sendEvent({
        type: 'retry',
        stepId,
        retryCount: attempt,
        maxRetries: MAX_RETRIES,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
  
  throw lastError;
}

// Calculate progress based on active steps
function createProgressCalculator(skippedStepIds: string[]) {
  const activeSteps = ALL_STEPS.filter(s => !skippedStepIds.includes(s.id));
  const totalWeight = activeSteps.reduce((sum, s) => sum + s.weight, 0);
  
  let completedWeight = 0;
  
  return {
    activeSteps,
    totalWeight,
    // Mark a step as complete and return new progress
    completeStep(stepId: string): number {
      const step = activeSteps.find(s => s.id === stepId);
      if (step) {
        completedWeight += step.weight;
      }
      return Math.min(Math.round((completedWeight / totalWeight) * 100), 99);
    },
    // Get progress for partial completion of a step
    partialProgress(stepId: string, fraction: number): number {
      const step = activeSteps.find(s => s.id === stepId);
      if (!step) return Math.round((completedWeight / totalWeight) * 100);
      const partial = step.weight * Math.min(fraction, 1);
      return Math.min(Math.round(((completedWeight + partial) / totalWeight) * 100), 99);
    },
    // Get current phase for a step
    getPhase(stepId: string): PhaseId {
      const step = ALL_STEPS.find(s => s.id === stepId);
      return step?.phase || 'coordinates';
    },
  };
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  if (process.env.INSTALLER_ENABLED === 'false') {
    return new Response(JSON.stringify({ error: 'Installer disabled' }), { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = RunSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', details: parsed.error.flatten() }), { status: 400 });
  }

  const expectedToken = process.env.INSTALLER_TOKEN;
  if (expectedToken && parsed.data.installerToken !== expectedToken) {
    return new Response(JSON.stringify({ error: 'Invalid installer token' }), { status: 403 });
  }

  const { vercel, supabase, admin, healthCheck } = parsed.data;
  const envTargets = vercel.targets;
  
  // Determine which steps to skip based on health check
  const skippedSteps: string[] = [];
  if (healthCheck?.skipWaitProject) skippedSteps.push('wait_project');
  if (healthCheck?.skipWaitStorage) skippedSteps.push('wait_storage');
  if (healthCheck?.skipMigrations) skippedSteps.push('migrations');
  // NOTE: não pulamos o bootstrap: ele é a garantia de que o admin informado consegue logar.
  // (Se o login já estiver ok, ele vira um no-op.)
  
  // Extrai primeiro nome para personalização
  const firstName = admin.companyName.split(' ')[0] || 'você';
  const PHASES = createCinemaPhases(firstName);
  
  // Create progress calculator
  const progress = createProgressCalculator(skippedSteps);

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: StreamEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  const sendPhase = async (stepId: string, partialFraction?: number) => {
    const phase = progress.getPhase(stepId);
    const p = PHASES[phase];
    const prog = partialFraction !== undefined 
      ? progress.partialProgress(stepId, partialFraction)
      : progress.completeStep(stepId);
    await sendEvent({ type: 'phase', stepId, phase, title: p.title, subtitle: p.subtitle, progress: prog });
  };

  // Run installation in background
  (async () => {
    let functions: SupabaseFunctionDeployResult[] | undefined;

    try {
      // Send initial event with skipped steps info
      if (skippedSteps.length > 0) {
        await sendEvent({ type: 'skip', skipped: skippedSteps });
        console.log('[run-stream] Skipping steps:', skippedSteps);
      }

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

      const localEdgeFunctionSlugs = supabase.deployEdgeFunctions
        ? await listEdgeFunctionSlugs()
        : [];
      const hasLocalEdgeFunctions = localEdgeFunctionSlugs.length > 0;

      const needsManagementApi =
        needsKeys || needsDb || (supabase.deployEdgeFunctions && hasLocalEdgeFunctions);

      if (needsManagementApi && (!resolvedAccessToken || !resolvedProjectRef)) {
        const message = !resolvedAccessToken
          ? 'Token de acesso Supabase não fornecido.'
          : 'Referência do projeto Supabase não encontrada.';
        await sendEvent({ type: 'error', error: message });
        await writer.close();
        return;
      }

      // Step: resolve_keys
      await sendPhase('resolve_keys', 0);

      if (needsKeys) {
        const keys = await withRetry(
          'resolve_keys',
          async () => {
            const result = await resolveSupabaseApiKeys({
              projectRef: resolvedProjectRef,
              accessToken: resolvedAccessToken,
            });
            if (!result.ok) throw new Error('Falha ao obter chaves de acesso.');
            return result;
          },
          sendEvent
        );
        resolvedAnonKey = keys.publishableKey;
        resolvedServiceRoleKey = keys.secretKey;
      }

      await sendPhase('resolve_keys', 0.5);

      if (needsDb) {
        const db = await withRetry(
          'resolve_db',
          async () => {
            const result = await resolveSupabaseDbUrlViaCliLoginRole({
              projectRef: resolvedProjectRef,
              accessToken: resolvedAccessToken,
            });
            if (!result.ok) throw new Error('Falha ao conectar com o banco de dados.');
            return result;
          },
          sendEvent
        );
        resolvedDbUrl = db.dbUrl;
      }

      await sendPhase('resolve_keys'); // Complete

      // Step: setup_envs
      await sendPhase('setup_envs', 0);

      await upsertProjectEnvs(
        vercel.token,
        vercel.projectId,
        [
          { key: 'NEXT_PUBLIC_SUPABASE_URL', value: supabase.url, targets: envTargets },
          { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: resolvedAnonKey, targets: envTargets },
          { key: 'SUPABASE_SERVICE_ROLE_KEY', value: resolvedServiceRoleKey, targets: envTargets },
        ],
        vercel.teamId || undefined
      );

      await sendPhase('setup_envs'); // Complete

      // Step: wait_project (skippable)
      if (!skippedSteps.includes('wait_project')) {
        await sendPhase('wait_project', 0);
        
        if (resolvedAccessToken && resolvedProjectRef) {
          // Poll with progress updates
          const startTime = Date.now();
          const timeoutMs = 210_000;
          const pollMs = 4_000;
          
          while (Date.now() - startTime < timeoutMs) {
            const ready = await waitForSupabaseProjectReady({
              accessToken: resolvedAccessToken,
              projectRef: resolvedProjectRef,
              timeoutMs: pollMs,
              pollMs: pollMs,
            });
            
            if (ready.ok) break;
            
            // Update progress based on elapsed time
            const elapsed = Date.now() - startTime;
            const fraction = Math.min(elapsed / timeoutMs, 0.95);
            await sendPhase('wait_project', fraction);
          }
        }
        
        await sendPhase('wait_project'); // Complete
      }

      // Step: wait_storage + migrations (combined in station phase)
      if (!skippedSteps.includes('wait_storage') || !skippedSteps.includes('migrations')) {
        if (!skippedSteps.includes('wait_storage')) {
          await sendPhase('wait_storage', 0);
        }
        
        if (!skippedSteps.includes('migrations')) {
          await sendPhase('migrations', 0);
          
          // runSchemaMigration internally waits for storage - with retry
          await withRetry(
            'migrations',
            async () => {
              await runSchemaMigration(resolvedDbUrl);
            },
            sendEvent,
            (err) => {
              // Don't retry if it's a schema conflict (already applied)
              const msg = err instanceof Error ? err.message : '';
              return !msg.includes('already exists');
            }
          );
          
          await sendPhase('migrations'); // Complete
        }
        
        if (!skippedSteps.includes('wait_storage')) {
          await sendPhase('wait_storage'); // Complete (done as part of migrations)
        }
      }

      // Step: edge_secrets + edge_deploy
      await sendPhase('edge_secrets', 0);

      if (supabase.deployEdgeFunctions && hasLocalEdgeFunctions) {
        await withRetry(
          'edge_secrets',
          async () => {
            const secrets = await setSupabaseEdgeFunctionSecrets({
              projectRef: resolvedProjectRef,
              accessToken: resolvedAccessToken,
              supabaseUrl: supabase.url,
              anonKey: resolvedAnonKey,
              serviceRoleKey: resolvedServiceRoleKey,
            });
            if (!secrets.ok) throw new Error('Falha ao configurar comunicadores.');
          },
          sendEvent
        );

        await sendPhase('edge_secrets'); // Complete
        await sendPhase('edge_deploy', 0);

        functions = await withRetry(
          'edge_deploy',
          async () => {
            return await deployAllSupabaseEdgeFunctions({
              projectRef: resolvedProjectRef,
              accessToken: resolvedAccessToken,
            });
          },
          sendEvent
        );
        
        await sendPhase('edge_deploy'); // Complete
      } else {
        await sendPhase('edge_secrets'); // Complete
        await sendPhase('edge_deploy'); // Complete (nothing to deploy)
      }

      // Step: bootstrap (skippable)
      if (!skippedSteps.includes('bootstrap')) {
        await sendPhase('bootstrap', 0);

        await withRetry(
          'bootstrap',
          async () => {
            // Se o login já funciona com a senha informada, podemos tratar como no-op.
            // Caso contrário, rodamos o bootstrap (idempotente) para criar/ajustar credenciais e validamos de novo.
            const login1 = await verifyPasswordLogin({
              supabaseUrl: supabase.url,
              anonKey: resolvedAnonKey,
              email: admin.email,
              password: admin.password,
            });

            if (login1.ok) {
              console.log('[run-stream] bootstrap: login já ok, pulando ajuste de credenciais');
              return;
            }

            console.log('[run-stream] bootstrap: login falhou, garantindo credenciais via bootstrap…', login1.error);

            const bootstrap = await bootstrapInstance({
              supabaseUrl: supabase.url,
              serviceRoleKey: resolvedServiceRoleKey,
              companyName: admin.companyName,
              email: admin.email,
              password: admin.password,
            });

            if (!bootstrap.ok) throw new Error(bootstrap.error || 'Falha ao estabelecer primeiro contato.');

            const login2 = await verifyPasswordLogin({
              supabaseUrl: supabase.url,
              anonKey: resolvedAnonKey,
              email: admin.email,
              password: admin.password,
            });

            if (!login2.ok) {
              throw new Error('Não conseguimos validar seu login com a senha informada. ' + login2.error);
            }
          },
          sendEvent,
          (err) => {
            // Don't retry if user already exists
            const msg = err instanceof Error ? err.message : '';
            return !msg.includes('already exists') && !msg.includes('already registered');
          }
        );

        await sendPhase('bootstrap'); // Complete
      }

      // Step: redeploy
      await sendPhase('redeploy', 0);

      let vercelDeploymentId: string | null = null;

      try {
        const redeploy = await triggerProjectRedeploy(
          vercel.token,
          vercel.projectId,
          vercel.teamId || undefined
        );
        vercelDeploymentId = redeploy.deploymentId;
        await sendEvent({ type: 'vercel_deploy', deploymentId: vercelDeploymentId });
      } catch (err) {
        // Redeploy é obrigatório para aplicar NEXT_PUBLIC_* no build do Next.js.
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          'Falha ao iniciar redeploy na Vercel (necessário para aplicar as variáveis do Supabase). ' +
            'Abra o projeto na Vercel → Deployments → Redeploy e tente novamente. ' +
            (msg ? 'Detalhe: ' + msg : '')
        );
      }

      await sendPhase('redeploy'); // Complete

      // Step: wait_vercel_deploy (aguarda o deployment ficar READY)
      await sendPhase('wait_vercel_deploy', 0);

      if (!vercelDeploymentId) {
        throw new Error('Falha ao acompanhar redeploy: deploymentId ausente.');
      }

      const wait = await waitForVercelDeploymentReady({
        token: vercel.token,
        deploymentId: vercelDeploymentId,
        teamId: vercel.teamId || undefined,
        timeoutMs: 240_000,
        pollMs: 2_500,
        onTick: async ({ readyState, elapsedMs }) => {
          const fraction = Math.min(elapsedMs / 240_000, 0.95);

          // UI: mantém narrativa limpa; apenas avança a barra de progresso.
          await sendPhase('wait_vercel_deploy', fraction);

          // Console: telemetria detalhada (para debug)
          const sec = Math.max(0, Math.round(elapsedMs / 1000));
          const rs = String(readyState || 'DESCONHECIDO').toUpperCase();
          console.log('[run-stream] wait_vercel_deploy:', rs, sec + 's');
        },
      });

      if (!wait.ok) {
        throw new Error(
          'Redeploy disparado, mas ainda não finalizou na Vercel. ' +
            'Abra o projeto na Vercel → Deployments e aguarde o status ficar READY.'
        );
      }

      await sendPhase('wait_vercel_deploy'); // Complete

      // Só desabilita o instalador APÓS tudo estar completo
      await upsertProjectEnvs(
        vercel.token,
        vercel.projectId,
        [{ key: 'INSTALLER_ENABLED', value: 'false', targets: envTargets }],
        vercel.teamId || undefined
      );

      // Complete!
      const completePhase = PHASES['complete'];
      await sendEvent({ 
        type: 'phase', 
        phase: 'complete', 
        title: completePhase.title, 
        subtitle: completePhase.subtitle, 
        progress: 100 
      });
      await sendEvent({ type: 'complete', ok: true });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro durante a missão.';
      await sendEvent({ type: 'error', error: message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

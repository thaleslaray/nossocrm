import { z } from 'zod';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import {
  extractProjectRefFromSupabaseUrl,
  resolveSupabaseApiKeys,
  resolveSupabaseDbUrlViaCliLoginRole,
} from '@/lib/installer/edgeFunctions';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const ResolveSchema = z
  .object({
    installerToken: z.string().optional(),
    accessToken: z.string().min(1),
    supabaseUrl: z.string().url().optional(),
    projectRef: z.string().min(1).optional(),
  })
  .strict();

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  if (process.env.INSTALLER_ENABLED === 'false') {
    return json({ error: 'Installer disabled' }, 403);
  }

  const raw = await req.json().catch(() => null);
  const parsed = ResolveSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const expectedToken = process.env.INSTALLER_TOKEN;
  if (expectedToken && parsed.data.installerToken !== expectedToken) {
    return json({ error: 'Invalid installer token' }, 403);
  }

  const accessToken = parsed.data.accessToken.trim();
  const projectRef =
    parsed.data.projectRef?.trim() ||
    (parsed.data.supabaseUrl
      ? extractProjectRefFromSupabaseUrl(parsed.data.supabaseUrl)
      : null) ||
    '';

  if (!projectRef) {
    return json(
      {
        error:
          'Missing Supabase project ref (projectRef) and could not infer from supabaseUrl.',
      },
      400
    );
  }

  const [keys, db] = await Promise.all([
    resolveSupabaseApiKeys({ projectRef, accessToken }),
    resolveSupabaseDbUrlViaCliLoginRole({ projectRef, accessToken }),
  ]);

  const warnings: string[] = [];
  if (!keys.ok) warnings.push(`keys: ${keys.error}`);
  if (!db.ok) warnings.push(`db: ${db.error}`);

  return json({
    ok: true,
    projectRef,
    supabaseUrl:
      parsed.data.supabaseUrl?.trim() || `https://${projectRef}.supabase.co`,
    publishableKey: keys.ok ? keys.publishableKey : null,
    secretKey: keys.ok ? keys.secretKey : null,
    publishableKeyType: keys.ok ? keys.publishableKeyType : null,
    secretKeyType: keys.ok ? keys.secretKeyType : null,
    dbUrl: db.ok ? db.dbUrl : null,
    ttlSeconds: db.ok ? db.ttlSeconds : null,
    warnings,
  });
}


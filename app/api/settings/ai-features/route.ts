import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Handler HTTP `GET` deste endpoint (Next.js Route Handler).
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (meError || !me?.organization_id) return json({ error: 'Profile not found' }, 404);

  const { data, error } = await supabase
    .from('ai_feature_flags')
    .select('key, enabled, updated_at')
    .eq('organization_id', me.organization_id);

  if (error) {
    console.error('[API] Database error:', error)
    return json({ error: 'Internal server error' }, 500)
  }

  const flags: Record<string, boolean> = {};
  for (const row of data || []) flags[row.key] = Boolean(row.enabled);

  return json({
    isAdmin: me.role === 'admin',
    flags,
  });
}

const UpdateFeatureSchema = z
  .object({
    key: z.string().min(3).max(120),
    enabled: z.boolean(),
  })
  .strict();

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (meError || !me?.organization_id) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const rawBody = await req.json().catch(() => null);
  const parsed = UpdateFeatureSchema.safeParse(rawBody);
  if (!parsed.success) return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);

  const { key, enabled } = parsed.data;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('ai_feature_flags')
    .upsert(
      {
        organization_id: me.organization_id,
        key,
        enabled,
        updated_at: now,
      },
      { onConflict: 'organization_id,key' }
    );

  if (error) {
    console.error('[API] Database error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
  return json({ ok: true });
}


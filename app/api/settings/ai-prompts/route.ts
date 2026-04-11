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
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .select('key, version, is_active, updated_at')
    .eq('organization_id', me.organization_id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[API] Database error:', error)
    return json({ error: 'Internal server error' }, 500)
  }

  // Map: key -> active version metadata (if any)
  const activeByKey: Record<string, { version: number; updatedAt: string }> = {};
  for (const row of data || []) {
    if (row.is_active && !activeByKey[row.key]) {
      activeByKey[row.key] = { version: row.version, updatedAt: row.updated_at };
    }
  }

  return json({ activeByKey });
}

const UpsertPromptSchema = z
  .object({
    key: z.string().min(3).max(120),
    content: z.string().min(1).max(50_000),
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

  const rawBody = await req.json().catch(() => null);
  const parsed = UpsertPromptSchema.safeParse(rawBody);
  if (!parsed.success) return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (meError || !me?.organization_id) return json({ error: 'Profile not found' }, 404);
  if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const { key, content } = parsed.data;

  // Determine next version
  const { data: existing, error: existingError } = await supabase
    .from('ai_prompt_templates')
    .select('version')
    .eq('organization_id', me.organization_id)
    .eq('key', key)
    .order('version', { ascending: false })
    .limit(1);

  if (existingError) {
    console.error('[API] Database error:', existingError)
    return json({ error: 'Internal server error' }, 500)
  }

  const lastVersion = existing && existing.length > 0 ? (existing[0].version as number) : 0;
  const nextVersion = lastVersion + 1;

  // Deactivate previous active version for the key (keep history)
  const { error: deactivateError } = await supabase
    .from('ai_prompt_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', me.organization_id)
    .eq('key', key)
    .eq('is_active', true);

  if (deactivateError) {
    console.error('[API] Database error:', deactivateError)
    return json({ error: 'Internal server error' }, 500)
  }

  const { error: insertError } = await supabase.from('ai_prompt_templates').insert({
    organization_id: me.organization_id,
    key,
    version: nextVersion,
    content,
    is_active: true,
    created_by: me.id,
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error('[API] Database error:', insertError)
    return json({ error: 'Internal server error' }, 500)
  }

  return json({ ok: true, key, version: nextVersion });
}


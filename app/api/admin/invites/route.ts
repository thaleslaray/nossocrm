import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

type Role = 'admin' | 'vendedor';

const CreateInviteSchema = z
  .object({
    role: z.enum(['admin', 'vendedor']).default('vendedor'),
    expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
    email: z.string().email().optional(),
  })
  .strict();

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

  // Return only active (not used) invites, and let UI decide how to show expiration.
  const { data: invites, error } = await supabase
    .from('organization_invites')
    .select('id, token, role, email, created_at, expires_at, used_at, created_by')
    .eq('organization_id', me.organization_id)
    .is('used_at', null)
    .limit(200)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[API] Database error:', error)
    return json({ error: 'Internal server error' }, 500)
  }

  return json({ invites: invites || [] });
}

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

  const raw = await req.json().catch(() => null);
  const parsed = CreateInviteSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('[admin/invites POST] Validation error:', parsed.error.flatten());
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const expiresAt = parsed.data.expiresAt ?? null;

  const { data: invite, error } = await supabase
    .from('organization_invites')
    .insert({
      organization_id: me.organization_id,
      role: parsed.data.role as Role,
      email: parsed.data.email ?? null,
      expires_at: expiresAt,
      created_by: me.id,
    })
    .select('id, token, role, email, created_at, expires_at, used_at, created_by')
    .single();

  if (error) {
    console.error('[admin/invites POST] Database error:', error);
    return json({ error: 'Internal server error' }, 500);
  }

  console.log('[admin/invites POST] Created invite:', { id: invite?.id, expires_at: invite?.expires_at });
  return json({ invite }, 201);
}

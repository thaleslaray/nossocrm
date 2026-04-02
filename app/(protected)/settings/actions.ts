'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Schemas
// =============================================================================

const CreateInviteSchema = z
  .object({
    role: z.enum(['admin', 'vendedor']).default('vendedor'),
    expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
    email: z.string().email().optional(),
  })
  .strict();

// =============================================================================
// Return Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type Role = 'admin' | 'vendedor';

interface Invite {
  id: string;
  token: string;
  role: Role;
  email: string | null;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  created_by: string;
}

// =============================================================================
// Helper
// =============================================================================

async function getAdminProfile(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, me: null, error: 'Unauthorized' as const };

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (meError || !me?.organization_id) return { user: null, me: null, error: 'Profile not found' as const };
  if (me.role !== 'admin') return { user: null, me: null, error: 'Forbidden' as const };

  return { user, me, error: null };
}

// =============================================================================
// Actions
// =============================================================================

/**
 * Lista todos os convites ativos (não utilizados) da organização do usuário.
 */
export async function listInvites(): Promise<ActionResult<Invite[]>> {
  const supabase = await createClient();
  const { me, error: authError } = await getAdminProfile(supabase);

  if (authError || !me) {
    return { ok: false, error: authError ?? 'Unauthorized', status: authError === 'Forbidden' ? 403 : 401 };
  }

  const { data: invites, error } = await supabase
    .from('organization_invites')
    .select('id, token, role, email, created_at, expires_at, used_at, created_by')
    .eq('organization_id', me.organization_id)
    .is('used_at', null)
    .limit(200)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Action:listInvites] Database error:', error);
    return { ok: false, error: 'Internal server error', status: 500 };
  }

  return { ok: true, data: (invites ?? []) as Invite[] };
}

/**
 * Cria um novo convite para a organização do usuário autenticado.
 */
export async function createInvite(
  input: z.infer<typeof CreateInviteSchema>
): Promise<ActionResult<Invite>> {
  const parsed = CreateInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid payload', status: 400 };
  }

  const supabase = await createClient();
  const { me, error: authError } = await getAdminProfile(supabase);

  if (authError || !me) {
    return { ok: false, error: authError ?? 'Unauthorized', status: authError === 'Forbidden' ? 403 : 401 };
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
    console.error('[Action:createInvite] Database error:', error);
    return { ok: false, error: 'Internal server error', status: 500 };
  }

  console.log('[Action:createInvite] Created invite:', { id: invite?.id, expires_at: invite?.expires_at });
  return { ok: true, data: invite as Invite };
}

/**
 * Remove um convite pelo ID, garantindo que pertence à organização do usuário.
 */
export async function deleteInvite(id: string): Promise<ActionResult> {
  if (!id || typeof id !== 'string') {
    return { ok: false, error: 'Invalid invite ID', status: 400 };
  }

  const supabase = await createClient();
  const { me, error: authError } = await getAdminProfile(supabase);

  if (authError || !me) {
    return { ok: false, error: authError ?? 'Unauthorized', status: authError === 'Forbidden' ? 403 : 401 };
  }

  const { error } = await supabase
    .from('organization_invites')
    .delete()
    .eq('id', id)
    .eq('organization_id', me.organization_id);

  if (error) {
    console.error('[Action:deleteInvite] Database error:', error);
    return { ok: false, error: 'Internal server error', status: 500 };
  }

  return { ok: true, data: undefined };
}

import { z } from 'zod';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const AcceptInviteSchema = z
  .object({
    token: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1).max(200).optional(),
  })
  .strict();

export async function POST(req: Request) {
  // Mitigação CSRF: cria usuário (efeito colateral), só aceita same-origin.
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const raw = await req.json().catch(() => null);
  const parsed = AcceptInviteSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const { token, email, password, name } = parsed.data;

  const admin = createStaticAdminClient();

  const { data: invite, error: inviteError } = await admin
    .from('organization_invites')
    // Performance: fetch only what we need (keeps payload small and avoids extra parsing).
    .select('id, token, email, role, expires_at, used_at, organization_id')
    .eq('token', token)
    .is('used_at', null)
    .single();

  if (inviteError || !invite) {
    return json({ error: 'Convite inválido ou já foi utilizado' }, 400);
  }

  // Performance: avoid multiple Date allocations.
  const nowIso = new Date().toISOString();
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) {
    return json({ error: 'Convite expirado' }, 400);
  }

  if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return json({ error: 'Este convite não é válido para este email' }, 400);
  }

  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: name || email.split('@')[0],
      organization_id: invite.organization_id,
      role: invite.role,
    },
  });

  if (createError) return json({ error: createError.message }, 400);

  const userId = authData.user.id;

  const displayName = name || email.split('@')[0];

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        name: displayName,
        first_name: displayName,
        organization_id: invite.organization_id,
        role: invite.role,
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return json({ error: profileError.message }, 400);
  }

  await admin
    .from('organization_invites')
    .update({ used_at: nowIso })
    .eq('id', invite.id);

  return json({ ok: true, user: { id: userId, email } });
}

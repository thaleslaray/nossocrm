import { createStaticAdminClient } from '@/lib/supabase/server';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Handler HTTP `GET` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) return json({ valid: false, error: 'Missing token' }, 400);

  // Normalize token (trim whitespace, handle UUID format)
  const normalizedToken = token.trim();

  const admin = createStaticAdminClient();

  const { data: invite, error } = await admin
    .from('organization_invites')
    .select('token, email, role, expires_at, used_at')
    .eq('token', normalizedToken)
    .is('used_at', null)
    .maybeSingle();

  if (error) {
    console.error('[invites/validate] Database error:', error);
    return json({ valid: false, error: 'Internal server error' }, 500);
  }
  
  if (!invite) {
    // Try to find if token exists but is used/expired for better error message
    const { data: usedInvite } = await admin
      .from('organization_invites')
      .select('used_at, expires_at')
      .eq('token', normalizedToken)
      .maybeSingle();
    
    if (usedInvite) {
      if (usedInvite.used_at) {
        return json({ valid: false, error: 'Este convite já foi utilizado' }, 400);
      }
      if (usedInvite.expires_at && new Date(usedInvite.expires_at) < new Date()) {
        return json({ valid: false, error: 'Este convite expirou' }, 400);
      }
    }
    
    return json({ valid: false, error: 'Convite não encontrado' }, 404);
  }

  // Check expiration with proper date comparison
  if (invite.expires_at) {
    const expiresDate = new Date(invite.expires_at);
    const now = new Date();
    if (expiresDate < now) {
      return json({ valid: false, error: 'Este convite expirou' }, 400);
    }
  }

  return json({
    valid: true,
    invite: {
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
    },
  });
}

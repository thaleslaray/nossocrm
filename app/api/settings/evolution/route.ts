import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

const UpdateEvolutionSettingsSchema = z
  .object({
    evolutionApiUrl: z
      .string()
      .url()
      .optional(),
    evolutionApiKey: z.string().optional(),
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

  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  const { data: orgSettings, error: orgError } = await supabase
    .from('organization_settings')
    .select('evolution_api_url, evolution_api_key')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (orgError) {
    return json({ error: orgError.message }, 500);
  }

  // Security: members should NOT receive raw API keys.
  if (profile.role !== 'admin') {
    return json({
      evolutionApiUrl: orgSettings?.evolution_api_url || '',
      evolutionApiKey: '',
      hasKey: Boolean(orgSettings?.evolution_api_key),
    });
  }

  return json({
    evolutionApiUrl: orgSettings?.evolution_api_url || '',
    evolutionApiKey: orgSettings?.evolution_api_key || '',
    hasKey: Boolean(orgSettings?.evolution_api_key),
  });
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisicao.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
  // Mitigacao CSRF: endpoint autenticado por cookies.
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = UpdateEvolutionSettingsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const updates = parsed.data;

  // Normalize empty-string values to null
  const normalize = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const dbUpdates: Record<string, unknown> = {
    organization_id: profile.organization_id,
    updated_at: new Date().toISOString(),
  };

  const apiUrl = normalize(updates.evolutionApiUrl);
  if (apiUrl !== undefined) dbUpdates.evolution_api_url = apiUrl;

  const apiKey = normalize(updates.evolutionApiKey);
  if (apiKey !== undefined) dbUpdates.evolution_api_key = apiKey;

  const { error: upsertError } = await supabase
    .from('organization_settings')
    .upsert(dbUpdates, { onConflict: 'organization_id' });

  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({ ok: true });
}

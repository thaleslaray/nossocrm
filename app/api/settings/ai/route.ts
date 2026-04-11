import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { AI_DEFAULT_MODELS } from '@/lib/ai/defaults';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

type Provider = 'google';

const UpdateOrgAISettingsSchema = z
  .object({
    aiEnabled: z.boolean().optional(),
    aiModel: z.string().min(1).max(200).optional(),
    aiGoogleKey: z.string().optional(),
    telegramBotToken: z.string().optional(),
    telegramChatId: z.string().nullable().optional(),
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
    .select('ai_enabled, ai_provider, ai_model, ai_google_key, telegram_bot_token, telegram_chat_id')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (orgError) {
    return json({ error: orgError.message }, 500);
  }

  const aiEnabled = typeof orgSettings?.ai_enabled === 'boolean' ? orgSettings.ai_enabled : true;

  const maskKey = (key: string | null | undefined): string => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return '••••••••' + key.slice(-4);
  };

  const baseResponse = {
    aiEnabled,
    aiProvider: 'google' as Provider,
    aiModel: orgSettings?.ai_model || AI_DEFAULT_MODELS.google,
    aiHasGoogleKey: Boolean(orgSettings?.ai_google_key),
    hasTelegramBot: Boolean(orgSettings?.telegram_bot_token),
    telegramChatId: orgSettings?.telegram_chat_id ?? null,
  };

  // Security: members should NOT receive raw API keys.
  if (profile.role !== 'admin') {
    return json({ ...baseResponse, aiGoogleKey: '' });
  }

  return json({ ...baseResponse, aiGoogleKey: maskKey(orgSettings?.ai_google_key) });
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
  // Mitigação CSRF: endpoint autenticado por cookies.
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
  const parsed = UpdateOrgAISettingsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const updates = parsed.data;

  // Normalize empty-string keys to null
  const normalizeKey = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const dbUpdates: Record<string, unknown> = {
    organization_id: profile.organization_id,
    updated_at: new Date().toISOString(),
  };

  if (updates.aiEnabled !== undefined) dbUpdates.ai_enabled = updates.aiEnabled;
  if (updates.aiModel !== undefined) dbUpdates.ai_model = updates.aiModel;

  const googleKey = normalizeKey(updates.aiGoogleKey);
  if (googleKey !== undefined) dbUpdates.ai_google_key = googleKey;

  if (updates.telegramBotToken !== undefined) {
    dbUpdates.telegram_bot_token = updates.telegramBotToken.trim() || null;
  }
  if (updates.telegramChatId !== undefined) {
    dbUpdates.telegram_chat_id = updates.telegramChatId ? updates.telegramChatId.trim() || null : null;
  }

  const { error: upsertError } = await supabase
    .from('organization_settings')
    .upsert(dbUpdates, { onConflict: 'organization_id' });

  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({ ok: true });
}

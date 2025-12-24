import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { getModel, type AIProvider } from '@/services/ai/config';

export type AITaskContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  organizationId: string;
  provider: AIProvider;
  modelId: string;
  apiKey: string;
  model: ReturnType<typeof getModel>;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export class AITaskHttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  toResponse() {
    return json({ error: { code: this.code, message: this.message } }, this.status);
  }
}

export async function requireAITaskContext(req: Request): Promise<AITaskContext> {
  // Mitigação CSRF: endpoint autenticado por cookies.
  if (!isAllowedOrigin(req)) {
    throw new AITaskHttpError(403, 'FORBIDDEN', 'Forbidden');
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AITaskHttpError(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    throw new AITaskHttpError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
  }

  const organizationId = profile.organization_id as string;

  const { data: orgSettings, error: orgError } = await supabase
    .from('organization_settings')
    .select('ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key')
    .eq('organization_id', organizationId)
    .single();

  const provider: AIProvider = (orgSettings?.ai_provider ?? 'google') as AIProvider;

  const apiKey: string | null =
    provider === 'google'
      ? (orgSettings?.ai_google_key ?? null)
      : provider === 'openai'
        ? (orgSettings?.ai_openai_key ?? null)
        : (orgSettings?.ai_anthropic_key ?? null);

  if (orgError || !apiKey) {
    const providerLabel = provider === 'google' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI' : 'Anthropic';
    throw new AITaskHttpError(
      400,
      'AI_KEY_NOT_CONFIGURED',
      `API key não configurada para ${providerLabel}. Configure em Configurações → Inteligência Artificial.`
    );
  }

  const modelId = orgSettings?.ai_model || '';
  const model = getModel(provider, apiKey, modelId);

  return {
    supabase,
    userId: user.id,
    organizationId,
    provider,
    modelId,
    apiKey,
    model,
  };
}

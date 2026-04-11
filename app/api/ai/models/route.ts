/**
 * @fileoverview AI Models API
 *
 * Retorna a lista de modelos disponíveis para o provider solicitado,
 * buscando diretamente da API do provider com a chave configurada no banco.
 *
 * @module app/api/ai/models/route
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

// =============================================================================
// Types
// =============================================================================

export interface AIModelInfo {
  id: string;
  name: string;
  provider: 'google';
  /** true = alias auto-atualizado (ex: gemini-flash-latest) */
  isAlias: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Padrões de modelos a excluir do fetch do Google
const GOOGLE_EXCLUDED_PATTERNS = [
  'tts',
  'image',
  'robotics',
  'computer-use',
  'deep-research',
  'lyria',
  'gemma',
  'embedding',
  'aqa',
];

function isExcluded(id: string): boolean {
  return GOOGLE_EXCLUDED_PATTERNS.some((p) => id.includes(p));
}

async function fetchGoogleModels(apiKey: string): Promise<AIModelInfo[]> {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
    { headers: { 'x-goog-api-key': apiKey } }
  );
  if (!res.ok) throw new Error(`Google API error: HTTP ${res.status}`);

  const data = await res.json() as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };

  const all: AIModelInfo[] = (data.models ?? [])
    .filter((m) => {
      const id = m.name.replace('models/', '');
      return (
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        !isExcluded(id)
      );
    })
    .map((m) => {
      const id = m.name.replace('models/', '');
      return {
        id,
        name: m.displayName || id,
        provider: 'google' as const,
        isAlias: id.endsWith('-latest'),
      };
    });

  // Aliases primeiro (sempre atualizados), depois versões fixas mais recente → mais antigo
  const aliases = all.filter((m) => m.isAlias);
  const pinned = all
    .filter((m) => !m.isAlias)
    .sort((a, b) => b.id.localeCompare(a.id));

  return [...aliases, ...pinned];
}

// =============================================================================
// GET /api/ai/models
// =============================================================================

export async function GET(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'Não autenticado' }, 401);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return json({ models: [] });
  }

  const { data: settings, error: settingsError } = await supabase
    .from('organization_settings')
    .select('ai_google_key')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (settingsError || !settings?.ai_google_key) {
    return json({ models: [] });
  }

  try {
    const models = await fetchGoogleModels(settings.ai_google_key);
    return json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error(`[api/ai/models] ${message}`);
    return json({ error: `Falha ao buscar modelos: ${message}` }, 502);
  }
}

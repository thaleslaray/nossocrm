'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Schemas
// =============================================================================

const UpsertPromptSchema = z
  .object({
    key: z.string().min(3).max(120),
    content: z.string().min(1).max(50_000),
  })
  .strict();

// =============================================================================
// Return Types
// =============================================================================

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

// =============================================================================
// Actions
// =============================================================================

/**
 * Upserta um prompt template de AI para a organização do usuário autenticado.
 * Cria uma nova versão do template, desativando a versão anterior.
 */
export async function upsertAIPrompt(
  input: z.infer<typeof UpsertPromptSchema>
): Promise<ActionResult<{ key: string; version: number }>> {
  const parsed = UpsertPromptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid payload', status: 400 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Unauthorized', status: 401 };

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (meError || !me?.organization_id) {
    return { ok: false, error: 'Profile not found', status: 404 };
  }
  if (me.role !== 'admin') {
    return { ok: false, error: 'Forbidden', status: 403 };
  }

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
    console.error('[Action:upsertAIPrompt] Database error:', existingError);
    return { ok: false, error: 'Internal server error', status: 500 };
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
    console.error('[Action:upsertAIPrompt] Deactivate error:', deactivateError);
    return { ok: false, error: 'Internal server error', status: 500 };
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
    console.error('[Action:upsertAIPrompt] Insert error:', insertError);
    return { ok: false, error: 'Internal server error', status: 500 };
  }

  return { ok: true, data: { key, version: nextVersion } };
}

/**
 * Lista os templates de prompt ativos da organização do usuário autenticado.
 */
export async function listActiveAIPrompts(): Promise<
  ActionResult<Record<string, { version: number; updatedAt: string }>>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Unauthorized', status: 401 };

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (meError || !me?.organization_id) {
    return { ok: false, error: 'Profile not found', status: 404 };
  }
  if (me.role !== 'admin') {
    return { ok: false, error: 'Forbidden', status: 403 };
  }

  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .select('key, version, is_active, updated_at')
    .eq('organization_id', me.organization_id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[Action:listActiveAIPrompts] Database error:', error);
    return { ok: false, error: 'Internal server error', status: 500 };
  }

  const activeByKey: Record<string, { version: number; updatedAt: string }> = {};
  for (const row of data || []) {
    if (row.is_active && !activeByKey[row.key]) {
      activeByKey[row.key] = { version: row.version, updatedAt: row.updated_at };
    }
  }

  return { ok: true, data: activeByKey };
}

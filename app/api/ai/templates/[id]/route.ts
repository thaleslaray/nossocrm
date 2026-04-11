/**
 * @fileoverview AI Template Detail API
 *
 * Endpoints para gerenciamento de um template específico.
 * GET: Buscar detalhes
 * PATCH: Atualizar template custom
 * DELETE: Remover template custom
 *
 * @module app/api/ai/templates/[id]/route
 */

import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { z } from 'zod';

// =============================================================================
// Helpers
// =============================================================================

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// =============================================================================
// Validation Schemas
// =============================================================================

const StageSchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().int().min(0),
  goal: z.string().optional(),
  criteria: z.array(z.string()).default([]),
  prompt_template: z.string().min(1),
});

const UpdateTemplateSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  stages: z.array(StageSchema).min(1).max(10).optional(),
});

// =============================================================================
// Types
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>;
}

// =============================================================================
// GET /api/ai/templates/[id]
// Busca detalhes de um template
// =============================================================================

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  // Buscar template (sistema ou da org)
  const { data: template, error } = await supabase
    .from('ai_qualification_templates')
    .select('*')
    .eq('id', id)
    .or(`is_system.eq.true,organization_id.eq.${profile.organization_id.replace(/[,()]/g, '')}`)
    .single();

  if (error || !template) {
    return json({ error: 'Template not found' }, 404);
  }

  return json({ template });
}

// =============================================================================
// PATCH /api/ai/templates/[id]
// Atualiza template custom (apenas templates da org)
// =============================================================================

export async function PATCH(req: Request, context: RouteContext) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { id } = await context.params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  // Apenas admins podem editar templates
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  // Verificar se template existe e pertence à org
  const { data: template, error: templateError } = await supabase
    .from('ai_qualification_templates')
    .select('id, is_system, organization_id')
    .eq('id', id)
    .single();

  if (templateError || !template) {
    return json({ error: 'Template not found' }, 404);
  }

  // Não pode editar templates do sistema
  if (template.is_system) {
    return json({ error: 'Cannot edit system templates' }, 403);
  }

  // Verificar se pertence à organização
  if (template.organization_id !== profile.organization_id) {
    return json({ error: 'Template not found' }, 404);
  }

  // Parse e validar body
  let body: z.infer<typeof UpdateTemplateSchema>;
  try {
    const rawBody = await req.json();
    body = UpdateTemplateSchema.parse(rawBody);
  } catch (parseError) {
    if (parseError instanceof z.ZodError) {
      return json({ error: 'Validation error', message: 'Invalid template data' }, 400);
    }
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Atualizar template
  const updateData: Record<string, unknown> = {};
  if (body.display_name !== undefined) updateData.display_name = body.display_name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.stages !== undefined) updateData.stages = body.stages;

  if (Object.keys(updateData).length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }

  const { data: updated, error: updateError } = await supabase
    .from('ai_qualification_templates')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('[AI Templates] Error updating template:', updateError);
    return json({ error: updateError.message }, 500);
  }

  return json({ template: updated });
}

// =============================================================================
// DELETE /api/ai/templates/[id]
// Remove template custom (apenas templates da org)
// =============================================================================

export async function DELETE(req: Request, context: RouteContext) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { id } = await context.params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  // Apenas admins podem deletar templates
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  // Verificar se template existe e pertence à org
  const { data: template, error: templateError } = await supabase
    .from('ai_qualification_templates')
    .select('id, is_system, organization_id')
    .eq('id', id)
    .single();

  if (templateError || !template) {
    return json({ error: 'Template not found' }, 404);
  }

  // Não pode deletar templates do sistema
  if (template.is_system) {
    return json({ error: 'Cannot delete system templates' }, 403);
  }

  // Verificar se pertence à organização
  if (template.organization_id !== profile.organization_id) {
    return json({ error: 'Template not found' }, 404);
  }

  // Verificar se template está em uso (organization_settings.ai_template_id)
  const { data: inUse } = await supabase
    .from('organization_settings')
    .select('organization_id')
    .eq('ai_template_id', id)
    .maybeSingle();

  if (inUse) {
    return json(
      {
        error: 'Template is currently in use. Please select a different template first.',
      },
      409
    );
  }

  // Deletar template
  const { error: deleteError } = await supabase.from('ai_qualification_templates').delete().eq('id', id);

  if (deleteError) {
    console.error('[AI Templates] Error deleting template:', deleteError);
    return json({ error: deleteError.message }, 500);
  }

  return json({ success: true });
}

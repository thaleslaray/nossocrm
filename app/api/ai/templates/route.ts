/**
 * @fileoverview AI Templates API
 *
 * Endpoints para gerenciamento de templates de qualificação de AI.
 * Permite listar templates do sistema e criar templates customizados.
 *
 * @module app/api/ai/templates/route
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

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, {
    message: 'Name must be lowercase alphanumeric with dashes/underscores only',
  }),
  display_name: z.string().min(1).max(100),
  description: z.string().optional(),
  stages: z.array(StageSchema).min(1).max(10),
});

// =============================================================================
// GET /api/ai/templates
// Lista templates disponíveis (sistema + custom da org)
// =============================================================================

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
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  // Buscar templates do sistema + templates custom da organização
  const { data: templates, error } = await supabase
    .from('ai_qualification_templates')
    .select(
      `
      id,
      name,
      display_name,
      description,
      stages,
      is_system,
      organization_id,
      created_at,
      updated_at
    `
    )
    .or(`is_system.eq.true,organization_id.eq.${profile.organization_id.replace(/[,.()*\\]/g, '')}`)
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[AI Templates] Error fetching templates:', error);
    return json({ error: 'Internal server error' }, 500);
  }

  // Separar templates por categoria
  const systemTemplates = templates?.filter((t) => t.is_system) || [];
  const customTemplates = templates?.filter((t) => !t.is_system) || [];

  return json({
    templates: templates || [],
    systemTemplates,
    customTemplates,
  });
}

// =============================================================================
// POST /api/ai/templates
// Cria template customizado para a organização
// =============================================================================

export async function POST(req: Request) {
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
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  // Apenas admins podem criar templates
  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden - Admin access required' }, 403);
  }

  // Parse e validar body
  let body: z.infer<typeof CreateTemplateSchema>;
  try {
    const rawBody = await req.json();
    body = CreateTemplateSchema.parse(rawBody);
  } catch (parseError) {
    if (parseError instanceof z.ZodError) {
      return json({ error: 'Validation error', message: 'Invalid template data' }, 400);
    }
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // Verificar se já existe template com mesmo nome na org
  const { data: existing } = await supabase
    .from('ai_qualification_templates')
    .select('id')
    .eq('organization_id', profile.organization_id)
    .eq('name', body.name)
    .maybeSingle();

  if (existing) {
    return json({ error: 'Template with this name already exists' }, 409);
  }

  // Criar template
  const { data: template, error: createError } = await supabase
    .from('ai_qualification_templates')
    .insert({
      name: body.name,
      display_name: body.display_name,
      description: body.description || null,
      stages: body.stages,
      is_system: false,
      organization_id: profile.organization_id,
    })
    .select()
    .single();

  if (createError) {
    console.error('[AI Templates] Error creating template:', createError);
    return json({ error: createError.message }, 500);
  }

  return json({ template }, 201);
}

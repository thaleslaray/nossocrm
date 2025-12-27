import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { isValidUUID } from '@/lib/supabase/utils';
import { normalizeText, normalizeUrl } from '@/lib/public-api/sanitize';

export const runtime = 'nodejs';

const CompanyPatchSchema = z.object({
  name: z.string().optional(),
  website: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
}).strict();

export async function GET(request: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { companyId } = await ctx.params;
  if (!isValidUUID(companyId)) {
    return NextResponse.json({ error: 'Invalid company id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const sb = createStaticAdminClient();
  const { data, error } = await sb
    .from('crm_companies')
    .select('id,name,website,industry,created_at,updated_at')
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null)
    .eq('id', companyId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Company not found', code: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ data });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { companyId } = await ctx.params;
  if (!isValidUUID(companyId)) {
    return NextResponse.json({ error: 'Invalid company id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CompanyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const updates: any = {};
  if (parsed.data.name !== undefined) updates.name = normalizeText(parsed.data.name);
  if (parsed.data.website !== undefined) updates.website = parsed.data.website === null ? null : normalizeUrl(parsed.data.website);
  if (parsed.data.industry !== undefined) updates.industry = parsed.data.industry === null ? null : normalizeText(parsed.data.industry);
  updates.updated_at = new Date().toISOString();

  const sb = createStaticAdminClient();
  const { data, error } = await sb
    .from('crm_companies')
    .update(updates)
    .eq('organization_id', auth.organizationId)
    .eq('id', companyId)
    .select('id,name,website,industry,created_at,updated_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Company not found', code: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ data });
}


import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { isValidUUID } from '@/lib/supabase/utils';
import { normalizeEmail, normalizePhone, normalizeText } from '@/lib/public-api/sanitize';
import { sanitizeUUID } from '@/lib/supabase/utils';

export const runtime = 'nodejs';

const ContactPatchSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  client_company_id: z.string().uuid().nullable().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
}).strict();

export async function GET(request: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { contactId } = await ctx.params;
  if (!isValidUUID(contactId)) {
    return NextResponse.json({ error: 'Invalid contact id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const sb = createStaticAdminClient();
  const { data, error } = await sb
    .from('contacts')
    .select('id,name,email,phone,role,client_company_id,source,notes,created_at,updated_at')
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null)
    .eq('id', contactId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Contact not found', code: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ data });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const { contactId } = await ctx.params;
  if (!isValidUUID(contactId)) {
    return NextResponse.json({ error: 'Invalid contact id', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ContactPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const updates: any = {};
  if (parsed.data.name !== undefined) updates.name = normalizeText(parsed.data.name);
  if (parsed.data.email !== undefined) updates.email = normalizeEmail(parsed.data.email);
  if (parsed.data.phone !== undefined) updates.phone = normalizePhone(parsed.data.phone);
  if (parsed.data.role !== undefined) updates.role = normalizeText(parsed.data.role);
  if (parsed.data.source !== undefined) updates.source = normalizeText(parsed.data.source);
  if (parsed.data.notes !== undefined) updates.notes = normalizeText(parsed.data.notes);
  if (parsed.data.client_company_id !== undefined) {
    updates.client_company_id = parsed.data.client_company_id === null ? null : (sanitizeUUID(parsed.data.client_company_id) || null);
  }
  updates.updated_at = new Date().toISOString();

  const sb = createStaticAdminClient();
  const { data, error } = await sb
    .from('contacts')
    .update(updates)
    .eq('organization_id', auth.organizationId)
    .eq('id', contactId)
    .select('id,name,email,phone,role,client_company_id,source,notes,created_at,updated_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Contact not found', code: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ data });
}


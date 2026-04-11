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
  company_name: z.string().optional(),
  client_company_id: z.string().uuid().nullable().optional(),
  avatar: z.string().optional(),
  status: z.string().optional(),
  stage: z.string().optional(),
  birth_date: z.string().nullable().optional(),
  last_interaction: z.string().nullable().optional(),
  last_purchase_date: z.string().nullable().optional(),
  total_value: z.number().nullable().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
}).strict();

function toIsoDateString(v: string | undefined | null) {
  const s = (v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '__INVALID__';
  return d.toISOString().slice(0, 10);
}

function toIsoTimestamp(v: string | undefined | null) {
  const s = (v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '__INVALID__';
  return d.toISOString();
}

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
    .select('id,name,email,phone,role,company_name,client_company_id,avatar,notes,status,stage,source,birth_date,last_interaction,last_purchase_date,total_value,created_at,updated_at')
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null)
    .eq('id', contactId)
    .maybeSingle();

  if (error) {
    console.error('[API] Database error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'DB_ERROR' }, { status: 500 })
  }
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
  if (parsed.data.company_name !== undefined) updates.company_name = normalizeText(parsed.data.company_name);
  if (parsed.data.avatar !== undefined) updates.avatar = normalizeText(parsed.data.avatar);
  if (parsed.data.status !== undefined) updates.status = normalizeText(parsed.data.status);
  if (parsed.data.stage !== undefined) updates.stage = normalizeText(parsed.data.stage);
  if (parsed.data.source !== undefined) updates.source = normalizeText(parsed.data.source);
  if (parsed.data.notes !== undefined) updates.notes = normalizeText(parsed.data.notes);
  if (parsed.data.client_company_id !== undefined) {
    updates.client_company_id = parsed.data.client_company_id === null ? null : (sanitizeUUID(parsed.data.client_company_id) || null);
  }
  if (parsed.data.birth_date !== undefined) {
    updates.birth_date = parsed.data.birth_date === null ? null : toIsoDateString(parsed.data.birth_date);
    if (updates.birth_date === '__INVALID__') {
      return NextResponse.json({ error: 'Invalid birth_date', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
  }
  if (parsed.data.last_purchase_date !== undefined) {
    updates.last_purchase_date = parsed.data.last_purchase_date === null ? null : toIsoDateString(parsed.data.last_purchase_date);
    if (updates.last_purchase_date === '__INVALID__') {
      return NextResponse.json({ error: 'Invalid last_purchase_date', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
  }
  if (parsed.data.last_interaction !== undefined) {
    updates.last_interaction = parsed.data.last_interaction === null ? null : toIsoTimestamp(parsed.data.last_interaction);
    if (updates.last_interaction === '__INVALID__') {
      return NextResponse.json({ error: 'Invalid last_interaction', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
  }
  if (parsed.data.total_value !== undefined) {
    updates.total_value = parsed.data.total_value === null ? null : Number(parsed.data.total_value);
  }
  updates.updated_at = new Date().toISOString();

  const sb = createStaticAdminClient();
  const { data, error } = await sb
    .from('contacts')
    .update(updates)
    .eq('organization_id', auth.organizationId)
    .eq('id', contactId)
    .select('id,name,email,phone,role,company_name,client_company_id,avatar,notes,status,stage,source,birth_date,last_interaction,last_purchase_date,total_value,created_at,updated_at')
    .maybeSingle();

  if (error) {
    console.error('[API] Database error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'DB_ERROR' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Contact not found', code: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({ data });
}


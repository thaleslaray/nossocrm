import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';
import { normalizeEmail, normalizePhone, normalizeText } from '@/lib/public-api/sanitize';
import { sanitizeUUID } from '@/lib/supabase/utils';

export const runtime = 'nodejs';

const ContactUpsertSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  client_company_id: z.string().uuid().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const email = normalizeEmail(url.searchParams.get('email'));
  const phone = normalizePhone(url.searchParams.get('phone'));
  const clientCompanyId = sanitizeUUID(url.searchParams.get('client_company_id'));
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = decodeOffsetCursor(url.searchParams.get('cursor'));

  const sb = createStaticAdminClient();
  let query = sb
    .from('contacts')
    .select('id,name,email,phone,role,client_company_id,source,notes,created_at,updated_at', { count: 'exact' })
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (clientCompanyId) query = query.eq('client_company_id', clientCompanyId);
  if (email) query = query.eq('email', email);
  if (phone) query = query.eq('phone', phone);
  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const from = offset;
  const to = offset + limit - 1;
  const { data, count, error } = await query.range(from, to);
  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });

  const total = count ?? 0;
  const nextOffset = to + 1;
  const nextCursor = nextOffset < total ? encodeOffsetCursor(nextOffset) : null;

  return NextResponse.json({
    data: (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      role: c.role ?? null,
      client_company_id: c.client_company_id ?? null,
      source: c.source ?? null,
      notes: c.notes ?? null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    })),
    nextCursor,
  });
}

export async function POST(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = ContactUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const email = normalizeEmail(parsed.data.email);
  const phone = normalizePhone(parsed.data.phone);
  const name = normalizeText(parsed.data.name);

  if (!email && !phone) {
    return NextResponse.json({ error: 'Provide email or phone', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const sb = createStaticAdminClient();

  let lookup = sb
    .from('contacts')
    .select('id')
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null);

  if (email && phone) lookup = lookup.or(`email.eq.${email},phone.eq.${phone}`);
  else if (email) lookup = lookup.eq('email', email);
  else if (phone) lookup = lookup.eq('phone', phone);

  const existing = await lookup.maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message, code: 'DB_ERROR' }, { status: 500 });

  const now = new Date().toISOString();
  const payload: any = {
    organization_id: auth.organizationId,
    email,
    phone,
    role: normalizeText(parsed.data.role),
    client_company_id: sanitizeUUID(parsed.data.client_company_id) || null,
    source: normalizeText(parsed.data.source),
    notes: normalizeText(parsed.data.notes),
    updated_at: now,
  };

  if (existing.data?.id) {
    if (name) payload.name = name;
    const { data, error } = await sb
      .from('contacts')
      .update(payload)
      .eq('id', existing.data.id)
      .select('id,name,email,phone,role,client_company_id,source,notes,created_at,updated_at')
      .single();
    if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
    return NextResponse.json({ data: data, action: 'updated' });
  }

  if (!name) {
    return NextResponse.json({ error: 'Name is required to create a new contact', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const insertPayload = {
    ...payload,
    name,
    created_at: now,
    status: 'ACTIVE',
    stage: 'LEAD',
  };

  const { data, error } = await sb
    .from('contacts')
    .insert(insertPayload)
    .select('id,name,email,phone,role,client_company_id,source,notes,created_at,updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
  return NextResponse.json({ data, action: 'created' }, { status: 201 });
}


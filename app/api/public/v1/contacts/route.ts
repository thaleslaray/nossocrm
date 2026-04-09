import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';
import { sanitizePostgrestValue } from '@/lib/utils/sanitize';
import { normalizeEmail, normalizePhone, normalizeText } from '@/lib/public-api/sanitize';
import { sanitizeUUID } from '@/lib/supabase/utils';

export const runtime = 'nodejs';

const ContactUpsertSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  company_name: z.string().optional(),
  client_company_id: z.string().uuid().optional(),
  avatar: z.string().optional(),
  status: z.string().optional(),
  stage: z.string().optional(),
  birth_date: z.string().optional(), // YYYY-MM-DD
  last_interaction: z.string().optional(), // ISO
  last_purchase_date: z.string().optional(), // YYYY-MM-DD
  total_value: z.number().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
}).strict();

function toIsoDateString(v: string | undefined) {
  const s = (v || '').trim();
  if (!s) return null;
  // Accept YYYY-MM-DD or ISO; store as YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '__INVALID__';
  return d.toISOString().slice(0, 10);
}

function toIsoTimestamp(v: string | undefined) {
  const s = (v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '__INVALID__';
  return d.toISOString();
}

async function resolveCompanyIdFromName(opts: { organizationId: string; companyName: string }) {
  const sb = createStaticAdminClient();
  const name = normalizeText(opts.companyName);
  if (!name) return null;

  const existing = await sb
    .from('crm_companies')
    .select('id')
    .eq('organization_id', opts.organizationId)
    .is('deleted_at', null)
    .ilike('name', name)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id as string;

  const now = new Date().toISOString();
  const created = await sb
    .from('crm_companies')
    .insert({ organization_id: opts.organizationId, name, created_at: now, updated_at: now })
    .select('id')
    .single();
  if (created.error) throw created.error;
  return created.data.id as string;
}

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
    .select('id,name,email,phone,role,company_name,client_company_id,avatar,notes,status,stage,source,birth_date,last_interaction,last_purchase_date,total_value,created_at,updated_at', { count: 'exact' })
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (clientCompanyId) query = query.eq('client_company_id', clientCompanyId);
  if (email) query = query.eq('email', email);
  if (phone) query = query.eq('phone', phone);
  if (q) {
    const safeQ = sanitizePostgrestValue(q)
    if (safeQ) query = query.or(`name.ilike.%${safeQ}%,email.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`);
  }

  const from = offset;
  const to = offset + limit - 1;
  const { data, count, error } = await query.range(from, to);
  if (error) {
    console.error('[API] Database error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'DB_ERROR' }, { status: 500 })
  }

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
      company_name: c.company_name ?? null,
      client_company_id: c.client_company_id ?? null,
      avatar: c.avatar ?? null,
      status: c.status ?? null,
      stage: c.stage ?? null,
      source: c.source ?? null,
      notes: c.notes ?? null,
      birth_date: c.birth_date ?? null,
      last_interaction: c.last_interaction ?? null,
      last_purchase_date: c.last_purchase_date ?? null,
      total_value: c.total_value != null ? Number(c.total_value) : null,
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
  const companyName = normalizeText(parsed.data.company_name);

  if (!email && !phone) {
    return NextResponse.json({ error: 'Provide email or phone', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const sb = createStaticAdminClient();

  const birthDate = toIsoDateString(parsed.data.birth_date);
  if (birthDate === '__INVALID__') return NextResponse.json({ error: 'Invalid birth_date', code: 'VALIDATION_ERROR' }, { status: 422 });
  const lastPurchaseDate = toIsoDateString(parsed.data.last_purchase_date);
  if (lastPurchaseDate === '__INVALID__') return NextResponse.json({ error: 'Invalid last_purchase_date', code: 'VALIDATION_ERROR' }, { status: 422 });
  const lastInteraction = toIsoTimestamp(parsed.data.last_interaction);
  if (lastInteraction === '__INVALID__') return NextResponse.json({ error: 'Invalid last_interaction', code: 'VALIDATION_ERROR' }, { status: 422 });

  let clientCompanyId = sanitizeUUID(parsed.data.client_company_id) || null;
  if (!clientCompanyId && companyName) {
    try {
      clientCompanyId = await resolveCompanyIdFromName({ organizationId: auth.organizationId, companyName });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Invalid company', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
  }

  let lookup = sb
    .from('contacts')
    .select('id')
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null);

  if (email && phone) lookup = lookup.or(`email.eq.${email},phone.eq.${phone}`);
  else if (email) lookup = lookup.eq('email', email);
  else if (phone) lookup = lookup.eq('phone', phone);

  const existing = await lookup.maybeSingle();
  if (existing.error) {
    console.error('[API] Database error:', existing.error)
    return NextResponse.json({ error: 'Internal server error', code: 'DB_ERROR' }, { status: 500 })
  }

  const now = new Date().toISOString();
  const payload: any = {
    organization_id: auth.organizationId,
    email,
    phone,
    role: normalizeText(parsed.data.role),
    company_name: companyName,
    client_company_id: clientCompanyId,
    avatar: normalizeText(parsed.data.avatar),
    status: normalizeText(parsed.data.status),
    stage: normalizeText(parsed.data.stage),
    source: normalizeText(parsed.data.source),
    notes: normalizeText(parsed.data.notes),
    birth_date: birthDate,
    last_interaction: lastInteraction,
    last_purchase_date: lastPurchaseDate,
    total_value: parsed.data.total_value ?? undefined,
    updated_at: now,
  };

  if (existing.data?.id) {
    if (name) payload.name = name;
    const { data, error } = await sb
      .from('contacts')
      .update(payload)
      .eq('id', existing.data.id)
      .select('id,name,email,phone,role,company_name,client_company_id,avatar,notes,status,stage,source,birth_date,last_interaction,last_purchase_date,total_value,created_at,updated_at')
      .single();
    if (error) {
      console.error('[API] Database error:', error)
      return NextResponse.json({ error: 'Internal server error', code: 'DB_ERROR' }, { status: 500 })
    }
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
    .select('id,name,email,phone,role,company_name,client_company_id,avatar,notes,status,stage,source,birth_date,last_interaction,last_purchase_date,total_value,created_at,updated_at')
    .single();
  if (error) {
    console.error('[API] Database error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'DB_ERROR' }, { status: 500 })
  }
  return NextResponse.json({ data, action: 'created' }, { status: 201 });
}


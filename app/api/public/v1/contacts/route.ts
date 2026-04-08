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
  // Travel fields
  destino_viagem: z.string().optional(),
  data_viagem: z.string().optional(),
  quantidade_adultos: z.number().int().min(1).optional(),
  quantidade_criancas: z.number().int().min(0).optional(),
  idade_criancas: z.string().optional(),
  categoria_viagem: z.enum(['economica', 'intermediaria', 'premium']).optional(),
  urgencia_viagem: z.enum(['imediato', 'curto_prazo', 'medio_prazo', 'planejando']).optional(),
  origem_lead: z.enum(['instagram', 'facebook', 'google', 'site', 'whatsapp', 'indicacao', 'outro']).optional(),
  indicado_por: z.string().optional(),
  observacoes_viagem: z.string().optional(),
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
    .select('id,name,email,phone,client_company_id,avatar,notes,status,stage,source,birth_date,last_interaction,last_purchase_date,total_value,destino_viagem,data_viagem,quantidade_adultos,quantidade_criancas,idade_criancas,categoria_viagem,urgencia_viagem,origem_lead,indicado_por,observacoes_viagem,created_at,updated_at', { count: 'exact' })
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
      destino_viagem: c.destino_viagem ?? null,
      data_viagem: c.data_viagem ?? null,
      quantidade_adultos: c.quantidade_adultos ?? null,
      quantidade_criancas: c.quantidade_criancas ?? null,
      idade_criancas: c.idade_criancas ?? null,
      categoria_viagem: c.categoria_viagem ?? null,
      urgencia_viagem: c.urgencia_viagem ?? null,
      origem_lead: c.origem_lead ?? null,
      indicado_por: c.indicado_por ?? null,
      observacoes_viagem: c.observacoes_viagem ?? null,
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

  const birthDate = toIsoDateString(parsed.data.birth_date);
  if (birthDate === '__INVALID__') return NextResponse.json({ error: 'Invalid birth_date', code: 'VALIDATION_ERROR' }, { status: 422 });
  const lastPurchaseDate = toIsoDateString(parsed.data.last_purchase_date);
  if (lastPurchaseDate === '__INVALID__') return NextResponse.json({ error: 'Invalid last_purchase_date', code: 'VALIDATION_ERROR' }, { status: 422 });
  const lastInteraction = toIsoTimestamp(parsed.data.last_interaction);
  if (lastInteraction === '__INVALID__') return NextResponse.json({ error: 'Invalid last_interaction', code: 'VALIDATION_ERROR' }, { status: 422 });

  const clientCompanyId = sanitizeUUID(parsed.data.client_company_id) || null;

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

  const TRAVEL_SELECT = 'id,name,email,phone,client_company_id,avatar,notes,status,stage,source,birth_date,last_interaction,last_purchase_date,total_value,destino_viagem,data_viagem,quantidade_adultos,quantidade_criancas,idade_criancas,categoria_viagem,urgencia_viagem,origem_lead,indicado_por,observacoes_viagem,created_at,updated_at';

  const now = new Date().toISOString();
  const payload: any = {
    organization_id: auth.organizationId,
    email,
    phone,
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
    destino_viagem: parsed.data.destino_viagem ?? undefined,
    data_viagem: parsed.data.data_viagem ?? undefined,
    quantidade_adultos: parsed.data.quantidade_adultos ?? undefined,
    quantidade_criancas: parsed.data.quantidade_criancas ?? undefined,
    idade_criancas: parsed.data.idade_criancas ?? undefined,
    categoria_viagem: parsed.data.categoria_viagem ?? undefined,
    urgencia_viagem: parsed.data.urgencia_viagem ?? undefined,
    origem_lead: parsed.data.origem_lead ?? undefined,
    indicado_por: parsed.data.indicado_por ?? undefined,
    observacoes_viagem: parsed.data.observacoes_viagem ?? undefined,
    updated_at: now,
  };

  if (existing.data?.id) {
    if (name) payload.name = name;
    const { data, error } = await sb
      .from('contacts')
      .update(payload)
      .eq('id', existing.data.id)
      .select(TRAVEL_SELECT)
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
    .select(TRAVEL_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });
  return NextResponse.json({ data, action: 'created' }, { status: 201 });
}


import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from '@/lib/public-api/cursor';
import { resolveBoardIdFromKey, resolveFirstStageId } from '@/lib/public-api/resolve';
import { normalizeEmail, normalizePhone, normalizeText } from '@/lib/public-api/sanitize';
import { isValidUUID, sanitizeUUID } from '@/lib/supabase/utils';

export const runtime = 'nodejs';

const ContactInlineSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  client_company_id: z.string().uuid().optional(),
}).strict();

const DealCreateSchema = z.object({
  title: z.string().min(1),
  value: z.number().optional(),
  board_id: z.string().uuid().optional(),
  board_key: z.string().min(1).optional(),
  stage_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  contact: ContactInlineSchema.optional(),
  client_company_id: z.string().uuid().optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const boardId = sanitizeUUID(url.searchParams.get('board_id'));
  const boardKey = (url.searchParams.get('board_key') || '').trim();
  const stageId = sanitizeUUID(url.searchParams.get('stage_id'));
  const contactId = sanitizeUUID(url.searchParams.get('contact_id'));
  const clientCompanyId = sanitizeUUID(url.searchParams.get('client_company_id'));
  const status = (url.searchParams.get('status') || '').trim(); // open|won|lost
  const updatedAfter = (url.searchParams.get('updated_after') || '').trim();
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = decodeOffsetCursor(url.searchParams.get('cursor'));

  const sb = createStaticAdminClient();

  let resolvedBoardId = boardId;
  if (!resolvedBoardId && boardKey) {
    resolvedBoardId = await resolveBoardIdFromKey({ organizationId: auth.organizationId, boardKey });
  }

  let query = sb
    .from('deals')
    .select('id,title,value,board_id,stage_id,contact_id,client_company_id,is_won,is_lost,loss_reason,closed_at,created_at,updated_at', { count: 'exact' })
    .eq('organization_id', auth.organizationId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (resolvedBoardId) query = query.eq('board_id', resolvedBoardId);
  if (stageId) query = query.eq('stage_id', stageId);
  if (contactId) query = query.eq('contact_id', contactId);
  if (clientCompanyId) query = query.eq('client_company_id', clientCompanyId);
  if (updatedAfter) query = query.gte('updated_at', updatedAfter);
  if (q) query = query.ilike('title', `%${q}%`);

  if (status === 'open') query = query.eq('is_won', false).eq('is_lost', false);
  if (status === 'won') query = query.eq('is_won', true);
  if (status === 'lost') query = query.eq('is_lost', true);

  const from = offset;
  const to = offset + limit - 1;
  const { data, count, error } = await query.range(from, to);
  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });

  const total = count ?? 0;
  const nextOffset = to + 1;
  const nextCursor = nextOffset < total ? encodeOffsetCursor(nextOffset) : null;

  return NextResponse.json({
    data: (data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      value: Number(d.value ?? 0),
      board_id: d.board_id,
      stage_id: d.stage_id,
      contact_id: d.contact_id,
      client_company_id: d.client_company_id ?? null,
      is_won: !!d.is_won,
      is_lost: !!d.is_lost,
      loss_reason: d.loss_reason ?? null,
      closed_at: d.closed_at ?? null,
      created_at: d.created_at,
      updated_at: d.updated_at,
    })),
    nextCursor,
  });
}

async function upsertContactForDeal(opts: {
  organizationId: string;
  contact: z.infer<typeof ContactInlineSchema>;
}) {
  const sb = createStaticAdminClient();
  const email = normalizeEmail(opts.contact.email);
  const phone = normalizePhone(opts.contact.phone);
  const name = normalizeText(opts.contact.name);
  if (!email && !phone) {
    throw new Error('Provide contact.email or contact.phone');
  }

  let lookup = sb
    .from('contacts')
    .select('id')
    .eq('organization_id', opts.organizationId)
    .is('deleted_at', null);
  if (email && phone) lookup = lookup.or(`email.eq.${email},phone.eq.${phone}`);
  else if (email) lookup = lookup.eq('email', email);
  else lookup = lookup.eq('phone', phone);

  const existing = await lookup.maybeSingle();
  if (existing.error) throw existing.error;

  const now = new Date().toISOString();
  const base: any = {
    organization_id: opts.organizationId,
    email,
    phone,
    role: normalizeText(opts.contact.role),
    client_company_id: sanitizeUUID(opts.contact.client_company_id) || null,
    updated_at: now,
  };

  if (existing.data?.id) {
    if (name) base.name = name;
    const { data, error } = await sb.from('contacts').update(base).eq('id', existing.data.id).select('id').single();
    if (error) throw error;
    return data.id as string;
  }

  if (!name) throw new Error('contact.name is required to create a new contact');
  const insert = {
    ...base,
    name,
    created_at: now,
    status: 'ACTIVE',
    stage: 'LEAD',
  };
  const { data, error } = await sb.from('contacts').insert(insert).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function POST(request: Request) {
  const auth = await authPublicApi(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = DealCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const sb = createStaticAdminClient();

  let boardId = sanitizeUUID(parsed.data.board_id);
  if (!boardId && parsed.data.board_key) {
    boardId = await resolveBoardIdFromKey({ organizationId: auth.organizationId, boardKey: parsed.data.board_key });
  }
  if (!boardId) {
    return NextResponse.json({ error: 'Provide board_id or board_key', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  let stageId = sanitizeUUID(parsed.data.stage_id);
  if (!stageId) {
    stageId = await resolveFirstStageId({ organizationId: auth.organizationId, boardId });
  }
  if (!stageId) {
    return NextResponse.json({ error: 'No stages found for board', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  let contactId = sanitizeUUID(parsed.data.contact_id);
  if (!contactId && parsed.data.contact) {
    try {
      contactId = await upsertContactForDeal({ organizationId: auth.organizationId, contact: parsed.data.contact });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Invalid contact', code: 'VALIDATION_ERROR' }, { status: 422 });
    }
  }
  if (!contactId) {
    return NextResponse.json({ error: 'Provide contact_id or contact', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  const now = new Date().toISOString();
  const value = Number(parsed.data.value ?? 0);
  const insertPayload: any = {
    organization_id: auth.organizationId,
    title: parsed.data.title.trim(),
    value,
    board_id: boardId,
    stage_id: stageId,
    contact_id: contactId,
    client_company_id: sanitizeUUID(parsed.data.client_company_id) || null,
    is_won: false,
    is_lost: false,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await sb
    .from('deals')
    .insert(insertPayload)
    .select('id,title,value,board_id,stage_id,contact_id,client_company_id,is_won,is_lost,loss_reason,closed_at,created_at,updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message, code: 'DB_ERROR' }, { status: 500 });

  return NextResponse.json({ data, action: 'created' }, { status: 201 });
}


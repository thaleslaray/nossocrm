import { createStaticAdminClient } from '@/lib/supabase/server';
import { normalizeEmail, normalizePhone } from '@/lib/public-api/sanitize';
import { resolveBoardId } from '@/lib/public-api/resolve';
import { sanitizeUUID } from '@/lib/supabase/utils';

const STAGE_NOTIFICATION_WEBHOOK = process.env.STAGE_NOTIFICATION_WEBHOOK_URL || '';

async function fireStageNotification(payload: {
  stage_name: string;
  contact_name: string;
  contact_phone: string;
  deal_id: string;
  deal_value: string;
  ai_summary: string;
}) {
  if (!STAGE_NOTIFICATION_WEBHOOK) return;
  try {
    // Enrich with contact name from DB
    const sb = createStaticAdminClient();
    if (payload.contact_phone) {
      const { data } = await sb
        .from('contacts')
        .select('name, phone')
        .eq('phone', payload.contact_phone)
        .limit(1)
        .maybeSingle();
      if (data?.name) payload.contact_name = data.name;
    }
    await fetch(STAGE_NOTIFICATION_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch { /* non-blocking */ }
}

export type MoveStageTarget =
  | { to_stage_id: string }
  | { to_stage_label: string }
  | { to_stage_id?: string; to_stage_label?: string };

async function resolveStageIdForBoard(opts: {
  organizationId: string;
  boardId: string;
  toStageId?: string | null;
  toStageLabel?: string | null;
}) {
  const sb = createStaticAdminClient();
  const idFromBody = sanitizeUUID(opts.toStageId || null);
  const label = (opts.toStageLabel || '').trim();

  if (idFromBody) {
    const { data, error } = await sb
      .from('board_stages')
      .select('id')
      .eq('organization_id', opts.organizationId)
      .eq('board_id', opts.boardId)
      .eq('id', idFromBody)
      .maybeSingle();
    if (error) throw error;
    return (data as any)?.id ? idFromBody : null;
  }

  if (!label) return null;

  const { data, error } = await sb
    .from('board_stages')
    .select('id,label')
    .eq('organization_id', opts.organizationId)
    .eq('board_id', opts.boardId)
    .ilike('label', label)
    .limit(2);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  if (data.length > 1) return '__AMBIGUOUS__';
  return (data[0] as any).id as string;
}

export async function moveStageByDealId(opts: {
  organizationId: string;
  dealId: string;
  target: { to_stage_id?: string | null; to_stage_label?: string | null };
  mark?: 'won' | 'lost' | null;
}) {
  const sb = createStaticAdminClient();
  const dealId = sanitizeUUID(opts.dealId);
  if (!dealId) return { ok: false as const, status: 422, body: { error: 'Invalid deal id', code: 'VALIDATION_ERROR' } };

  const { data: deal, error: dealError } = await sb
    .from('deals')
    .select('id,board_id,stage_id')
    .eq('organization_id', opts.organizationId)
    .is('deleted_at', null)
    .eq('id', dealId)
    .maybeSingle();
  if (dealError) return { ok: false as const, status: 500, body: { error: dealError.message, code: 'DB_ERROR' } };
  if (!deal) return { ok: false as const, status: 404, body: { error: 'Deal not found', code: 'NOT_FOUND' } };

  const boardId = (deal as any).board_id as string;
  const { data: boardCfg, error: boardCfgError } = await sb
    .from('boards')
    .select('won_stage_id,lost_stage_id')
    .eq('organization_id', opts.organizationId)
    .is('deleted_at', null)
    .eq('id', boardId)
    .maybeSingle();
  if (boardCfgError) return { ok: false as const, status: 500, body: { error: boardCfgError.message, code: 'DB_ERROR' } };
  const wonStageId = sanitizeUUID((boardCfg as any)?.won_stage_id) || null;
  const lostStageId = sanitizeUUID((boardCfg as any)?.lost_stage_id) || null;
  const stageId = await resolveStageIdForBoard({
    organizationId: opts.organizationId,
    boardId,
    toStageId: opts.target.to_stage_id ?? null,
    toStageLabel: opts.target.to_stage_label ?? null,
  });

  if (!stageId || stageId === '__AMBIGUOUS__') {
    return {
      ok: false as const,
      status: 422,
      body: {
        error: stageId === '__AMBIGUOUS__' ? 'Ambiguous stage label for this board' : 'Stage not found for this board',
        code: 'VALIDATION_ERROR',
      },
    };
  }

  const now = new Date().toISOString();
  const updates: any = { stage_id: stageId, last_stage_change_date: now, updated_at: now };
  if (opts.mark === 'won' || (wonStageId && stageId === wonStageId)) {
    updates.is_won = true;
    updates.is_lost = false;
    updates.closed_at = now;
    updates.loss_reason = null;
  }
  if (opts.mark === 'lost' || (lostStageId && stageId === lostStageId)) {
    updates.is_lost = true;
    updates.is_won = false;
    updates.closed_at = now;
  }
  const { data, error } = await sb
    .from('deals')
    .update(updates)
    .eq('organization_id', opts.organizationId)
    .eq('id', dealId)
    .select('id,title,value,board_id,stage_id,contact_id,client_company_id,is_won,is_lost,loss_reason,closed_at,created_at,updated_at')
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, body: { error: error.message, code: 'DB_ERROR' } };
  if (!data) return { ok: false as const, status: 404, body: { error: 'Deal not found', code: 'NOT_FOUND' } };
  return { ok: true as const, status: 200, body: { data, action: 'moved' } };
}

export async function moveStageByIdentity(opts: {
  organizationId: string;
  boardKeyOrId: string;
  phone?: string | null;
  email?: string | null;
  target: { to_stage_id?: string | null; to_stage_label?: string | null };
  mark?: 'won' | 'lost' | null;
  aiSummary?: string | null;
}) {
  const boardId = await resolveBoardId({
    organizationId: opts.organizationId,
    boardKeyOrId: opts.boardKeyOrId.trim(),
  });
  if (!boardId) return { ok: false as const, status: 404, body: { error: 'Board not found', code: 'NOT_FOUND' } };

  const phone = normalizePhone(opts.phone);
  const email = normalizeEmail(opts.email);
  if (!phone && !email) return { ok: false as const, status: 422, body: { error: 'Invalid phone/email', code: 'VALIDATION_ERROR' } };

  const sb = createStaticAdminClient();
  const { data: boardCfg, error: boardCfgError } = await sb
    .from('boards')
    .select('won_stage_id,lost_stage_id')
    .eq('organization_id', opts.organizationId)
    .is('deleted_at', null)
    .eq('id', boardId)
    .maybeSingle();
  if (boardCfgError) return { ok: false as const, status: 500, body: { error: boardCfgError.message, code: 'DB_ERROR' } };
  const wonStageId = sanitizeUUID((boardCfg as any)?.won_stage_id) || null;
  const lostStageId = sanitizeUUID((boardCfg as any)?.lost_stage_id) || null;

  let contactsQuery = sb
    .from('contacts')
    .select('id')
    .eq('organization_id', opts.organizationId)
    .is('deleted_at', null);
  if (phone && email) contactsQuery = contactsQuery.or(`phone.eq.${phone},email.eq.${email}`);
  else if (phone) contactsQuery = contactsQuery.eq('phone', phone);
  else contactsQuery = contactsQuery.eq('email', email);

  const { data: contacts, error: contactsError } = await contactsQuery.limit(20);
  if (contactsError) return { ok: false as const, status: 500, body: { error: contactsError.message, code: 'DB_ERROR' } };
  const contactIds = (contacts || []).map((c: any) => c.id).filter(Boolean);
  if (contactIds.length === 0) return { ok: false as const, status: 404, body: { error: 'Deal not found for this identity', code: 'NOT_FOUND' } };

  const { data: deals, error: dealsError } = await sb
    .from('deals')
    .select('id')
    .eq('organization_id', opts.organizationId)
    .is('deleted_at', null)
    .eq('board_id', boardId)
    .eq('is_won', false)
    .eq('is_lost', false)
    .in('contact_id', contactIds)
    .order('updated_at', { ascending: false })
    .limit(2);
  if (dealsError) return { ok: false as const, status: 500, body: { error: dealsError.message, code: 'DB_ERROR' } };
  if (!deals || deals.length === 0) return { ok: false as const, status: 404, body: { error: 'Deal not found for this identity', code: 'NOT_FOUND' } };
  // When multiple open deals exist, use the most recently updated one (first in list due to order)
  const dealId = (deals[0] as any).id as string;
  const stageId = await resolveStageIdForBoard({
    organizationId: opts.organizationId,
    boardId,
    toStageId: opts.target.to_stage_id ?? null,
    toStageLabel: opts.target.to_stage_label ?? null,
  });
  if (!stageId || stageId === '__AMBIGUOUS__') {
    return {
      ok: false as const,
      status: 422,
      body: {
        error: stageId === '__AMBIGUOUS__' ? 'Ambiguous stage label for this board' : 'Stage not found for this board',
        code: 'VALIDATION_ERROR',
      },
    };
  }

  const now = new Date().toISOString();
  const updates: any = { stage_id: stageId, last_stage_change_date: now, updated_at: now };
  if (opts.aiSummary) {
    updates.ai_summary = opts.aiSummary;
  }
  if (opts.mark === 'won' || (wonStageId && stageId === wonStageId)) {
    updates.is_won = true;
    updates.is_lost = false;
    updates.closed_at = now;
    updates.loss_reason = null;
  }
  if (opts.mark === 'lost' || (lostStageId && stageId === lostStageId)) {
    updates.is_lost = true;
    updates.is_won = false;
    updates.closed_at = now;
  }
  const { data: updated, error: updateError } = await sb
    .from('deals')
    .update(updates)
    .eq('organization_id', opts.organizationId)
    .eq('id', dealId)
    .select('id,title,value,board_id,stage_id,contact_id,client_company_id,is_won,is_lost,loss_reason,closed_at,created_at,updated_at,ai_summary')
    .maybeSingle();
  if (updateError) return { ok: false as const, status: 500, body: { error: updateError.message, code: 'DB_ERROR' } };
  if (!updated) return { ok: false as const, status: 404, body: { error: 'Deal not found', code: 'NOT_FOUND' } };

  // Stage notification is handled by Supabase trigger (trg_notify_stage_change)

  return { ok: true as const, status: 200, body: { data: updated, action: 'moved' } };
}


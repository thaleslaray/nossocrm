import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { createClient } from '@/lib/supabase/server';

function isMissingTableError(message: string) {
  const m = message.toLowerCase();
  return m.includes('could not find the table') && m.includes('whatsapp_accounts');
}

function buildWebhookUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/functions/v1/zapi-in/${token}`;
}

function getErrorMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && typeof (e as any).message === 'string') return (e as any).message;
  return fallback;
}

function missingTablesMessage() {
  return 'Tabelas do WhatsApp Lite não existem neste projeto Supabase. Aplique as migrations em supabase/migrations/20260104010000_whatsapp_core.sql e 20260104020000_whatsapp_zapi_singleton.sql no mesmo projeto configurado em NEXT_PUBLIC_SUPABASE_URL.';
}

export async function POST(req: Request) {
  // Mitigação CSRF: endpoint autenticado por cookies.
  if (!isAllowedOrigin(req)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr) {
      return Response.json({ error: profileErr.message }, { status: 500 });
    }

    const organizationId = profile?.organization_id ?? null;
    const isAdmin = profile?.role === 'admin';

    if (!organizationId) {
      return new Response('Profile sem organização', { status: 409 });
    }

    if (!isAdmin) {
      return new Response('Forbidden', { status: 403 });
    }

    const { data: existing, error: existingErr } = await supabase
      .from('whatsapp_accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('provider', 'zapi')
      .maybeSingle();

    if (existingErr) {
      if (isMissingTableError(existingErr.message)) {
        return new Response(missingTablesMessage(), { status: 500 });
      }
      return Response.json({ error: existingErr.message }, { status: 500 });
    }

    if (!existing) {
      return new Response('Conta Z-API não existe', { status: 404 });
    }

    const token = crypto.randomUUID();

    const { data: updated, error: updateErr } = await supabase
      .from('whatsapp_accounts')
      .update({ webhook_token: token, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('provider', 'zapi')
      .select('id, active, provider, name, webhook_token, config')
      .maybeSingle();

    if (updateErr) {
      if (isMissingTableError(updateErr.message)) {
        return new Response(missingTablesMessage(), { status: 500 });
      }
      return Response.json({ error: updateErr.message }, { status: 500 });
    }

    if (!updated) {
      return new Response('Conta Z-API não existe', { status: 404 });
    }

    return Response.json({ account: updated, webhookUrl: buildWebhookUrl(updated.webhook_token) }, { status: 200 });
  } catch (e) {
    return Response.json({ error: getErrorMessage(e, 'Erro ao rotacionar token') }, { status: 500 });
  }
}

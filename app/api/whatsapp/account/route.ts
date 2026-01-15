import { z } from 'zod';

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
	if (e && typeof e === 'object') {
		const maybeMessage = (e as any).message;
		if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
	}
	return fallback;
}

function generateWebhookToken() {
	return crypto.randomUUID();
}

const PostBodySchema = z
	.object({
		name: z.string().trim().min(1).max(120).optional(),
	})
	.optional();

const PutBodySchema = z.object({
	name: z.string().trim().min(1).max(120).optional(),
	active: z.boolean().optional(),
	instance_id: z.string().trim().min(1).optional(),
	instance_token: z.string().trim().min(1).optional(),
	instance_api_base: z.string().trim().url().optional(),
});

async function getAdminContext() {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return { supabase, user: null, organizationId: null, isAdmin: false } as const;
	}

	const { data: profile, error: profileErr } = await supabase
		.from('profiles')
		.select('organization_id, role')
		.eq('id', user.id)
		.maybeSingle();

	if (profileErr) {
		throw profileErr;
	}

	const organizationId = profile?.organization_id ?? null;
	const isAdmin = profile?.role === 'admin';

	return { supabase, user, organizationId, isAdmin } as const;
}

function missingTablesMessage() {
	return 'Tabelas do WhatsApp Lite não existem neste projeto Supabase. Aplique as migrations em supabase/migrations/20260104010000_whatsapp_core.sql e 20260104020000_whatsapp_zapi_singleton.sql no mesmo projeto configurado em NEXT_PUBLIC_SUPABASE_URL.';
}

export async function GET(req: Request) {
	// Mitigação CSRF: endpoint autenticado por cookies.
	if (!isAllowedOrigin(req)) {
		return new Response('Forbidden', { status: 403 });
	}

	try {
		const { supabase, user, organizationId, isAdmin } = await getAdminContext();

		if (!user) {
			return new Response('Unauthorized', { status: 401 });
		}

		if (!organizationId) {
			return new Response('Profile sem organização', { status: 409 });
		}

		if (!isAdmin) {
			return new Response('Forbidden', { status: 403 });
		}

		const { data: account, error } = await supabase
			.from('whatsapp_accounts')
			.select('id, active, provider, name, webhook_token, config')
			.eq('organization_id', organizationId)
			.eq('provider', 'zapi')
			.maybeSingle();

		if (error) {
			if (isMissingTableError(error.message)) {
				return new Response(missingTablesMessage(), { status: 500 });
			}
			return Response.json({ error: error.message }, { status: 500 });
		}

		if (!account) {
			return Response.json({ account: null, webhookUrl: null }, { status: 200 });
		}

		return Response.json(
			{
				account,
				webhookUrl: buildWebhookUrl(account.webhook_token),
			},
			{ status: 200 }
		);
	} catch (e) {
		return Response.json({ error: getErrorMessage(e, 'Erro ao carregar conta') }, { status: 500 });
	}
}

export async function POST(req: Request) {
	// Mitigação CSRF: endpoint autenticado por cookies.
	if (!isAllowedOrigin(req)) {
		return new Response('Forbidden', { status: 403 });
	}

	try {
		const body = await req.json().catch(() => undefined);
		const parsed = PostBodySchema?.safeParse(body);
		const name = parsed?.success ? parsed.data?.name : undefined;

		const { supabase, user, organizationId, isAdmin } = await getAdminContext();

		if (!user) {
			return new Response('Unauthorized', { status: 401 });
		}

		if (!organizationId) {
			return new Response('Profile sem organização', { status: 409 });
		}

		if (!isAdmin) {
			return new Response('Forbidden', { status: 403 });
		}

		const { data: existing, error: existingErr } = await supabase
			.from('whatsapp_accounts')
			.select('id, active, provider, name, webhook_token, config')
			.eq('organization_id', organizationId)
			.eq('provider', 'zapi')
			.maybeSingle();

		if (existingErr) {
			if (isMissingTableError(existingErr.message)) {
				return new Response(missingTablesMessage(), { status: 500 });
			}
			return Response.json({ error: existingErr.message }, { status: 500 });
		}

		if (existing) {
			return Response.json(
				{
					account: existing,
					webhookUrl: buildWebhookUrl(existing.webhook_token),
				},
				{ status: 200 }
			);
		}

		const token = generateWebhookToken();

		const { data: inserted, error: insertErr } = await supabase
			.from('whatsapp_accounts')
			.insert({
				organization_id: organizationId,
				provider: 'zapi',
				name: name ?? 'Z-API WhatsApp',
				webhook_token: token,
				active: true,
				config: {},
			})
			.select('id, active, provider, name, webhook_token, config')
			.single();

		if (insertErr) {
			if (isMissingTableError(insertErr.message)) {
				return new Response(missingTablesMessage(), { status: 500 });
			}

			// Caso clássico: singleton já existe (race). Carrega e retorna.
			const { data: fallbackExisting } = await supabase
				.from('whatsapp_accounts')
				.select('id, active, provider, name, webhook_token, config')
				.eq('organization_id', organizationId)
				.eq('provider', 'zapi')
				.maybeSingle();

			if (fallbackExisting) {
				return Response.json(
					{ account: fallbackExisting, webhookUrl: buildWebhookUrl(fallbackExisting.webhook_token) },
					{ status: 200 }
				);
			}

			return Response.json({ error: insertErr.message }, { status: 500 });
		}

		return Response.json(
			{
				account: inserted,
				webhookUrl: buildWebhookUrl(inserted.webhook_token),
			},
			{ status: 201 }
		);
	} catch (e) {
		return Response.json({ error: getErrorMessage(e, 'Erro ao criar conta') }, { status: 500 });
	}
}

export async function PUT(req: Request) {
	// Mitigação CSRF: endpoint autenticado por cookies.
	if (!isAllowedOrigin(req)) {
		return new Response('Forbidden', { status: 403 });
	}

	try {
		const body = await req.json().catch(() => null);
		const parsed = PutBodySchema.safeParse(body);

		if (!parsed.success) {
			return Response.json({ error: 'Payload inválido' }, { status: 400 });
		}

		const { supabase, user, organizationId, isAdmin } = await getAdminContext();

		if (!user) {
			return new Response('Unauthorized', { status: 401 });
		}

		if (!organizationId) {
			return new Response('Profile sem organização', { status: 409 });
		}

		if (!isAdmin) {
			return new Response('Forbidden', { status: 403 });
		}

		const patch = parsed.data;

		const configPatch: Record<string, unknown> = {};
		if (patch.instance_id) configPatch.instance_id = patch.instance_id;
		if (patch.instance_token) configPatch.instance_token = patch.instance_token;
		if (patch.instance_api_base) configPatch.instance_api_base = patch.instance_api_base;

		const update: Record<string, unknown> = {
			updated_at: new Date().toISOString(),
		};

		if (typeof patch.active === 'boolean') update.active = patch.active;
		if (patch.name) update.name = patch.name;

		// Atualiza config como merge server-side (evita perder outras chaves).
		if (Object.keys(configPatch).length > 0) {
			const { data: current, error: currentErr } = await supabase
				.from('whatsapp_accounts')
				.select('id, config')
				.eq('organization_id', organizationId)
				.eq('provider', 'zapi')
				.maybeSingle();

			if (currentErr) {
				if (isMissingTableError(currentErr.message)) {
					return new Response(missingTablesMessage(), { status: 500 });
				}
				return Response.json({ error: currentErr.message }, { status: 500 });
			}

			if (!current) {
				return new Response('Conta Z-API não existe', { status: 404 });
			}

			update.config = { ...(current.config as any), ...configPatch };
		}

		const { data: updated, error: updateErr } = await supabase
			.from('whatsapp_accounts')
			.update(update)
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

		return Response.json(
			{
				account: updated,
				webhookUrl: buildWebhookUrl(updated.webhook_token),
			},
			{ status: 200 }
		);
	} catch (e) {
		return Response.json({ error: getErrorMessage(e, 'Erro ao atualizar conta') }, { status: 500 });
	}
}
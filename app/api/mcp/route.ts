import { NextResponse } from 'next/server';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { isValidUUID } from '@/lib/supabase/utils';

export const runtime = 'nodejs';

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
};

function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function getApiKeyFromHeaders(request: Request) {
  const headerKey = request.headers.get('x-api-key');
  if (headerKey?.trim()) return headerKey.trim();

  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]?.trim()) return m[1].trim();

  return '';
}

async function authMcp(request: Request) {
  const apiKey = getApiKeyFromHeaders(request);
  if (!apiKey) return { ok: false as const, status: 401, body: { error: 'Missing API key', code: 'AUTH_MISSING' } };

  // `authPublicApi` expects X-Api-Key. Most MCP clients use Authorization: Bearer, so we normalize here.
  const headers = new Headers(request.headers);
  headers.set('x-api-key', apiKey);
  const normalized = new Request(request.url, { method: request.method, headers });

  return await authPublicApi(normalized);
}

function toolText(json: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(json, null, 2) }],
  };
}

const TOOLS = [
  {
    name: 'crm_get_me',
    description: 'Returns the organization context for the current API key.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'crm_search_deals',
    description: 'Search deals by title (substring match) within the authenticated organization.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query (matches deal title)' },
        limit: { type: 'number', description: 'Max number of deals to return (default 20, max 50)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'crm_get_deal',
    description: 'Get a deal by id within the authenticated organization.',
    inputSchema: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'Deal UUID' },
      },
      required: ['dealId'],
      additionalProperties: false,
    },
  },
] as const;

async function handleToolsCall(opts: { toolName: string; args: any; auth: { organizationId: string; organizationName: string } }) {
  const sb = createStaticAdminClient();

  if (opts.toolName === 'crm_get_me') {
    return toolText({
      organization_id: opts.auth.organizationId,
      organization_name: opts.auth.organizationName,
    });
  }

  if (opts.toolName === 'crm_search_deals') {
    const q = typeof opts.args?.q === 'string' ? opts.args.q.trim() : '';
    const limitRaw = typeof opts.args?.limit === 'number' ? opts.args.limit : 20;
    const limit = Math.max(1, Math.min(50, Math.floor(limitRaw)));

    let query = sb
      .from('deals')
      .select('id,title,value,board_id,stage_id,contact_id,client_company_id,is_won,is_lost,loss_reason,closed_at,created_at,updated_at')
      .eq('organization_id', opts.auth.organizationId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (q) query = query.ilike('title', `%${q}%`);

    const { data, error } = await query;
    if (error) {
      return toolText({ error: error.message, code: 'DB_ERROR' });
    }

    return toolText({
      deals: (data || []).map((d: any) => ({
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
    });
  }

  if (opts.toolName === 'crm_get_deal') {
    const dealId = opts.args?.dealId;
    if (!isValidUUID(dealId)) {
      return toolText({ error: 'dealId must be a valid UUID', code: 'VALIDATION_ERROR' });
    }

    const { data, error } = await sb
      .from('deals')
      .select('id,title,value,board_id,stage_id,contact_id,client_company_id,is_won,is_lost,loss_reason,closed_at,created_at,updated_at')
      .eq('organization_id', opts.auth.organizationId)
      .eq('id', dealId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) return toolText({ error: error.message, code: 'DB_ERROR' });
    if (!data) return toolText({ error: 'Deal not found', code: 'NOT_FOUND' });

    return toolText({
      deal: {
        id: data.id,
        title: data.title,
        value: Number((data as any).value ?? 0),
        board_id: (data as any).board_id,
        stage_id: (data as any).stage_id,
        contact_id: (data as any).contact_id,
        client_company_id: (data as any).client_company_id ?? null,
        is_won: !!(data as any).is_won,
        is_lost: !!(data as any).is_lost,
        loss_reason: (data as any).loss_reason ?? null,
        closed_at: (data as any).closed_at ?? null,
        created_at: (data as any).created_at,
        updated_at: (data as any).updated_at,
      },
    });
  }

  return toolText({ error: `Unknown tool: ${opts.toolName}`, code: 'UNKNOWN_TOOL' });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: 'crmia-next-mcp',
    endpoint: '/api/mcp',
    auth: 'Authorization: Bearer <API_KEY> (or X-Api-Key header)',
  });
}

export async function POST(request: Request) {
  const auth = await authMcp(request);
  if (!auth.ok) {
    // JSON-RPC friendly error envelope (MCP clients will still see 401 if they surface it)
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: auth.body.error, data: auth.body } }, { status: auth.status });
  }

  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return NextResponse.json(jsonRpcError(null, -32600, 'Invalid Request'), { status: 400 });
  }

  // MCP core methods (minimal set to work with common MCP clients / Inspector)
  if (body.method === 'initialize') {
    return NextResponse.json(
      jsonRpcResult(body.id, {
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'crmia-next-mcp', version: '0.1.0' },
        capabilities: { tools: {}, resources: {} },
      })
    );
  }

  if (body.method === 'notifications/initialized') {
    // Notification: no response required by JSON-RPC, but returning 204 keeps proxies happy.
    return new NextResponse(null, { status: 204 });
  }

  if (body.method === 'tools/list') {
    return NextResponse.json(jsonRpcResult(body.id, { tools: TOOLS }));
  }

  if (body.method === 'tools/call') {
    const toolName = body.params?.name;
    const args = body.params?.arguments ?? {};
    if (typeof toolName !== 'string' || !toolName) {
      return NextResponse.json(jsonRpcError(body.id, -32602, 'Invalid params: missing tool name'), { status: 400 });
    }

    const toolResult = await handleToolsCall({
      toolName,
      args,
      auth: { organizationId: auth.organizationId, organizationName: auth.organizationName },
    });

    return NextResponse.json(jsonRpcResult(body.id, toolResult));
  }

  return NextResponse.json(jsonRpcError(body.id, -32601, `Method not found: ${body.method}`), { status: 404 });
}


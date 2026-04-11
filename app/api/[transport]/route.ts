import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { authPublicApi } from '@/lib/public-api/auth';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import { registerExistingCrmTools } from '@/lib/mcp/registerTools';
import { registerMessagingTools } from '@/lib/mcp/tools/messaging';
import { registerAITools } from '@/lib/mcp/tools/ai';
import { registerAdminTools } from '@/lib/mcp/tools/admin';
import { registerContactsAdvancedTools } from '@/lib/mcp/tools/contacts-advanced';
import { registerSimulationTools } from '@/lib/mcp/tools/simulation';
import { mcpContextStorage } from '@/lib/mcp/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveApiKey(token: string) {
  const fakeRequest = new Request('http://localhost/api/mcp', {
    headers: { 'x-api-key': token },
  });

  const result = await authPublicApi(fakeRequest);
  if (!result.ok) return null;

  const sb = createStaticAdminClient();
  const { data } = await sb
    .from('api_keys')
    .select('created_by')
    .eq('id', result.apiKeyId)
    .eq('organization_id', result.organizationId)
    .maybeSingle();

  if (!data) return null;

  return {
    organizationId: result.organizationId,
    userId: data.created_by as string,
  };
}

function extractBearerToken(request: Request): string {
  const auth = request.headers.get('authorization') ?? '';
  const fromBearer = auth.replace(/^Bearer\s+/i, '').trim();
  if (fromBearer) return fromBearer;
  return request.headers.get('x-api-key')?.trim() ?? '';
}

const mcpHandler = createMcpHandler(
  (server) => {
    registerExistingCrmTools(server);
    registerMessagingTools(server);
    registerAITools(server);
    registerAdminTools(server);
    registerContactsAdvancedTools(server);
    registerSimulationTools(server);
  },
  undefined,
  {
    basePath: '/api',
    maxDuration: 120,
    verboseLogs: process.env.NODE_ENV === 'development',
  }
);

const authWrappedHandler = withMcpAuth(
  mcpHandler,
  async (req, bearerToken) => {
    const token = bearerToken ?? extractBearerToken(req);
    if (!token) return undefined;

    const ctx = await resolveApiKey(token);
    if (!ctx) return undefined;

    // Return a minimal AuthInfo-compatible object. The real context is stored
    // in AsyncLocalStorage by the outer wrappedHandler below.
    return { token, clientId: ctx.userId, scopes: [] };
  }
);

async function wrappedHandler(request: Request) {
  const token = extractBearerToken(request);

  if (token) {
    const ctx = await resolveApiKey(token);
    if (ctx) {
      return mcpContextStorage.run(ctx, () => authWrappedHandler(request));
    }
  }

  return authWrappedHandler(request);
}

export {
  wrappedHandler as GET,
  wrappedHandler as POST,
  wrappedHandler as DELETE,
};

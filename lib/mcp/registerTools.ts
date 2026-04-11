import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createCRMTools } from '@/lib/ai/tools';
import { CRM_TOOL_CATALOG } from '@/lib/mcp/crmToolCatalog';
import { getMcpContext } from '@/lib/mcp/context';

type AnyTool = {
  description?: string;
  inputSchema?: unknown;
  execute?: (args: any) => Promise<any> | any;
};

export function registerExistingCrmTools(server: McpServer) {
  // Create tools with dummy context to extract schemas only
  const dummyTools = createCRMTools({ organizationId: '__schema__' }, '__schema__') as Record<string, AnyTool>;

  for (const [internalKey, t] of Object.entries(dummyTools)) {
    if (!t?.execute) continue;

    const catalog = (CRM_TOOL_CATALOG as Record<string, any>)[internalKey];
    if (!catalog) continue;

    const zodSchema = (t as any).inputSchema;
    // Zod v3: shape can be a function (ZodObject) or absent (other schema types).
    // Extract the inner shape for mcp-handler's flat inputSchema format.
    const shapeDef = zodSchema?._def?.shape;
    const flatShape = typeof shapeDef === 'function' ? shapeDef() : (shapeDef ?? {});

    server.registerTool(
      catalog.name,
      {
        title: catalog.title,
        description: catalog.description,
        inputSchema: flatShape,
      },
      async (args: any) => {
        const ctx = getMcpContext();
        const realTools = createCRMTools(
          { organizationId: ctx.organizationId },
          ctx.userId
        ) as Record<string, AnyTool>;

        const realTool = realTools[internalKey];
        if (!realTool?.execute) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Tool ${internalKey} not available` }) }],
            isError: true,
          };
        }

        try {
          const result = await realTool.execute(args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: err?.message || 'Tool execution failed' }) }],
            isError: true,
          };
        }
      }
    );
  }
}

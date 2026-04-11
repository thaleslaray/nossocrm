import { AsyncLocalStorage } from 'node:async_hooks';

export type McpRequestContext = {
  organizationId: string;
  userId: string;
};

export const mcpContextStorage = new AsyncLocalStorage<McpRequestContext>();

export function getMcpContext(): McpRequestContext {
  const ctx = mcpContextStorage.getStore();
  if (!ctx) {
    throw new Error('MCP context not available — called outside of request handler');
  }
  return ctx;
}

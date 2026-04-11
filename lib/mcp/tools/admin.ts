import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getMcpContext } from '@/lib/mcp/context';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';

const getDb = () => createStaticAdminClient();

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

export function registerAdminTools(server: McpServer) {
  // ─── crm.admin.users.list ─────────────────────────────────────────────────
  server.registerTool(
    'crm.admin.users.list',
    {
      title: 'List team members',
      description:
        'Read-only. Lists all team members (profiles) for the authenticated organization. Returns id, email, name, role, avatar_url, created_at.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();
      const { data, error } = await getDb()
        .from('profiles')
        .select('id, email, name, role, avatar_url, created_at')
        .eq('organization_id', ctx.organizationId)
        .order('created_at', { ascending: true });

      if (error) return err(error.message);
      return ok(data);
    }
  );

  // ─── crm.settings.ai.get ─────────────────────────────────────────────────
  server.registerTool(
    'crm.settings.ai.get',
    {
      title: 'Get AI settings',
      description:
        'Read-only. Returns AI configuration for the authenticated organization. API keys are never returned — only boolean flags (hasGoogleKey, hasOpenAIKey, hasAnthropicKey) indicate whether keys are configured.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();

      const { data, error } = await getDb()
        .from('organization_settings')
        .select(
          'organization_id, ai_enabled, ai_provider, ai_model, ai_google_key, ai_takeover_enabled, ai_config_mode, ai_template_id, ai_hitl_threshold'
        )
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      if (error) return err(error.message);
      if (!data) return err('Organization settings not found');

      // Mask API keys — never return the actual values
      const { ai_google_key, ...safe } = data as typeof data & { ai_google_key?: string | null };
      const result = {
        ...safe,
        hasGoogleKey: !!ai_google_key,
      };

      return ok(result);
    }
  );

  // ─── crm.settings.ai.update ───────────────────────────────────────────────
  server.registerTool(
    'crm.settings.ai.update',
    {
      title: 'Update AI settings',
      description:
        'Writes data. Updates non-sensitive AI configuration fields. API keys cannot be updated via MCP — use the web UI for key management. Scoped to the authenticated organization.',
      inputSchema: {
        ai_enabled: z.boolean().optional(),
        ai_provider: z.string().optional(),
        ai_model: z.string().optional(),
        ai_takeover_enabled: z.boolean().optional(),
        ai_config_mode: z
          .enum(['zero_config', 'template', 'auto_learn', 'advanced'])
          .optional(),
        ai_template_id: z.string().uuid().nullable().optional(),
        ai_hitl_threshold: z.number().min(0).max(1).optional(),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      // Build update payload from only provided fields
      const updates: Record<string, unknown> = {};
      if (args.ai_enabled !== undefined) updates.ai_enabled = args.ai_enabled;
      if (args.ai_provider !== undefined) updates.ai_provider = args.ai_provider;
      if (args.ai_model !== undefined) updates.ai_model = args.ai_model;
      if (args.ai_takeover_enabled !== undefined) updates.ai_takeover_enabled = args.ai_takeover_enabled;
      if (args.ai_config_mode !== undefined) updates.ai_config_mode = args.ai_config_mode;
      if (args.ai_template_id !== undefined) updates.ai_template_id = args.ai_template_id;
      if (args.ai_hitl_threshold !== undefined) updates.ai_hitl_threshold = args.ai_hitl_threshold;

      if (Object.keys(updates).length === 0) return err('No fields provided to update');

      const { data, error } = await getDb()
        .from('organization_settings')
        .update(updates)
        .eq('organization_id', ctx.organizationId)
        .select(
          'organization_id, ai_enabled, ai_provider, ai_model, ai_takeover_enabled, ai_config_mode, ai_template_id, ai_hitl_threshold'
        )
        .maybeSingle();

      if (error) return err(error.message);
      if (!data) return err('Organization settings not found');
      return ok(data);
    }
  );

  // ─── crm.settings.ai_templates.list ──────────────────────────────────────
  server.registerTool(
    'crm.settings.ai_templates.list',
    {
      title: 'List AI qualification templates',
      description:
        'Read-only. Lists AI qualification templates available to the authenticated organization. Includes both system-wide templates (organization_id IS NULL) and org-specific custom templates.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();

      // Fetch system templates (organization_id IS NULL) and org-specific ones
      const { data, error } = await getDb()
        .from('ai_qualification_templates')
        .select('id, organization_id, name, stages, is_system, created_at')
        .or(`organization_id.is.null,organization_id.eq.${ctx.organizationId}`)
        .order('is_system', { ascending: false })
        .order('name', { ascending: true });
      if (error) return err(error.message);
      return ok(data);
    }
  );

  // ─── crm.settings.ai_features.get ────────────────────────────────────────
  server.registerTool(
    'crm.settings.ai_features.get',
    {
      title: 'Get AI feature flags',
      description:
        'Read-only. Returns the current AI feature flag state for the authenticated organization: ai_enabled, ai_takeover_enabled, and ai_config_mode.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();

      const { data, error } = await getDb()
        .from('organization_settings')
        .select('ai_enabled, ai_takeover_enabled, ai_config_mode')
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      if (error) return err(error.message);
      if (!data) return err('Organization settings not found');
      return ok(data);
    }
  );
}

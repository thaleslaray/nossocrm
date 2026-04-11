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

export function registerMessagingTools(server: McpServer) {
  // ─── crm.channels.list ───────────────────────────────────────────────────
  server.registerTool(
    'crm.channels.list',
    {
      title: 'List channels',
      description:
        'Read-only. Lists messaging channels (WhatsApp, Instagram, Email, etc.) for the authenticated organization. Credentials are never returned.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();
      const { data, error } = await getDb()
        .from('messaging_channels')
        .select(
          'id, organization_id, channel_type, provider, external_identifier, name, settings, status, deleted_at, created_at, updated_at'
        )
        .eq('organization_id', ctx.organizationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) return err(error.message);
      return ok(data);
    }
  );

  // ─── crm.channels.create ─────────────────────────────────────────────────
  server.registerTool(
    'crm.channels.create',
    {
      title: 'Create messaging channel',
      description:
        'Creates a new messaging channel (WhatsApp, Email, etc.) for the organization. Credentials are stored encrypted. Returns the created channel id.',
      inputSchema: {
        name: z.string().min(1).describe('Friendly name for the channel'),
        channelType: z
          .enum(['whatsapp', 'instagram', 'email', 'sms', 'telegram'])
          .describe('Type of channel'),
        provider: z
          .string()
          .min(1)
          .describe('Provider name: z-api, meta-cloud, evolution, resend, meta, etc.'),
        externalIdentifier: z
          .string()
          .min(1)
          .describe('Phone number, email address, or handle that identifies this channel externally'),
        businessUnitId: z
          .string()
          .uuid()
          .describe('Business unit this channel belongs to'),
        credentials: z
          .record(z.string(), z.string())
          .default({})
          .describe('Provider credentials as key-value pairs (e.g. apiKey, instanceName, serverUrl)'),
        settings: z
          .record(z.string(), z.unknown())
          .default({})
          .describe('Optional provider settings'),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      const { data, error } = await getDb()
        .from('messaging_channels')
        .insert({
          organization_id: ctx.organizationId,
          business_unit_id: args.businessUnitId,
          channel_type: args.channelType,
          provider: args.provider,
          external_identifier: args.externalIdentifier,
          name: args.name,
          credentials: args.credentials ?? {},
          settings: args.settings ?? {},
          status: 'pending',
        })
        .select('id, name, channel_type, provider, external_identifier, status, created_at')
        .maybeSingle();

      if (error || !data) {
        return err(error?.message ?? 'Falha ao criar canal');
      }

      const result: Record<string, unknown> = { ...data };
      if (args.provider === 'evolution') {
        result.warning = 'Canal Evolution criado. Configure o webhook na sua instância apontando para: /functions/v1/messaging-webhook-evolution/' + data.id;
      }
      return ok(result);
    }
  );

  // ─── crm.conversations.list ──────────────────────────────────────────────
  server.registerTool(
    'crm.conversations.list',
    {
      title: 'List conversations',
      description:
        'Read-only. Lists messaging conversations with optional filters (channelId, contactId, status). Includes contact name via join. Scoped to the authenticated organization.',
      inputSchema: {
        channelId: z.string().uuid().optional(),
        contactId: z.string().uuid().optional(),
        status: z.enum(['open', 'resolved']).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      let query = getDb()
        .from('messaging_conversations')
        .select(
          `id, organization_id, channel_id, contact_id, external_contact_id,
           external_contact_name, status, priority, assigned_user_id,
           unread_count, message_count, last_message_at, last_message_preview,
           contacts ( id, name, email )`
        )
        .eq('organization_id', ctx.organizationId)
        .order('last_message_at', { ascending: false })
        .limit(args.limit ?? 50);

      if (args.channelId) query = query.eq('channel_id', args.channelId);
      if (args.contactId) query = query.eq('contact_id', args.contactId);
      if (args.status) query = query.eq('status', args.status);

      const { data, error } = await query;
      if (error) return err(error.message);
      return ok(data);
    }
  );

  // ─── crm.conversations.get ───────────────────────────────────────────────
  server.registerTool(
    'crm.conversations.get',
    {
      title: 'Get conversation',
      description:
        'Read-only. Returns a single conversation with its most recent messages, contact, and channel info. Scoped to the authenticated organization.',
      inputSchema: {
        conversationId: z.string().uuid(),
        messageLimit: z.number().int().min(1).max(100).default(50),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      const { data: conversation, error: convError } = await getDb()
        .from('messaging_conversations')
        .select(
          `id, organization_id, channel_id, contact_id, external_contact_id,
           external_contact_name, status, priority, assigned_user_id,
           unread_count, message_count, last_message_at, last_message_preview,
           contacts ( id, name, email, phone ),
           messaging_channels ( id, name, channel_type, provider, status )`
        )
        .eq('id', args.conversationId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      if (convError) return err(convError.message);
      if (!conversation) return err('Conversation not found');

      const { data: messages, error: msgError } = await getDb()
        .from('messaging_messages')
        .select(
          'id, conversation_id, external_id, direction, content_type, content, status, error_code, error_message, sender_name, metadata, created_at'
        )
        .eq('conversation_id', args.conversationId)
        .order('created_at', { ascending: false })
        .limit(args.messageLimit ?? 50);

      if (msgError) return err(msgError.message);

      return ok({ ...conversation, messages: (messages ?? []).reverse() });
    }
  );

  // ─── crm.messages.send ───────────────────────────────────────────────────
  server.registerTool(
    'crm.messages.send',
    {
      title: 'Send message',
      description:
        'Writes data. Queues a text message for sending in an existing conversation. The message is inserted as "pending" and will be dispatched by the messaging worker. Scoped to the authenticated organization.',
      inputSchema: {
        conversationId: z.string().uuid(),
        text: z.string().min(1).max(4096),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      // Verify the conversation belongs to this org before inserting
      const { data: conv, error: convError } = await getDb()
        .from('messaging_conversations')
        .select('id')
        .eq('id', args.conversationId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      if (convError) return err(convError.message);
      if (!conv) return err('Conversation not found or access denied');

      const { data: message, error: insertError } = await getDb()
        .from('messaging_messages')
        .insert({
          conversation_id: args.conversationId,
          direction: 'outbound',
          content_type: 'text',
          content: { type: 'text', text: args.text },
          status: 'pending',
          sender_name: 'AI Agent',
        })
        .select('id, conversation_id, direction, content_type, content, status, created_at')
        .maybeSingle();

      if (insertError) return err(insertError.message);
      return ok(message);
    }
  );

  // ─── crm.messages.search ─────────────────────────────────────────────────
  server.registerTool(
    'crm.messages.search',
    {
      title: 'Search messages',
      description:
        'Read-only. Full-text search over message content within the authenticated organization. Joins through conversations to enforce org scoping.',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(20),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      // Join through conversations to enforce org_id scoping
      // (messaging_messages has no organization_id column)
      const { data, error } = await getDb()
        .from('messaging_messages')
        .select(
          `id, conversation_id, direction, content_type, content, status,
           sender_name, created_at,
           messaging_conversations!inner ( id, organization_id, external_contact_name, status )`
        )
        .eq('messaging_conversations.organization_id', ctx.organizationId)
        .textSearch('content', args.query, { config: 'portuguese' })
        .order('created_at', { ascending: false })
        .limit(args.limit ?? 20);

      if (error) return err(error.message);
      return ok(data);
    }
  );

  // ─── crm.messages.retry ──────────────────────────────────────────────────
  server.registerTool(
    'crm.messages.retry',
    {
      title: 'Retry failed message',
      description:
        'Writes data. Resets a failed message back to "pending" status so it will be retried by the messaging worker. Scoped to the authenticated organization.',
      inputSchema: {
        messageId: z.string().uuid(),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      // Look up message via conversation join to verify org ownership
      const { data: msg, error: lookupError } = await getDb()
        .from('messaging_messages')
        .select(
          `id, status, messaging_conversations!inner ( organization_id )`
        )
        .eq('id', args.messageId)
        .eq('messaging_conversations.organization_id', ctx.organizationId)
        .maybeSingle();

      if (lookupError) return err(lookupError.message);
      if (!msg) return err('Message not found or access denied');
      if (msg.status !== 'failed') return err(`Message is not in failed state (current: ${msg.status})`);

      const { data: updated, error: updateError } = await getDb()
        .from('messaging_messages')
        .update({ status: 'pending', error_code: null, error_message: null })
        .eq('id', args.messageId)
        .select('id, status, updated_at')
        .maybeSingle();

      if (updateError) return err(updateError.message);
      return ok(updated);
    }
  );

  // ─── crm.templates.list ──────────────────────────────────────────────────
  server.registerTool(
    'crm.templates.list',
    {
      title: 'List message templates',
      description:
        'Read-only. Lists HSM (WhatsApp) message templates, optionally filtered by channel. Scoped to the authenticated organization via channel ownership.',
      inputSchema: {
        channelId: z.string().uuid().optional(),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      // Filter by org via the channel join
      let query = getDb()
        .from('messaging_templates')
        .select(
          `id, channel_id, external_id, name, language, category, components, status,
           messaging_channels!inner ( id, organization_id, name, channel_type )`
        )
        .eq('messaging_channels.organization_id', ctx.organizationId)
        .order('name', { ascending: true });

      if (args.channelId) query = query.eq('channel_id', args.channelId);

      const { data, error } = await query;
      if (error) return err(error.message);
      return ok(data);
    }
  );

  // ─── crm.templates.sync ──────────────────────────────────────────────────
  server.registerTool(
    'crm.templates.sync',
    {
      title: 'Sync message templates',
      description:
        'Initiates a template sync with the provider (Meta). This operation requires Meta API credentials and must be performed via the web UI.',
      inputSchema: {
        channelId: z.string().uuid().optional(),
      },
    },
    async () => {
      return err(
        'Template sync must be done via the web UI — it requires live Meta API credentials that are not accessible from MCP tools.'
      );
    }
  );
}

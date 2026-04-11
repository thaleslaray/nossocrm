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

export function registerContactsAdvancedTools(server: McpServer) {
  // ─── crm.contacts.find_duplicates ────────────────────────────────────────
  server.registerTool(
    'crm.contacts.find_duplicates',
    {
      title: 'Find duplicate contacts',
      description:
        'Read-only. Finds potential duplicate contacts by matching email or phone within the authenticated organization. Returns groups of contacts that share the same email or phone value.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();

      // Find duplicates by email
      const { data: emailDups, error: emailError } = await getDb()
        .from('contacts')
        .select('id, name, email, phone, company_name, source, created_at')
        .eq('organization_id', ctx.organizationId)
        .not('email', 'is', null)
        .neq('email', '')
        .order('email', { ascending: true })
        .order('created_at', { ascending: true });

      if (emailError) return err(emailError.message);

      // Find duplicates by phone
      const { data: phoneDups, error: phoneError } = await getDb()
        .from('contacts')
        .select('id, name, email, phone, company_name, source, created_at')
        .eq('organization_id', ctx.organizationId)
        .not('phone', 'is', null)
        .neq('phone', '')
        .order('phone', { ascending: true })
        .order('created_at', { ascending: true });

      if (phoneError) return err(phoneError.message);

      // Group by email
      const byEmail: Record<string, typeof emailDups> = {};
      for (const contact of emailDups ?? []) {
        if (!contact.email) continue;
        if (!byEmail[contact.email]) byEmail[contact.email] = [];
        byEmail[contact.email]!.push(contact);
      }

      // Group by phone
      const byPhone: Record<string, typeof phoneDups> = {};
      for (const contact of phoneDups ?? []) {
        if (!contact.phone) continue;
        if (!byPhone[contact.phone]) byPhone[contact.phone] = [];
        byPhone[contact.phone]!.push(contact);
      }

      // Keep only groups with more than one contact
      const emailGroups = Object.entries(byEmail)
        .filter(([, contacts]) => contacts.length > 1)
        .map(([email, contacts]) => ({ matchField: 'email', matchValue: email, contacts }));

      const phoneGroups = Object.entries(byPhone)
        .filter(([, contacts]) => contacts.length > 1)
        .map(([phone, contacts]) => ({ matchField: 'phone', matchValue: phone, contacts }));

      return ok({
        totalGroups: emailGroups.length + phoneGroups.length,
        byEmail: emailGroups,
        byPhone: phoneGroups,
      });
    }
  );

  // ─── crm.contacts.merge ──────────────────────────────────────────────────
  server.registerTool(
    'crm.contacts.merge',
    {
      title: 'Merge contacts',
      description:
        'Writes data. Merges two contacts: moves all deals and conversation links from the source contact to the target contact, then deletes the source contact. Scoped to the authenticated organization.',
      inputSchema: {
        sourceId: z.string().uuid(),
        targetId: z.string().uuid(),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      if (args.sourceId === args.targetId) {
        return err('sourceId and targetId must be different');
      }

      // Verify both contacts exist and belong to this org
      const { data: contacts, error: lookupError } = await getDb()
        .from('contacts')
        .select('id, name, email, phone')
        .eq('organization_id', ctx.organizationId)
        .in('id', [args.sourceId, args.targetId]);

      if (lookupError) return err(lookupError.message);

      const source = contacts?.find((c) => c.id === args.sourceId);
      const target = contacts?.find((c) => c.id === args.targetId);

      if (!source) return err('Source contact not found or access denied');
      if (!target) return err('Target contact not found or access denied');

      // Move deals from source → target
      const { error: dealsError } = await getDb()
        .from('deals')
        .update({ contact_id: args.targetId })
        .eq('contact_id', args.sourceId)
        .eq('organization_id', ctx.organizationId);

      if (dealsError) return err(`Failed to move deals: ${dealsError.message}`);

      // Move conversation links from source → target
      const { error: convsError } = await getDb()
        .from('messaging_conversations')
        .update({ contact_id: args.targetId })
        .eq('contact_id', args.sourceId)
        .eq('organization_id', ctx.organizationId);

      if (convsError) return err(`Failed to move conversations: ${convsError.message}`);

      // Delete source contact
      const { error: deleteError } = await getDb()
        .from('contacts')
        .delete()
        .eq('id', args.sourceId)
        .eq('organization_id', ctx.organizationId);

      if (deleteError) return err(`Failed to delete source contact: ${deleteError.message}`);

      // Return the surviving target contact
      const { data: merged, error: fetchError } = await getDb()
        .from('contacts')
        .select('id, name, email, phone, company_name, source, created_at, updated_at')
        .eq('id', args.targetId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      if (fetchError) return err(fetchError.message);

      return ok({
        merged: merged,
        deletedSourceId: args.sourceId,
        sourceName: source.name,
      });
    }
  );

  // ─── crm.contacts.export ─────────────────────────────────────────────────
  server.registerTool(
    'crm.contacts.export',
    {
      title: 'Export contacts',
      description:
        'Read-only. Exports contacts as a JSON array with optional filters (source, dateRange). Capped at 1000 records. Scoped to the authenticated organization.',
      inputSchema: {
        source: z.string().optional(),
        dateFrom: z.string().optional().describe('ISO 8601 date string (inclusive)'),
        dateTo: z.string().optional().describe('ISO 8601 date string (inclusive)'),
        limit: z.number().int().min(1).max(1000).default(1000),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      let query = getDb()
        .from('contacts')
        .select(
          'id, name, email, phone, company_name, source, created_at, updated_at'
        )
        .eq('organization_id', ctx.organizationId)
        .order('created_at', { ascending: false })
        .limit(args.limit ?? 1000);

      if (args.source) query = query.eq('source', args.source);
      if (args.dateFrom) query = query.gte('created_at', args.dateFrom);
      if (args.dateTo) query = query.lte('created_at', args.dateTo);

      const { data, error } = await query;
      if (error) return err(error.message);

      return ok({ count: data?.length ?? 0, contacts: data ?? [] });
    }
  );

  // ─── crm.contacts.import ─────────────────────────────────────────────────
  server.registerTool(
    'crm.contacts.import',
    {
      title: 'Import contacts',
      description:
        'Writes data. Imports an array of contacts into the authenticated organization. Skips records whose email already exists in the org. Returns a summary with imported, skipped, and error counts.',
      inputSchema: {
        contacts: z
          .array(
            z.object({
              name: z.string().min(1),
              email: z.string().email().optional(),
              phone: z.string().optional(),
              company_name: z.string().optional(),
              source: z.string().optional(),
            })
          )
          .min(1)
          .max(500),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      // Collect emails from incoming contacts to check for existing ones
      const incomingEmails = args.contacts
        .map((c) => c.email)
        .filter((e): e is string => !!e);

      // Fetch existing emails in this org
      const existingEmailSet = new Set<string>();
      if (incomingEmails.length > 0) {
        const { data: existing, error: existingError } = await getDb()
          .from('contacts')
          .select('email')
          .eq('organization_id', ctx.organizationId)
          .in('email', incomingEmails);

        if (existingError) return err(`Failed to check existing contacts: ${existingError.message}`);

        for (const row of existing ?? []) {
          if (row.email) existingEmailSet.add(row.email);
        }
      }

      const toInsert: {
        organization_id: string;
        name: string;
        email?: string;
        phone?: string;
        company_name?: string;
        source?: string;
      }[] = [];
      const skipped: string[] = [];
      const errors: { index: number; reason: string }[] = [];

      for (let i = 0; i < args.contacts.length; i++) {
        const contact = args.contacts[i]!;

        // Skip if email already exists in org
        if (contact.email && existingEmailSet.has(contact.email)) {
          skipped.push(contact.email);
          continue;
        }

        toInsert.push({
          organization_id: ctx.organizationId,
          name: contact.name,
          ...(contact.email ? { email: contact.email } : {}),
          ...(contact.phone ? { phone: contact.phone } : {}),
          ...(contact.company_name ? { company_name: contact.company_name } : {}),
          ...(contact.source ? { source: contact.source } : {}),
        });
      }

      let importedCount = 0;

      if (toInsert.length > 0) {
        const { data: inserted, error: insertError } = await getDb()
          .from('contacts')
          .insert(toInsert)
          .select('id');

        if (insertError) {
          return err(`Insert failed: ${insertError.message}`);
        }

        importedCount = inserted?.length ?? 0;
      }

      return ok({
        imported: importedCount,
        skipped: skipped.length,
        skippedEmails: skipped,
        errors: errors.length,
        errorDetails: errors,
      });
    }
  );
}

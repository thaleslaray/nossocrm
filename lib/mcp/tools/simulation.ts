/**
 * @fileoverview AI Simulation MCP Tools
 *
 * Tools for stress-testing the AI agent with real pipeline movement.
 * Creates real contacts, deals, and conversations in the database,
 * then drives them through the AI agent loop using simulationMode
 * (bypasses actual channel delivery, all other logic is real).
 *
 * @module lib/mcp/tools/simulation
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getMcpContext } from '@/lib/mcp/context';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import { processIncomingMessage } from '@/lib/ai/agent/agent.service';

const SIM_TAG = '[SIM]';

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

// =============================================================================
// Helpers
// =============================================================================

async function findSimStage(
  db: ReturnType<typeof createStaticAdminClient>,
  organizationId: string,
  stageId?: string,
  boardId?: string,
) {
  if (stageId) {
    const { data } = await db
      .from('stage_ai_config')
      .select('stage_id, board_id, board_stages(id, name, board_id)')
      .eq('stage_id', stageId)
      .eq('organization_id', organizationId)
      .eq('enabled', true)
      .maybeSingle();
    return data;
  }

  let query = db
    .from('stage_ai_config')
    .select('stage_id, board_id, board_stages(id, name, board_id)')
    .eq('organization_id', organizationId)
    .eq('enabled', true);

  if (boardId) {
    query = query.eq('board_id', boardId);
  }

  const { data } = await query.limit(1).maybeSingle();
  return data;
}

async function findFirstChannel(
  db: ReturnType<typeof createStaticAdminClient>,
  organizationId: string,
  channelId?: string,
) {
  if (channelId) {
    const { data } = await db
      .from('messaging_channels')
      .select('id, channel_type, name, business_unit_id')
      .eq('id', channelId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    return data;
  }

  const { data } = await db
    .from('messaging_channels')
    .select('id, channel_type, name, business_unit_id')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  return data;
}

async function createSimContact(
  db: ReturnType<typeof createStaticAdminClient>,
  organizationId: string,
  name: string,
  phone: string,
) {
  const { data, error } = await db
    .from('contacts')
    .insert({
      organization_id: organizationId,
      name: `${SIM_TAG} ${name}`,
      phone,
      source: 'simulation',
    })
    .select('id, name, phone')
    .single();

  if (error) throw new Error(`Failed to create sim contact: ${error.message}`);
  return data;
}

async function createSimDeal(
  db: ReturnType<typeof createStaticAdminClient>,
  organizationId: string,
  boardId: string,
  stageId: string,
  contactId: string,
  title: string,
) {
  const { data, error } = await db
    .from('deals')
    .insert({
      organization_id: organizationId,
      board_id: boardId,
      stage_id: stageId,
      contact_id: contactId,
      title: `${SIM_TAG} ${title}`,
      status: 'open',
    })
    .select('id, title, stage_id')
    .single();

  if (error) throw new Error(`Failed to create sim deal: ${error.message}`);
  return data;
}

async function createSimConversation(
  db: ReturnType<typeof createStaticAdminClient>,
  organizationId: string,
  channelId: string,
  businessUnitId: string,
  contactId: string,
  dealId: string,
  externalContactId: string,
) {
  const { data, error } = await db
    .from('messaging_conversations')
    .insert({
      organization_id: organizationId,
      channel_id: channelId,
      business_unit_id: businessUnitId,
      contact_id: contactId,
      external_contact_id: externalContactId,
      status: 'open',
      metadata: { deal_id: dealId, simulation: true },
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create sim conversation: ${error.message}`);
  return data;
}

async function insertInboundMessage(
  db: ReturnType<typeof createStaticAdminClient>,
  conversationId: string,
  text: string,
) {
  const { data, error } = await db
    .from('messaging_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'inbound',
      content_type: 'text',
      content: { type: 'text', text },
      status: 'delivered',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to insert inbound message: ${error.message}`);
  return data;
}

async function getDealCurrentStage(
  db: ReturnType<typeof createStaticAdminClient>,
  dealId: string,
) {
  const { data } = await db
    .from('deals')
    .select('stage_id, status, board_stages(name)')
    .eq('id', dealId)
    .maybeSingle();
  return data;
}

// =============================================================================
// Tool Registration
// =============================================================================

export function registerSimulationTools(server: McpServer) {
  // ─── crm.ai.simulate.run_conversation ─────────────────────────────────────
  server.registerTool(
    'crm.ai.simulate.run_conversation',
    {
      title: 'Simulate AI agent conversation',
      description:
        'Creates a real contact, deal, and conversation in the database, then drives a scripted sequence of inbound messages through the AI agent loop. Causes real pipeline movement (stage advances, HITL records, BANT extraction). Channel delivery is bypassed — the AI response is written directly as "sent". All created records are tagged [SIM] for easy identification and cleanup.',
      inputSchema: {
        messages: z
          .array(z.string().min(1))
          .min(1)
          .max(20)
          .describe('Inbound messages from the lead, in order'),
        personaName: z
          .string()
          .default('Lead Simulado')
          .describe('Name of the simulated lead'),
        personaPhone: z
          .string()
          .default('+5511900000000')
          .describe('Phone number for the simulated lead'),
        stageId: z
          .string()
          .uuid()
          .optional()
          .describe('Specific stage ID to test. If omitted, auto-discovers first stage with AI enabled'),
        boardId: z
          .string()
          .uuid()
          .optional()
          .describe('If stageId is omitted, restrict auto-discover to this board'),
        channelId: z
          .string()
          .uuid()
          .optional()
          .describe('Channel to attach the conversation to. If omitted, uses first active channel'),
      },
    },
    async (args) => {
      const ctx = getMcpContext();
      const db = createStaticAdminClient();

      // 1. Find a stage with AI enabled
      const stageConfig = await findSimStage(db, ctx.organizationId, args.stageId, args.boardId);
      if (!stageConfig) {
        return err(
          'No stage with AI enabled found for this organization. Enable AI for at least one stage in Settings > Pipeline > Stage AI Config.'
        );
      }

      const resolvedStageId: string = stageConfig.stage_id;
      const resolvedBoardId: string = stageConfig.board_id;

      // 2. Find a channel
      const channel = await findFirstChannel(db, ctx.organizationId, args.channelId);
      if (!channel) {
        return err(
          'No active messaging channel found. Create and activate at least one channel in Settings > Channels.'
        );
      }

      // 3. Create contact, deal, conversation
      let contact: { id: string; name: string; phone: string | null };
      let deal: { id: string; title: string; stage_id: string };
      let conversation: { id: string };

      // Generate a unique phone per run to avoid unique constraint on messaging_conversations.
      // args.personaPhone has a Zod default so it's never undefined — only use it if it's NOT
      // the default placeholder value, otherwise generate a unique one.
      const simPhone =
        args.personaPhone !== '+5511900000000'
          ? args.personaPhone
          : `+5511${String(Date.now()).slice(-9)}`;

      try {
        contact = await createSimContact(
          db,
          ctx.organizationId,
          args.personaName ?? 'Lead Simulado',
          simPhone
        );

        deal = await createSimDeal(
          db,
          ctx.organizationId,
          resolvedBoardId,
          resolvedStageId,
          contact.id,
          `Simulação — ${args.personaName ?? 'Lead Simulado'}`
        );

        conversation = await createSimConversation(
          db,
          ctx.organizationId,
          channel.id,
          channel.business_unit_id ?? '',
          contact.id,
          deal.id,
          simPhone
        );
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create simulation fixtures');
      }

      // 4. Drive the conversation
      const turns: Array<{
        turn: number;
        inbound: string;
        action: string;
        response?: string;
        reason: string;
        stageAdvanced: boolean;
        newStageId?: string;
        tokensUsed?: number;
        model?: string;
        error?: string;
      }> = [];

      for (let i = 0; i < args.messages.length; i++) {
        const text = args.messages[i]!;

        let msgId: string | undefined;
        try {
          const msg = await insertInboundMessage(db, conversation.id, text);
          msgId = msg?.id;
        } catch (e) {
          console.error('[SIM] insertInboundMessage failed:', e instanceof Error ? e.message : e);
        }

        const result = await processIncomingMessage({
          supabase: db,
          conversationId: conversation.id,
          organizationId: ctx.organizationId,
          incomingMessage: text,
          messageId: msgId,
          simulationMode: true,
        });

        turns.push({
          turn: i + 1,
          inbound: text,
          action: result.decision.action,
          response: result.decision.response,
          reason: result.decision.reason,
          stageAdvanced: result.decision.stage_advanced ?? false,
          newStageId: result.decision.new_stage_id,
          tokensUsed: result.decision.tokens_used,
          model: result.decision.model_used,
          error: result.success ? undefined : result.error?.message,
        });
      }

      // 5. Get final deal state
      const finalDeal = await getDealCurrentStage(db, deal.id);

      const stagesAdvanced = turns.filter((t) => t.stageAdvanced).length;
      const responded = turns.filter((t) => t.action === 'responded').length;
      const skipped = turns.filter((t) => t.action === 'skipped').length;
      const handoffs = turns.filter((t) => t.action === 'handoff').length;

      return ok({
        summary: {
          totalTurns: turns.length,
          responded,
          skipped,
          handoffs,
          stagesAdvanced,
          finalStageId: finalDeal?.stage_id ?? deal.stage_id,
        },
        fixtures: {
          contactId: contact.id,
          contactName: contact.name,
          dealId: deal.id,
          dealTitle: deal.title,
          conversationId: conversation.id,
          channelId: channel.id,
          channelType: channel.channel_type,
        },
        turns,
        note: 'Records tagged [SIM] remain in the database. Use crm.ai.simulate.cleanup to remove them.',
      });
    }
  );

  // ─── crm.ai.simulate.compare_modes ────────────────────────────────────────
  server.registerTool(
    'crm.ai.simulate.compare_modes',
    {
      title: 'Compare all AI config modes',
      description:
        'Runs the same persona and message script through all 4 AI config modes (zero_config, template, auto_learn, advanced) by temporarily switching the org config mode for each run. Creates separate fixtures per mode. Returns a side-by-side comparison of AI responses, actions, and pipeline movement across modes. Original config mode is restored after all runs complete.',
      inputSchema: {
        messages: z
          .array(z.string().min(1))
          .min(1)
          .max(10)
          .describe('Inbound messages from the lead'),
        personaName: z.string().default('Lead Comparativo').describe('Name of the simulated lead'),
        stageId: z
          .string()
          .uuid()
          .optional()
          .describe('Stage ID to test. Auto-discovers if omitted'),
        channelId: z
          .string()
          .uuid()
          .optional()
          .describe('Channel ID. Auto-discovers if omitted'),
      },
    },
    async (args) => {
      const ctx = getMcpContext();
      const db = createStaticAdminClient();

      // Fetch original config mode
      const { data: originalSettings } = await db
        .from('organization_settings')
        .select('ai_config_mode')
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      const originalMode = originalSettings?.ai_config_mode ?? 'zero_config';
      const modes = ['zero_config', 'template', 'auto_learn', 'advanced'] as const;

      const results: Record<string, unknown> = {};

      for (const mode of modes) {
        // Set mode
        await db
          .from('organization_settings')
          .update({ ai_config_mode: mode })
          .eq('organization_id', ctx.organizationId);

        // Find stage
        const stageConfig = await findSimStage(db, ctx.organizationId, args.stageId);
        const channel = await findFirstChannel(db, ctx.organizationId, args.channelId);

        if (!stageConfig || !channel) {
          results[mode] = { error: 'No AI-enabled stage or channel found' };
          continue;
        }

        try {
          const contact = await createSimContact(
            db,
            ctx.organizationId,
            `${args.personaName ?? 'Lead Comparativo'} (${mode})`,
            `+551190000${modes.indexOf(mode)}000`
          );

          const deal = await createSimDeal(
            db,
            ctx.organizationId,
            stageConfig.board_id,
            stageConfig.stage_id,
            contact.id,
            `Comparativo ${mode}`
          );

          const conversation = await createSimConversation(
            db,
            ctx.organizationId,
            channel.id,
            channel.business_unit_id ?? '',
            contact.id,
            deal.id,
            `+551190000${modes.indexOf(mode)}000`
          );

          const turns: Array<{ turn: number; action: string; response?: string; reason: string; stageAdvanced: boolean }> = [];
          for (let i = 0; i < args.messages.length; i++) {
            const text = args.messages[i]!;
            const msg = await insertInboundMessage(db, conversation.id, text).catch(() => null);

            const result = await processIncomingMessage({
              supabase: db,
              conversationId: conversation.id,
              organizationId: ctx.organizationId,
              incomingMessage: text,
              messageId: msg?.id,
              simulationMode: true,
            });

            turns.push({
              turn: i + 1,
              action: result.decision.action,
              response: result.decision.response,
              reason: result.decision.reason,
              stageAdvanced: result.decision.stage_advanced ?? false,
            });
          }

          const finalDeal = await getDealCurrentStage(db, deal.id);

          results[mode] = {
            contactId: contact.id,
            dealId: deal.id,
            conversationId: conversation.id,
            finalStageId: finalDeal?.stage_id ?? deal.stage_id,
            stagesAdvanced: turns.filter((t) => t.stageAdvanced).length,
            responded: turns.filter((t) => t.action === 'responded').length,
            turns,
          };
        } catch (e) {
          results[mode] = { error: e instanceof Error ? e.message : 'Unknown error' };
        }
      }

      // Restore original mode
      await db
        .from('organization_settings')
        .update({ ai_config_mode: originalMode })
        .eq('organization_id', ctx.organizationId);

      return ok({
        modesCompared: modes,
        originalModeRestored: originalMode,
        results,
        note: 'Records tagged [SIM] remain in the database. Use crm.ai.simulate.cleanup to remove them.',
      });
    }
  );

  // ─── crm.ai.simulate.cleanup ──────────────────────────────────────────────
  server.registerTool(
    'crm.ai.simulate.cleanup',
    {
      title: 'Remove simulation data',
      description:
        'Deletes all contacts (and cascade-related deals, conversations, messages) created by simulation tools. Identifies simulation records by name prefix "[SIM]" and metadata.simulation=true. Scoped to the authenticated organization.',
      inputSchema: {
        dryRun: z
          .boolean()
          .default(true)
          .describe('If true (default), only reports what would be deleted without deleting anything'),
      },
    },
    async (args) => {
      const ctx = getMcpContext();
      const db = createStaticAdminClient();

      // Find all sim contacts
      const { data: simContacts, error: findError } = await db
        .from('contacts')
        .select('id, name, created_at')
        .eq('organization_id', ctx.organizationId)
        .like('name', `${SIM_TAG}%`)
        .order('created_at', { ascending: false });

      if (findError) return err(findError.message);

      const count = simContacts?.length ?? 0;

      if (args.dryRun) {
        return ok({
          dryRun: true,
          wouldDelete: count,
          contacts: simContacts?.slice(0, 20).map((c) => ({ id: c.id, name: c.name, created_at: c.created_at })),
          message: `Found ${count} simulation contact(s). Set dryRun=false to delete them and all related data.`,
        });
      }

      if (count === 0) {
        return ok({ deleted: 0, message: 'No simulation data found.' });
      }

      const ids = (simContacts ?? []).map((c) => c.id);

      // Delete in FK-safe order: deals → conversations → contacts
      const { error: dealsErr } = await db
        .from('deals')
        .delete()
        .in('contact_id', ids)
        .eq('organization_id', ctx.organizationId);
      if (dealsErr) return err(`Failed to delete sim deals: ${dealsErr.message}`);

      const { error: convsErr } = await db
        .from('messaging_conversations')
        .delete()
        .in('contact_id', ids)
        .eq('organization_id', ctx.organizationId);
      if (convsErr) return err(`Failed to delete sim conversations: ${convsErr.message}`);

      const { error: contactsErr } = await db
        .from('contacts')
        .delete()
        .in('id', ids)
        .eq('organization_id', ctx.organizationId);
      if (contactsErr) return err(`Failed to delete sim contacts: ${contactsErr.message}`);

      return ok({
        deleted: count,
        message: `Deleted ${count} simulation contact(s) and all related deals, conversations, and messages.`,
      });
    }
  );
}

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getMcpContext } from '@/lib/mcp/context';
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import { generateMeetingBriefing } from '@/lib/ai/briefing/briefing.service';

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

export function registerAITools(server: McpServer) {
  // ─── crm.ai.hitl.list ────────────────────────────────────────────────────
  server.registerTool(
    'crm.ai.hitl.list',
    {
      title: 'List HITL pending stage advances',
      description:
        'Read-only. Lists AI-suggested stage advances awaiting human review. Defaults to status="pending". Joins deals for title. Scoped to the authenticated organization.',
      inputSchema: {
        status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      const { data, error } = await getDb()
        .from('ai_pending_stage_advances')
        .select(
          `id, organization_id, deal_id, current_stage_id, suggested_stage_id,
           confidence, reason, status, resolved_by, resolved_at,
           resolution_notes, created_at,
           deals ( id, title )`
        )
        .eq('organization_id', ctx.organizationId)
        .eq('status', args.status ?? 'pending')
        .order('created_at', { ascending: false })
        .limit(args.limit ?? 50);

      if (error) return err(error.message);
      return ok(data);
    }
  );

  // ─── crm.ai.hitl.count ───────────────────────────────────────────────────
  server.registerTool(
    'crm.ai.hitl.count',
    {
      title: 'Count HITL pending stage advances',
      description:
        'Read-only. Returns the count of AI-suggested stage advances filtered by status (default: "pending"). Scoped to the authenticated organization.',
      inputSchema: {
        status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      const { count, error } = await getDb()
        .from('ai_pending_stage_advances')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('status', args.status ?? 'pending');

      if (error) return err(error.message);
      return ok({ count: count ?? 0, status: args.status ?? 'pending' });
    }
  );

  // ─── crm.ai.hitl.resolve ─────────────────────────────────────────────────
  server.registerTool(
    'crm.ai.hitl.resolve',
    {
      title: 'Resolve HITL pending stage advance',
      description:
        'Writes data. Approves or rejects an AI-suggested stage advance. On approval, moves the deal to the target stage. Records resolved_by, resolved_at, and optional notes. Scoped to the authenticated organization.',
      inputSchema: {
        advanceId: z.string().uuid(),
        action: z.enum(['approved', 'rejected']),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      // Fetch the pending advance and verify ownership
      const { data: advance, error: fetchError } = await getDb()
        .from('ai_pending_stage_advances')
        .select('id, organization_id, deal_id, suggested_stage_id, status')
        .eq('id', args.advanceId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      if (fetchError) return err(fetchError.message);
      if (!advance) return err('Pending advance not found or access denied');
      if (advance.status !== 'pending') {
        return err(`Advance is already ${advance.status} — cannot resolve again`);
      }

      const now = new Date().toISOString();

      // Resolve the advance record
      const { data: resolved, error: resolveError } = await getDb()
        .from('ai_pending_stage_advances')
        .update({
          status: args.action,
          resolved_by: ctx.userId,
          resolved_at: now,
          resolution_notes: args.notes ?? null,
        })
        .eq('id', args.advanceId)
        .select('id, status, resolved_at, resolution_notes')
        .maybeSingle();

      if (resolveError) return err(resolveError.message);

      // On approval, move the deal to the target stage
      if (args.action === 'approved' && advance.suggested_stage_id) {
        const { error: moveError } = await getDb()
          .from('deals')
          .update({ stage_id: advance.suggested_stage_id })
          .eq('id', advance.deal_id)
          .eq('organization_id', ctx.organizationId);

        if (moveError) {
          return err(`Advance marked approved but deal move failed: ${moveError.message}`);
        }
      }

      return ok({
        ...resolved,
        dealMoved: args.action === 'approved',
      });
    }
  );

  // ─── crm.ai.daily_briefing ───────────────────────────────────────────────
  server.registerTool(
    'crm.ai.daily_briefing',
    {
      title: 'Get daily AI briefing',
      description:
        'Read-only. Aggregates a daily operations briefing: overdue activities, recent open deals, and pending HITL count. Scoped to the authenticated organization.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const [activitiesResult, dealsResult, hitlResult] = await Promise.all([
        // Overdue activities: date <= today, not completed
        getDb()
          .from('activities')
          .select('id, title, type, date, deal_id, contact_id, created_at')
          .eq('organization_id', ctx.organizationId)
          .eq('completed', false)
          .lte('date', today)
          .order('date', { ascending: true })
          .limit(50),

        // Recent open deals (last 30 days)
        getDb()
          .from('deals')
          .select('id, title, value, stage_id, created_at, updated_at')
          .eq('organization_id', ctx.organizationId)
          .eq('status', 'open')
          .order('updated_at', { ascending: false })
          .limit(20),

        // Pending HITL count
        getDb()
          .from('ai_pending_stage_advances')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', ctx.organizationId)
          .eq('status', 'pending'),
      ]);

      if (activitiesResult.error) return err(activitiesResult.error.message);
      if (dealsResult.error) return err(dealsResult.error.message);
      if (hitlResult.error) return err(hitlResult.error.message);

      return ok({
        date: today,
        overdueActivities: {
          count: activitiesResult.data?.length ?? 0,
          items: activitiesResult.data ?? [],
        },
        recentOpenDeals: {
          count: dealsResult.data?.length ?? 0,
          items: dealsResult.data ?? [],
        },
        pendingHITL: {
          count: hitlResult.count ?? 0,
        },
      });
    }
  );

  // ─── crm.ai.meeting_briefing ─────────────────────────────────────────────
  server.registerTool(
    'crm.ai.meeting_briefing',
    {
      title: 'Generate meeting briefing',
      description:
        'Calls AI. Generates a pre-meeting briefing for a deal using the BANT framework. Analyzes conversation history and returns actionable insights. Scoped to the authenticated organization.',
      inputSchema: {
        dealId: z.string().uuid(),
      },
    },
    async (args) => {
      const ctx = getMcpContext();

      // Verify the deal belongs to this org before calling the AI service
      const { data: deal, error: dealError } = await getDb()
        .from('deals')
        .select('id')
        .eq('id', args.dealId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      if (dealError) return err(dealError.message);
      if (!deal) return err('Deal not found or access denied');

      try {
        const briefing = await generateMeetingBriefing(args.dealId, getDb());
        return ok(briefing);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to generate briefing');
      }
    }
  );

  // ─── crm.ai.patterns.list ────────────────────────────────────────────────
  server.registerTool(
    'crm.ai.patterns.list',
    {
      title: 'List AI learned patterns',
      description:
        'Read-only. Lists few-shot learned patterns for the authenticated organization. Patterns are stored as JSONB in organization_settings.ai_learned_patterns. Returns empty array if none configured.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();

      const { data, error } = await getDb()
        .from('organization_settings')
        .select('ai_learned_patterns')
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();

      if (error) return err(error.message);
      if (!data) return ok([]);

      const raw = data.ai_learned_patterns;

      // Treat null, empty object {}, or non-array as empty
      if (!raw || !Array.isArray(raw)) return ok([]);

      return ok(raw);
    }
  );

  // ─── crm.ai.metrics ──────────────────────────────────────────────────────
  server.registerTool(
    'crm.ai.metrics',
    {
      title: 'Get AI conversation metrics',
      description:
        'Read-only. Aggregates AI conversation logs for the last 30 days: count by action_taken, total tokens used, breakdown by model, and daily activity. Scoped to the authenticated organization.',
      inputSchema: {},
    },
    async () => {
      const ctx = getMcpContext();

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const since = thirtyDaysAgo.toISOString();

      const { data, error } = await getDb()
        .from('ai_conversation_log')
        .select('id, action_taken, tokens_used, model_used, created_at')
        .eq('organization_id', ctx.organizationId)
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      if (error) return err(error.message);

      const logs = data ?? [];

      // Aggregate counts by action_taken
      const byAction: Record<string, number> = {};
      // Aggregate tokens and counts by model
      const byModel: Record<string, { count: number; tokens: number }> = {};
      // Aggregate by day (YYYY-MM-DD)
      const byDay: Record<string, { count: number; tokens: number }> = {};
      let totalTokens = 0;

      for (const log of logs) {
        const action = log.action_taken ?? 'unknown';
        byAction[action] = (byAction[action] ?? 0) + 1;

        const model = log.model_used ?? 'unknown';
        if (!byModel[model]) byModel[model] = { count: 0, tokens: 0 };
        byModel[model].count += 1;
        byModel[model].tokens += log.tokens_used ?? 0;

        const day = (log.created_at as string).split('T')[0];
        if (!byDay[day]) byDay[day] = { count: 0, tokens: 0 };
        byDay[day].count += 1;
        byDay[day].tokens += log.tokens_used ?? 0;

        totalTokens += log.tokens_used ?? 0;
      }

      return ok({
        period: { from: since, to: new Date().toISOString() },
        totals: {
          conversations: logs.length,
          tokens: totalTokens,
        },
        byAction,
        byModel,
        byDay,
      });
    }
  );
}

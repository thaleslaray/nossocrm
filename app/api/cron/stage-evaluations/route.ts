/**
 * GET /api/cron/stage-evaluations
 *
 * Scheduled cron job (every minute) that processes pending AI stage evaluations.
 *
 * Why this exists: after sending an AI response, evaluating stage advancement
 * requires a second LLM call (~2-4s). If that runs inline inside the webhook
 * handler, a Vercel function timeout silently cancels it. Instead, the agent
 * inserts a row in ai_pending_evaluations and this cron drains the queue.
 *
 * Processing strategy:
 * - Fetches up to 10 pending evaluations (FIFO)
 * - Claims each row by flipping status → 'processing' (optimistic lock via UPDATE ... RETURNING)
 * - Calls evaluateStageAdvancement() with rebuilt context
 * - Marks as 'completed' or 'failed'; increments attempts
 * - Rows that have failed 3+ times are left as 'failed' and ignored on future runs
 *
 * Protected by CRON_SECRET bearer token — only callable by Vercel Cron.
 */

import { createClient } from '@/lib/supabase/server';
import { evaluateStageAdvancement } from '@/lib/ai/agent/stage-evaluator';
import { buildLeadContext } from '@/lib/ai/agent/context-builder';
import { getConversationHistory, getOrgAIConfig } from '@/lib/ai/agent/agent.service';

export const maxDuration = 60;

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = await createClient();

  // Claim a batch of pending evaluations atomically.
  // We update status to 'processing' before reading to avoid double-processing
  // across concurrent cron invocations (Vercel may overlap on long queues).
  const { data: claimed, error: claimError } = await supabase
    .from('ai_pending_evaluations')
    .update({ status: 'processing' })
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)
    .select('id, organization_id, conversation_id, deal_id, message_id, message_text');

  if (claimError) {
    console.error('[Cron:stage-evaluations] Failed to claim batch:', claimError);
    return json({ error: 'Failed to claim evaluations' }, 500);
  }

  const batch = claimed ?? [];
  console.log(`[Cron:stage-evaluations] Processing ${batch.length} evaluations`);

  if (batch.length === 0) {
    return json({ processed: 0, failed: 0, skipped: 0 });
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  await Promise.allSettled(
    batch.map(async (row) => {
      const { id, organization_id, conversation_id, deal_id, message_text } = row;

      try {
        // Rebuild context needed by evaluateStageAdvancement
        const [aiConfig, context, conversationHistory] = await Promise.all([
          getOrgAIConfig(supabase, organization_id),
          buildLeadContext({ supabase, conversationId: conversation_id, organizationId: organization_id }),
          getConversationHistory(supabase, conversation_id),
        ]);

        if (!aiConfig || !context) {
          // Config or context gone (org deleted, deal archived) — skip cleanly
          await supabase
            .from('ai_pending_evaluations')
            .update({
              status: 'failed',
              last_error: 'Missing aiConfig or context at evaluation time',
              processed_at: new Date().toISOString(),
            })
            .eq('id', id);
          skipped++;
          return;
        }

        // Fetch stage config for this deal
        const { data: deal } = await supabase
          .from('deals')
          .select('stage_id')
          .eq('id', deal_id)
          .maybeSingle();

        if (!deal?.stage_id) {
          await supabase
            .from('ai_pending_evaluations')
            .update({
              status: 'failed',
              last_error: 'Deal has no stage at evaluation time',
              processed_at: new Date().toISOString(),
            })
            .eq('id', id);
          skipped++;
          return;
        }

        const { data: stageConfig } = await supabase
          .from('stage_ai_config')
          .select('*')
          .eq('stage_id', deal.stage_id)
          .eq('enabled', true)
          .maybeSingle();

        if (!stageConfig) {
          // Stage AI disabled or removed — nothing to evaluate
          await supabase
            .from('ai_pending_evaluations')
            .update({
              status: 'completed',
              last_error: 'Stage AI not enabled at evaluation time',
              processed_at: new Date().toISOString(),
            })
            .eq('id', id);
          skipped++;
          return;
        }

        const evalResult = await evaluateStageAdvancement({
          supabase,
          context,
          stageConfig,
          conversationHistory,
          aiConfig: {
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
          },
          organizationId: organization_id,
          hitlThreshold: aiConfig.hitlThreshold,
          hitlMinConfidence: aiConfig.hitlMinConfidence,
          hitlExpirationHours: aiConfig.hitlExpirationHours,
          conversationId: conversation_id,
        });

        if (evalResult.advanced && evalResult.newStageId) {
          console.log(`[Cron:stage-evaluations] Deal advanced to stage ${evalResult.newStageId} (eval ${id})`);
        } else if (evalResult.requiresConfirmation && evalResult.pendingAdvanceId) {
          console.log(`[Cron:stage-evaluations] HITL pending advance created: ${evalResult.pendingAdvanceId} (eval ${id})`);
        }

        await supabase
          .from('ai_pending_evaluations')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', id);

        processed++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[Cron:stage-evaluations] Failed for eval ${id}:`, errorMessage);

        // Increment attempts; if >= MAX_ATTEMPTS mark as failed permanently
        const { data: current } = await supabase
          .from('ai_pending_evaluations')
          .select('attempts')
          .eq('id', id)
          .maybeSingle();

        const nextAttempts = (current?.attempts ?? 0) + 1;
        const nextStatus = nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

        await supabase
          .from('ai_pending_evaluations')
          .update({
            status: nextStatus,
            attempts: nextAttempts,
            last_error: errorMessage,
            processed_at: nextStatus === 'failed' ? new Date().toISOString() : null,
          })
          .eq('id', id);

        failed++;
      }
    })
  );

  console.log(`[Cron:stage-evaluations] Done — processed: ${processed}, failed: ${failed}, skipped: ${skipped}`);
  return json({ processed, failed, skipped });
}

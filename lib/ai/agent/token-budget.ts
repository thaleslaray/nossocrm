/**
 * @fileoverview Token budget enforcement for AI calls.
 *
 * Checks monthly token usage against the organization's configured limit.
 * Uses `ai_conversation_log.tokens_used` aggregated by month.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_MONTHLY_LIMIT = 1_000_000; // 1M tokens default

interface TokenBudgetResult {
  allowed: boolean;
  used: number;
  limit: number;
  remainingPercent: number;
}

/**
 * Check if the organization is within its monthly token budget.
 */
export async function checkTokenBudget(
  supabase: SupabaseClient,
  organizationId: string
): Promise<TokenBudgetResult> {
  // Get org's monthly limit
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('ai_monthly_token_limit')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const limit =
    (orgSettings?.ai_monthly_token_limit as number | null) ??
    DEFAULT_MONTHLY_LIMIT;

  // Sum tokens used this month (UTC boundary)
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  // Try server-side aggregate first (PostgREST 12+)
  let used = 0;
  const { data: aggregate, error: aggError } = await supabase
    .from('ai_conversation_log')
    .select('tokens_used.sum()')
    .eq('organization_id', organizationId)
    .gte('created_at', startOfMonth.toISOString())
    .single();

  if (!aggError && aggregate) {
    used = (aggregate.sum as number) ?? 0;
  } else {
    // Fallback: fetch rows and sum client-side (capped at 1000 rows)
    const { data: rows } = await supabase
      .from('ai_conversation_log')
      .select('tokens_used')
      .eq('organization_id', organizationId)
      .gte('created_at', startOfMonth.toISOString())
      .limit(1000);

    used = (rows || []).reduce(
      (sum, r) => sum + ((r.tokens_used as number) || 0),
      0
    );
  }

  const remainingPercent = Math.max(0, ((limit - used) / limit) * 100);

  return {
    allowed: used < limit,
    used,
    limit,
    remainingPercent,
  };
}

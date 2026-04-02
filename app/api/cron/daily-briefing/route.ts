import { createClient } from '@/lib/supabase/server';
import { generateMeetingBriefing } from '@/lib/ai/briefing/briefing.service';

export const maxDuration = 120;

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * GET /api/cron/daily-briefing
 *
 * Scheduled cron job (weekdays at 08:00 UTC) that pre-generates meeting briefings
 * for all deals with a meeting scheduled today or tomorrow.
 *
 * Protected by CRON_SECRET bearer token — only callable by Vercel Cron.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = await createClient();

  // Build date range: today and tomorrow (ISO dates)
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(now);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(23, 59, 59, 999);

  // Fetch deal activities of type 'meeting' scheduled within today–tomorrow
  const { data: activities, error: activitiesError } = await supabase
    .from('deal_activities')
    .select('deal_id, organization_id')
    .eq('type', 'meeting')
    .gte('scheduled_at', todayStart.toISOString())
    .lte('scheduled_at', tomorrowEnd.toISOString())
    .is('completed_at', null);

  if (activitiesError) {
    console.error('[Cron:daily-briefing] Failed to fetch activities:', activitiesError);
    return json({ error: 'Failed to fetch activities' }, 500);
  }

  // Deduplicate by deal_id (a deal may have multiple meetings in the window)
  const seen = new Set<string>();
  const uniqueDeals = (activities ?? []).filter((a) => {
    if (seen.has(a.deal_id)) return false;
    seen.add(a.deal_id);
    return true;
  });

  let processed = 0;
  let errors = 0;

  await Promise.allSettled(
    uniqueDeals.map(async (activity) => {
      try {
        await generateMeetingBriefing(activity.deal_id, supabase);
        processed++;
      } catch (err) {
        errors++;
        console.error(
          `[Cron:daily-briefing] Failed for deal ${activity.deal_id}:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );

  console.log(`[Cron:daily-briefing] Done — processed: ${processed}, errors: ${errors}`);
  return json({ processed, errors });
}

import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { processFollowUps } from '@/lib/evolution/followUpProcessor';

/**
 * POST /api/whatsapp/follow-ups/process
 *
 * Processes all pending follow-ups that have reached their trigger time.
 * Should be called by a cron job every minute.
 *
 * Vercel Cron configuration (vercel.json):
 * { "crons": [{ "path": "/api/whatsapp/follow-ups/process", "schedule": "* * * * *" }] }
 */
export async function POST(request: Request) {
  // Verify cron secret or admin auth
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createStaticAdminClient();

  try {
    const result = await processFollowUps(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[follow-ups-cron] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// Also support GET for Vercel Cron
export async function GET(request: Request) {
  return POST(request);
}

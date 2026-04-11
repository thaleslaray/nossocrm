/**
 * GET /api/messaging/messages/search
 *
 * Search messages within a conversation using ILIKE.
 * Query params: conversationId, q, limit
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizePostgrestValue } from '@/lib/utils/sanitize';

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const conversationId = searchParams.get('conversationId');
  const query = searchParams.get('q');
  const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
  const limit = Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 50, 100);

  if (!conversationId || !query || query.trim().length < 2) {
    return NextResponse.json(
      { error: 'conversationId and q (min 2 chars) are required' },
      { status: 400 }
    );
  }

  // Get user profile for org check
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // Verify conversation belongs to the user's org
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const sanitizedQuery = sanitizePostgrestValue(query.trim());

  const { data: messages, error } = await supabase.rpc('search_messages', {
    p_conversation_id: conversationId,
    p_query: sanitizedQuery,
    p_limit: limit,
  });

  if (error) {
    console.error('[API] search_messages error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  return NextResponse.json({ messages: messages ?? [] });
}

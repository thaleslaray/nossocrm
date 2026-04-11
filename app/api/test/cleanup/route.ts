/**
 * @fileoverview Test Cleanup Endpoint
 *
 * Limpa dados de teste (conversas, mensagens, deals de teste).
 * NÃO usar em produção!
 *
 * POST /api/test/cleanup
 *
 * @module app/api/test/cleanup
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  // Safety check - only in development with explicit opt-in flag
  if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_TEST_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const body = await request.json().catch(() => ({}));
    const { keepChannels = true, keepBoards = true } = body as {
      keepChannels?: boolean;
      keepBoards?: boolean;
    };

    // Get user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 404 });
    }

    const orgId = profile.organization_id;
    const results: Record<string, number | string> = {};

    // 1. Delete messages
    const { count: messagesDeleted } = await supabase
      .from('messaging_messages')
      .delete({ count: 'exact' })
      .eq('organization_id', orgId);
    results.messagesDeleted = messagesDeleted || 0;

    // 2. Delete conversations
    const { count: conversationsDeleted } = await supabase
      .from('messaging_conversations')
      .delete({ count: 'exact' })
      .eq('organization_id', orgId);
    results.conversationsDeleted = conversationsDeleted || 0;

    // 3. Delete AI log
    const { count: aiLogsDeleted } = await supabase
      .from('ai_conversation_log')
      .delete({ count: 'exact' })
      .eq('organization_id', orgId);
    results.aiLogsDeleted = aiLogsDeleted || 0;

    // 4. Delete pending advances
    const { count: pendingAdvancesDeleted } = await supabase
      .from('ai_pending_stage_advances')
      .delete({ count: 'exact' })
      .eq('organization_id', orgId);
    results.pendingAdvancesDeleted = pendingAdvancesDeleted || 0;

    // 5. Delete deals
    const { count: dealsDeleted } = await supabase
      .from('deals')
      .delete({ count: 'exact' })
      .eq('organization_id', orgId);
    results.dealsDeleted = dealsDeleted || 0;

    // 6. Delete contacts
    const { count: contactsDeleted } = await supabase
      .from('contacts')
      .delete({ count: 'exact' })
      .eq('organization_id', orgId);
    results.contactsDeleted = contactsDeleted || 0;

    // 7. Reset stage_ai_config (optional - keep if user wants to test modes)
    // We'll keep them but disable
    const { count: stageConfigsReset } = await supabase
      .from('stage_ai_config')
      .update({ enabled: false })
      .eq('organization_id', orgId);
    results.stageConfigsDisabled = stageConfigsReset || 0;

    // 8. Reset organization AI settings
    const { error: resetError } = await supabase
      .from('organization_settings')
      .update({
        ai_config_mode: null,
        ai_template_id: null,
        ai_learned_patterns: {},
      })
      .eq('organization_id', orgId);

    if (resetError) {
      results.resetError = resetError.message;
    } else {
      results.orgSettingsReset = 'true';
    }

    return NextResponse.json({
      success: true,
      organizationId: orgId,
      cleaned: results,
      message: 'Test data cleaned. Ready for fresh testing.',
    });
  } catch (error) {
    console.error('[TestCleanup] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

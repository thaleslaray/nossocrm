/**
 * @fileoverview AI Agent Processing Endpoint
 *
 * Processa mensagens recebidas com o AI Agent.
 * Chamado pelos webhooks após inserir mensagem inbound.
 *
 * POST /api/messaging/ai/process
 * Body: { conversationId, organizationId, messageId, messageText }
 *
 * Esta rota é interna - chamada apenas pelos webhooks.
 *
 * @module app/api/messaging/ai/process
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processIncomingMessage } from '@/lib/ai/agent';

// Internal API secret for webhook -> AI communication
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

export async function POST(request: NextRequest) {
  try {
    // Verify internal API secret
    // Accepts both X-Internal-Secret header and Authorization: Bearer
    const internalSecret = request.headers.get('X-Internal-Secret');
    const authHeader = request.headers.get('Authorization');
    const providedKey = internalSecret || authHeader?.replace('Bearer ', '');

    if (!INTERNAL_API_SECRET) {
      console.error('[AI Process] INTERNAL_API_SECRET not configured');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    if (!providedKey || providedKey !== INTERNAL_API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { conversationId, organizationId, messageId, messageText } = body;

    if (!conversationId || !organizationId || !messageText) {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, organizationId, messageText' },
        { status: 400 }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Support both old and new Supabase key formats
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Process with AI Agent
    const result = await processIncomingMessage({
      supabase,
      conversationId,
      organizationId,
      incomingMessage: messageText,
      messageId,
    });

    return NextResponse.json({
      success: result.success,
      action: result.decision.action,
      reason: result.decision.reason,
      message_sent: result.message_sent,
      error: result.error,
    });
  } catch (error) {
    console.error('[AI Process] Error:', error);
    return NextResponse.json(
      {
        error: 'Processing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

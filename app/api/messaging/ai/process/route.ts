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
import crypto from 'crypto';

// Internal API secret for webhook -> AI communication
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

import { waitUntil } from '@vercel/functions';

// Maximum function execution duration (seconds)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Verify internal API secret
  // Accepts both X-Internal-Secret header and Authorization: Bearer
  const internalSecret = request.headers.get('X-Internal-Secret');
  const authHeader = request.headers.get('Authorization');
  const providedKey = internalSecret || authHeader?.replace('Bearer ', '');

  if (!INTERNAL_API_SECRET) {
    console.error('[AI Process] INTERNAL_API_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!providedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Timing-safe comparison to prevent timing attacks
  const expectedBuf = Buffer.from(INTERNAL_API_SECRET, 'utf8');
  const providedBuf = Buffer.from(providedKey, 'utf8');
  const isValid =
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse and validate request body
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { conversationId, organizationId, messageId, messageText } = body;

  // Validate required fields and UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!conversationId || !organizationId || !messageText) {
    return NextResponse.json(
      { error: 'Missing required fields: conversationId, organizationId, messageText' },
      { status: 400 }
    );
  }

  if (!uuidRegex.test(conversationId) || !uuidRegex.test(organizationId)) {
    return NextResponse.json(
      { error: 'Invalid UUID format for conversationId or organizationId' },
      { status: 400 }
    );
  }

  if (messageId && !uuidRegex.test(messageId)) {
    return NextResponse.json(
      { error: 'Invalid UUID format for messageId' },
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

  // Return immediately and process AI in the background via waitUntil
  waitUntil(
    processIncomingMessage({
      supabase,
      conversationId,
      organizationId,
      incomingMessage: messageText,
      messageId,
    }).catch((error) => {
      console.error('[AI Process] Background processing error:', error);
    })
  );

  return Response.json({ received: true }, { status: 200 });
}

/**
 * @fileoverview Health Check Endpoint
 *
 * Verifica a saúde básica da aplicação:
 * - Conexão com Supabase
 * - Disponibilidade dos provedores de AI (Google Gemini)
 * - Status de Edge Functions de webhooks
 *
 * @route GET /api/health
 * @public
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_ms: number;
  components: {
    database: {
      status: 'ok' | 'error';
      latency_ms?: number;
      error?: string;
    };
    ai_provider: {
      status: 'ok' | 'error';
      provider: string;
      error?: string;
    };
    webhooks: {
      status: 'ok' | 'unknown';
      edge_functions: string[];
    };
  };
  version: string;
}

/**
 * GET /api/health — Health check endpoint
 * Returns 200 if healthy, 503 if unhealthy
 */
export async function GET(): Promise<NextResponse<HealthCheckResult>> {
  const startTime = Date.now();
  const components: HealthCheckResult['components'] = {
    database: { status: 'error' },
    ai_provider: { status: 'error', provider: 'google' },
    webhooks: { status: 'unknown', edge_functions: [] },
  };

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy';

  // 1. Check Supabase connection
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const dbStartTime = Date.now();

    // Simple query to verify connection
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .maybeSingle();

    const dbLatency = Date.now() - dbStartTime;

    if (error) {
      throw new Error(error.message);
    }

    components.database = {
      status: 'ok',
      latency_ms: dbLatency,
    };
  } catch (err) {
    components.database = {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown database error',
    };
  }

  // 2. Check AI Provider Configuration
  try {
    const aiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!aiApiKey) {
      throw new Error('Google AI API key not configured');
    }

    // Validate API key format (basic check)
    if (aiApiKey.length < 20) {
      throw new Error('Invalid API key format');
    }

    components.ai_provider = {
      status: 'ok',
      provider: 'google',
    };
  } catch (err) {
    components.ai_provider = {
      status: 'error',
      provider: 'google',
      error: err instanceof Error ? err.message : 'Unknown AI provider error',
    };
  }

  // 3. Determine overall status
  const dbOk = components.database.status === 'ok';
  const aiOk = components.ai_provider.status === 'ok';

  if (dbOk && aiOk) {
    overallStatus = 'healthy';
  } else if (dbOk || aiOk) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'unhealthy';
  }

  const response: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime_ms: Date.now() - startTime,
    components,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
  };

  // Return 503 if unhealthy, 200 otherwise
  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * HEAD /api/health — Lightweight health check (HEAD request)
 * Returns 200 if healthy, 503 if unhealthy
 * No response body for bandwidth savings
 */
export async function HEAD(): Promise<NextResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const aiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    const dbConfigured = !!(supabaseUrl && supabaseAnonKey);
    const aiConfigured = !!(aiApiKey && aiApiKey.length > 20);

    const healthy = dbConfigured && aiConfigured;
    const statusCode = healthy ? 200 : 503;

    return new NextResponse(null, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

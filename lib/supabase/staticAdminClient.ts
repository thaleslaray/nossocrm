import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _cachedClient: SupabaseClient | null = null;

/**
 * Static admin client (service role) for non-Next runtimes.
 *
 * - Não depende de `next/headers` nem de `server-only`
 * - Seguro para uso em scripts/CLI e em agentes (sem cookies)
 * - Lazy-initialized: safe to import at module level during build
 */
export function createStaticAdminClient() {
  if (_cachedClient) return _cachedClient;

  // Prefer new key formats, fallback to legacy
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Ensure environment variables are loaded before calling createStaticAdminClient().'
    );
  }

  _cachedClient = createClient(supabaseUrl, supabaseSecretKey);
  return _cachedClient;
}

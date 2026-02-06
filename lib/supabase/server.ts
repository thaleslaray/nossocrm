import "server-only";
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Função pública `createClient` do projeto.
 * @returns {Promise<SupabaseClient<any, "public", "public", any, any>>} Retorna um valor do tipo `Promise<SupabaseClient<any, "public", "public", any, any>>`.
 */
export async function createClient() {
    const cookieStore = await cookies()

    // Prefer new key formats, fallback to legacy
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing user sessions.
                    }
                },
            },
        }
    )
}

// Admin client for server-side operations with service role (requires request context)
/**
 * Função pública `createAdminClient` do projeto.
 * @returns {Promise<SupabaseClient<any, "public", "public", any, any>>} Retorna um valor do tipo `Promise<SupabaseClient<any, "public", "public", any, any>>`.
 */
export async function createAdminClient() {
    const cookieStore = await cookies()

    // Prefer new key formats, fallback to legacy
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
        || process.env.SUPABASE_SERVICE_ROLE_KEY!

    return createServerClient(
        supabaseUrl,
        supabaseSecretKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Ignored in Server Components
                    }
                },
            },
        }
    )
}

// Static admin client for contexts without request (AI agents, background jobs, etc.)
// This uses createClient from @supabase/supabase-js directly, not SSR version
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Função pública `createStaticAdminClient` do projeto.
 * @returns {SupabaseClient<any, "public", "public", any, any>} Retorna um valor do tipo `SupabaseClient<any, "public", "public", any, any>`.
 */
export function createStaticAdminClient() {
    // Prefer new key formats, fallback to legacy
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
        || process.env.SUPABASE_SERVICE_ROLE_KEY!

    return createSupabaseClient(supabaseUrl, supabaseSecretKey);
}

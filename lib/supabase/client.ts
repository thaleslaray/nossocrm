'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Check if Supabase is properly configured
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
// Prefer new publishable key format, fallback to legacy anon key
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const isConfigured = supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your_') &&
    supabaseUrl.startsWith('http')

let _supabase: SupabaseClient | null = null

/**
 * Função pública `createClient` do projeto.
 * @returns {SupabaseClient<any, "public", "public", any, any> | null} Retorna um valor do tipo `SupabaseClient<any, "public", "public", any, any> | null`.
 */
export function createClient(): SupabaseClient | null {
    if (!isConfigured) {
        console.warn('[supabase] Not configured - auth will not work')
        return null
    }

    if (!_supabase) {
        _supabase = createBrowserClient(supabaseUrl!, supabaseAnonKey!)
    }
    return _supabase
}

/**
 * Get Supabase client with guaranteed non-null return.
 * Throws an error if Supabase is not configured.
 * Use this in queryFn and mutationFn where you need a non-nullable client.
 */
export function getClient(): SupabaseClient {
    const client = createClient()
    if (!client) {
        throw new Error('Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }
    return client
}

// Alias for backward compatibility
// Importante: em ambientes devidamente configurados, `createClient()` nunca deve retornar null.
// Mantemos o retorno `SupabaseClient | null` em `createClient` para permitir uma mensagem
// amigável em dev quando o `.env` não está preenchido, mas exportamos o singleton como
// não-nulo para simplificar o restante do código (e evitar checks repetitivos).
export const supabase: SupabaseClient = createClient() as SupabaseClient

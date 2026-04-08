import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Função pública `GET` do projeto.
 *
 * @param {Request} request - Objeto da requisição.
 * @returns {Promise<NextResponse<unknown>>} Retorna um valor do tipo `Promise<NextResponse<unknown>>`.
 */
/**
 * Valida o parâmetro `next` para evitar open redirect.
 * Aceita apenas paths relativos começando com uma única barra: `/foo`, `/foo?bar=1`.
 * Rejeita: URLs absolutas (`https://evil.com`), scheme-relative (`//evil.com`),
 * backslash tricks (`/\evil.com`), e qualquer valor vazio/não-string.
 */
function sanitizeNextPath(next: string | null): string {
    const DEFAULT_NEXT = '/dashboard'
    if (!next || typeof next !== 'string') return DEFAULT_NEXT
    // Deve começar com `/` E não começar com `//` nem `/\`
    if (!next.startsWith('/')) return DEFAULT_NEXT
    if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_NEXT
    // Limite de tamanho defensivo
    if (next.length > 512) return DEFAULT_NEXT
    return next
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = sanitizeNextPath(searchParams.get('next'))

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host')
            const isLocalEnv = process.env.NODE_ENV === 'development'

            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${next}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`)
            } else {
                return NextResponse.redirect(`${origin}${next}`)
            }
        }
    }

    // Return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}

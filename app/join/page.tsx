import { Suspense } from 'react'
import { JoinClient } from './JoinClient'

/**
 * Componente React `JoinPage`.
 *
 * @param {{ searchParams?: { token?: string | string[] | undefined; } | undefined; }} {
  searchParams,
} - Parâmetro `{
  searchParams,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string | string[] }>
}) {
  const params = await searchParams
  const token =
    typeof params?.token === 'string'
      ? params.token
      : Array.isArray(params?.token)
        ? params?.token?.[0] ?? null
        : null

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-bg">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    }>
      <JoinClient token={token} />
    </Suspense>
  )
}

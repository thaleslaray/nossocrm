'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/utils/errorUtils'
import { useAuth } from '@/context/AuthContext'
import { Loader2, Building2, User, Lock, ArrowRight } from 'lucide-react'

/**
 * Componente React `SetupPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function SetupPage() {
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingInit, setCheckingInit] = useState(true)

  const router = useRouter()
  const { checkInitialization } = useAuth()

  // Se a instância já estiver inicializada, não faz sentido exibir o wizard de setup.
  // Mantemos a rota pública, mas redirecionamos o usuário para login (ou dashboard se já estiver logado).
  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        if (!supabase) {
          // Sem Supabase configurado localmente: não dá pra checar init. Apenas mostra a UI.
          return
        }

        const [{ data: initData, error: initError }, { data: sessionData }] = await Promise.all([
          supabase.rpc('is_instance_initialized'),
          supabase.auth.getSession(),
        ])

        if (initError) throw initError

        if (initData === true) {
          if (cancelled) return
          if (sessionData?.session?.user) {
            router.replace('/dashboard')
          } else {
            router.replace('/login')
          }
          return
        }
      } catch (e) {
        console.error('Setup init check error:', e)
        // Em caso de erro, não bloqueia o setup.
      } finally {
        if (!cancelled) setCheckingInit(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [router])

  const passwordRequirements = {
    minLength: password.length >= 6,
    hasLowercase: /[a-z]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasDigit: /\d/.test(password),
  }
  const isPasswordValid = Object.values(passwordRequirements).every(Boolean)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (checkingInit) return

    if (!isPasswordValid) {
      setError('A senha não atende aos requisitos mínimos')
      return
    }

    if (!passwordsMatch) {
      setError('As senhas não coincidem')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/setup-instance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ companyName, email, password }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || `Erro no setup (HTTP ${res.status})`)

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      await checkInitialization()
      router.push('/dashboard')
    } catch (err) {
      console.error('Setup error:', err)
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-bg relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-primary-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-purple-500/20 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-md w-full relative z-10 px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white font-display tracking-tight mb-2">
            Bem-vindo ao NossoCRM
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Vamos preparar seu ambiente de trabalho.</p>
        </div>

        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-8 backdrop-blur-sm">
          {checkingInit ? (
            <div className="flex items-center justify-center py-10 text-slate-600 dark:text-slate-300">
              <Loader2 className="animate-spin h-5 w-5 mr-2" />
              Verificando configuração…
            </div>
          ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="company-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Nome da Empresa
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="company-name"
                  name="company"
                  type="text"
                  required
                  aria-required="true"
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all sm:text-sm"
                  placeholder="Ex: Acme Corp"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email-address" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email do Administrador
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-required="true"
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all sm:text-sm"
                  placeholder="admin@empresa.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  aria-required="true"
                  aria-describedby="password-requirements"
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all sm:text-sm"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              {password.length > 0 && (
                <div id="password-requirements" className="mt-2 space-y-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Requisitos:</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className={passwordRequirements.minLength ? 'text-green-500' : 'text-slate-400'}>
                      {passwordRequirements.minLength ? '✓' : '○'} Mínimo 6 caracteres
                    </span>
                    <span className={passwordRequirements.hasLowercase ? 'text-green-500' : 'text-slate-400'}>
                      {passwordRequirements.hasLowercase ? '✓' : '○'} Letra minúscula
                    </span>
                    <span className={passwordRequirements.hasUppercase ? 'text-green-500' : 'text-slate-400'}>
                      {passwordRequirements.hasUppercase ? '✓' : '○'} Letra maiúscula
                    </span>
                    <span className={passwordRequirements.hasDigit ? 'text-green-500' : 'text-slate-400'}>
                      {passwordRequirements.hasDigit ? '✓' : '○'} Número
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Confirmar Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  aria-required="true"
                  aria-invalid={confirmPassword.length > 0 && !passwordsMatch ? 'true' : undefined}
                  className={`block w-full pl-10 pr-3 py-2.5 border rounded-xl bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all sm:text-sm ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? 'border-green-500 focus:border-green-500'
                        : 'border-red-500 focus:border-red-500'
                      : 'border-slate-300 dark:border-slate-700 focus:border-primary-500'
                  }`}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>

              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-500">As senhas não coincidem</p>
              )}
              {passwordsMatch && <p className="mt-1 text-xs text-green-500">✓ Senhas coincidem</p>}
            </div>

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm text-center"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isPasswordValid || !passwordsMatch}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-primary-500/20 text-sm font-bold text-white bg-primary-600 hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                <>
                  Começar Agora
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </button>
          </form>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          &copy; {new Date().getFullYear()} NossoCRM. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}

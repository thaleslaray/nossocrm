'use client';

import React from 'react';
import { Download, X } from 'lucide-react';
import { useInstallState } from './useInstallState';

export function InstallBanner() {
  const { isEligible, isDismissed, canPrompt, platformHint, promptInstall, dismiss } = useInstallState();

  if (!isEligible || isDismissed) return null;

  return (
    <div className="fixed left-3 right-3 top-3 z-[9999] md:left-[calc(0.75rem+var(--app-sidebar-width,0px))] md:right-3">
      <div className="glass border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0">
            <Download className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Instale o Ads Rocket
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              {platformHint === 'ios'
                ? 'No iPhone/iPad: toque em Compartilhar → “Adicionar à Tela de Início”.'
                : canPrompt
                  ? 'Instale para abrir mais rápido e usar como app.'
                  : 'Instale para abrir mais rápido e usar como app.'}
            </div>
            {platformHint !== 'ios' ? (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={promptInstall}
                  disabled={!canPrompt}
                  className="px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:text-slate-600 text-white text-xs font-semibold transition-colors"
                >
                  Instalar
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                >
                  Agora não
                </button>
              </div>
            ) : (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={dismiss}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                >
                  Entendi
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus-visible-ring"
            aria-label="Fechar"
          >
            <X className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}


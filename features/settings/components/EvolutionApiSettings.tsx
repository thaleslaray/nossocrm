'use client';

import React, { useState, useEffect } from 'react';
import { Plug, Save, Loader2, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * Componente React `EvolutionApiSettings`.
 * Configuracoes de conexao com o Evolution API para integracao WhatsApp.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const EvolutionApiSettings: React.FC = () => {
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveResult, setSaveResult] = useState<ConnectionTestResult | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  // Fetch current settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings/evolution');
        if (!res.ok) throw new Error('Falha ao carregar configuracoes');
        const data = await res.json();
        setEvolutionApiUrl(data.evolutionApiUrl || '');
        setEvolutionApiKey(data.evolutionApiKey || '');
      } catch (err: any) {
        console.error('Erro ao carregar configuracoes do Evolution API:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/settings/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evolutionApiUrl: evolutionApiUrl.trim(),
          evolutionApiKey: evolutionApiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveResult({ ok: false, message: data?.error || 'Erro ao salvar' });
        return;
      }
      setSaveResult({ ok: true, message: 'Configuracoes salvas com sucesso' });
    } catch (err: any) {
      setSaveResult({ ok: false, message: err?.message || 'Erro ao salvar configuracoes' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const url = evolutionApiUrl.trim();
    const key = evolutionApiKey.trim();

    if (!url) {
      setTestResult({ ok: false, message: 'Informe a URL do Evolution API' });
      return;
    }
    if (!key) {
      setTestResult({ ok: false, message: 'Informe a API Key do Evolution API' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const baseUrl = url.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/instance/fetchInstances`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        setTestResult({
          ok: false,
          message: `Erro ${res.status}: ${body || 'Falha na conexao'}`,
        });
        return;
      }

      const data = await res.json().catch(() => null);
      const instanceCount = Array.isArray(data) ? data.length : 0;
      setTestResult({
        ok: true,
        message: `Conectado com sucesso. ${instanceCount} instancia(s) encontrada(s).`,
      });
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err?.message || 'Nao foi possivel conectar ao Evolution API',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="mb-12">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">Carregando configuracoes...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-12">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
        {/* Header */}
        <div className="min-w-0 mb-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Plug className="h-5 w-5" />
            WhatsApp (Evolution API)
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure a conexao com o Evolution API para integracao WhatsApp.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Evolution API URL */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Evolution API URL
            </label>
            <input
              type="text"
              value={evolutionApiUrl}
              onChange={(e) => {
                setEvolutionApiUrl(e.target.value);
                setSaveResult(null);
                setTestResult(null);
              }}
              placeholder="https://evo.exemplo.com"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Evolution API Key */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Evolution API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={evolutionApiKey}
                onChange={(e) => {
                  setEvolutionApiKey(e.target.value);
                  setSaveResult(null);
                  setTestResult(null);
                }}
                placeholder="Sua chave de API global"
                className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-60 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              {testing ? 'Testando...' : 'Testar Conexao'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
                testResult.ok
                  ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  : 'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200'
              }`}
            >
              {testResult.ok ? (
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Save Result */}
          {saveResult && (
            <div
              className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
                saveResult.ok
                  ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  : 'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200'
              }`}
            >
              {saveResult.ok ? (
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{saveResult.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EvolutionApiSettings;

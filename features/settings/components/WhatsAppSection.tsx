import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

type SourceRow = {
  id: string;
  name: string;
  token: string;
  channel: string;
  active: boolean;
};

function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return b64;
}

function buildWebhookUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return `${base}/functions/v1/gptmaker-in/${token}`;
}

export const WhatsAppSection: React.FC = () => {
  const { profile } = useAuth();
  const { addToast } = useToast();

  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const organizationId = (profile as any)?.organization_id as string | undefined;

  const canManage = useMemo(() => (profile as any)?.role === 'admin', [profile]);

  async function load() {
    if (!canManage) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gptmaker_webhook_sources')
        .select('id, name, token, channel, active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources((data ?? []) as SourceRow[]);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Erro ao carregar fontes', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  async function createSource() {
    if (!organizationId) {
      addToast('Profile sem organização', 'error');
      return;
    }

    const token = generateToken();

    setLoading(true);
    try {
      const { error } = await supabase
        .from('gptmaker_webhook_sources')
        .insert({
          organization_id: organizationId,
          name: 'GPTMaker WhatsApp',
          token,
          channel: 'WHATSAPP',
          active: true,
        });

      if (error) throw error;

      addToast('Token criado', 'success');
      await load();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Erro ao criar token', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function removeSource(id: string) {
    setLoading(true);
    try {
      const { error } = await supabase.from('gptmaker_webhook_sources').delete().eq('id', id);
      if (error) throw error;
      addToast('Removido', 'success');
      await load();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Erro ao remover', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  }

  return (
    <div className="pb-10">
      <SettingsSection
        title="WhatsApp (GPTMaker)"
        description="Configure o webhook de mensagens do GPTMaker usando token na URL."
        icon={KeyRound}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            1) Crie um token aqui • 2) Cole a URL no webhook do GPTMaker
          </div>
          <button
            type="button"
            disabled={!canManage || loading}
            onClick={createSource}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300 hover:bg-primary-500/15 transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
            Criar token
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {sources.length === 0 ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">Nenhuma fonte configurada ainda.</div>
          ) : (
            sources.map((s) => {
              const url = buildWebhookUrl(s.token);
              return (
                <div key={s.id} className="p-4 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                      <p className="text-xs text-slate-500">Canal: {s.channel} • {s.active ? 'ativo' : 'inativo'}</p>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        if (confirm('Remover este token? Isso quebra o webhook no GPTMaker.')) {
                          void removeSource(s.id);
                        }
                      }}
                      className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remover"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">URL do webhook</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={url}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-sm text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => void copy(url, `url:${s.id}`)}
                        className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
                        title="Copiar"
                      >
                        {copied === `url:${s.id}` ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SettingsSection>
    </div>
  );
};

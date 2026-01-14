import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

type AccountRow = {
  id: string;
  active: boolean;
  provider: string;
  name: string;
  webhook_token: string;
};

type PostgrestishError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function getErrorMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const pe = e as PostgrestishError;
    if (typeof pe.message === 'string' && pe.message.trim()) return pe.message;
  }
  return fallback;
}

function isDuplicateConstraint(e: unknown) {
  if (!e || typeof e !== 'object') return false;
  const pe = e as PostgrestishError;
  if (pe.code === '23505') return true;
  const msg = typeof pe.message === 'string' ? pe.message : '';
  return msg.includes('duplicate key') || msg.includes('unique constraint');
}

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
  return `${base}/functions/v1/zapi-in/${token}`;
}

export const WhatsAppSection: React.FC = () => {
  const { profile } = useAuth();
  const { addToast } = useToast();

  const [account, setAccount] = useState<AccountRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const organizationId = (profile as any)?.organization_id as string | undefined;

  const canManage = useMemo(() => (profile as any)?.role === 'admin', [profile]);

  async function load() {
    if (!canManage) return;
    if (!organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_accounts')
        .select('id, active, provider, name, webhook_token')
        .eq('organization_id', organizationId)
        .eq('provider', 'zapi')
        .maybeSingle();

      if (error) throw error;
      setAccount((data ?? null) as AccountRow | null);
    } catch (e) {
      addToast(getErrorMessage(e, 'Erro ao carregar conexão'), 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [canManage, organizationId]);

  async function createConnection() {
    if (!organizationId) {
      addToast('Profile sem organização', 'error');
      return;
    }

    setLoading(true);

    try {
      // Evita tentar inserir duplicado quando já existe conexão no banco.
      const { data: existing, error: existingErr } = await supabase
        .from('whatsapp_accounts')
        .select('id, active, provider, name, webhook_token')
        .eq('organization_id', organizationId)
        .eq('provider', 'zapi')
        .maybeSingle();

      if (existingErr) throw existingErr;
      if (existing) {
        setAccount(existing as AccountRow);
        addToast('Conexão Z-API já existe. Carregada com sucesso.', 'info');
        return;
      }

      const token = generateToken();

      const { error } = await supabase
        .from('whatsapp_accounts')
        .insert({
          organization_id: organizationId,
          provider: 'zapi',
          name: 'Z-API WhatsApp',
          webhook_token: token,
          active: true,
          config: {},
        });

      if (error) throw error;

      addToast('Conexão criada', 'success');
      await load();
    } catch (e) {
      // Caso clássico: já existe conexão (índice singleton por organização). Recarrega e segue.
      if (isDuplicateConstraint(e)) {
        await load();
        addToast('Já existe uma conexão Z-API configurada. Carreguei a existente.', 'info');
        return;
      }
      addToast(getErrorMessage(e, 'Erro ao criar conexão'), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function setConnectionActive(id: string, active: boolean) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_accounts')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', organizationId ?? '');
      if (error) throw error;
      addToast(active ? 'Conexão ativada' : 'Conexão desativada', 'success');
      await load();
    } catch (e) {
      addToast(getErrorMessage(e, 'Erro ao atualizar'), 'error');
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
        title="WhatsApp (Z-API)"
        icon={KeyRound}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            1) Crie a conexão aqui • 2) Cole a URL no webhook da Z-API
          </div>
          <button
            type="button"
            disabled={!canManage || loading || !!account}
            onClick={createConnection}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300 hover:bg-primary-500/15 transition-colors disabled:opacity-50"
          >
            <Plus size={16} />
            Conectar
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {!account ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Nenhuma conexão configurada ainda.
            </div>
          ) : (
            (() => {
              const url = buildWebhookUrl(account.webhook_token);
              return (
                <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{account.name}</p>
                      <p className="text-xs text-slate-500">
                        Provedor: {account.provider} • {account.active ? 'ativo' : 'inativo'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const nextActive = !account.active;
                        const msg = nextActive
                          ? 'Ativar esta conexão?'
                          : 'Desativar esta conexão? O webhook da Z-API vai parar de enviar eventos.';
                        if (confirm(msg)) {
                          void setConnectionActive(account.id, nextActive);
                        }
                      }}
                      className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title={account.active ? 'Desativar' : 'Ativar'}
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
                        onClick={() => void copy(url, `url:${account.id}`)}
                        className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
                        title="Copiar"
                      >
                        {copied === `url:${account.id}` ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </SettingsSection>
    </div>
  );
};

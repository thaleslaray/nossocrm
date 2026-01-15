import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

type ZapiConfig = {
  instance_id?: string;
  instance_token?: string;
  instance_api_base?: string;
  webhook_config_status?: unknown;
};

type AccountRow = {
  id: string;
  active: boolean;
  provider: string;
  name: string;
  webhook_token: string;
  config?: ZapiConfig | null;
};

function getErrorMessage(e: unknown, fallback: string) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && typeof (e as any).message === 'string') return (e as any).message;
  return fallback;
}

type AccountApiResponse =
  | { account: AccountRow | null; webhookUrl: string | null }
  | { error: string };

async function readApiError(res: Response) {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await res.json().catch(() => null)) as any;
    if (body && typeof body.error === 'string' && body.error.trim()) return body.error;
  }
  const text = await res.text().catch(() => '');
  return text.trim() || `HTTP ${res.status}`;
}

export const WhatsAppSection: React.FC = () => {
  const { profile } = useAuth();
  const { addToast } = useToast();

  const [account, setAccount] = useState<AccountRow | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [instanceId, setInstanceId] = useState('');
  const [instanceToken, setInstanceToken] = useState('');
  const [instanceApiBase, setInstanceApiBase] = useState('');

  const organizationId = (profile as any)?.organization_id as string | undefined;

  const canManage = useMemo(() => (profile as any)?.role === 'admin', [profile]);

  async function load() {
    if (!canManage) return;
    if (!organizationId) return;

    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/account', { method: 'GET' });
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      const data = (await res.json()) as AccountApiResponse;
      if ('error' in data) {
        throw new Error(data.error);
      }

      setAccount(data.account);
      setWebhookUrl(data.webhookUrl);

      const cfg = data.account?.config ?? null;
      setInstanceId(cfg?.instance_id ?? '');
      setInstanceToken(cfg?.instance_token ?? '');
      setInstanceApiBase(cfg?.instance_api_base ?? '');
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
      const res = await fetch('/api/whatsapp/account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const data = (await res.json()) as AccountApiResponse;
      if ('error' in data) {
        throw new Error(data.error);
      }

      setAccount(data.account);
      setWebhookUrl(data.webhookUrl);
      addToast(data.account ? 'Conexão pronta' : 'Conexão não encontrada', 'success');
    } catch (e) {
      addToast(getErrorMessage(e, 'Erro ao criar conexão'), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function setConnectionActive(id: string, active: boolean) {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/account', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const data = (await res.json()) as AccountApiResponse;
      if ('error' in data) {
        throw new Error(data.error);
      }

      setAccount(data.account);
      setWebhookUrl(data.webhookUrl);
      addToast(active ? 'Conexão ativada' : 'Conexão desativada', 'success');
    } catch (e) {
      addToast(getErrorMessage(e, 'Erro ao atualizar'), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function saveCredentials() {
    if (!account) return;

    const id = instanceId.trim();
    const token = instanceToken.trim();
    const api = instanceApiBase.trim();

    if (!id || !token || !api) {
      addToast('Preencha Instance ID, Token e API Base para salvar.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/account', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instance_id: id,
          instance_token: token,
          instance_api_base: api,
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const data = (await res.json()) as AccountApiResponse;
      if ('error' in data) {
        throw new Error(data.error);
      }

      setAccount(data.account);
      setWebhookUrl(data.webhookUrl);
      addToast('Credenciais salvas', 'success');
    } catch (e) {
      addToast(getErrorMessage(e, 'Erro ao salvar credenciais'), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function rotateToken() {
    if (!account) return;
    const ok = confirm(
      'Rotacionar o token do webhook?\n\nIsso revoga URLs antigas. Atualize também o webhook configurado na Z-API.'
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/account/rotate-token', { method: 'POST' });
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      const data = (await res.json()) as AccountApiResponse;
      if ('error' in data) {
        throw new Error(data.error);
      }

      setAccount(data.account);
      setWebhookUrl(data.webhookUrl);
      addToast('Token rotacionado. Copie a nova URL.', 'success');
    } catch (e) {
      addToast(getErrorMessage(e, 'Erro ao rotacionar token'), 'error');
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
            1) Conectar • 2) Salvar credenciais • 3) Copiar URL do webhook
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

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">Instance ID</p>
                      <input
                        value={instanceId}
                        onChange={(e) => setInstanceId(e.target.value)}
                        placeholder="ex.: 123456"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-sm text-slate-200"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">Token</p>
                      <input
                        value={instanceToken}
                        onChange={(e) => setInstanceToken(e.target.value)}
                        placeholder="token da instância"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-sm text-slate-200"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1">API Base</p>
                      <input
                        value={instanceApiBase}
                        onChange={(e) => setInstanceApiBase(e.target.value)}
                        placeholder="https://api.z-api.io"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-sm text-slate-200"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <a
                      href="https://www.z-api.io/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary-600 dark:text-primary-300 hover:underline"
                    >
                      Abrir Z-API (criar instância / QR Code)
                    </a>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void saveCredentials()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 disabled:opacity-50"
                      >
                        Salvar credenciais
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void rotateToken()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 text-red-200 disabled:opacity-50"
                        title="Rotacionar token do webhook"
                      >
                        Rotacionar token
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">URL do webhook</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={webhookUrl ?? ''}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-sm text-slate-200"
                      />
                      <button
                        type="button"
                        disabled={!webhookUrl}
                        onClick={() => webhookUrl && void copy(webhookUrl, `url:${account.id}`)}
                        className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
                        title="Copiar"
                      >
                        {copied === `url:${account.id}` ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Cole essa URL no webhook da Z-API (campo “Ao receber”).
                    </p>
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

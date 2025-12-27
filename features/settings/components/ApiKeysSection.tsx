import React, { useEffect, useMemo, useState } from 'react';
import { Key, Copy, ExternalLink, CheckCircle2, Plus, Trash2, ShieldCheck, RefreshCw, TerminalSquare, Play } from 'lucide-react';

import { useOptionalToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase/client';

import { SettingsSection } from './SettingsSection';

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/**
 * Componente React `ApiKeysSection`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ApiKeysSection: React.FC = () => {
  const { addToast } = useOptionalToast();

  const [action, setAction] = useState<'create_lead' | 'create_deal' | 'move_stage' | 'create_activity'>('create_lead');
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('n8n');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdPrefix, setCreatedPrefix] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [boards, setBoards] = useState<Array<{ id: string; key: string | null; name: string }>>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [selectedBoardKey, setSelectedBoardKey] = useState<string>('');
  const [actionTestLoading, setActionTestLoading] = useState(false);
  const [actionTestResult, setActionTestResult] = useState<{ ok: boolean; message: string; raw?: any } | null>(null);

  const openApiUrl = useMemo(() => '/api/public/v1/openapi.json', []);
  const swaggerUrl = useMemo(() => '/api/public/v1/docs', []);
  const meUrl = useMemo(() => '/api/public/v1/me', []);
  const boardsUrl = useMemo(() => '/api/public/v1/boards?limit=250', []);
  const contactsUrl = useMemo(() => '/api/public/v1/contacts', []);
  const dealsUrl = useMemo(() => '/api/public/v1/deals', []);
  const activitiesUrl = useMemo(() => '/api/public/v1/activities', []);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast(`${label} copiado.`, 'success');
    } catch {
      addToast(`Não foi possível copiar ${label.toLowerCase()}.`, 'error');
    }
  };

  const loadKeys = async () => {
    if (!supabase) {
      addToast('Supabase não configurado neste ambiente.', 'error');
      return;
    }
    setLoadingKeys(true);
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id,name,key_prefix,created_at,last_used_at,revoked_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setKeys((data || []) as ApiKeyRow[]);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar chaves', 'error');
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  const createKey = async () => {
    if (!supabase) {
      addToast('Supabase não configurado neste ambiente.', 'error');
      return;
    }
    const name = newKeyName.trim() || 'Integração';
    setCreating(true);
    setCreatedToken(null);
    setCreatedPrefix(null);
    setTestResult(null);
    try {
      const { data, error } = await supabase.rpc('create_api_key', { p_name: name });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const token = row?.token as string | undefined;
      const prefix = row?.key_prefix as string | undefined;
      if (!token || !prefix) throw new Error('Resposta inválida ao criar chave');
      setCreatedToken(token);
      setCreatedPrefix(prefix);
      addToast('Chave criada. Copie agora — ela aparece só uma vez.', 'success');
      await loadKeys();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao criar chave', 'error');
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!supabase) {
      addToast('Supabase não configurado neste ambiente.', 'error');
      return;
    }
    setRevokingId(id);
    try {
      const { error } = await supabase.rpc('revoke_api_key', { p_api_key_id: id });
      if (error) throw error;
      addToast('Chave revogada.', 'success');
      await loadKeys();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao revogar chave', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  const testMe = async () => {
    if (!createdToken) {
      addToast('Crie uma chave primeiro.', 'warning');
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch(meUrl, {
        headers: { 'X-Api-Key': createdToken },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResult({ ok: false, message: json?.error || 'Falha no teste' });
        return;
      }
      setTestResult({ ok: true, message: 'OK — API key validada' });
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || 'Erro no teste' });
    } finally {
      setTestLoading(false);
    }
  };

  const loadBoardsViaApi = async () => {
    if (!createdToken) return;
    setBoardsLoading(true);
    try {
      const res = await fetch(boardsUrl, {
        headers: { 'X-Api-Key': createdToken },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Falha ao carregar boards');
      const rows = (json?.data || []) as Array<any>;
      setBoards(rows.map((b) => ({ id: b.id, key: b.key ?? null, name: b.name })));
      if (!selectedBoardKey) {
        const firstWithKey = rows.find((b) => b.key) as any;
        if (firstWithKey?.key) setSelectedBoardKey(firstWithKey.key);
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao carregar boards', 'error');
    } finally {
      setBoardsLoading(false);
    }
  };

  useEffect(() => {
    if (createdToken) void loadBoardsViaApi();
  }, [createdToken]);

  const curlExample = useMemo(() => {
    const token = createdToken || 'SUA_API_KEY';
    if (action === 'create_lead') {
      return `curl -X POST '${contactsUrl}' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Api-Key: ${token}' \\\n+  -d '{\n+    \"name\": \"Lead Teste\",\n+    \"email\": \"teste@exemplo.com\",\n+    \"phone\": \"+5511999999999\",\n+    \"source\": \"n8n\"\n+  }'`;
    }
    if (action === 'create_deal') {
      const boardKey = selectedBoardKey || 'board-key';
      return `curl -X POST '${dealsUrl}' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Api-Key: ${token}' \\\n+  -d '{\n+    \"title\": \"Deal Teste\",\n+    \"value\": 0,\n+    \"board_key\": \"${boardKey}\",\n+    \"contact\": {\n+      \"name\": \"Lead Teste\",\n+      \"email\": \"teste@exemplo.com\",\n+      \"phone\": \"+5511999999999\"\n+    }\n+  }'`;
    }
    if (action === 'move_stage') {
      return `curl -X POST '/api/public/v1/deals/DEAL_ID/move-stage' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Api-Key: ${token}' \\\n+  -d '{ \"to_stage_id\": \"STAGE_UUID\" }'`;
    }
    return `curl -X POST '${activitiesUrl}' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Api-Key: ${token}' \\\n+  -d '{\n+    \"type\": \"NOTE\",\n+    \"title\": \"Nota\",\n+    \"description\": \"Criada via integração\",\n+    \"date\": \"${new Date().toISOString()}\"\n+  }'`;
  }, [action, activitiesUrl, contactsUrl, createdToken, dealsUrl, selectedBoardKey]);

  const runActionTest = async () => {
    if (!createdToken) {
      addToast('Crie uma chave no Passo 2.', 'warning');
      return;
    }
    setActionTestLoading(true);
    setActionTestResult(null);
    try {
      if (action === 'create_lead') {
        const res = await fetch(contactsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': createdToken },
          body: JSON.stringify({
            name: 'Lead Teste',
            email: `teste+${Date.now()}@exemplo.com`,
            phone: '+5511999999999',
            source: 'ui-test',
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Falha no teste');
        setActionTestResult({ ok: true, message: `OK (${json?.action || 'ok'})`, raw: json });
        return;
      }

      if (action === 'create_deal') {
        if (!selectedBoardKey) {
          addToast('Escolha um board no Passo 3.', 'warning');
          setActionTestResult({ ok: false, message: 'Selecione um board_key primeiro.' });
          return;
        }
        const res = await fetch(dealsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': createdToken },
          body: JSON.stringify({
            title: `Deal Teste ${new Date().toLocaleTimeString('pt-BR')}`,
            value: 0,
            board_key: selectedBoardKey,
            contact: {
              name: 'Lead Teste',
              email: `teste+${Date.now()}@exemplo.com`,
              phone: '+5511999999999',
            },
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Falha no teste');
        setActionTestResult({ ok: true, message: 'OK (deal criado)', raw: json });
        return;
      }

      if (action === 'create_activity') {
        const res = await fetch(activitiesUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': createdToken },
          body: JSON.stringify({
            type: 'NOTE',
            title: 'Nota via integração',
            description: 'Criada pelo teste da UI',
            date: new Date().toISOString(),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Falha no teste');
        setActionTestResult({ ok: true, message: 'OK (atividade criada)', raw: json });
        return;
      }

      setActionTestResult({ ok: false, message: 'Teste automático para mover etapa entra no próximo passo (precisa DEAL_ID + STAGE_ID).' });
    } catch (e: any) {
      setActionTestResult({ ok: false, message: e?.message || 'Erro no teste' });
    } finally {
      setActionTestLoading(false);
    }
  };

  return (
    <SettingsSection title="API (Integrações)" icon={Key}>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
        Aqui você conecta n8n/Make sem precisar “entender API”. Escolha o que quer automatizar, copie o que precisa e teste.
        <br />
        A documentação técnica (OpenAPI/Swagger) fica disponível, mas só quando você quiser.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Passo 1 — O que você quer automatizar?
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as any)}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="create_lead">Criar/Atualizar Lead (Contato)</option>
            <option value="create_deal">Criar Negócio (Deal)</option>
            <option value="move_stage">Mover etapa do Deal</option>
            <option value="create_activity">Criar Atividade (nota/tarefa)</option>
          </select>

          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>Produto primeiro: você escolhe o objetivo, a gente te entrega o “copiar/colar”.</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Passo 2 — Gere sua chave
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
            Você vai colar essa chave no n8n/Make. Ela aparece <strong>uma vez</strong>.
          </div>
          <div className="flex gap-2">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Nome (ex: n8n, make, parceiro-x)"
            />
            <button
              type="button"
              onClick={createKey}
              disabled={creating}
              className="shrink-0 px-3 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar
            </button>
          </div>

          {createdToken && (
            <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Chave criada (copie agora)
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={createdToken}
                  className="w-full px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-white/70 dark:bg-black/20 text-slate-900 dark:text-white font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => copy('API key', createdToken)}
                  className="shrink-0 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-white/70 dark:bg-black/20 hover:bg-white text-emerald-800 dark:text-emerald-200 text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copiar
                </button>
              </div>
              <div className="mt-2 text-xs text-emerald-700/80 dark:text-emerald-200/80">
                Prefixo: <span className="font-mono">{createdPrefix}</span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={testMe}
                  disabled={testLoading}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold"
                >
                  {testLoading ? 'Testando…' : 'Testar agora'}
                </button>
                {testResult && (
                  <div className={`text-xs ${testResult.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4 lg:col-span-2">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Passo 3 — Escolha seu pipeline (board)
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
            A integração usa a <strong>chave (slug)</strong> do board — não precisa de UUID.
          </div>

          {!createdToken ? (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              Crie uma chave no Passo 2 para listar seus boards via API.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={loadBoardsViaApi}
                  disabled={boardsLoading}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${boardsLoading ? 'animate-spin' : ''}`} />
                  Carregar boards via API
                </button>
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  GET {boardsUrl}
                </div>
              </div>

              <select
                value={selectedBoardKey}
                onChange={(e) => setSelectedBoardKey(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Selecione…</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.key || ''} disabled={!b.key}>
                    {b.name}{b.key ? ` — ${b.key}` : ' — (sem chave)'}
                  </option>
                ))}
              </select>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => selectedBoardKey && copy('board_key', selectedBoardKey)}
                  disabled={!selectedBoardKey}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-60 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copiar board_key
                </button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4 lg:col-span-2">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Passo 4 — Documentação (OpenAPI)
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
            Se você (ou o time técnico) precisar, aqui está o OpenAPI para importar em Swagger/Postman e gerar integrações.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy('URL do OpenAPI', openApiUrl)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copiar URL
            </button>
            <a
              href={swaggerUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Swagger
            </a>
            <a
              href={openApiUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir OpenAPI (JSON)
            </a>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Status: <span className="font-mono">{openApiUrl}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Passo 4 (em andamento): vamos adicionar “Copiar cURL” e “Prova de funcionamento” (logs) para {action.replaceAll('_', ' ')}.
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
          Passo 5 — Copiar e testar
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
          Este é o “copiar/colar” que seu usuário precisa. Se funcionar aqui, funciona no n8n.
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={() => copy('cURL', curlExample)}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <TerminalSquare className="h-4 w-4" />
            Copiar cURL
          </button>
          <button
            type="button"
            onClick={runActionTest}
            disabled={actionTestLoading}
            className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            {actionTestLoading ? 'Testando…' : 'Testar agora'}
          </button>
        </div>

        <pre className="text-xs font-mono whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-black/20 p-3 text-slate-800 dark:text-slate-100">
          {curlExample}
        </pre>

        {actionTestResult && (
          <div className={`mt-3 text-sm ${actionTestResult.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
            {actionTestResult.message}
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Chaves existentes
          </div>
          <button
            type="button"
            onClick={loadKeys}
            disabled={loadingKeys}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loadingKeys ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {keys.length === 0 ? (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-300">
                Nenhuma chave criada ainda.
              </div>
            ) : (
              keys.map((k) => (
                <div key={k.id} className="p-4 bg-white dark:bg-white/5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {k.name}
                      {k.revoked_at ? (
                        <span className="ml-2 text-xs font-semibold text-rose-600 dark:text-rose-400">revogada</span>
                      ) : (
                        <span className="ml-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">ativa</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      {k.key_prefix}…
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Último uso: {k.last_used_at ? new Date(k.last_used_at).toLocaleString('pt-BR') : '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!!k.revoked_at || revokingId === k.id}
                      onClick={() => revokeKey(k.id)}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-60 text-rose-700 dark:text-rose-300 text-sm font-semibold inline-flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      {revokingId === k.id ? 'Revogando…' : 'Revogar'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
};

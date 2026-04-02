import React, { useEffect, useMemo, useState } from 'react';
import { Key, Copy, ExternalLink, CheckCircle2, Plus, Trash2, ShieldCheck, RefreshCw, TerminalSquare, Play } from 'lucide-react';

import { ConfirmDialog as ConfirmModal } from '@/components/ui/confirm-dialog';
import { useOptionalToast } from '@/context/ToastContext';
import { useBoards } from '@/lib/query/hooks/useBoardsQuery';
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
  const { data: boardsFromContext = [] } = useBoards();

  const [action, setAction] = useState<'create_lead' | 'create_deal' | 'move_stage' | 'create_activity'>('create_lead');
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyRow | null>(null);
  const [newKeyName, setNewKeyName] = useState('n8n');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdPrefix, setCreatedPrefix] = useState<string | null>(null);
  const [apiKeyToken, setApiKeyToken] = useState<string>(''); // token completo (apenas em memória)
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedToStageId, setSelectedToStageId] = useState<string>('');
  const [identityMode, setIdentityMode] = useState<'phone' | 'email'>('phone');
  const [identityPhone, setIdentityPhone] = useState<string>('');
  const [identityEmail, setIdentityEmail] = useState<string>('');
  const [leadName, setLeadName] = useState<string>('Lead Teste');
  const [leadEmail, setLeadEmail] = useState<string>('teste@exemplo.com');
  const [leadPhone, setLeadPhone] = useState<string>('+5511999999999');
  const [leadSource, setLeadSource] = useState<string>('n8n');
  const [leadRole, setLeadRole] = useState<string>('Gerente');
  const [leadCompanyName, setLeadCompanyName] = useState<string>('Empresa Teste');
  const [leadNotes, setLeadNotes] = useState<string>('');
  const [activityType, setActivityType] = useState<string>('NOTE');
  const [activityTitle, setActivityTitle] = useState<string>('Nota via integração');
  const [actionTestLoading, setActionTestLoading] = useState(false);
  const [actionTestResult, setActionTestResult] = useState<{ ok: boolean; message: string; raw?: any } | null>(null);

  const openApiUrl = useMemo(() => '/api/public/v1/openapi.json', []);
  const swaggerUrl = useMemo(() => '/api/public/v1/docs', []);
  const meUrl = useMemo(() => '/api/public/v1/me', []);
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
      setApiKeyToken(token);
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

  const deleteRevokedKey = async (id: string) => {
    if (!supabase) {
      addToast('Supabase não configurado neste ambiente.', 'error');
      return;
    }
    setDeletingId(id);
    try {
      // Segurança: só permite excluir se já estiver revogada
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', id)
        .not('revoked_at', 'is', null);
      if (error) throw error;
      addToast('Chave excluída.', 'success');
      await loadKeys();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir chave', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const openDeleteConfirm = (k: ApiKeyRow) => {
    if (!k.revoked_at) {
      addToast('Você só pode excluir chaves revogadas.', 'warning');
      return;
    }
    setDeleteTarget(k);
    setDeleteConfirmOpen(true);
  };

  const testMe = async () => {
    const token = apiKeyToken.trim() || createdToken?.trim() || '';
    if (!token) {
      addToast('Cole uma API key (ou crie uma nova) para testar.', 'warning');
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch(meUrl, {
        headers: { 'X-Api-Key': token },
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

  // Defaults para deixar o wizard "mágico" (usa dados locais do app; não depende da API key)
  useEffect(() => {
    if (!selectedBoardId && boardsFromContext?.length) {
      const firstWithKey = boardsFromContext.find((b) => !!b.key) || boardsFromContext[0];
      if (firstWithKey?.id) setSelectedBoardId(firstWithKey.id);
    }
  }, [boardsFromContext, selectedBoardId]);

  useEffect(() => {
    // troca de board reseta seleções dependentes
    setSelectedToStageId('');
  }, [selectedBoardId]);

  const selectedBoard = useMemo(
    () => boardsFromContext.find((b) => b.id === selectedBoardId),
    [boardsFromContext, selectedBoardId]
  );
  const selectedBoardKey = selectedBoard?.key || '';
  const stagesForBoard = useMemo(() => selectedBoard?.stages || [], [selectedBoard]);
  const selectedToStageLabel = useMemo(() => {
    if (!selectedToStageId) return '';
    const stage = stagesForBoard.find((s) => s.id === selectedToStageId);
    return stage?.label || '';
  }, [selectedToStageId, stagesForBoard]);
  const suggestedMark = useMemo<'won' | 'lost' | null>(() => {
    if (!selectedToStageId) return null;
    if (selectedBoard?.wonStageId && selectedToStageId === selectedBoard.wonStageId) return 'won';
    if (selectedBoard?.lostStageId && selectedToStageId === selectedBoard.lostStageId) return 'lost';
    return null;
  }, [selectedBoard?.wonStageId, selectedBoard?.lostStageId, selectedToStageId]);

  const curlExample = useMemo(() => {
    const token = (apiKeyToken.trim() || createdToken?.trim() || '') || 'SUA_API_KEY';
    if (action === 'create_lead') {
      const name = (leadName || 'Lead').replaceAll('"', '\\"');
      const email = (leadEmail || 'teste@exemplo.com').replaceAll('"', '\\"');
      const phone = (leadPhone || '+5511999999999').replaceAll('"', '\\"');
      const source = (leadSource || 'n8n').replaceAll('"', '\\"');
      const role = (leadRole || '').replaceAll('"', '\\"');
      const companyName = (leadCompanyName || '').replaceAll('"', '\\"');
      const notes = (leadNotes || '').replaceAll('"', '\\"');
      const roleLine = role ? `,\\n+    \\\"role\\\": \\\"${role}\\\"` : '';
      const companyLine = companyName ? `,\\n+    \\\"company_name\\\": \\\"${companyName}\\\"` : '';
      const notesLine = notes ? `,\\n+    \\\"notes\\\": \\\"${notes}\\\"` : '';
      return `curl -X POST '${contactsUrl}' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Api-Key: ${token}' \\\n+  -d '{\n+    \"name\": \"${name}\",\n+    \"email\": \"${email}\",\n+    \"phone\": \"${phone}\",\n+    \"source\": \"${source}\"${roleLine}${companyLine}${notesLine}\n+  }'`;
    }
    if (action === 'create_deal') {
      const boardKey = selectedBoardKey || 'board-key';
      return `curl -X POST '${dealsUrl}' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Api-Key: ${token}' \\\n+  -d '{\n+    \"title\": \"Deal Teste\",\n+    \"value\": 0,\n+    \"board_key\": \"${boardKey}\",\n+    \"contact\": {\n+      \"name\": \"Lead Teste\",\n+      \"email\": \"teste@exemplo.com\",\n+      \"phone\": \"+5511999999999\"\n+    }\n+  }'`;
    }
    if (action === 'move_stage') {
      const stageLabel = selectedToStageLabel || 'STAGE_LABEL';
      const boardKeyOrId = selectedBoardKey || selectedBoardId || 'board_key';
      const phone = identityPhone.trim() || '+5511999999999';
      const email = identityEmail.trim() || 'teste@exemplo.com';
      const identityField =
        identityMode === 'phone'
          ? `\"phone\": \"${phone.replaceAll('"', '\\"')}\",`
          : `\"email\": \"${email.replaceAll('"', '\\"')}\",`;
      const markField = suggestedMark ? `\n+    \"mark\": \"${suggestedMark}\",` : '';
      return `curl -X POST '/api/public/v1/deals/move-stage' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Api-Key: ${token}' \\\n+  -d '{\n+    \"board_key_or_id\": \"${boardKeyOrId}\",\n+    ${identityField}${markField}\n+    \"to_stage_label\": \"${stageLabel.replaceAll('"', '\\"')}\"\n+  }'`;
    }
    return `curl -X POST '${activitiesUrl}' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Api-Key: ${token}' \\\n+  -d '{\n+    \"type\": \"${activityType}\",\n+    \"title\": \"${activityTitle.replaceAll('"', '\\"')}\",\n+    \"description\": \"Criada via integração\",\n+    \"date\": \"${new Date().toISOString()}\"\n+  }'`;
  }, [
    action,
    activitiesUrl,
    contactsUrl,
    createdToken,
    dealsUrl,
    selectedBoardKey,
    selectedBoardId,
    apiKeyToken,
    leadName,
    leadEmail,
    leadPhone,
    leadSource,
    leadRole,
    leadCompanyName,
    leadNotes,
    identityMode,
    identityPhone,
    identityEmail,
    selectedToStageId,
    selectedToStageLabel,
    suggestedMark,
    activityTitle,
    activityType,
  ]);

  const runActionTest = async () => {
    const token = (apiKeyToken.trim() || createdToken?.trim() || '') || '';
    if (!token) {
      addToast('Cole uma API key (ou crie uma nova) para testar.', 'warning');
      return;
    }
    setActionTestLoading(true);
    setActionTestResult(null);
    try {
      if (action === 'create_lead') {
        const res = await fetch(contactsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': token },
          body: JSON.stringify({
            name: leadName || 'Lead Teste',
            email: leadEmail || `teste+${Date.now()}@exemplo.com`,
            phone: leadPhone || '+5511999999999',
            source: leadSource || 'ui-test',
            role: leadRole || undefined,
            company_name: leadCompanyName || undefined,
            notes: leadNotes || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Falha no teste');
        setActionTestResult({ ok: true, message: `OK (${json?.action || 'ok'})`, raw: json });
        return;
      }

      if (action === 'create_deal') {
        if (!selectedBoardKey) {
          addToast('Escolha um board com key (slug) para criar deal.', 'warning');
          setActionTestResult({ ok: false, message: 'Selecione um board com key.' });
          return;
        }
        const res = await fetch(dealsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': token },
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
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': token },
          body: JSON.stringify({
            type: activityType,
            title: activityTitle,
            description: 'Criada pelo teste da UI',
            date: new Date().toISOString(),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Falha no teste');
        setActionTestResult({ ok: true, message: 'OK (atividade criada)', raw: json });
        return;
      }

      if (action === 'move_stage') {
        if (!selectedToStageId) {
          addToast('Selecione a etapa de destino.', 'warning');
          setActionTestResult({ ok: false, message: 'Selecione uma etapa.' });
          return;
        }
        if (!selectedToStageLabel) {
          addToast('Etapa inválida para este board.', 'warning');
          setActionTestResult({ ok: false, message: 'Etapa inválida.' });
          return;
        }
        if (!selectedBoardKey && !selectedBoardId) {
          addToast('Selecione um board.', 'warning');
          setActionTestResult({ ok: false, message: 'Selecione um board.' });
          return;
        }
        const phone = identityPhone.trim();
        const email = identityEmail.trim().toLowerCase();
        if (identityMode === 'phone' && !phone) {
          addToast('Informe telefone (E.164).', 'warning');
          setActionTestResult({ ok: false, message: 'Informe telefone.' });
          return;
        }
        if (identityMode === 'email' && !email) {
          addToast('Informe email.', 'warning');
          setActionTestResult({ ok: false, message: 'Informe email.' });
          return;
        }
        const res = await fetch(`/api/public/v1/deals/move-stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': token },
          body: JSON.stringify({
            board_key_or_id: selectedBoardKey || selectedBoardId,
            ...(identityMode === 'phone' ? { phone } : { email }),
            ...(suggestedMark ? { mark: suggestedMark } : {}),
            to_stage_label: selectedToStageLabel,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Falha no teste');
        setActionTestResult({ ok: true, message: 'OK (deal movido)', raw: json });
        return;
      }
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

      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
            <Key className="h-4 w-4" />
            Chave da integração (independente do assistente)
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
            A chave é da sua conta. O assistente só usa ela para montar o “copiar/colar” e testar.
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
            </div>
          )}

          <div className="mt-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-black/20 p-3">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Para testar aqui (opcional): cole a API key completa
            </div>
            <div className="flex gap-2">
              <input
                value={apiKeyToken}
                onChange={(e) => setApiKeyToken(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white font-mono text-xs"
                placeholder="ncrm_… (fica só em memória, não é salvo)"
              />
              <button
                type="button"
                onClick={testMe}
                disabled={testLoading}
                className="shrink-0 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-60 text-slate-800 dark:text-white text-sm font-semibold"
              >
                {testLoading ? 'Testando…' : 'Testar chave'}
              </button>
            </div>
            {testResult && (
              <div className={`mt-2 text-xs ${testResult.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                {testResult.message}
              </div>
            )}
          </div>
        </div>

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
            <span>Você escolhe o objetivo. O sistema monta o comando final com seus dados.</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Passo 2 — Configure (dinâmico)
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
            Aqui entra o “mágico”: você escolhe e a gente já preenche o comando final.
          </div>

          {action === 'create_lead' && (
            <div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                <span className="font-semibold text-slate-700 dark:text-slate-200">*</span> Obrigatório: <span className="font-semibold text-slate-700 dark:text-slate-200">Email</span> <span className="font-semibold">ou</span>{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">Telefone</span>. <span className="font-semibold text-slate-700 dark:text-slate-200">Nome</span> é obrigatório apenas ao{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">criar</span> um contato novo.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Nome <span className="text-slate-500 dark:text-slate-400">*</span>
                </div>
                <input
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                  placeholder="Nome do lead"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Source</div>
                <input
                  value={leadSource}
                  onChange={(e) => setLeadSource(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                  placeholder="n8n / make / webhook"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Email <span className="text-slate-500 dark:text-slate-400">*</span>
                </div>
                <input
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Telefone (E.164) <span className="text-slate-500 dark:text-slate-400">*</span>
                </div>
                <input
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white font-mono"
                  placeholder="+5511999999999"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Cargo</div>
                <input
                  value={leadRole}
                  onChange={(e) => setLeadRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                  placeholder="Ex: Gerente"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Empresa</div>
                <input
                  value={leadCompanyName}
                  onChange={(e) => setLeadCompanyName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                  placeholder="Nome da Empresa"
                />
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Notas</div>
                <textarea
                  value={leadNotes}
                  onChange={(e) => setLeadNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white min-h-[92px]"
                  placeholder="Opcional"
                />
              </div>
              </div>
            </div>
          )}

          {(action === 'create_deal' || action === 'move_stage') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Pipeline (board)</div>
                <select
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                >
                  <option value="">Selecione…</option>
                  {boardsFromContext.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}{b.key ? ` — ${b.key}` : ' — (sem key)'}
                    </option>
                  ))}
                </select>
                {selectedBoardId && !selectedBoardKey && (
                  <div className="mt-1 text-xs text-rose-600 dark:text-rose-300">
                    Este board ainda não tem <span className="font-mono">key</span>. Para integrações, gere uma key para o board.
                  </div>
                )}
              </div>

              {action === 'move_stage' && (
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Identidade do lead</div>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setIdentityMode('phone')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                        identityMode === 'phone'
                          ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
                      }`}
                    >
                      Telefone
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdentityMode('email')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                        identityMode === 'email'
                          ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10'
                      }`}
                    >
                      Email
                    </button>
                  </div>

                  {identityMode === 'phone' ? (
                    <input
                      value={identityPhone}
                      onChange={(e) => setIdentityPhone(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white font-mono text-sm"
                      placeholder="+5511999999999"
                    />
                  ) : (
                    <input
                      value={identityEmail}
                      onChange={(e) => setIdentityEmail(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                      placeholder="email@exemplo.com"
                    />
                  )}
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    No board deve existir só 1 deal aberto para essa identidade.
                  </div>
                </div>
              )}

              {action === 'move_stage' && (
                <div className="md:col-span-2">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Mover para etapa</div>
                  <select
                    value={selectedToStageId}
                    onChange={(e) => setSelectedToStageId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                  >
                    <option value="">Selecione…</option>
                    {stagesForBoard.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {action === 'create_activity' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Tipo</div>
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                >
                  <option value="NOTE">Nota</option>
                  <option value="TASK">Tarefa</option>
                  <option value="CALL">Ligação</option>
                  <option value="MEETING">Reunião</option>
                  <option value="EMAIL">Email</option>
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">Título</div>
                <input
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>

      </div>

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
          Passo 3 — Copiar e testar
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

      <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/30 p-4">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
          Consulta técnica — OpenAPI
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
                    {k.revoked_at ? (
                      <button
                        type="button"
                        disabled={deletingId === k.id}
                        onClick={() => openDeleteConfirm(k)}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-60 text-rose-700 dark:text-rose-300 text-sm font-semibold inline-flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === k.id ? 'Excluindo…' : 'Excluir'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={revokingId === k.id}
                        onClick={() => revokeKey(k.id)}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-60 text-rose-700 dark:text-rose-300 text-sm font-semibold inline-flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        {revokingId === k.id ? 'Revogando…' : 'Revogar'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void deleteRevokedKey(deleteTarget.id);
        }}
        title="Excluir chave revogada?"
        message={
          <div className="space-y-2">
            <div>Essa chave será removida permanentemente.</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {deleteTarget ? (
                <>
                  <span className="font-semibold">{deleteTarget.name}</span> — <span className="font-mono">{deleteTarget.key_prefix}…</span>
                </>
              ) : null}
            </div>
          </div>
        }
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />
    </SettingsSection>
  );
};

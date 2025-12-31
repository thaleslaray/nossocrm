import React, { useMemo, useState } from 'react';
import { Webhook, ArrowRight, Copy, Check, Link as LinkIcon, Pencil, Power, Trash2, KeyRound, HelpCircle } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { Modal } from '@/components/ui/Modal';
import ConfirmModal from '@/components/ConfirmModal';
import { useBoards } from '@/context/boards/BoardsContext';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils/cn';

type InboundSourceRow = {
  id: string;
  name: string;
  entry_board_id: string;
  entry_stage_id: string;
  secret: string;
  active: boolean;
};

type OutboundEndpointRow = {
  id: string;
  name: string;
  url: string;
  secret: string;
  active: boolean;
};

type InboundEventRow = {
  id: string;
  received_at: string;
  status: string;
  external_event_id: string | null;
  error: string | null;
  created_deal_id: string | null;
};

function generateSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // base64url
  const b64 = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return b64;
}

function buildWebhookUrl(sourceId: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return `${base}/functions/v1/webhook-in/${sourceId}`;
}

function buildCurlExample(url: string, secret: string) {
  return `curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Webhook-Secret: ${secret}' \\
  -H 'Authorization: Bearer ${secret}' \\
  -d '{
    "deal_title": "Contrato Anual - Acme",
    "deal_value": 12000,
    "company_name": "Empresa Ltd",
    "contact_name": "Nome do Contato",
    "email": "email@exemplo.com",
    "phone": "+5511999999999",
    "source": "webhook"
  }'`;
}

/**
 * Componente React `WebhooksSection`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const WebhooksSection: React.FC = () => {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const { boards, loading: boardsLoading } = useBoards();

  const [sources, setSources] = useState<InboundSourceRow[]>([]);
  const [endpoint, setEndpoint] = useState<OutboundEndpointRow | null>(null);
  const [loading, setLoading] = useState(false);

  const defaultBoard = useMemo(() => boards.find(b => b.isDefault) || boards[0] || null, [boards]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const selectedBoard = useMemo(
    () => boards.find(b => b.id === selectedBoardId) || defaultBoard,
    [boards, selectedBoardId, defaultBoard]
  );
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const stages = selectedBoard?.stages || [];

  // Follow-up modal
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [followUpUrl, setFollowUpUrl] = useState('');

  // Quick start (produto) — inbound/outbound
  const [isQuickStartOpen, setIsQuickStartOpen] = useState(false);
  const [quickStartTab, setQuickStartTab] = useState<'inbound' | 'outbound'>('inbound');
  const [inboundStep, setInboundStep] = useState<1 | 2 | 3>(1);
  const [inboundProvider, setInboundProvider] = useState<'hotmart' | 'n8n' | 'make'>('n8n');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [inboundEvents, setInboundEvents] = useState<InboundEventRow[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; raw?: any } | null>(null);

  // Confirm modals
  const [confirmDeleteInboundOpen, setConfirmDeleteInboundOpen] = useState(false);
  const [confirmDeleteOutboundOpen, setConfirmDeleteOutboundOpen] = useState(false);

  const canUse = profile?.role === 'admin' && !!profile?.organization_id;

  const activeInbound = useMemo(() => sources.find((s) => s.active) || sources[0] || null, [sources]);
  const hasInbound = !!activeInbound && !!activeInbound.active;

  const inboundBoardName = useMemo(() => {
    if (!activeInbound) return null;
    const b = boards.find((x) => x.id === activeInbound.entry_board_id);
    return b?.name || null;
  }, [activeInbound, boards]);

  const inboundStageLabel = useMemo(() => {
    if (!activeInbound) return null;
    const b = boards.find((x) => x.id === activeInbound.entry_board_id);
    const s = b?.stages?.find((x) => x.id === activeInbound.entry_stage_id);
    return s?.label || null;
  }, [activeInbound, boards]);

  async function loadWebhooks() {
    if (!canUse) return;
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: srcData } = await supabase
        .from('integration_inbound_sources')
        .select('id,name,entry_board_id,entry_stage_id,secret,active')
        .order('created_at', { ascending: false });
      setSources((srcData as any) || []);

      const { data: epData } = await supabase
        .from('integration_outbound_endpoints')
        .select('id,name,url,secret,active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setEndpoint((epData as any) || null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!canUse) return;
    if (!supabase) return;

    loadWebhooks();
  }, [canUse]);

  React.useEffect(() => {
    if (!selectedBoardId && defaultBoard?.id) setSelectedBoardId(defaultBoard.id);
  }, [defaultBoard?.id, selectedBoardId]);

  React.useEffect(() => {
    if (!selectedStageId && stages.length > 0) {
      // Heurística: preferir um estágio com label "Novo" se existir, senão o primeiro
      const preferred =
        stages.find(s => (s.label || '').toLowerCase().includes('novo')) || stages[0];
      setSelectedStageId(preferred.id);
    }
  }, [stages, selectedStageId]);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1200);
  }

  async function loadInboundEvents(sourceId: string) {
    if (!canUse) return;
    if (!supabase) return;
    if (!profile?.organization_id) return;
    const { data } = await supabase
      .from('webhook_events_in')
      .select('id,received_at,status,external_event_id,error,created_deal_id')
      .eq('organization_id', profile.organization_id)
      .eq('source_id', sourceId)
      .order('received_at', { ascending: false })
      .limit(3);
    setInboundEvents((data as any) || []);
  }

  async function createInboundSource() {
    if (!canUse) return;
    if (!selectedBoard?.id || !selectedStageId) return;

    const secret = generateSecret();
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_inbound_sources')
        .insert({
          organization_id: profile!.organization_id,
          name: 'Entrada de Leads',
          entry_board_id: selectedBoard.id,
          entry_stage_id: selectedStageId,
          secret,
          active: true,
        })
        .select('id')
        .single();

      if (error) throw error;

      const sourceId = (data as any)?.id as string;
      setSources((prev) => [
        { id: sourceId, name: 'Entrada de Leads', entry_board_id: selectedBoard.id, entry_stage_id: selectedStageId, secret, active: true },
        ...prev,
      ]);
      setInboundStep(2);
      await loadInboundEvents(sourceId);
      addToast('Pronto: URL e Secret gerados.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao ativar entrada de leads', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function saveInboundDestination() {
    if (!canUse) return;
    if (!activeInbound?.id) return;
    if (!selectedBoard?.id || !selectedStageId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('integration_inbound_sources')
        .update({
          entry_board_id: selectedBoard.id,
          entry_stage_id: selectedStageId,
        })
        .eq('id', activeInbound.id);
      if (error) throw error;
      addToast('Destino atualizado.', 'success');
      await loadWebhooks();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao atualizar destino', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function runInboundTest() {
    if (!activeInbound) return;
    const url = buildWebhookUrl(activeInbound.id);
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          'X-Webhook-Secret': activeInbound.secret,
          Authorization: `Bearer ${activeInbound.secret}`,
          },
          body: JSON.stringify({
          external_event_id: `ui-test-${Date.now()}`,
          contact_name: 'Lead Teste',
            email: `teste+${Date.now()}@exemplo.com`,
          phone: '+5511999999999',
          source: 'webhook-ui',
          deal_title: 'Teste de Webhook',
          deal_value: 0,
          company_name: 'Empresa Teste',
          }),
        });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResult({ ok: false, message: json?.error || 'Falha no teste', raw: json });
        addToast(json?.error || 'Falha no teste do webhook', 'error');
      } else {
        setTestResult({ ok: true, message: json?.message || 'Recebido!', raw: json });
        addToast('Teste recebido com sucesso.', 'success');
      }
      await loadInboundEvents(activeInbound.id);
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || 'Erro no teste' });
      addToast(e?.message || 'Erro no teste do webhook', 'error');
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSaveFollowUp() {
    if (!canUse) return;
    if (!followUpUrl.trim()) return;

    setLoading(true);
    try {
      if (endpoint?.id) {
        const { data, error } = await supabase
          .from('integration_outbound_endpoints')
          .update({
            url: followUpUrl.trim(),
          })
          .eq('id', endpoint.id)
          .select('id,name,url,secret,active')
          .single();
        if (error) throw error;
        setEndpoint(data as any);
        addToast('Follow-up atualizado!', 'success');
      } else {
        const secret = generateSecret();
        const { data, error } = await supabase
          .from('integration_outbound_endpoints')
          .insert({
            organization_id: profile!.organization_id,
            name: 'Follow-up (Webhook)',
            url: followUpUrl.trim(),
            secret,
            events: ['deal.stage_changed'],
            active: true,
          })
          .select('id,name,url,secret,active')
          .single();

        if (error) throw error;
        setEndpoint(data as any);
        addToast('Follow-up conectado!', 'success');
      }
      setIsFollowUpOpen(false);
      setFollowUpUrl('');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar follow-up', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openQuickStart(tab: 'inbound' | 'outbound') {
    setQuickStartTab(tab);
    setInboundStep(1);
    setTestResult(null);
    setCopiedKey(null);
    setInboundProvider('n8n');
    if (tab === 'inbound' && activeInbound) {
    setSelectedBoardId(activeInbound.entry_board_id);
    setSelectedStageId(activeInbound.entry_stage_id);
      loadInboundEvents(activeInbound.id);
    }
    setIsQuickStartOpen(true);
  }

  async function handleToggleInboundActive(nextActive: boolean) {
    if (!canUse) return;
    if (!activeInbound) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('integration_inbound_sources')
        .update({ active: nextActive })
        .eq('id', activeInbound.id);
      if (error) throw error;
      addToast(nextActive ? 'Entrada de leads ativada!' : 'Entrada de leads desativada.', 'success');
      await loadWebhooks();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao atualizar status do webhook', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteInbound() {
    if (!canUse) return;
    if (!activeInbound) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('integration_inbound_sources')
        .delete()
        .eq('id', activeInbound.id);
      if (error) throw error;
      addToast('Configuração de entrada removida.', 'success');
      await loadWebhooks();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir webhook', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleOutboundActive(nextActive: boolean) {
    if (!canUse) return;
    if (!endpoint?.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('integration_outbound_endpoints')
        .update({ active: nextActive })
        .eq('id', endpoint.id);
      if (error) throw error;
      addToast(nextActive ? 'Follow-up ativado!' : 'Follow-up desativado.', 'success');
      await loadWebhooks();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao atualizar follow-up', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateOutboundSecret() {
    if (!canUse) return;
    if (!endpoint?.id) return;
    const nextSecret = generateSecret();
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_outbound_endpoints')
        .update({ secret: nextSecret })
        .eq('id', endpoint.id)
        .select('id,name,url,secret,active')
        .single();
      if (error) throw error;
      setEndpoint(data as any);
      addToast('Secret do follow-up regenerado. Atualize no seu n8n/Make/WhatsApp.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao regenerar secret', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteOutbound() {
    if (!canUse) return;
    if (!endpoint?.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('integration_outbound_endpoints')
        .delete()
        .eq('id', endpoint.id);
      if (error) throw error;
      setEndpoint(null);
      addToast('Follow-up removido.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao excluir follow-up', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsSection title="Webhooks" icon={Webhook}>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
        Ative automações sem técnico: escolha onde os leads entram e (opcionalmente) conecte um endpoint
        para follow-up quando um lead mudar de etapa.
      </p>

      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Dica: se você está integrando com Hotmart/n8n/Make, use o guia rápido.
        </div>
        <button
          onClick={() => openQuickStart('inbound')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
        >
          <HelpCircle className="h-4 w-4" />
          Como usar
        </button>
      </div>

      {!canUse ? (
        <div className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-600 dark:text-slate-300">
          Disponível apenas para administradores.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Entrada */}
          <div className="p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Entrada de Leads (Webhook)</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Receba leads de Hotmart, formulários, n8n/Make e crie automaticamente um negócio no funil.
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${hasInbound ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>
                {hasInbound ? 'Ativo' : 'Desativado'}
              </span>
            </div>

            {activeInbound ? (
              <div className="mt-4 flex flex-col gap-2">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Fonte: <span className="font-medium text-slate-700 dark:text-slate-200">{activeInbound.name}</span>
                  {inboundBoardName && inboundStageLabel ? (
                    <>
                      {' '}· <span className="text-slate-600 dark:text-slate-300">{inboundBoardName}</span>
                      {' '}→ <span className="text-slate-600 dark:text-slate-300">{inboundStageLabel}</span>
                    </>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => copy(buildWebhookUrl(activeInbound.id), 'url')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar URL
                    {copiedKey === 'url' && <Check className="h-4 w-4 text-green-600" />}
                  </button>
                  <button
                    onClick={() => copy(activeInbound.secret, 'inboundSecret')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <KeyRound className="h-4 w-4" />
                    Copiar secret
                    {copiedKey === 'inboundSecret' && <Check className="h-4 w-4 text-green-600" />}
                  </button>
                  <button
                    onClick={() => openQuickStart('inbound')}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
                  >
                    <Pencil className="h-4 w-4" />
                    Ajustar / Testar
                  </button>
                  <button
                    onClick={() => handleToggleInboundActive(!activeInbound.active)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
                  >
                    <Power className="h-4 w-4" />
                    {activeInbound.active ? 'Desativar' : 'Ativar'}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => copy(buildCurlExample(buildWebhookUrl(activeInbound.id), activeInbound.secret), 'inboundCurl')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar cURL (importar no n8n)
                    {copiedKey === 'inboundCurl' && <Check className="h-4 w-4 text-green-600" />}
                  </button>

                  <button
                    onClick={() => setConfirmDeleteInboundOpen(true)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-white/5 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  onClick={() => openQuickStart('inbound')}
                  disabled={loading || boardsLoading || boards.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  Ativar entrada de leads
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Saída */}
          <div className="p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Follow-up (Webhook de saída)</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Quando um lead mudar de etapa, enviamos um aviso para seu WhatsApp/n8n/Make.
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${endpoint?.active ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>
                {endpoint?.active ? 'Ativo' : 'Desativado'}
              </span>
            </div>

            {endpoint ? (
              <div className="mt-4 flex flex-col gap-2">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  <span className="font-mono truncate max-w-[520px]">{endpoint.url}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => copy(endpoint.url, 'outboundUrl')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar URL
                    {copiedKey === 'outboundUrl' && <Check className="h-4 w-4 text-green-600" />}
                  </button>
                  <button
                    onClick={() => copy(endpoint.secret, 'outboundSecret')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <KeyRound className="h-4 w-4" />
                    Copiar secret
                    {copiedKey === 'outboundSecret' && <Check className="h-4 w-4 text-green-600" />}
                  </button>
                  <button
                    onClick={() => { setFollowUpUrl(endpoint.url); setIsFollowUpOpen(true); }}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggleOutboundActive(!endpoint.active)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
                  >
                    <Power className="h-4 w-4" />
                    {endpoint.active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={handleRegenerateOutboundSecret}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
                  >
                    <KeyRound className="h-4 w-4" />
                    Regenerar secret
                  </button>
                  <button
                    onClick={() => setConfirmDeleteOutboundOpen(true)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-white/5 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  onClick={() => setIsFollowUpOpen(true)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                >
                  Conectar follow-up (opcional)
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Start (produto) */}
      <Modal
        isOpen={isQuickStartOpen}
        onClose={() => setIsQuickStartOpen(false)}
        title="Webhooks (guia rápido)"
        size="xl"
        bodyClassName="max-h-[70vh] overflow-auto"
      >
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Conecte em <b>minutos</b>: gere URL/Secret, configure no seu provedor e faça um teste.
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Você pode usar <code className="font-mono">X-Webhook-Secret</code> <span className="mx-1">ou</span>{' '}
                <code className="font-mono">Authorization: Bearer</code>.
              </div>
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/10 p-1 border border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setQuickStartTab('inbound')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-bold transition-colors',
                  quickStartTab === 'inbound'
                    ? 'bg-white dark:bg-black/20 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10'
                )}
              >
                Receber leads
              </button>
              <button
                type="button"
                onClick={() => setQuickStartTab('outbound')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-bold transition-colors',
                  quickStartTab === 'outbound'
                    ? 'bg-white dark:bg-black/20 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10'
                )}
              >
                Follow-up
              </button>
            </div>
          </div>

          {quickStartTab === 'outbound' ? (
        <div className="space-y-4">
              <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                <b>Follow-up</b> envia um aviso quando um lead muda de etapa. Você cola uma URL (n8n/Make/WhatsApp) e
                valida o Secret no seu lado.
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    {endpoint?.url ? (
                      <>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400">URL atual</div>
                        <div className="mt-1 font-mono text-xs break-all">{endpoint.url}</div>
                      </>
                    ) : (
                      <>Nenhum follow-up conectado ainda.</>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsQuickStartOpen(false);
                      if (endpoint?.url) setFollowUpUrl(endpoint.url);
                      setIsFollowUpOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                  >
                    Configurar
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Dica: para testar, mova um deal de etapa — o aviso dispara somente na mudança.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stepper */}
              <div className="flex items-center gap-2">
                {[
                  { n: 1 as const, label: 'Destino' },
                  { n: 2 as const, label: 'Conexão' },
                  { n: 3 as const, label: 'Teste' },
                ].map((s, idx) => (
                  <button
                    key={s.n}
                    type="button"
                    onClick={() => setInboundStep(s.n)}
                    className={cn(
                      'group flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-colors',
                      inboundStep === s.n
                        ? 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white'
                        : 'bg-transparent border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
                    )}
                  >
                    <span
                      className={cn(
                        'h-6 w-6 rounded-full inline-flex items-center justify-center text-xs border',
                        inboundStep === s.n
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 group-hover:bg-white dark:group-hover:bg-black/20'
                      )}
                    >
                      {s.n}
                    </span>
                    <span>{s.label}</span>
                    {idx < 2 ? <span className="text-slate-300 dark:text-white/10">/</span> : null}
                  </button>
                ))}
          </div>

              {/* Step 1: Destino */}
              {inboundStep === 1 ? (
                <div className="space-y-4">
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    Escolha <b>qual funil</b> e <b>qual etapa</b> o lead vai cair.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Funil</label>
            <select
              value={selectedBoard?.id || ''}
              onChange={(e) => {
                setSelectedBoardId(e.target.value);
                setSelectedStageId('');
              }}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
                        disabled={boardsLoading || boards.length === 0}
            >
                        {boards.map((b) => (
                <option key={b.id} value={b.id}>
                            {b.name}
                            {b.isDefault ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Etapa</label>
            <select
              value={selectedStageId}
              onChange={(e) => setSelectedStageId(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              disabled={!selectedBoard || stages.length === 0}
            >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
              ))}
            </select>
                    </div>
          </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {activeInbound ? (
                        <>
                          Atual: <b>{inboundBoardName}</b> → <b>{inboundStageLabel}</b>
                        </>
                      ) : (
                        <>Você vai gerar uma URL única e um Secret (senha) para esse destino.</>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {activeInbound ? (
            <button
                          type="button"
                          onClick={saveInboundDestination}
                          disabled={loading || !selectedBoard?.id || !selectedStageId}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
            >
                          <Pencil className="h-4 w-4" />
                          Salvar destino
            </button>
                      ) : (
            <button
                          type="button"
                          onClick={() => setInboundStep(2)}
                          disabled={!selectedBoard?.id || !selectedStageId}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
                          Continuar
              <ArrowRight className="h-4 w-4" />
            </button>
                      )}
          </div>
        </div>
                </div>
              ) : null}

              {/* Step 2: Conexão */}
              {inboundStep === 2 ? (
        <div className="space-y-4">
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    Copie a <b>URL</b> e o <b>Secret</b> e cole no seu provedor (Hotmart / n8n / Make).
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
                    {activeInbound ? (
                      <>
          <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">URL do webhook</div>
              <button
                              type="button"
                              onClick={() => copy(buildWebhookUrl(activeInbound.id), 'qsUrl')}
                              className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                              {copiedKey === 'qsUrl' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                              Copiar
              </button>
            </div>
                          <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                            {buildWebhookUrl(activeInbound.id)}
                          </div>
          </div>

          <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Secret (senha)</div>
              <button
                              type="button"
                              onClick={() => copy(activeInbound.secret, 'qsSecret')}
                              className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                              {copiedKey === 'qsSecret' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                              Copiar
              </button>
            </div>
                          <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                            {activeInbound.secret}
                          </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
                            Envie no header <code className="font-mono">X-Webhook-Secret</code> (ou{' '}
                            <code className="font-mono">Authorization: Bearer</code>).
            </div>
          </div>

                        <details className="rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 p-3">
                          <summary className="cursor-pointer text-sm font-bold text-slate-900 dark:text-white">
                            Exemplo pronto (cURL)
                          </summary>
                          <div className="mt-3 relative">
              <pre className="whitespace-pre-wrap text-xs p-3 rounded-lg bg-slate-900 text-slate-100 border border-slate-800">
                              {buildCurlExample(buildWebhookUrl(activeInbound.id), activeInbound.secret)}
              </pre>
              <button
                              type="button"
                              onClick={() => copy(buildCurlExample(buildWebhookUrl(activeInbound.id), activeInbound.secret), 'qsCurl')}
                className="absolute top-2 right-2 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-100 inline-flex items-center gap-1"
              >
                              {copiedKey === 'qsCurl' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copiar
              </button>
            </div>
                        </details>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-700 dark:text-slate-200">
                          Gere sua URL e Secret para começar.
                        </div>
                        <button
                          type="button"
                          onClick={createInboundSource}
                          disabled={loading || !selectedBoard?.id || !selectedStageId}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                          Gerar URL e Secret
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
          </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Seu provedor</div>
                      <div className="inline-flex rounded-xl bg-white dark:bg-white/10 p-1 border border-slate-200 dark:border-white/10">
                        {(
                          [
                            { key: 'hotmart' as const, label: 'Hotmart' },
                            { key: 'n8n' as const, label: 'n8n' },
                            { key: 'make' as const, label: 'Make' },
                          ] as const
                        ).map((p) => (
            <button
                            key={p.key}
                            type="button"
                            onClick={() => setInboundProvider(p.key)}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-sm font-bold transition-colors',
                              inboundProvider === p.key
                                ? 'bg-white dark:bg-black/20 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10'
                            )}
                          >
                            {p.label}
            </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {inboundProvider === 'hotmart' ? (
                        <>
                          Cole a <b>URL</b> no webhook do produto e envie o Secret no header{' '}
                          <code className="font-mono">X-Webhook-Secret</code>. No body, envie JSON com pelo menos{' '}
                          <b>email</b> ou <b>phone</b>.
                        </>
                      ) : inboundProvider === 'make' ? (
                        <>
                          Use um módulo <b>HTTP</b> com <b>POST</b> e <b>JSON</b>. Headers: <code className="font-mono">X-Webhook-Secret</code>{' '}
                          (ou <code className="font-mono">Authorization: Bearer</code>). Body: email ou phone.
                        </>
                      ) : (
                        <>
                          Use <b>HTTP Request</b> (POST) com <b>JSON</b>. Headers: <code className="font-mono">X-Webhook-Secret</code>{' '}
                          (ou <code className="font-mono">Authorization: Bearer</code>). Body: email ou phone.
                        </>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Quer deixar “bonito”? Envie também <code className="font-mono">contact_name</code>,{' '}
                      <code className="font-mono">company_name</code> e <code className="font-mono">deal_title</code>.
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
            <button
                      type="button"
                      onClick={() => setInboundStep(1)}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={() => setInboundStep(3)}
                      disabled={!activeInbound}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
                      Fazer teste
                      <ArrowRight className="h-4 w-4" />
            </button>
          </div>
                </div>
              ) : null}

              {/* Step 3: Teste */}
              {inboundStep === 3 ? (
                <div className="space-y-4">
                  <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    Envie um evento de teste para confirmar que está tudo certo. Isso cria/atualiza um lead de teste no
                    funil.
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-slate-900 dark:text-white">Teste agora</div>
                        <button
                          type="button"
                          onClick={runInboundTest}
                          disabled={!activeInbound || testLoading}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                          {testLoading ? 'Enviando...' : 'Enviar teste'}
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>

                      {testResult ? (
                        <div
                          className={cn(
                            'p-3 rounded-xl border text-sm',
                            testResult.ok
                              ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30 text-green-800 dark:text-green-200'
                              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-800 dark:text-red-200'
                          )}
                        >
                          <div className="font-bold">{testResult.ok ? 'Recebido ✓' : 'Falhou'}</div>
                          <div className="mt-1">{testResult.message}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Dica: se o seu provedor estiver configurado, você também pode mandar um lead real e ver os
                          eventos aqui.
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">Últimos recebidos</div>
                      {activeInbound ? (
                        inboundEvents.length > 0 ? (
                          <div className="space-y-2">
                            {inboundEvents.map((ev) => (
                              <div
                                key={ev.id}
                                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                                    {new Date(ev.received_at).toLocaleString()}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {ev.external_event_id ? `event_id: ${ev.external_event_id}` : 'event_id: —'}
                                  </div>
                                </div>
                                <div className="text-xs font-bold">
                                  {String(ev.status || '').toLowerCase().includes('processed') ? (
                                    <span className="text-green-700 dark:text-green-300">OK</span>
                                  ) : String(ev.status || '').toLowerCase().includes('received') ? (
                                    <span className="text-slate-600 dark:text-slate-300">Recebido</span>
                                  ) : (
                                    <span className="text-red-700 dark:text-red-300">Erro</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-600 dark:text-slate-300">
                            Ainda não recebemos nada. Envie um teste.
                          </div>
                        )
                      ) : (
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                          Gere a URL/Secret antes de testar.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setInboundStep(2)}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsQuickStartOpen(false)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                    >
                      Concluir
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Modal>

      {/* Follow-up modal */}
      <Modal
        isOpen={isFollowUpOpen}
        onClose={() => setIsFollowUpOpen(false)}
        title={endpoint?.id ? 'Editar follow-up' : 'Conectar follow-up'}
        size="sm"
      >
        <div className="space-y-4">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Cole a URL do seu WhatsApp/n8n/Make. Quando um lead mudar de etapa, enviaremos um aviso.
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">URL do destino</label>
            <input
              value={followUpUrl}
              onChange={(e) => setFollowUpUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setIsFollowUpOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Agora não
            </button>
            <button
              onClick={handleSaveFollowUp}
              disabled={loading || !followUpUrl.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {endpoint?.id ? 'Salvar' : 'Conectar'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmDeleteInboundOpen}
        onClose={() => setConfirmDeleteInboundOpen(false)}
        onConfirm={handleDeleteInbound}
        title="Excluir webhook de entrada?"
        message={
          <div>
            Isso remove apenas a <b>configuração</b> do webhook (URL/secret param de entrada). Leads já criados no CRM não serão apagados.
          </div>
        }
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />

      <ConfirmModal
        isOpen={confirmDeleteOutboundOpen}
        onClose={() => setConfirmDeleteOutboundOpen(false)}
        onConfirm={handleDeleteOutbound}
        title="Excluir follow-up (webhook de saída)?"
        message={
          <div>
            Isso remove apenas a <b>configuração</b> do follow-up. O CRM não enviará mais notificações quando o lead mudar de etapa.
          </div>
        }
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />

    </SettingsSection>
  );
};

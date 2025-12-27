import React, { useMemo, useState } from 'react';
import { Webhook, ArrowRight, Copy, Check, Link as LinkIcon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { Modal } from '@/components/ui/Modal';
import { useBoards } from '@/context/boards/BoardsContext';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

type InboundSourceRow = {
  id: string;
  name: string;
  entry_board_id: string;
  entry_stage_id: string;
  active: boolean;
};

type OutboundEndpointRow = {
  id: string;
  name: string;
  url: string;
  active: boolean;
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
  -d '{
    "external_event_id": "teste-123",
    "name": "Lead Teste",
    "email": "teste@exemplo.com",
    "phone": "+55...",
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

  // Wizard (1 passo)
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const defaultBoard = useMemo(() => boards.find(b => b.isDefault) || boards[0] || null, [boards]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const selectedBoard = useMemo(
    () => boards.find(b => b.id === selectedBoardId) || defaultBoard,
    [boards, selectedBoardId, defaultBoard]
  );
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const stages = selectedBoard?.stages || [];

  const [createTestLead, setCreateTestLead] = useState(false);

  // Final screen
  const [isDoneOpen, setIsDoneOpen] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');
  const [createdSecret, setCreatedSecret] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Follow-up modal
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [followUpUrl, setFollowUpUrl] = useState('');

  const canUse = profile?.role === 'admin' && !!profile?.organization_id;

  React.useEffect(() => {
    if (!canUse) return;
    if (!supabase) return;

    (async () => {
      setLoading(true);
      try {
        const { data: srcData } = await supabase
          .from('integration_inbound_sources')
          .select('id,name,entry_board_id,entry_stage_id,active')
          .order('created_at', { ascending: false });
        setSources((srcData as any) || []);

        const { data: epData } = await supabase
          .from('integration_outbound_endpoints')
          .select('id,name,url,active')
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setEndpoint((epData as any) || null);
      } finally {
        setLoading(false);
      }
    })();
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

  async function handleActivateInbound() {
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
      const url = buildWebhookUrl(sourceId);
      setCreatedUrl(url);
      setCreatedSecret(secret);
      setIsWizardOpen(false);
      setIsDoneOpen(true);

      // refresh list
      setSources((prev) => [{ id: sourceId, name: 'Entrada de Leads', entry_board_id: selectedBoard.id, entry_stage_id: selectedStageId, active: true }, ...prev]);

      if (createTestLead) {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': secret,
          },
          body: JSON.stringify({
            external_event_id: `teste-${Date.now()}`,
            name: 'Lead Teste',
            email: `teste+${Date.now()}@exemplo.com`,
            phone: '+55...',
            source: 'webhook',
          }),
        });
        addToast('Lead de teste enviado! Verifique o funil.', 'success');
      } else {
        addToast('Entrada de leads ativada!', 'success');
      }
    } catch (e: any) {
      addToast(e?.message || 'Erro ao ativar entrada de leads', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectFollowUp() {
    if (!canUse) return;
    if (!followUpUrl.trim()) return;

    const secret = generateSecret();
    setLoading(true);
    try {
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
        .select('id,name,url,active')
        .single();

      if (error) throw error;
      setEndpoint(data as any);
      setIsFollowUpOpen(false);
      setFollowUpUrl('');
      addToast('Follow-up conectado!', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao conectar follow-up', 'error');
    } finally {
      setLoading(false);
    }
  }

  const hasInbound = sources.length > 0;

  return (
    <SettingsSection title="Webhooks" icon={Webhook}>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
        Ative automações sem técnico: escolha onde os leads entram e (opcionalmente) conecte um endpoint
        para follow-up quando um lead mudar de etapa.
      </p>

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

            {hasInbound && sources[0] ? (
              <div className="mt-4 flex flex-col gap-2">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Fonte: <span className="font-medium text-slate-700 dark:text-slate-200">{sources[0].name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => copy(buildWebhookUrl(sources[0].id), 'url')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar URL
                    {copiedKey === 'url' && <Check className="h-4 w-4 text-green-600" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  onClick={() => setIsWizardOpen(true)}
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

            {endpoint?.active ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  <span className="font-mono truncate max-w-[520px]">{endpoint.url}</span>
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

      {/* Wizard modal (1 passo) */}
      <Modal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        title="Ativar entrada de leads"
        size="sm"
      >
        <div className="space-y-4">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Onde você quer que novos leads entrem no CRM?
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Board (funil)</label>
            <select
              value={selectedBoard?.id || ''}
              onChange={(e) => {
                setSelectedBoardId(e.target.value);
                setSelectedStageId('');
              }}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
            >
              {boards.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.isDefault ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Estágio de entrada</label>
            <select
              value={selectedStageId}
              onChange={(e) => setSelectedStageId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
              disabled={!selectedBoard || stages.length === 0}
            >
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={createTestLead}
              onChange={(e) => setCreateTestLead(e.target.checked)}
            />
            Criar um lead de teste ao finalizar
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setIsWizardOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleActivateInbound}
              disabled={loading || !selectedBoard?.id || !selectedStageId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Ativar agora
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Modal>

      {/* Done modal */}
      <Modal
        isOpen={isDoneOpen}
        onClose={() => setIsDoneOpen(false)}
        title="Pronto! Sua entrada de leads está ativa"
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">URL do webhook</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                {createdUrl}
              </div>
              <button
                onClick={() => copy(createdUrl, 'createdUrl')}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10"
                aria-label="Copiar URL"
              >
                {copiedKey === 'createdUrl' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Secret</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                {createdSecret}
              </div>
              <button
                onClick={() => copy(createdSecret, 'createdSecret')}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10"
                aria-label="Copiar secret"
              >
                {copiedKey === 'createdSecret' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Dica: copie e cole este secret no seu Hotmart/n8n/Make. Ele funciona como senha do webhook.
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Exemplo (cURL)</div>
            <div className="relative">
              <pre className="whitespace-pre-wrap text-xs p-3 rounded-lg bg-slate-900 text-slate-100 border border-slate-800">
                {buildCurlExample(createdUrl, createdSecret)}
              </pre>
              <button
                onClick={() => copy(buildCurlExample(createdUrl, createdSecret), 'curl')}
                className="absolute top-2 right-2 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-100 inline-flex items-center gap-1"
              >
                {copiedKey === 'curl' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copiar
              </button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              onClick={() => { setIsDoneOpen(false); setIsFollowUpOpen(true); }}
              className="text-sm font-bold text-primary-600 dark:text-primary-400 hover:underline"
            >
              Conectar follow-up agora (opcional)
            </button>
            <button
              onClick={() => setIsDoneOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </Modal>

      {/* Follow-up modal */}
      <Modal
        isOpen={isFollowUpOpen}
        onClose={() => setIsFollowUpOpen(false)}
        title="Conectar follow-up"
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
              onClick={handleConnectFollowUp}
              disabled={loading || !followUpUrl.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Conectar
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Modal>
    </SettingsSection>
  );
};

'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Power,
  Trash2,
  Settings2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff,
  QrCode,
  MessageCircle,
  Instagram,
  Mail,
  Smartphone,
  Phone,
  Send,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Zap,
  ArrowRight,
  Building2,
} from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog as ConfirmModal } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils/cn';
import {
  useChannelsQuery,
  useDeleteChannelMutation,
  useToggleChannelStatusMutation,
} from '@/lib/query/hooks/useChannelsQuery';
import { useInstanceFlagsQuery } from '@/lib/query/hooks/useInstanceFlagsQuery';
import {
  type MessagingChannel,
  type ChannelType,
  type ChannelStatus,
  CHANNEL_STATUS_LABELS,
  CHANNEL_TYPE_INFO,
} from '@/lib/messaging/types';
import { ChannelSetupWizard } from './ChannelSetupWizard';
import {
  useLeadRoutingRules,
  useBoardsWithStages,
  useCreateLeadRoutingRule,
  useUpdateLeadRoutingRule,
  useDeleteLeadRoutingRule,
} from '@/lib/query/hooks/useLeadRoutingRulesQuery';
import type { LeadRoutingRuleView } from '@/lib/messaging/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const CHANNEL_ICONS: Record<ChannelType, React.FC<{ className?: string }>> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  email: Mail,
  sms: Smartphone,
  telegram: Send,
  voice: Phone,
};

const STATUS_ICONS: Record<ChannelStatus, React.FC<{ className?: string }>> = {
  pending: Clock,
  connecting: RefreshCw,
  connected: CheckCircle,
  disconnected: WifiOff,
  error: AlertCircle,
  waiting_qr: QrCode,
};

const STATUS_COLORS: Record<ChannelStatus, string> = {
  pending: 'text-slate-500 bg-slate-100 dark:bg-slate-500/10',
  connecting: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-500/10',
  connected: 'text-green-600 bg-green-100 dark:bg-green-500/10',
  disconnected: 'text-slate-400 bg-slate-100 dark:bg-slate-500/10',
  error: 'text-red-600 bg-red-100 dark:bg-red-500/10',
  waiting_qr: 'text-blue-600 bg-blue-100 dark:bg-blue-500/10',
};

// =============================================================================
// WEBHOOK INFO (Meta Cloud)
// =============================================================================

/**
 * Extract the project ref (subdomain) from the Supabase URL.
 * Format: https://<project-ref>.supabase.co
 */
function getSupabaseProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  try {
    const hostname = new URL(url).hostname; // e.g. "abcdef.supabase.co"
    return hostname.split('.')[0];
  } catch {
    return '';
  }
}

const WEBHOOK_FUNCTION_MAP: Record<string, string> = {
  'z-api': 'messaging-webhook-zapi',
  'meta-cloud': 'messaging-webhook-meta',
  'meta': 'messaging-webhook-meta',
  'resend': 'messaging-webhook-resend',
};

interface WebhookField {
  label: string;
  description: string;
  required?: boolean;
}

const WEBHOOK_CONFIGS: Record<string, {
  title: string;
  where: string;
  docsUrl?: string;
  fields: WebhookField[];
  toggles?: string[];
}> = {
  'z-api': {
    title: 'Configurar Webhooks no Z-API',
    where: 'Acesse developer.z-api.io → Sua instância → aba "Webhooks e configurações gerais"',
    docsUrl: 'https://developer.z-api.io/webhooks/introduction',
    fields: [
      { label: 'Ao receber (Receive)', description: 'Recebe mensagens dos leads no CRM — obrigatório pra funcionar', required: true },
      { label: 'Receber status da mensagem (Status)', description: 'Rastreia entregue (✓✓), lido (✓✓ azul), respondido', required: true },
      { label: 'Ao enviar (Delivery)', description: 'Confirma que a mensagem enviada pelo CRM foi entregue ao WhatsApp' },
      { label: 'Ao conectar', description: 'Avisa quando o WhatsApp reconecta' },
      { label: 'Ao desconectar (Disconnected)', description: 'Avisa se o WhatsApp cair ou perder conexão' },
      { label: 'Presença do chat', description: 'Mostra "online" e "digitando..." na tela de mensagens' },
    ],
    toggles: [
      'Ative "Notificar as enviadas por mim também" — senão mensagens enviadas pelo celular não aparecem no CRM',
      'Cole a mesma URL em todos os campos (exceto Presença do chat). O sistema identifica o tipo de evento automaticamente.',
    ],
  },
  'meta-cloud': {
    title: 'Configurar Webhook no Meta for Developers',
    where: 'Acesse developers.facebook.com → Seu App → WhatsApp → Configuração → Webhook',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/set-up',
    fields: [
      { label: 'Callback URL', description: 'Cole a URL abaixo no campo de webhook', required: true },
    ],
    toggles: ['Inscreva-se nos campos: messages, message_deliveries, message_reads'],
  },
  'meta': {
    title: 'Configurar Webhook no Meta for Developers',
    where: 'Acesse developers.facebook.com → Seu App → Messenger → Configurações → Webhooks',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform/webhooks',
    fields: [
      { label: 'Callback URL', description: 'Cole a URL abaixo', required: true },
    ],
    toggles: ['Inscreva-se no campo: messages'],
  },
  'resend': {
    title: 'Configurar Webhook no Resend',
    where: 'Acesse resend.com → Dashboard → Webhooks → Add Webhook',
    docsUrl: 'https://resend.com/docs/dashboard/webhooks/introduction',
    fields: [
      { label: 'Endpoint URL', description: 'Cole a URL abaixo', required: true },
    ],
    toggles: ['Selecione os eventos: email.sent, email.delivered, email.opened, email.bounced'],
  },
};

function WebhookInfo({ channelId, provider, verifyToken }: { channelId: string; provider: string; verifyToken?: string }) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const projectRef = getSupabaseProjectRef();
  const fn = WEBHOOK_FUNCTION_MAP[provider] || 'messaging-webhook-zapi';
  const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/${fn}/${channelId}`;
  const config = WEBHOOK_CONFIGS[provider];

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast(`${label} copiado!`, 'success');
    } catch {
      addToast('Erro ao copiar', 'error');
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-blue-100/50 dark:hover:bg-blue-500/5 transition-colors"
      >
        <h5 className="text-xs font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" />
          {config?.title || 'Configurar Webhook'}
        </h5>
        <ChevronDown className={cn('w-4 h-4 text-blue-500 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Where to go */}
          {config?.where && (
            <p className="text-[11px] text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/20 rounded px-2 py-1.5">
              {config.where}
            </p>
          )}

          {/* Webhook URL — the thing to copy */}
          <div>
            <label className="text-[10px] font-bold text-blue-600 dark:text-blue-300 uppercase tracking-wider">
              URL do Webhook (cole nos campos abaixo)
            </label>
            <div className="flex items-center gap-1 mt-1">
              <code className="flex-1 text-[11px] bg-white dark:bg-black/30 border border-blue-200 dark:border-blue-500/20 px-2.5 py-2 rounded-lg text-blue-900 dark:text-blue-100 break-all select-all font-mono">
                {webhookUrl}
              </code>
              <button
                onClick={() => copyToClipboard(webhookUrl, 'URL')}
                className="shrink-0 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                title="Copiar URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Verify Token (Meta only) */}
          {verifyToken && (
            <div>
              <label className="text-[10px] font-bold text-green-600 dark:text-green-300 uppercase tracking-wider">
                Verify Token
              </label>
              <div className="flex items-center gap-1 mt-1">
                <code className="flex-1 text-[11px] bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/20 px-2.5 py-2 rounded-lg text-green-900 dark:text-green-100 font-mono">
                  {verifyToken}
                </code>
                <button
                  onClick={() => copyToClipboard(verifyToken, 'Token')}
                  className="shrink-0 p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  title="Copiar Token"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Fields to fill */}
          {config?.fields && config.fields.length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-blue-600 dark:text-blue-300 uppercase tracking-wider">
                Campos para preencher
              </label>
              <div className="mt-1.5 space-y-1">
                {config.fields.map((field) => (
                  <div
                    key={field.label}
                    className="flex items-start gap-2 text-[11px] text-blue-800 dark:text-blue-200 bg-white/60 dark:bg-black/20 rounded px-2 py-1.5"
                  >
                    <span className="font-semibold whitespace-nowrap">
                      {field.label}{field.required ? ' *' : ''}:
                    </span>
                    <span className="text-blue-600 dark:text-blue-300">{field.description}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1 italic">
                * Obrigatório para o canal funcionar.
              </p>
            </div>
          )}

          {/* Toggles / extra config */}
          {config?.toggles && config.toggles.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-lg px-2.5 py-2 space-y-1">
              {config.toggles.map((toggle, i) => (
                <p key={i} className="text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {toggle}
                </p>
              ))}
            </div>
          )}

          {/* Docs link */}
          {config?.docsUrl && (
            <a
              href={config.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Ver documentação completa <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CHANNEL CARD
// =============================================================================

interface ChannelCardProps {
  channel: MessagingChannel;
  routingRule?: LeadRoutingRuleView;
  boards: { id: string; name: string; stages: { id: string; name: string; position: number }[] }[];
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRoutingChange: (channelId: string, boardId: string | null, stageId: string | null, enabled: boolean) => void;
  isLoading?: boolean;
  isRoutingLoading?: boolean;
}

function ChannelCard({
  channel,
  routingRule,
  boards,
  onEdit,
  onToggle,
  onDelete,
  onRoutingChange,
  isLoading,
  isRoutingLoading,
}: ChannelCardProps) {
  const Icon = CHANNEL_ICONS[channel.channelType] || MessageSquare;
  const StatusIcon = STATUS_ICONS[channel.status];
  const typeInfo = CHANNEL_TYPE_INFO[channel.channelType];
  const isConnected = channel.status === 'connected';
  const isConnecting = channel.status === 'connecting';

  // Routing state
  const [isRoutingExpanded, setIsRoutingExpanded] = useState(false);
  const [createDeal, setCreateDeal] = useState(!!routingRule?.boardId);
  const [boardId, setBoardId] = useState<string | null>(routingRule?.boardId || null);
  const [stageId, setStageId] = useState<string | null>(routingRule?.stageId || null);

  // Sync local state with routing rule
  useEffect(() => {
    setCreateDeal(!!routingRule?.boardId);
    setBoardId(routingRule?.boardId || null);
    setStageId(routingRule?.stageId || null);
  }, [routingRule]);

  // Get stages for selected board
  const selectedBoard = boards.find((b) => b.id === boardId);
  const stages = selectedBoard?.stages || [];

  // Auto-select first stage when board changes
  useEffect(() => {
    if (boardId && stages.length > 0 && !stages.find((s) => s.id === stageId)) {
      const firstStageId = stages[0].id;
      setStageId(firstStageId);
      // Save immediately on board change
      onRoutingChange(channel.id, boardId, firstStageId, true);
    }
  }, [boardId, stages]);

  // Handle toggle create deal
  const handleToggleCreateDeal = () => {
    const newCreateDeal = !createDeal;
    setCreateDeal(newCreateDeal);
    if (!newCreateDeal) {
      setBoardId(null);
      setStageId(null);
      onRoutingChange(channel.id, null, null, routingRule?.enabled ?? true);
    }
  };

  // Handle board change
  const handleBoardChange = (newBoardId: string) => {
    setBoardId(newBoardId || null);
    if (!newBoardId) {
      setStageId(null);
      onRoutingChange(channel.id, null, null, routingRule?.enabled ?? true);
    }
    // Stage will be auto-selected by useEffect
  };

  // Handle stage change
  const handleStageChange = (newStageId: string) => {
    setStageId(newStageId || null);
    if (boardId && newStageId) {
      onRoutingChange(channel.id, boardId, newStageId, routingRule?.enabled ?? true);
    }
  };

  // Routing status display
  const hasRouting = routingRule && routingRule.boardId;

  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
      {/* Main card content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Icon & Info */}
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                typeInfo?.color || 'bg-slate-500',
                'text-white'
              )}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {channel.name}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {typeInfo?.label} · {channel.provider}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                {channel.settings?.displayPhone || channel.externalIdentifier}
              </p>
              {channel.businessUnitName && (
                <div className="flex items-center gap-1 mt-1">
                  <Building2 className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {channel.businessUnitName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              STATUS_COLORS[channel.status]
            )}
          >
            <StatusIcon
              className={cn(
                'w-3.5 h-3.5',
                isConnecting && 'animate-spin'
              )}
            />
            <span>{CHANNEL_STATUS_LABELS[channel.status]}</span>
          </div>
        </div>

        {/* Status Message */}
        {channel.statusMessage && channel.status === 'error' && (
          <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <p className="text-xs text-red-700 dark:text-red-300">
              {channel.statusMessage}
            </p>
          </div>
        )}

        {/* Webhook URL — shown for all providers */}
        <WebhookInfo
          channelId={channel.id}
          provider={channel.provider}
          verifyToken={(channel.settings?.verifyToken || channel.credentials?.verifyToken) as string | undefined}
        />

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10
                hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Configurar
            </button>
            <button
              onClick={onToggle}
              disabled={isLoading || isConnecting}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                isConnected
                  ? 'bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
                  : 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-500/20'
              )}
            >
              {isConnected ? (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  Desconectar
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  Conectar
                </>
              )}
            </button>
          </div>

          <button
            onClick={onDelete}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-white dark:bg-white/5 border border-red-200 dark:border-red-500/20
              text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10
              transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Routing Section - Collapsible */}
      <div className="border-t border-slate-100 dark:border-white/5">
        <button
          type="button"
          onClick={() => setIsRoutingExpanded(!isRoutingExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Entrada de Leads
            </span>
            {hasRouting ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300">
                <LayoutGrid className="w-3 h-3" />
                {routingRule.boardName}
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400">
                Desativado
              </span>
            )}
          </div>
          {isRoutingExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {/* Expanded routing config */}
        {isRoutingExpanded && (
          <div className="px-4 pb-4 space-y-4">
            {/* Toggle create deal */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-black/20 rounded-xl">
              <button
                type="button"
                onClick={handleToggleCreateDeal}
                disabled={isRoutingLoading}
                className={cn(
                  'relative w-10 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50',
                  createDeal
                    ? 'bg-primary-600'
                    : 'bg-slate-200 dark:bg-white/10'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    createDeal ? 'left-5' : 'left-1'
                  )}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Criar deal automaticamente
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Quando uma nova conversa iniciar neste canal
                </p>
              </div>
            </div>

            {/* Board + Stage selectors */}
            {createDeal && (
              <div className="space-y-3 p-3 border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <ArrowRight className="w-3.5 h-3.5" />
                  Destino do deal
                </div>

                {/* Board selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Funil
                  </label>
                  {boards.length === 0 ? (
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Nenhum funil encontrado. Crie um funil primeiro.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={boardId || ''}
                      onChange={(e) => handleBoardChange(e.target.value)}
                      disabled={isRoutingLoading}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-slate-900 dark:text-white disabled:opacity-50"
                    >
                      <option value="">Selecione um funil</option>
                      {boards.map((board) => (
                        <option key={board.id} value={board.id}>
                          {board.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Stage selector */}
                {boardId && stages.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Estágio inicial
                    </label>
                    <select
                      value={stageId || ''}
                      onChange={(e) => handleStageChange(e.target.value)}
                      disabled={isRoutingLoading}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-slate-900 dark:text-white disabled:opacity-50"
                    >
                      {stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      O deal será criado neste estágio quando a conversa iniciar.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// =============================================================================
// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyChannelsState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
        <MessageSquare className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
        Nenhum canal configurado
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
        Configure canais de comunicação para receber e enviar mensagens
        diretamente pelo CRM.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold
          bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Adicionar Canal
      </button>
    </div>
  );
}


// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ChannelsSection() {
  const { profile } = useAuth();
  const { addToast } = useToast();

  // Queries
  const { data: channels = [], isLoading } = useChannelsQuery();
  const { data: routingRules = [], isLoading: routingLoading } = useLeadRoutingRules();
  const { data: boards = [], isLoading: boardsLoading } = useBoardsWithStages();

  // Mutations
  const deleteMutation = useDeleteChannelMutation();
  const toggleMutation = useToggleChannelStatusMutation();
  const createRoutingMutation = useCreateLeadRoutingRule();
  const updateRoutingMutation = useUpdateLeadRoutingRule();
  const deleteRoutingMutation = useDeleteLeadRoutingRule();

  // Local state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<MessagingChannel | null>(null);
  const [channelToEdit, setChannelToEdit] = useState<MessagingChannel | null>(null);

  const canUse = profile?.role === 'admin';

  // Helper to get routing rule for a channel
  const getRoutingRuleForChannel = (channelId: string) => {
    return routingRules.find((r) => r.channelId === channelId);
  };

  // Handle routing changes
  const handleRoutingChange = async (
    channelId: string,
    boardId: string | null,
    stageId: string | null,
    enabled: boolean
  ) => {
    const existingRule = getRoutingRuleForChannel(channelId);

    try {
      if (existingRule) {
        // Update existing rule
        await updateRoutingMutation.mutateAsync({
          ruleId: existingRule.id,
          input: { boardId, stageId, enabled },
        });
      } else if (boardId && stageId) {
        // Create new rule
        await createRoutingMutation.mutateAsync({
          channelId,
          boardId,
          stageId,
          enabled: true,
        });
      }
      // No toast for inline changes - feels smoother
    } catch {
      addToast('Erro ao salvar configuração de entrada de leads', 'error');
    }
  };

  const isRoutingMutating =
    createRoutingMutation.isPending ||
    updateRoutingMutation.isPending ||
    deleteRoutingMutation.isPending;

  // Handlers
  const handleToggleChannel = async (channel: MessagingChannel) => {
    const isConnected = channel.status === 'connected';
    try {
      await toggleMutation.mutateAsync({
        channelId: channel.id,
        connect: !isConnected,
      });
      addToast(
        isConnected ? 'Canal desconectado.' : 'Conectando canal...',
        'success'
      );
    } catch {
      addToast('Erro ao alterar status do canal.', 'error');
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelToDelete) return;
    try {
      await deleteMutation.mutateAsync(channelToDelete.id);
      addToast('Canal removido com sucesso.', 'success');
      setChannelToDelete(null);
    } catch {
      addToast('Erro ao remover canal.', 'error');
    }
  };

  if (!canUse) {
    return (
      <SettingsSection title="Canais de Mensagem" icon={MessageSquare}>
        <div className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-600 dark:text-slate-300">
          Disponível apenas para administradores.
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="Canais de Mensagem" icon={MessageSquare}>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
        Configure canais de WhatsApp, Instagram e outros para centralizar suas
        conversas no CRM.
      </p>

      {/* Actions - only show when there are channels */}
      {channels.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {channels.length} canal{channels.length > 1 ? 'is' : ''} configurado{channels.length > 1 ? 's' : ''}
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold
              bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Adicionar Canal
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : channels.length === 0 ? (
        <EmptyChannelsState onAdd={() => setIsAddModalOpen(true)} />
      ) : (
        <div className="grid gap-4">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              routingRule={getRoutingRuleForChannel(channel.id)}
              boards={boards}
              onEdit={() => setChannelToEdit(channel)}
              onToggle={() => handleToggleChannel(channel)}
              onDelete={() => setChannelToDelete(channel)}
              onRoutingChange={handleRoutingChange}
              isLoading={toggleMutation.isPending || deleteMutation.isPending}
              isRoutingLoading={isRoutingMutating || routingLoading || boardsLoading}
            />
          ))}
        </div>
      )}

      {/* Channel Setup Wizard */}
      <ChannelSetupWizard
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!channelToDelete}
        onClose={() => setChannelToDelete(null)}
        onConfirm={handleDeleteChannel}
        title="Remover canal?"
        message={
          <div>
            Isso vai remover o canal <b>{channelToDelete?.name}</b>. As conversas
            existentes serão mantidas, mas novas mensagens não serão recebidas.
          </div>
        }
        confirmText="Remover"
        cancelText="Cancelar"
        variant="danger"
      />

      {/* Edit Modal (placeholder - will be replaced by wizard) */}
      <Modal
        isOpen={!!channelToEdit}
        onClose={() => setChannelToEdit(null)}
        title={`Configurar ${channelToEdit?.name}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            A configuração detalhada do canal será implementada no próximo passo
            (ChannelSetupWizard).
          </p>

          {channelToEdit && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Tipo:</dt>
                  <dd className="text-slate-900 dark:text-white font-medium">
                    {CHANNEL_TYPE_INFO[channelToEdit.channelType]?.label}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Provider:</dt>
                  <dd className="text-slate-900 dark:text-white font-medium">
                    {channelToEdit.provider}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Identificador:</dt>
                  <dd className="text-slate-900 dark:text-white font-medium">
                    {channelToEdit.externalIdentifier}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Unidade:</dt>
                  <dd className="text-slate-900 dark:text-white font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {channelToEdit.businessUnitName || 'Não definida'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500 dark:text-slate-400">Status:</dt>
                  <dd className="text-slate-900 dark:text-white font-medium">
                    {CHANNEL_STATUS_LABELS[channelToEdit.status]}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setChannelToEdit(null)}
              className="px-4 py-2 rounded-lg text-sm font-semibold
                text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10
                transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    </SettingsSection>
  );
}

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Copy,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  Settings,
  Info,
} from 'lucide-react';
import { CHANNEL_CONFIG } from '../ChannelIndicator';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';
import {
  useChannelQuery,
  useUpdateChannelMutation,
  useDeleteChannelMutation,
  useToggleChannelStatusMutation,
} from '@/lib/query/hooks/useChannelsQuery';
import {
  type ChannelType,
  type MessagingChannel,
  CHANNEL_TYPE_INFO,
} from '@/lib/messaging/types';

// =============================================================================
// TYPES
// =============================================================================

interface ChannelSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
}

interface ProviderConfig {
  name: string;
  description: string;
  official: boolean;
  fields: {
    key: string;
    label: string;
    type: 'text' | 'password' | 'textarea';
    placeholder: string;
    required: boolean;
    helpText?: string;
    readOnly?: boolean;
  }[];
  setupUrl?: string;
}

type ModalView = 'info' | 'credentials' | 'delete';

/** Mask a credential value for display, showing only the last 4 characters. */
function maskCredential(value: string): string {
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}

/** Sentinel that indicates the user has NOT changed a credential field. */
const UNCHANGED_SENTINEL = '__UNCHANGED__';

// =============================================================================
// PROVIDER CONFIGURATIONS
// =============================================================================

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  'whatsapp:z-api': {
    name: 'Z-API',
    description: 'Conexão não-oficial via WhatsApp Web.',
    official: false,
    fields: [
      {
        key: 'instanceId',
        label: 'Instance ID',
        type: 'text',
        placeholder: 'Ex: A1B2C3D4E5F6...',
        required: true,
        helpText: 'ID da instância na Z-API.',
      },
      {
        key: 'token',
        label: 'Token',
        type: 'password',
        placeholder: 'Seu token de API',
        required: true,
        helpText: 'Token de autenticação.',
      },
      {
        key: 'clientToken',
        label: 'Client Token',
        type: 'password',
        placeholder: 'Token do cliente (opcional)',
        required: false,
      },
    ],
    setupUrl: 'https://developer.z-api.io/',
  },
  'whatsapp:meta-cloud': {
    name: 'Meta Cloud API',
    description: 'API oficial da Meta para WhatsApp Business.',
    official: true,
    fields: [
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID',
        type: 'text',
        placeholder: 'Ex: 123456789012345',
        required: true,
      },
      {
        key: 'businessAccountId',
        label: 'WhatsApp Business Account ID',
        type: 'text',
        placeholder: 'Ex: 123456789012345',
        required: true,
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'Token de acesso',
        required: true,
      },
      {
        key: 'verifyToken',
        label: 'Verify Token (Webhook)',
        type: 'text',
        placeholder: 'Token de verificação',
        required: false,
        readOnly: true,
        helpText: 'Use este token ao configurar webhooks no Meta.',
      },
    ],
    setupUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  },
  'instagram:meta': {
    name: 'Instagram API',
    description: 'API oficial da Meta para Instagram Direct.',
    official: true,
    fields: [
      {
        key: 'pageId',
        label: 'Facebook Page ID',
        type: 'text',
        placeholder: 'Ex: 123456789012345',
        required: true,
      },
      {
        key: 'instagramAccountId',
        label: 'Instagram Business Account ID',
        type: 'text',
        placeholder: 'Ex: 17841400000000000',
        required: true,
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'Token de acesso',
        required: true,
      },
    ],
    setupUrl: 'https://developers.facebook.com/docs/instagram-api',
  },
};

// =============================================================================
// STATUS BADGE
// =============================================================================

function StatusBadge({ status }: { status: MessagingChannel['status'] }) {
  const statusConfig: Record<string, { label: string; color: string; icon: React.FC<{ className?: string }> }> = {
    connected: {
      label: 'Conectado',
      color: 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-300',
      icon: CheckCircle,
    },
    connecting: {
      label: 'Conectando...',
      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300',
      icon: Loader2,
    },
    disconnected: {
      label: 'Desconectado',
      color: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300',
      icon: PowerOff,
    },
    error: {
      label: 'Erro',
      color: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300',
      icon: AlertCircle,
    },
    pending: {
      label: 'Pendente',
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
      icon: Info,
    },
    waiting_qr: {
      label: 'Aguardando QR',
      color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300',
      icon: RefreshCw,
    },
  };

  const config = statusConfig[status] || {
    label: status,
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
    icon: Info,
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        config.color
      )}
    >
      <Icon className={cn('w-3.5 h-3.5', status === 'connecting' && 'animate-spin')} />
      {config.label}
    </span>
  );
}

// =============================================================================
// INFO VIEW
// =============================================================================

interface InfoViewProps {
  channel: MessagingChannel;
  onEditCredentials: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  isToggling: boolean;
}

function InfoView({
  channel,
  onEditCredentials,
  onToggleStatus,
  onDelete,
  isToggling,
}: InfoViewProps) {
  const Icon = CHANNEL_CONFIG[channel.channelType]?.icon ?? CHANNEL_CONFIG.whatsapp.icon;
  const typeInfo = CHANNEL_TYPE_INFO[channel.channelType];
  const config = PROVIDER_CONFIGS[`${channel.channelType}:${channel.provider}`];
  const isConnected = channel.status === 'connected';

  return (
    <div className="space-y-6">
      {/* Channel Header */}
      <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5">
        <div
          className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center text-white flex-shrink-0',
            typeInfo.color
          )}
        >
          <Icon className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
            {channel.name}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
            {config?.name || channel.provider} • {channel.externalIdentifier}
          </p>
          <StatusBadge status={channel.status} />
        </div>
      </div>

      {/* Status Message */}
      {channel.statusMessage && (
        <div
          className={cn(
            'p-4 rounded-xl border',
            channel.status === 'error'
              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
              : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20'
          )}
        >
          <p
            className={cn(
              'text-sm',
              channel.status === 'error'
                ? 'text-red-700 dark:text-red-300'
                : 'text-blue-700 dark:text-blue-300'
            )}
          >
            {channel.statusMessage}
          </p>
        </div>
      )}

      {/* Channel Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Informações do Canal
        </h4>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
            <span className="text-slate-500 dark:text-slate-400">Tipo</span>
            <span className="text-slate-900 dark:text-white font-medium">
              {typeInfo.label}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
            <span className="text-slate-500 dark:text-slate-400">Provedor</span>
            <span className="text-slate-900 dark:text-white font-medium">
              {config?.name || channel.provider}
              {config?.official && (
                <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">
                  (Oficial)
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
            <span className="text-slate-500 dark:text-slate-400">Identificador</span>
            <span className="text-slate-900 dark:text-white font-medium font-mono text-xs">
              {channel.externalIdentifier}
            </span>
          </div>
          {channel.lastConnectedAt && (
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
              <span className="text-slate-500 dark:text-slate-400">Última conexão</span>
              <span className="text-slate-900 dark:text-white font-medium">
                {new Date(channel.lastConnectedAt).toLocaleString('pt-BR')}
              </span>
            </div>
          )}
          <div className="flex justify-between py-2">
            <span className="text-slate-500 dark:text-slate-400">Criado em</span>
            <span className="text-slate-900 dark:text-white font-medium">
              {new Date(channel.createdAt).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/10">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onToggleStatus}
            disabled={isToggling}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isConnected
                ? 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20'
                : 'bg-green-600 text-white hover:bg-green-700'
            )}
          >
            {isToggling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isConnected ? (
              <PowerOff className="w-4 h-4" />
            ) : (
              <Power className="w-4 h-4" />
            )}
            {isConnected ? 'Desconectar' : 'Conectar'}
          </button>
          <button
            onClick={onEditCredentials}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
              bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300
              hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Credenciais
          </button>
        </div>
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
            text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Excluir canal
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// CREDENTIALS VIEW
// =============================================================================

interface CredentialsViewProps {
  channel: MessagingChannel;
  credentials: Record<string, string>;
  maskedDisplay: Record<string, string>;
  dirtyFields: Set<string>;
  channelName: string;
  onCredentialsChange: (key: string, value: string) => void;
  onNameChange: (name: string) => void;
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
  isValid: boolean;
}

function CredentialsView({
  channel,
  credentials,
  maskedDisplay,
  dirtyFields,
  channelName,
  onCredentialsChange,
  onNameChange,
  onBack,
  onSave,
  isSaving,
  isValid,
}: CredentialsViewProps) {
  const config = PROVIDER_CONFIGS[`${channel.channelType}:${channel.provider}`];

  if (!config) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Configuração não encontrada para este provedor.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
          Editar Credenciais
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Atualize as credenciais de conexão do canal.
        </p>
      </div>

      {/* Documentation Link */}
      {config.setupUrl && (
        <a
          href={config.setupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          <ExternalLink className="w-4 h-4" />
          Documentação do {config.name}
        </a>
      )}

      {/* Channel Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Nome do canal <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={channelName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ex: WhatsApp Comercial"
          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
        />
      </div>

      {/* Credential Fields */}
      <div className="space-y-4">
        {config.fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            {field.readOnly ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={credentials[field.key] || ''}
                  readOnly
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl
                    text-slate-900 dark:text-white font-mono text-sm cursor-default"
                />
                <button
                  type="button"
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(credentials[field.key] || '');
                    } catch {
                      // Clipboard API not available
                    }
                  }}
                  className="p-2.5 bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl
                    hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                  title="Copiar"
                >
                  <Copy className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
              </div>
            ) : field.type === 'textarea' ? (
              <textarea
                value={credentials[field.key] || ''}
                onChange={(e) => onCredentialsChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white resize-none"
              />
            ) : (() => {
              const isPasswordField = field.type === 'password';
              const isUnchanged = isPasswordField && !dirtyFields.has(field.key);
              const displayValue = isUnchanged ? '' : (credentials[field.key] === UNCHANGED_SENTINEL ? '' : (credentials[field.key] || ''));
              const maskedPlaceholder = isUnchanged && maskedDisplay[field.key]
                ? maskedDisplay[field.key]
                : field.placeholder;

              return (
                <input
                  type={field.type}
                  value={displayValue}
                  onChange={(e) => onCredentialsChange(field.key, e.target.value)}
                  placeholder={maskedPlaceholder}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl
                    focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
                />
              );
            })()}
            {field.helpText && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {field.helpText}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10">
        <button
          onClick={onBack}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-sm font-medium
            text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={!isValid || isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
            bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar alterações'
          )}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// DELETE CONFIRMATION VIEW
// =============================================================================

interface DeleteViewProps {
  channel: MessagingChannel;
  onBack: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

function DeleteView({ channel, onBack, onConfirm, isDeleting }: DeleteViewProps) {
  const [confirmText, setConfirmText] = useState('');
  const canDelete = confirmText.toLowerCase() === 'excluir';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Excluir canal?
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Esta ação irá remover permanentemente o canal <strong>{channel.name}</strong> e
          todas as suas configurações. As conversas existentes serão mantidas mas
          ficarão órfãs.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
        <p className="text-sm text-red-700 dark:text-red-300 mb-3">
          Digite <strong>excluir</strong> para confirmar:
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="excluir"
          className="w-full px-4 py-2.5 bg-white dark:bg-black/20 border border-red-200 dark:border-red-500/20 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-red-500 text-slate-900 dark:text-white"
        />
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10">
        <button
          onClick={onBack}
          disabled={isDeleting}
          className="px-4 py-2 rounded-lg text-sm font-medium
            text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={!canDelete || isDeleting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold
            bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Excluindo...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Excluir canal
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ChannelSetupModal({
  isOpen,
  onClose,
  channelId,
}: ChannelSetupModalProps) {
  const { addToast } = useToast();

  // Queries and mutations
  const { data: channel, isLoading } = useChannelQuery(channelId);
  const updateMutation = useUpdateChannelMutation();
  const deleteMutation = useDeleteChannelMutation();
  const toggleMutation = useToggleChannelStatusMutation();

  // Local state
  const [view, setView] = useState<ModalView>('info');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [maskedDisplay, setMaskedDisplay] = useState<Record<string, string>>({});
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [channelName, setChannelName] = useState('');

  // Initialize form when channel loads - mask credential values
  useEffect(() => {
    if (channel) {
      const creds: Record<string, string> = {};
      const masked: Record<string, string> = {};
      if (channel.credentials) {
        const config = PROVIDER_CONFIGS[`${channel.channelType}:${channel.provider}`];
        for (const [key, value] of Object.entries(channel.credentials)) {
          const strValue = typeof value === 'string' ? value : (value !== null && value !== undefined ? String(value) : '');
          const fieldConfig = config?.fields.find((f) => f.key === key);
          // Mask password fields; show non-secret fields as-is
          if (fieldConfig?.type === 'password') {
            creds[key] = UNCHANGED_SENTINEL;
            masked[key] = strValue ? maskCredential(strValue) : '';
          } else {
            creds[key] = strValue;
            masked[key] = strValue;
          }
        }
      }
      setCredentials(creds);
      setMaskedDisplay(masked);
      setDirtyFields(new Set());
      setChannelName(channel.name);
    }
  }, [channel]);

  // Reset view when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView('info');
      setDirtyFields(new Set());
    }
  }, [isOpen]);

  // Check if credentials form is valid
  const isCredentialsValid = useMemo(() => {
    if (!channel) return false;
    if (!channelName.trim()) return false;

    const config = PROVIDER_CONFIGS[`${channel.channelType}:${channel.provider}`];
    if (!config) return true;

    return config.fields
      .filter((f) => f.required && !f.readOnly)
      .every((f) => {
        const val = credentials[f.key];
        // UNCHANGED_SENTINEL means the existing value is kept -- still valid
        if (val === UNCHANGED_SENTINEL) return true;
        return val?.trim();
      });
  }, [channel, channelName, credentials]);

  // Handlers
  const handleCredentialsChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
    setDirtyFields((prev) => new Set(prev).add(key));
  };

  const handleSaveCredentials = async () => {
    if (!channel) return;

    // Only include credential fields that the user actually changed
    const updatedCreds: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (value !== UNCHANGED_SENTINEL && dirtyFields.has(key)) {
        updatedCreds[key] = value;
      } else if (value !== UNCHANGED_SENTINEL) {
        // Non-password field, always include
        updatedCreds[key] = value;
      }
      // Skip UNCHANGED_SENTINEL values entirely - server keeps existing value
    }

    try {
      await updateMutation.mutateAsync({
        channelId: channel.id,
        input: {
          name: channelName.trim(),
          credentials: updatedCreds,
        },
      });
      addToast('Canal atualizado com sucesso!', 'success');
      setView('info');
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Erro ao atualizar canal.',
        'error'
      );
    }
  };

  const handleToggleStatus = async () => {
    if (!channel) return;

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
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Erro ao alterar status.',
        'error'
      );
    }
  };

  const handleDelete = async () => {
    if (!channel) return;

    try {
      await deleteMutation.mutateAsync(channel.id);
      addToast('Canal excluído com sucesso.', 'success');
      onClose();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Erro ao excluir canal.',
        'error'
      );
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Configurar Canal" size="md">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </Modal>
    );
  }

  // Not found
  if (!channel) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Configurar Canal" size="md">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Canal não encontrado.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={view === 'info' ? 'Configurar Canal' : view === 'credentials' ? 'Editar Credenciais' : 'Excluir Canal'}
      size="md"
    >
      {view === 'info' && (
        <InfoView
          channel={channel}
          onEditCredentials={() => setView('credentials')}
          onToggleStatus={handleToggleStatus}
          onDelete={() => setView('delete')}
          isToggling={toggleMutation.isPending}
        />
      )}

      {view === 'credentials' && (
        <CredentialsView
          channel={channel}
          credentials={credentials}
          maskedDisplay={maskedDisplay}
          dirtyFields={dirtyFields}
          channelName={channelName}
          onCredentialsChange={handleCredentialsChange}
          onNameChange={setChannelName}
          onBack={() => setView('info')}
          onSave={handleSaveCredentials}
          isSaving={updateMutation.isPending}
          isValid={isCredentialsValid}
        />
      )}

      {view === 'delete' && (
        <DeleteView
          channel={channel}
          onBack={() => setView('info')}
          onConfirm={handleDelete}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </Modal>
  );
}

export default ChannelSetupModal;

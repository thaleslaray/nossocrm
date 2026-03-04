'use client';

import { useState } from 'react';
import {
  useWhatsAppInstances,
  useCreateWhatsAppInstance,
  useDeleteWhatsAppInstance,
  useWhatsAppQRCode,
  useWhatsAppInstance,
} from '@/lib/query/whatsapp';
import type { WhatsAppInstance } from '@/types/whatsapp';
import {
  MessageSquare,
  Plus,
  Trash2,
  Wifi,
  WifiOff,
  QrCode,
  RefreshCw,
  Bot,
  X,
  Check,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// QR Code Connection Modal
// ---------------------------------------------------------------------------

function QRCodePanel({ instanceId, onClose }: { instanceId: string; onClose: () => void }) {
  const { data: qrData, isLoading, refetch } = useWhatsAppQRCode(instanceId);
  const { data: instanceData } = useWhatsAppInstance(instanceId);

  const isConnected = instanceData?.status === 'connected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-green-500/10">
              <QrCode className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Conectar WhatsApp</h3>
              <p className="text-xs text-slate-500">Escaneie o QR Code com seu celular</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center">
          {isConnected ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <h4 className="font-semibold text-lg text-slate-900 dark:text-white mb-1">Conectado!</h4>
              <p className="text-sm text-slate-500">
                WhatsApp conectado com sucesso{instanceData?.phone ? ` (${instanceData.phone})` : ''}.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors"
              >
                Continuar
              </button>
            </div>
          ) : isLoading ? (
            <div className="py-12">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto" />
              <p className="text-sm text-slate-500 mt-3">Carregando QR Code...</p>
            </div>
          ) : qrData?.value ? (
            <>
              <div className="bg-white p-4 rounded-xl mb-4">
                <img
                  src={`data:image/png;base64,${qrData.value}`}
                  alt="QR Code WhatsApp"
                  className="w-64 h-64"
                />
              </div>
              <p className="text-xs text-slate-400 text-center mb-3">
                Abra o WhatsApp no celular &gt; Menu &gt; Aparelhos conectados &gt; Conectar
              </p>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar QR Code
              </button>
            </>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500 mb-3">Não foi possível gerar o QR Code.</p>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 mx-auto"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Instance Modal
// ---------------------------------------------------------------------------

function AddInstanceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');

  const createMutation = useCreateWhatsAppInstance();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      { name: name || 'WhatsApp Principal' },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-white">Nova Instância WhatsApp</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nome da instância
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: WhatsApp Vendas"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-bg text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <p className="text-xs text-slate-400">
            O sistema cria e configura a instância automaticamente na Evolution API.
          </p>

          {createMutation.error && (
            <p className="text-sm text-red-500">{createMutation.error.message}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-2 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar Instância
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instance Card
// ---------------------------------------------------------------------------

function InstanceCard({
  instance,
  onConnect,
  onDelete,
}: {
  instance: WhatsAppInstance;
  onConnect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const statusConfig = {
    connected: { color: 'text-green-500 bg-green-500/10', icon: Wifi, label: 'Conectado' },
    disconnected: { color: 'text-slate-400 bg-slate-100 dark:bg-white/5', icon: WifiOff, label: 'Desconectado' },
    connecting: { color: 'text-amber-500 bg-amber-500/10', icon: RefreshCw, label: 'Conectando...' },
    banned: { color: 'text-red-500 bg-red-500/10', icon: WifiOff, label: 'Banido' },
  };

  const s = statusConfig[instance.status] || statusConfig.disconnected;
  const StatusIcon = s.icon;

  return (
    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white">{instance.name}</h4>
            {instance.phone && (
              <p className="text-xs text-slate-500">{instance.phone}</p>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {s.label}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
        {instance.ai_enabled ? (
          <span className="flex items-center gap-1 text-violet-500">
            <Bot className="w-3.5 h-3.5" />
            I.A. Ativada
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Bot className="w-3.5 h-3.5" />
            I.A. Desativada
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {instance.status !== 'connected' && (
          <button
            onClick={() => onConnect(instance.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors"
          >
            <QrCode className="w-4 h-4" />
            Conectar
          </button>
        )}
        {instance.status === 'connected' && (
          <button
            onClick={() => onConnect(instance.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reconectar
          </button>
        )}
        <button
          onClick={() => onDelete(instance.id)}
          className="p-2 rounded-xl border border-red-200 dark:border-red-500/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function WhatsAppSetup() {
  const { data: instances, isLoading } = useWhatsAppInstances();
  const deleteMutation = useDeleteWhatsAppInstance();
  const [showAddModal, setShowAddModal] = useState(false);
  const [connectingInstanceId, setConnectingInstanceId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Instâncias WhatsApp</h3>
          <p className="text-sm text-slate-500 mt-1">
            Conecte suas contas WhatsApp para receber e enviar mensagens.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Instância
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      ) : !instances || instances.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
          <MessageSquare className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h4 className="font-semibold text-slate-900 dark:text-white mb-1">Nenhuma instância configurada</h4>
          <p className="text-sm text-slate-500 mb-4">
            Crie uma instância e conecte seu WhatsApp para começar.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Instância
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {instances.map((inst) => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              onConnect={(id) => setConnectingInstanceId(id)}
              onDelete={(id) => {
                if (confirm('Deseja realmente excluir esta instância?')) {
                  deleteMutation.mutate(id);
                }
              }}
            />
          ))}
        </div>
      )}

      {showAddModal && <AddInstanceModal onClose={() => setShowAddModal(false)} />}
      {connectingInstanceId && (
        <QRCodePanel
          instanceId={connectingInstanceId}
          onClose={() => setConnectingInstanceId(null)}
        />
      )}
    </div>
  );
}

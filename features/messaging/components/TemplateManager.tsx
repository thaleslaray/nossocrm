'use client';

import React, { useState } from 'react';
import {
  RefreshCw,
  FileText,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useTemplatesQuery,
  useTemplateSyncMutation,
} from '@/lib/query/hooks';
import type { MessagingTemplate, TemplateCategory, TemplateStatus } from '@/lib/messaging/types';

// =============================================================================
// CONFIG
// =============================================================================

const CATEGORY_CONFIG: Record<TemplateCategory, { label: string; color: string }> = {
  marketing: {
    label: 'Marketing',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  },
  utility: {
    label: 'Utilitário',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  authentication: {
    label: 'Autenticação',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
};

const STATUS_CONFIG: Record<
  TemplateStatus,
  { label: string; icon: React.ElementType; color: string }
> = {
  approved: {
    label: 'Aprovado',
    icon: CheckCircle,
    color: 'text-green-600',
  },
  pending: {
    label: 'Pendente',
    icon: Clock,
    color: 'text-yellow-600',
  },
  rejected: {
    label: 'Rejeitado',
    icon: XCircle,
    color: 'text-red-600',
  },
  paused: {
    label: 'Pausado',
    icon: AlertCircle,
    color: 'text-gray-500',
  },
};

// =============================================================================
// PROPS
// =============================================================================

interface TemplateManagerProps {
  channelId: string;
  channelName?: string;
  className?: string;
}

// =============================================================================
// TEMPLATE ROW
// =============================================================================

interface TemplateRowProps {
  template: MessagingTemplate;
}

function TemplateRow({ template }: TemplateRowProps) {
  const [expanded, setExpanded] = useState(false);
  const categoryConfig = CATEGORY_CONFIG[template.category];
  const statusConfig = STATUS_CONFIG[template.status];
  const StatusIcon = statusConfig.icon;

  const bodyComponent = template.components.find((c) => c.type === 'BODY');
  const previewText = bodyComponent?.text?.slice(0, 120) || `[${template.name}]`;

  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-muted)]/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-[var(--color-text-muted)]" />
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--color-text-primary)]">
                {template.name}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                ({template.language})
              </span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] line-clamp-1">
              {previewText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={cn('text-xs px-2 py-1 rounded-full', categoryConfig.color)}>
            {categoryConfig.label}
          </span>
          <div className={cn('flex items-center gap-1', statusConfig.color)}>
            <StatusIcon className="w-4 h-4" />
            <span className="text-sm">{statusConfig.label}</span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-border)] bg-[var(--color-muted)]/30">
          <div className="space-y-3">
            {template.components.map((comp, idx) => (
              <div key={idx}>
                <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase">
                  {comp.type}
                  {comp.format && ` (${comp.format})`}
                </span>
                {comp.text && (
                  <p className="text-sm text-[var(--color-text-primary)] mt-1 whitespace-pre-wrap">
                    {comp.text}
                  </p>
                )}
                {comp.buttons && comp.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {comp.buttons.map((btn, btnIdx) => (
                      <span
                        key={btnIdx}
                        className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-primary)]"
                      >
                        {btn.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {template.rejectionReason && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <span className="text-xs font-medium text-red-700 dark:text-red-300 block mb-1">
                  Motivo da rejeição:
                </span>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {template.rejectionReason}
                </p>
              </div>
            )}

            <div className="text-xs text-[var(--color-text-muted)] pt-2">
              ID: {template.id}
              {template.externalId && ` | External: ${template.externalId}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TemplateManager({ channelId, channelName, className }: TemplateManagerProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | 'all'>('all');

  const { data: templates = [], isLoading, error } = useTemplatesQuery(channelId);
  const syncMutation = useTemplateSyncMutation();

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      search === '' ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.components.some((c) => c.text?.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Group by status for summary
  const statusCounts = templates.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<TemplateStatus, number>
  );

  const handleSync = () => {
    syncMutation.mutate(channelId);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Templates de Mensagem
          </h3>
          {channelName && (
            <p className="text-sm text-[var(--color-text-muted)]">{channelName}</p>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncMutation.isPending}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-[var(--color-primary)] text-white',
            'hover:bg-[var(--color-primary-hover)] transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw
            className={cn('w-4 h-4', syncMutation.isPending && 'animate-spin')}
          />
          <span>{syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar'}</span>
        </button>
      </div>

      {/* Sync result */}
      {syncMutation.isSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-300">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">
            {syncMutation.data.synced} template(s) sincronizado(s) de {syncMutation.data.total}
          </span>
        </div>
      )}

      {syncMutation.isError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
          <XCircle className="w-4 h-4" />
          <span className="text-sm">
            Erro ao sincronizar: {syncMutation.error.message}
          </span>
        </div>
      )}

      {/* Status Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[var(--color-text-muted)]">Total: {templates.length}</span>
        {statusCounts.approved && (
          <span className="text-green-600">✓ {statusCounts.approved} aprovados</span>
        )}
        {statusCounts.pending && (
          <span className="text-yellow-600">⏳ {statusCounts.pending} pendentes</span>
        )}
        {statusCounts.rejected && (
          <span className="text-red-600">✗ {statusCounts.rejected} rejeitados</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar templates..."
            className={cn(
              'w-full pl-9 pr-3 py-2 text-sm rounded-lg border',
              'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
              'border-[var(--color-border)] focus:border-[var(--color-primary)]',
              'placeholder:text-[var(--color-text-muted)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20'
            )}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TemplateStatus | 'all')}
          className={cn(
            'px-3 py-2 text-sm rounded-lg border',
            'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
            'border-[var(--color-border)] focus:border-[var(--color-primary)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20'
          )}
        >
          <option value="all">Todos os status</option>
          <option value="approved">Aprovados</option>
          <option value="pending">Pendentes</option>
          <option value="rejected">Rejeitados</option>
          <option value="paused">Pausados</option>
        </select>
      </div>

      {/* Template List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <XCircle className="w-12 h-12 mx-auto mb-3 text-red-500" />
          <p className="text-sm text-[var(--color-text-muted)]">
            Erro ao carregar templates
          </p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-muted)]">
            {search || statusFilter !== 'all'
              ? 'Nenhum template encontrado com esses filtros'
              : 'Nenhum template sincronizado. Clique em "Sincronizar" para buscar templates do Meta.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTemplates.map((template) => (
            <TemplateRow key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}

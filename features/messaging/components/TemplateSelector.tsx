'use client';

import React, { useState, useMemo } from 'react';
import { Search, Send, ChevronDown, ChevronUp, X, FileText, CheckCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  MessagingTemplate,
  TemplateComponent,
  TemplateCategory,
  TemplateStatus,
} from '@/lib/messaging/types';

// =============================================================================
// TYPES
// =============================================================================

export type TemplateData = MessagingTemplate;

interface TemplateSelectorProps {
  templates: MessagingTemplate[];
  isLoading?: boolean;
  onSelect: (template: MessagingTemplate, params?: Record<string, string>) => void;
  onCancel: () => void;
  className?: string;
}

// =============================================================================
// CATEGORY CONFIG
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

const STATUS_CONFIG: Record<TemplateStatus, { label: string; icon: typeof CheckCircle; color: string }> = {
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
    icon: Clock,
    color: 'text-gray-500',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractVariables(text: string): string[] {
  const regex = /\{\{(\d+)\}\}/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function getTemplatePreview(template: MessagingTemplate): string {
  const bodyComponent = template.components.find((c) => c.type === 'BODY');
  return bodyComponent?.text || template.name;
}

// =============================================================================
// TEMPLATE CARD
// =============================================================================

interface TemplateCardProps {
  template: MessagingTemplate;
  isSelected: boolean;
  onClick: () => void;
}

function TemplateCard({ template, isSelected, onClick }: TemplateCardProps) {
  const categoryConfig = CATEGORY_CONFIG[template.category];
  const statusConfig = STATUS_CONFIG[template.status];
  const StatusIcon = statusConfig.icon;

  const isDisabled = template.status !== 'approved';

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        isSelected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]',
        isDisabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {template.name}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
            {getTemplatePreview(template)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn('text-xs px-2 py-0.5 rounded-full', categoryConfig.color)}>
            {categoryConfig.label}
          </span>
          <div className={cn('flex items-center gap-1', statusConfig.color)}>
            <StatusIcon className="w-3 h-3" />
            <span className="text-xs">{statusConfig.label}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// VARIABLE FORM
// =============================================================================

interface VariableFormProps {
  template: MessagingTemplate;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

function VariableForm({ template, values, onChange }: VariableFormProps) {
  const variables = useMemo(() => {
    const allVariables: string[] = [];
    template.components.forEach((comp) => {
      if (comp.text) {
        allVariables.push(...extractVariables(comp.text));
      }
    });
    return [...new Set(allVariables)].sort((a, b) => parseInt(a) - parseInt(b));
  }, [template]);

  if (variables.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
        Preencha as variáveis
      </h4>
      <div className="space-y-2">
        {variables.map((varNum) => (
          <div key={varNum}>
            <label className="text-xs text-[var(--color-text-muted)] mb-1 block">
              Variável {`{{${varNum}}}`}
            </label>
            <input
              type="text"
              value={values[varNum] || ''}
              onChange={(e) => onChange(varNum, e.target.value)}
              placeholder={`Valor para {{${varNum}}}`}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-lg border',
                'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
                'border-[var(--color-border)] focus:border-[var(--color-primary)]',
                'placeholder:text-[var(--color-text-muted)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20'
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// TEMPLATE PREVIEW
// =============================================================================

interface TemplatePreviewProps {
  template: MessagingTemplate;
  variables: Record<string, string>;
}

function TemplatePreview({ template, variables }: TemplatePreviewProps) {
  const renderText = (text?: string) => {
    if (!text) return '';
    let result = text;
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replaceAll(`{{${key}}}`, value || `{{${key}}}`);
    });
    return result;
  };

  const headerComp = template.components.find((c) => c.type === 'HEADER');
  const bodyComp = template.components.find((c) => c.type === 'BODY');
  const footerComp = template.components.find((c) => c.type === 'FOOTER');
  const buttonsComp = template.components.find((c) => c.type === 'BUTTONS');

  return (
    <div className="bg-[var(--color-bubble-outbound)] rounded-lg p-3 max-w-[280px]">
      {headerComp?.text && (
        <div className="font-medium text-sm text-[var(--color-text-primary)] mb-1">
          {renderText(headerComp.text)}
        </div>
      )}
      {bodyComp?.text && (
        <div className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
          {renderText(bodyComp.text)}
        </div>
      )}
      {footerComp?.text && (
        <div className="text-xs text-[var(--color-text-muted)] mt-2">
          {renderText(footerComp.text)}
        </div>
      )}
      {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--color-border)] space-y-1">
          {buttonsComp.buttons.map((btn, idx) => (
            <div
              key={idx}
              className="text-center text-sm text-[var(--color-primary)] py-1"
            >
              {btn.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TemplateSelector({
  templates,
  isLoading,
  onSelect,
  onCancel,
  className,
}: TemplateSelectorProps) {
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MessagingTemplate | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);

  // Filter approved templates by search
  const filteredTemplates = useMemo(() => {
    const query = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        getTemplatePreview(t).toLowerCase().includes(query)
    );
  }, [templates, search]);

  const handleSelectTemplate = (template: MessagingTemplate) => {
    if (template.status !== 'approved') return;
    setSelectedTemplate(template);
    setVariables({});
    setShowPreview(true);
  };

  const handleVariableChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const handleSend = () => {
    if (!selectedTemplate) return;

    // Check if all variables are filled
    const templateVariables: string[] = [];
    selectedTemplate.components.forEach((comp) => {
      if (comp.text) {
        templateVariables.push(...extractVariables(comp.text));
      }
    });

    const missingVars = templateVariables.filter((v) => !variables[v]?.trim());
    if (missingVars.length > 0) {
      // Could show a toast here
      console.warn('Missing variables:', missingVars);
      return;
    }

    onSelect(selectedTemplate, variables);
  };

  if (isLoading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Selecionar Template
        </h3>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-[var(--color-muted)] transition-colors"
        >
          <X className="w-5 h-5 text-[var(--color-text-muted)]" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Template List */}
        <div className="w-1/2 border-r border-[var(--color-border)] flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-[var(--color-border)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar template..."
                className={cn(
                  'w-full pl-9 pr-3 py-2 text-sm rounded-lg border',
                  'bg-[var(--color-bg)] text-[var(--color-text-primary)]',
                  'border-[var(--color-border)] focus:border-[var(--color-primary)]',
                  'placeholder:text-[var(--color-text-muted)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20'
                )}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-muted)]" />
                <p className="text-sm text-[var(--color-text-muted)]">
                  {search ? 'Nenhum template encontrado' : 'Nenhum template disponível'}
                </p>
              </div>
            ) : (
              filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplate?.id === template.id}
                  onClick={() => handleSelectTemplate(template)}
                />
              ))
            )}
          </div>
        </div>

        {/* Preview & Variables */}
        <div className="w-1/2 flex flex-col">
          {selectedTemplate ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Preview Toggle */}
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span>Prévia da mensagem</span>
                </button>

                {showPreview && (
                  <div className="flex justify-center py-2">
                    <TemplatePreview template={selectedTemplate} variables={variables} />
                  </div>
                )}

                {/* Variables */}
                <VariableForm
                  template={selectedTemplate}
                  values={variables}
                  onChange={handleVariableChange}
                />
              </div>

              {/* Send Button */}
              <div className="p-4 border-t border-[var(--color-border)]">
                <button
                  onClick={handleSend}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg',
                    'bg-[var(--color-primary)] text-white font-medium',
                    'hover:bg-[var(--color-primary-hover)] transition-colors'
                  )}
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar Template</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-muted)]" />
                <p className="text-sm text-[var(--color-text-muted)]">
                  Selecione um template para ver a prévia
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

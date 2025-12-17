/**
 * @fileoverview Assistente de IA (Next-first)
 *
 * Wrapper simples para manter compatibilidade com pontos do app que ainda
 * renderizam `<AIAssistant />`, mas usando o chat oficial do Next em
 * `/api/ai/chat` (AI SDK v6) via `UIChat`.
 */

'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Board } from '@/types';
import { UIChat } from '@/components/ai/UIChat';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: 'overlay' | 'sidebar';
  activeBoard?: Board | null;
  dealId?: string;
  contactId?: string;
  cockpitSnapshot?: unknown;
  /** Força o chat a usar apenas props (sem AIContext) quando necessário. */
  contextMode?: 'auto' | 'props-only';
}

const AIAssistant: React.FC<AIAssistantProps> = ({
  isOpen,
  onClose,
  variant = 'overlay',
  activeBoard,
  dealId,
  contactId,
  cockpitSnapshot,
  contextMode,
}) => {
  if (!isOpen) return null;

  const content = (
    <div className="relative flex h-full w-full flex-col">
      {variant === 'overlay' && (
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/70 text-slate-200 hover:bg-slate-700/70"
            aria-label="Fechar assistente"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <UIChat
          boardId={activeBoard?.id}
          dealId={dealId}
          contactId={contactId}
          cockpitSnapshot={cockpitSnapshot}
          contextMode={contextMode}
          floating={false}
          startMinimized={false}
        />
      </div>
    </div>
  );

  if (variant === 'sidebar') {
    return (
      <aside className="h-full w-full border-l border-slate-700/50 bg-slate-900">
        {content}
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900 shadow-2xl shadow-black/50">
        {content}
      </div>
    </div>
  );
};

export default AIAssistant;

'use client';

/**
 * BoardAgentsSection — lista de boards com controle inline de modo do agente.
 *
 * Cada board exibe 3 pills: Desligado / Observar / Responder.
 * Clicar salva imediatamente. "Personalizar →" abre o wizard completo.
 */

import { useEffect, useState } from 'react';
import { Bot, Settings2, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBoards } from '@/lib/query/hooks';
import { BoardAIConfigModal } from './BoardAIConfigModal';
import type { BoardAIConfig } from '@/lib/ai/messaging/types';

type BoardMode = 'off' | 'observe' | 'respond';

const PILLS: { id: BoardMode; label: string }[] = [
  { id: 'off',     label: 'Desligado' },
  { id: 'observe', label: 'Observar'  },
  { id: 'respond', label: 'Responder' },
];

export function BoardAgentsSection() {
  const { data: boards = [], isLoading } = useBoards();
  const [selectedBoard, setSelectedBoard] = useState<{
    id: string;
    name: string;
    stages: { id: string; name: string; order: number }[];
  } | null>(null);
  const [boardConfigs, setBoardConfigs] = useState<Record<string, BoardAIConfig | null>>({});
  const [loadingBoards, setLoadingBoards] = useState<Set<string>>(new Set());
  const [configsLoaded, setConfigsLoaded] = useState(false);

  // Carrega configs de todos os boards em paralelo ao montar
  useEffect(() => {
    if (boards.length === 0 || configsLoaded) return;

    void (async () => {
      const results = await Promise.allSettled(
        boards.map(async (board) => {
          const res = await fetch(`/api/ai/board-config/${board.id}`);
          if (!res.ok) return { id: board.id, config: null };
          const { config } = await res.json() as { config: BoardAIConfig | null };
          return { id: board.id, config };
        })
      );

      const configs: Record<string, BoardAIConfig | null> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') {
          configs[r.value.id] = r.value.config;
        }
      }
      setBoardConfigs(configs);
      setConfigsLoaded(true);
    })();
  }, [boards, configsLoaded]);

  function getCurrentMode(boardId: string): BoardMode {
    if (!configsLoaded) return 'off';
    const cfg = boardConfigs[boardId];
    if (!cfg) return 'off';
    return cfg.agent_mode === 'respond' ? 'respond' : 'observe';
  }

  async function handleModeChange(boardId: string, mode: BoardMode) {
    setLoadingBoards((prev) => new Set([...prev, boardId]));

    try {
      if (mode === 'off') {
        await fetch(`/api/ai/board-config/${boardId}`, { method: 'DELETE' });
        setBoardConfigs((prev) => ({ ...prev, [boardId]: null }));
      } else {
        const res = await fetch(`/api/ai/board-config/${boardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_mode: mode }),
        });
        if (res.ok) {
          const { config } = await res.json() as { config: BoardAIConfig };
          setBoardConfigs((prev) => ({ ...prev, [boardId]: config }));
        }
      }
    } finally {
      setLoadingBoards((prev) => {
        const next = new Set(prev);
        next.delete(boardId);
        return next;
      });
    }
  }

  async function handleOpen(boardId: string, boardName: string, boardStages: { id: string; name: string; order: number }[]) {
    // Garante config carregada antes de abrir o modal
    if (!(boardId in boardConfigs)) {
      try {
        const res = await fetch(`/api/ai/board-config/${boardId}`);
        if (res.ok) {
          const { config } = await res.json() as { config: BoardAIConfig | null };
          setBoardConfigs((prev) => ({ ...prev, [boardId]: config }));
        }
      } catch {
        setBoardConfigs((prev) => ({ ...prev, [boardId]: null }));
      }
    }
    setSelectedBoard({ id: boardId, name: boardName, stages: boardStages });
  }

  async function handleSave(config: Partial<BoardAIConfig>) {
    if (!selectedBoard) return;
    const res = await fetch(`/api/ai/board-config/${selectedBoard.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Falha ao salvar');
    const { config: saved } = await res.json() as { config: BoardAIConfig };
    setBoardConfigs((prev) => ({ ...prev, [selectedBoard.id]: saved }));
  }

  if (isLoading) {
    return <div className="h-20 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-xl" />;
  }

  if (boards.length === 0) return null;

  return (
    <>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-1.5 bg-violet-100 dark:bg-violet-900/20 rounded-lg text-violet-600 dark:text-violet-400">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Agente por Funil
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ative e ajuste o agente em cada funil independentemente
            </p>
          </div>
        </div>

        {/* Board list */}
        <div className="space-y-2">
          {boards.map((board) => {
            const mode = getCurrentMode(board.id);
            const isThisLoading = loadingBoards.has(board.id) || !configsLoaded;
            const stages = board.stages.map((s, i) => ({
              id: s.id,
              name: s.label,
              order: i,
            }));

            return (
              <div
                key={board.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 transition-colors"
              >
                {/* Board name + mode indicator */}
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0 transition-colors',
                      mode === 'respond'
                        ? 'bg-emerald-500'
                        : mode === 'observe'
                        ? 'bg-amber-400'
                        : 'bg-slate-300 dark:bg-slate-600'
                    )}
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {board.name}
                  </span>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Inline mode pills */}
                  <ModePills
                    mode={mode}
                    isLoading={isThisLoading}
                    onChange={(m) => handleModeChange(board.id, m)}
                  />

                  {/* Personalizar → */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 gap-1"
                    onClick={() => handleOpen(board.id, board.name, stages)}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Personalizar
                    <ChevronRight className="w-3 h-3 opacity-50" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
          <strong>Observar</strong> — lê as mensagens, não responde. &nbsp;
          <strong>Responder</strong> — responde automaticamente. &nbsp;
          &quot;Personalizar&quot; configura persona, objetivo e estágios.
        </p>
      </div>

      {selectedBoard && (
        <BoardAIConfigModal
          boardId={selectedBoard.id}
          boardName={selectedBoard.name}
          stages={selectedBoard.stages}
          existingConfig={boardConfigs[selectedBoard.id]}
          onSave={handleSave}
          onClose={() => setSelectedBoard(null)}
        />
      )}
    </>
  );
}

// =============================================================================
// ModePills — controle segmentado inline (Desligado / Observar / Responder)
// =============================================================================

function ModePills({
  mode,
  isLoading,
  onChange,
}: {
  mode: BoardMode;
  isLoading: boolean;
  onChange: (mode: BoardMode) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden text-xs">
      {PILLS.map((pill, i) => {
        const active = mode === pill.id;
        return (
          <button
            key={pill.id}
            type="button"
            disabled={isLoading}
            onClick={() => !isLoading && onChange(pill.id)}
            className={cn(
              'px-2.5 py-1 font-medium transition-colors relative',
              i > 0 && 'border-l border-slate-200 dark:border-white/10',
              active && pill.id === 'off' &&
                'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200',
              active && pill.id === 'observe' &&
                'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
              active && pill.id === 'respond' &&
                'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
              !active && 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5',
              isLoading && 'cursor-wait opacity-70'
            )}
          >
            {isLoading && active ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              pill.label
            )}
          </button>
        );
      })}
    </div>
  );
}

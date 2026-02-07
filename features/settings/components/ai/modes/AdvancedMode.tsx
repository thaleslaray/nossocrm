'use client';

/**
 * @fileoverview Advanced Mode Component
 *
 * Wrapper para o modo avançado que permite configuração manual por estágio.
 * Reutiliza o StageAIConfig existente mas adiciona um seletor de board.
 *
 * @module features/settings/components/ai/modes/AdvancedMode
 */

import { useState } from 'react';
import { Settings2, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StageAIConfig } from '../../StageAIConfig';
import { useBoards } from '@/lib/query/hooks';
import { cn } from '@/lib/utils';
import type { Board } from '@/types';
import type { OrgAIConfig } from '@/lib/query/hooks/useAIConfigQuery';

// =============================================================================
// Types
// =============================================================================

interface AdvancedModeProps {
  config: OrgAIConfig | null | undefined;
}

// =============================================================================
// Component
// =============================================================================

export function AdvancedMode({ config }: AdvancedModeProps) {
  const { data: boards, isLoading, error } = useBoards();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const activeBoards = boards || [];
  const selectedBoard = activeBoards.find((b) => b.id === selectedBoardId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Erro ao carregar boards: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (activeBoards.length === 0) {
    return (
      <Alert>
        <Settings2 className="h-4 w-4" />
        <AlertDescription>
          Nenhum board encontrado. Crie um board primeiro para configurar o AI Agent.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <div>
        <h4 className="font-medium text-slate-900 dark:text-white mb-1">Configuração Avançada</h4>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure prompts e critérios específicos para cada estágio de cada board.
          Esta é a opção mais flexível para personalizar o comportamento do AI Agent.
        </p>
      </div>

      {/* Board Selector */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          Selecione um Board
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeBoards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              isSelected={selectedBoardId === board.id}
              onClick={() => setSelectedBoardId(board.id)}
            />
          ))}
        </div>
      </div>

      {/* Stage Config */}
      {selectedBoard && selectedBoard.stages && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <StageAIConfig
            boardId={selectedBoard.id}
            stages={selectedBoard.stages.map((s, index) => ({
              id: s.id,
              name: s.label, // Board type uses 'label' not 'name'
              order: index,
            }))}
          />
        </div>
      )}

      {/* No Board Selected */}
      {!selectedBoard && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <Settings2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">Selecione um board acima para configurar os estágios.</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Board Card
// =============================================================================

interface BoardCardProps {
  board: Board;
  isSelected: boolean;
  onClick: () => void;
}

function BoardCard({ board, isSelected, onClick }: BoardCardProps) {
  const stageCount = board.stages?.length || 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left p-4 rounded-lg border transition-all',
        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-500/50'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
      )}
    >
      <h5
        className={cn(
          'font-semibold mb-1',
          isSelected ? 'text-primary-700 dark:text-primary-300' : 'text-slate-900 dark:text-white'
        )}
      >
        {board.name}
      </h5>
      <p className="text-xs text-slate-500 dark:text-slate-400">{stageCount} estágios</p>
    </button>
  );
}

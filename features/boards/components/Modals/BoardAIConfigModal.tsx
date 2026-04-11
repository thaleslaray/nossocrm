import React, { useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { StageAIConfig } from '@/features/settings/components/StageAIConfig';
import { Board } from '@/types';
import { Sparkles } from 'lucide-react';
import { useBoards, useUpdateBoard } from '@/lib/query/hooks/useBoardsQuery';

interface BoardAIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: Board;
}

/**
 * Modal para configurar o AI Agent por estágio do board.
 *
 * Permite que admins definam prompts e comportamentos específicos
 * de AI para cada estágio do funil de vendas.
 */
export const BoardAIConfigModal: React.FC<BoardAIConfigModalProps> = ({
  isOpen,
  onClose,
  board,
}) => {
  const headingId = useId();
  const updateBoard = useUpdateBoard();
  const { data: boards } = useBoards();
  const liveBoard = boards?.find(b => b.id === board.id) ?? board;
  const [goalStageId, setGoalStageId] = useState<string>(liveBoard.agentGoalStageId ?? '');

  useEffect(() => {
    setGoalStageId(liveBoard.agentGoalStageId ?? '');
  }, [liveBoard.agentGoalStageId]);

  // Convert board stages to format expected by StageAIConfig
  const stages = liveBoard.stages.map((stage, index) => ({
    id: stage.id,
    name: stage.label,
    order: index,
  }));

  function handleGoalStageChange(value: string) {
    setGoalStageId(value);
    updateBoard.mutate({
      id: board.id,
      updates: { agentGoalStageId: value || null },
    });
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`🤖 AI Agent — ${board.name}`}
      size="lg"
      labelledById={headingId}
      className="max-w-2xl"
    >
      <div className="p-4 sm:p-6 space-y-6 max-h-[calc(100dvh-12rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-800/10 rounded-xl border border-primary-200/50 dark:border-primary-700/30">
          <div className="flex-shrink-0 w-10 h-10 bg-primary-500/10 dark:bg-primary-500/20 rounded-lg flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary-500" />
          </div>
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">
              AI Agent Autônomo
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Configure prompts específicos para cada estágio. O AI responderá automaticamente
              aos leads seguindo as instruções definidas, com objetivo de avançar no funil.
            </p>
          </div>
        </div>

        {/* Agent Scope */}
        <div className="space-y-2">
          <label
            htmlFor="agent-goal-stage"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            O agente age autonomamente até:
          </label>
          <select
            id="agent-goal-stage"
            value={goalStageId}
            onChange={e => handleGoalStageChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Sem limite (age em todos os estágios com AI habilitado)</option>
            {liveBoard.stages.map(stage => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A partir do estágio seguinte, o agente para de responder automaticamente.
          </p>
        </div>

        {/* Stage AI Config */}
        <StageAIConfig boardId={board.id} stages={stages} goalStageId={goalStageId || undefined} />
      </div>
    </Modal>
  );
};

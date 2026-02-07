import React, { useId } from 'react';
import { Modal } from '@/components/ui/Modal';
import { StageAIConfig } from '@/features/settings/components/StageAIConfig';
import { Board } from '@/types';
import { Sparkles } from 'lucide-react';

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

  // Convert board stages to format expected by StageAIConfig
  const stages = board.stages.map((stage, index) => ({
    id: stage.id,
    name: stage.label,
    order: index,
  }));

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

        {/* Stage AI Config */}
        <StageAIConfig boardId={board.id} stages={stages} />
      </div>
    </Modal>
  );
};

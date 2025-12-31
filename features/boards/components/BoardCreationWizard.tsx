import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Loader2, Send, MessageSquare, LayoutTemplate, AlertCircle, Settings, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BOARD_TEMPLATES, BoardTemplateType } from '@/lib/templates/board-templates';
import {
  generateBoardStructure,
  generateBoardStrategy,
  refineBoardWithAI,
  GeneratedBoard,
} from '@/lib/ai/tasksClient';
import { Board, BoardStage } from '@/types';
import { AIProcessingModal, ProcessingStep, SimulatorPhase } from './Modals/AIProcessingModal';
import { fetchRegistry, fetchTemplateJourney } from '@/lib/templates/registryService';
import { RegistryIndex, RegistryTemplate, JourneyDefinition } from '@/types';
import { OFFICIAL_JOURNEYS } from '@/lib/templates/journey-templates';
import { MODAL_OVERLAY_CLASS } from '@/components/ui/modalStyles';

interface BoardCreationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (board: Omit<Board, 'id' | 'createdAt'>, order?: number) => void;
  /**
   * Async create used for flows that must chain steps and then update boards
   * (ex.: installing Journeys and linking boards via nextBoardId).
   */
  onCreateBoardAsync?: (board: Omit<Board, 'id' | 'createdAt'>, order?: number) => Promise<Board>;
  /** Async update used to set nextBoardId after all boards are created. */
  onUpdateBoardAsync?: (id: string, updates: Partial<Board>) => Promise<void>;
  onOpenCustomModal: () => void;
}

type WizardStep = 'select' | 'ai-input' | 'ai-preview' | 'playbook-preview';
type SelectMode = 'home' | 'browse';
type SelectBrowseFocus = 'playbooks' | 'templates' | 'community';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  proposalData?: GeneratedBoard;
}

// IMPORTANT: Tailwind won't generate arbitrary class names returned by the AI at runtime.
// Keep colors from a fixed palette so preview + created boards always have visible colors.
const AI_STAGE_COLOR_PALETTE = [
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-orange-500',
  'bg-red-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
] as const;

function normalizeAIStageColor(color: string | undefined, index: number) {
  if (color && (AI_STAGE_COLOR_PALETTE as readonly string[]).includes(color)) return color;
  return AI_STAGE_COLOR_PALETTE[index % AI_STAGE_COLOR_PALETTE.length];
}

function normalizeGeneratedBoardColors(board: GeneratedBoard): GeneratedBoard {
  const stages = Array.isArray(board.stages) ? board.stages : [];
  return {
    ...board,
    stages: stages.map((s, idx) => ({
      ...s,
      color: normalizeAIStageColor(s.color, idx),
    })),
  };
}

function normalizeStageLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function guessWonLostStageIds(stages: BoardStage[], opts?: { wonLabel?: string; lostLabel?: string }) {
  const byLabel = new Map<string, string>();
  for (const s of stages) {
    byLabel.set(normalizeStageLabel(s.label), s.id);
  }

  const exactWon = opts?.wonLabel ? byLabel.get(normalizeStageLabel(opts.wonLabel)) : undefined;
  const exactLost = opts?.lostLabel ? byLabel.get(normalizeStageLabel(opts.lostLabel)) : undefined;

  const heuristicWon =
    exactWon
    ?? stages.find(s => /\b(ganho|won|fechado ganho|conclu[ií]do)\b/i.test(s.label))?.id;
  const heuristicLost =
    exactLost
    ?? stages.find(s => /\b(perdido|lost|churn|cancelad[oa])\b/i.test(s.label))?.id;

  return { wonStageId: heuristicWon ?? '', lostStageId: heuristicLost ?? '' };
}

/**
 * Componente React `BoardCreationWizard`.
 *
 * @param {BoardCreationWizardProps} {
  isOpen,
  onClose,
  onCreate,
  onCreateBoardAsync,
  onUpdateBoardAsync,
  onOpenCustomModal,
} - Parâmetro `{
  isOpen,
  onClose,
  onCreate,
  onCreateBoardAsync,
  onUpdateBoardAsync,
  onOpenCustomModal,
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const BoardCreationWizard: React.FC<BoardCreationWizardProps> = ({
  isOpen,
  onClose,
  onCreate,
  onCreateBoardAsync,
  onUpdateBoardAsync,
  onOpenCustomModal,
}) => {
  const router = useRouter();
  const [step, setStep] = useState<'select' | 'ai-input' | 'ai-preview' | 'playbook-preview'>(
    'select'
  );
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string | null>(null);
  // Optional journey flags (shown before installing certain journeys)
  const [includeSubscriptionRenewals, setIncludeSubscriptionRenewals] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedBoard, setGeneratedBoard] = useState<GeneratedBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Simulator State
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('analyzing');
  const [processingPhase, setProcessingPhase] = useState<SimulatorPhase>('structure');
  const [isProcessingModalOpen, setIsProcessingModalOpen] = useState(false);

  // Chat / Refinement State
  const [isChatMode, setIsChatMode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // New: Preview State for Proposals
  const [previewBoard, setPreviewBoard] = useState<GeneratedBoard | null>(null);

  // Registry State
  const [activeTab, setActiveTab] = useState<'official' | 'community'>('official');
  // Jobs-style: progressive disclosure for the initial selection (reduces cognitive load).
  const [selectMode, setSelectMode] = useState<SelectMode>('home');
  const [selectBrowseFocus, setSelectBrowseFocus] = useState<SelectBrowseFocus>('playbooks');
  const [registryIndex, setRegistryIndex] = useState<RegistryIndex | null>(null);
  const [isLoadingRegistry, setIsLoadingRegistry] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<{
    total: number;
    current: number;
    currentBoardName?: string;
  } | null>(null);

  useEffect(() => {
    if (activeTab === 'community' && !registryIndex) {
      setIsLoadingRegistry(true);
      fetchRegistry()
        .then(setRegistryIndex)
        .catch(console.error)
        .finally(() => setIsLoadingRegistry(false));
    }
  }, [activeTab, registryIndex]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isChatMode]);

  const handleReset = () => {
    setStep('select');
    setAiInput('');
    setGeneratedBoard(null);
    setPreviewBoard(null);
    setError(null);
    setIsChatMode(false);
    setChatMessages([]);
    setChatInput('');
    setSelectedPlaybookId(null); // Reset selected playbook
    setIncludeSubscriptionRenewals(false);
    setSelectMode('home');
    setSelectBrowseFocus('playbooks');
    setActiveTab('official');
  };

  const buildRenewalsBoard = (): JourneyDefinition['boards'][number] => {
    return {
      slug: 'renewals',
      // UX: keep the journey list visually consistent (all boards are numbered).
      // This board is inserted after "5. Upsell (Expansão)" when the optional flag is enabled.
      name: '6. Renovações (Assinatura)',
      columns: [
        { name: '180+ dias', color: 'bg-blue-500', linkedLifecycleStage: 'CUSTOMER' },
        { name: '120 dias', color: 'bg-purple-500', linkedLifecycleStage: 'CUSTOMER' },
        { name: '90 dias', color: 'bg-yellow-500', linkedLifecycleStage: 'CUSTOMER' },
        { name: '60 dias', color: 'bg-orange-500', linkedLifecycleStage: 'CUSTOMER' },
        { name: '30 dias', color: 'bg-orange-500', linkedLifecycleStage: 'CUSTOMER' },
        { name: 'Renovado (Ganho)', color: 'bg-green-500', linkedLifecycleStage: 'CUSTOMER' },
        { name: 'Cancelado (Perdido)', color: 'bg-red-500', linkedLifecycleStage: 'OTHER' },
      ],
      strategy: {
        agentPersona: {
          name: 'CS Renewals',
          role: 'Renovações',
          behavior:
            'Trate renovações com rigor comercial. Antecipe risco, mostre valor, alinhe stakeholders e remova fricção do pagamento.',
        },
        goal: {
          description: 'Aumentar taxa de renovação e previsibilidade.',
          kpi: 'Renewal Rate',
          targetValue: '90',
          type: 'percentage',
        },
        entryTrigger:
          'Assinantes com data de renovação aproximando. (Pode ser criado manualmente ou via automação futura.)',
      },
    };
  };

  const getJourneyForInstall = (journeyId: string) => {
    const base = OFFICIAL_JOURNEYS[journeyId];
    if (!base) return null;

    // Only Infoproducer exposes the optional "subscription renewals" step for now.
    if (journeyId !== 'INFOPRODUCER' || !includeSubscriptionRenewals) return base;

    // UX: for infoproducts, it's often easier to understand renewals as "after upsell",
    // even though in practice it runs as a parallel cadence. We keep the board optional.
    const renewalsBoard = buildRenewalsBoard();
    const nextBoards = [...base.boards];
    const expansionIndex = nextBoards.findIndex(b => b.slug === 'expansion');
    const insertAt = expansionIndex >= 0 ? expansionIndex + 1 : nextBoards.length;
    nextBoards.splice(insertAt, 0, renewalsBoard);

    return { ...base, boards: nextBoards };
  };

  const handleTemplateSelect = (templateType: BoardTemplateType) => {
    const template = BOARD_TEMPLATES[templateType];
    // Safety: never create an "empty template" board from this flow.
    // Use "Começar do zero" for custom boards.
    if (!Array.isArray((template as any)?.stages) || (template as any).stages.length === 0) {
      onClose();
      onOpenCustomModal();
      handleReset();
      return;
    }

    // Prefer async creation when available so we can show an "installing" overlay and close after completion.
    if (onCreateBoardAsync) {
      setIsInstalling(true);
      setInstallProgress({ total: 1, current: 1, currentBoardName: template.name });
    }

    const boardStages: BoardStage[] = template.stages.map((s, idx) => ({
      id: crypto.randomUUID(),
      ...s,
    }));

    const guessed = guessWonLostStageIds(boardStages, {
      wonLabel: template.defaultWonStageLabel,
      lostLabel: template.defaultLostStageLabel,
    });

    // Randomize Agent Name (Names ending in 'ia')
    const agentNames = [
      'Sofia',
      'Valeria',
      'Julia',
      'Cecilia',
      'Livia',
      'Vitoria',
      'Alicia',
      'Olivia',
      'Claudia',
      'Silvia',
    ];
    const randomName = agentNames[Math.floor(Math.random() * agentNames.length)];

    const payload: Omit<Board, 'id' | 'createdAt'> = {
      name: template.name,
      description: template.description,
      linkedLifecycleStage: template.linkedLifecycleStage,
      template: templateType,
      stages: boardStages,
      isDefault: false,
      wonStageId: (guessed.wonStageId || null) as any,
      lostStageId: (guessed.lostStageId || null) as any,
      // Strategy Fields
      agentPersona: {
        ...template.agentPersona!,
        name: randomName, // Override with random name
      },
      goal: template.goal,
      entryTrigger: template.entryTrigger,
    };

    if (onCreateBoardAsync) {
      onCreateBoardAsync(payload)
        .then(() => {
          onClose();
          handleReset();
        })
        .catch((err) => {
          console.error('[BoardCreationWizard] Failed to create template board:', err);
          setError('Erro ao criar board do template.');
        })
        .finally(() => {
          setIsInstalling(false);
          setInstallProgress(null);
        });
    } else {
      // Fallback: fire-and-forget (no progress overlay available)
      onCreate(payload);
      onClose();
      handleReset();
    }
  };

  const handleInstallJourney = async (templatePath: string) => {
    setIsInstalling(true);
    setInstallProgress(null);
    try {
      const journey = await fetchTemplateJourney(templatePath);

      // Install all boards in the journey with sequential order
      const createdBoards: Board[] = [];
      const totalBoards = journey.boards.length;
      setInstallProgress({ total: totalBoards, current: 0 });
      for (let i = 0; i < journey.boards.length; i++) {
        const boardDef = journey.boards[i];
        setInstallProgress({ total: totalBoards, current: i + 1, currentBoardName: boardDef.name });
        const boardStages: BoardStage[] = boardDef.columns.map(c => ({
          id: crypto.randomUUID(),
          label: c.name,
          color: c.color || 'bg-slate-500',
          linkedLifecycleStage: c.linkedLifecycleStage,
        }));

        const guessed = guessWonLostStageIds(boardStages);
        const inferredBoardLifecycleStage = boardDef.columns.find(c => c.linkedLifecycleStage)?.linkedLifecycleStage;

        const payload: Omit<Board, 'id' | 'createdAt'> = {
          name: boardDef.name,
          description: `Parte da jornada: ${journey.boards.length > 1 ? 'Sim' : 'Não'}`,
          // Community journeys may not declare board-level linkage. We infer it from the first column that has linkage.
          linkedLifecycleStage: inferredBoardLifecycleStage,
          template: 'CUSTOM',
          stages: boardStages,
          isDefault: false,
          wonStageId: guessed.wonStageId || undefined,
          lostStageId: guessed.lostStageId || undefined,
          // Strategy
          agentPersona: boardDef.strategy?.agentPersona,
          goal: boardDef.strategy?.goal,
          entryTrigger: boardDef.strategy?.entryTrigger,
        };

        if (onCreateBoardAsync) {
          const created = await onCreateBoardAsync(payload, i);
          createdBoards.push(created);
        } else {
          onCreate(payload, i); // Pass index as relative order
        }
      }

      // Link boards sequentially (handoff) when async updater is available.
      if (onUpdateBoardAsync && createdBoards.length > 1) {
        for (let i = 0; i < createdBoards.length - 1; i += 1) {
          await onUpdateBoardAsync(createdBoards[i].id, { nextBoardId: createdBoards[i + 1].id });
        }
      }

      onClose();
      handleReset();
    } catch (error) {
      console.error('Failed to install journey:', error);
      setError('Erro ao instalar template da comunidade.');
    } finally {
      setIsInstalling(false);
      setInstallProgress(null);
    }
  };

  const handleInstallOfficialJourney = async (journeyId: string) => {
    if (!OFFICIAL_JOURNEYS) return;
    const journey = getJourneyForInstall(journeyId);
    if (!journey) return;
    setIsInstalling(true);
    setInstallProgress({ total: journey.boards.length, current: 0 });

    const wonLostByJourneyAndSlug: Record<string, Record<string, { wonLabel?: string; lostLabel?: string; wonArchive?: boolean }>> = {
      INFOPRODUCER: {
        sales: { wonLabel: 'Matriculado (Ganho)', lostLabel: 'Não comprou (Perdido)' },
        onboarding: { wonLabel: 'Primeiro Resultado (Ganho)' },
        cs: { wonArchive: true, lostLabel: 'Churn' },
        expansion: { wonLabel: 'Upsell Fechado (Ganho)', lostLabel: 'Perdido' },
        renewals: { wonLabel: 'Renovado (Ganho)', lostLabel: 'Cancelado (Perdido)' },
      },
      B2B_MACHINE: {
        onboarding: { wonLabel: 'Go Live' },
        cs: { wonArchive: true, lostLabel: 'Churn' },
        expansion: { wonLabel: 'Upsell Fechado', lostLabel: 'Perdido' },
      },
      SIMPLE_SALES: {
        'sales-simple': { wonLabel: 'Ganho', lostLabel: 'Perdido' },
      },
    };

    // For official journeys we can safely set the board-level lifecycle linkage,
    // so the UI/analytics can understand the "handoff" between boards.
    const boardLifecycleBySlug: Record<string, string | undefined> = {
      sdr: BOARD_TEMPLATES.PRE_SALES.linkedLifecycleStage,
      sales: BOARD_TEMPLATES.SALES.linkedLifecycleStage,
      onboarding: BOARD_TEMPLATES.ONBOARDING.linkedLifecycleStage,
      cs: BOARD_TEMPLATES.CS.linkedLifecycleStage,
      renewals: 'CUSTOMER',
      expansion: 'CUSTOMER',
      'sales-simple': BOARD_TEMPLATES.SALES.linkedLifecycleStage,
    };

    // Install all boards in the journey with sequential order
    // Each board gets an incrementing order to maintain sequence
    const createdBoards: Board[] = [];
    for (let i = 0; i < journey.boards.length; i++) {
      const boardDef = journey.boards[i];
      setInstallProgress({ total: journey.boards.length, current: i + 1, currentBoardName: boardDef.name });
      const boardStages: BoardStage[] = boardDef.columns.map(c => ({
        id: crypto.randomUUID(),
        label: c.name,
        color: c.color || 'bg-slate-500',
        linkedLifecycleStage: c.linkedLifecycleStage,
      }));

      const templateBySlug: Record<string, BoardTemplateType> = {
        sdr: 'PRE_SALES',
        sales: 'SALES',
        onboarding: 'ONBOARDING',
        cs: 'CS',
        renewals: 'CUSTOM',
        expansion: 'CUSTOM',
        'sales-simple': 'SALES',
      };
      const template = BOARD_TEMPLATES[templateBySlug[boardDef.slug] ?? 'CUSTOM'];
      const overrides = wonLostByJourneyAndSlug[journeyId]?.[boardDef.slug] || {};
      const guessed = guessWonLostStageIds(boardStages, {
        wonLabel: overrides.wonLabel ?? template.defaultWonStageLabel,
        lostLabel: overrides.lostLabel ?? template.defaultLostStageLabel,
      });

      // Pass index as order - this will be added to the current max order in the service
      const payload: Omit<Board, 'id' | 'createdAt'> = {
        name: boardDef.name,
        description: `Parte da jornada: ${journey.boards.length > 1 ? 'Sim' : 'Não'}`,
        linkedLifecycleStage: boardLifecycleBySlug[boardDef.slug],
        template: 'CUSTOM',
        stages: boardStages,
        isDefault: false,
        wonStageId: overrides.wonArchive ? undefined : (guessed.wonStageId || undefined),
        lostStageId: guessed.lostStageId || undefined,
        wonStayInStage: overrides.wonArchive ? true : false,
        agentPersona: boardDef.strategy?.agentPersona,
        goal: boardDef.strategy?.goal,
        entryTrigger: boardDef.strategy?.entryTrigger,
      };

      if (onCreateBoardAsync) {
        const created = await onCreateBoardAsync(payload, i);
        createdBoards.push(created);
      } else {
        onCreate(payload, i); // Pass index as relative order
      }
    }

    // Link boards with an explicit handoff chain for official journeys.
    // Market-aligned: keep the core revenue journey chained (SDR → Sales → Onboarding → CS Health).
    // Expansion/Upsell is a separate commercial pipeline and should NOT be auto-chained by default.
    if (onUpdateBoardAsync && createdBoards.length > 0) {
      const bySlug = new Map<string, Board>();
      for (let i = 0; i < createdBoards.length; i += 1) {
        bySlug.set(journey.boards[i]?.slug, createdBoards[i]);
      }

      const chain: Array<[string, string | null]> = [
        ['sdr', 'sales'],
        ['sales', 'onboarding'],
        ['onboarding', 'cs'],
        ['cs', null],
        // renewals + expansion intentionally left unlinked
      ];

      for (const [from, to] of chain) {
        const fromBoard = bySlug.get(from);
        if (!fromBoard) continue;
        const toBoard = to ? bySlug.get(to) : undefined;
        await onUpdateBoardAsync(fromBoard.id, { nextBoardId: toBoard?.id });
      }
    }

    onClose();
    handleReset();
    setIsInstalling(false);
    setInstallProgress(null);
  };

  const handleAIGenerate = async () => {
    if (!aiInput.trim()) return;

    setIsGenerating(true);
    setIsProcessingModalOpen(true);
    setProcessingPhase('structure');
    setProcessingStep('analyzing');
    setError(null);

    // Artificial delay for "Analyzing..."
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      // Step 1: Structure
      setProcessingStep('structure');
      const boardData = await generateBoardStructure(aiInput, []);

      // Placeholder Strategy (Will be generated in Phase 2)
      const placeholderStrategy = {
        goal: { description: 'Será definida na criação', kpi: '...', targetValue: '...' },
        agentPersona: { name: '...', role: '...', behavior: '...' },
        entryTrigger: '...',
      };

      // Merge Results - normalize boardName to name
      const finalBoard: GeneratedBoard = {
        name: boardData.boardName, // Required field
        description: boardData.description,
        stages: normalizeGeneratedBoardColors({
          name: boardData.boardName,
          description: boardData.description,
          stages: boardData.stages,
          automationSuggestions: boardData.automationSuggestions,
          goal: placeholderStrategy.goal,
          agentPersona: placeholderStrategy.agentPersona,
          entryTrigger: placeholderStrategy.entryTrigger,
          confidence: 0.9,
        }).stages,
        automationSuggestions: boardData.automationSuggestions,
        ...placeholderStrategy,
        confidence: 0.9,
      };

      if (finalBoard.confidence < 0.6) {
        setError(
          'Não consegui entender bem seu negócio. Tente descrever de forma diferente ou escolha um template.'
        );
        setIsGenerating(false);
        setIsProcessingModalOpen(false);
        return;
      }

      // Finalizing
      setProcessingStep('finalizing');
      await new Promise(resolve => setTimeout(resolve, 800));

      setProcessingStep('complete');
      await new Promise(resolve => setTimeout(resolve, 500));

      setGeneratedBoard(finalBoard);
      setStep('ai-preview');
    } catch (err) {
      console.error(err);
      const message = (err as any)?.message;
      setError(message || 'Erro ao gerar board. Tente novamente ou escolha um template.');
    } finally {
      setIsGenerating(false);
      setIsProcessingModalOpen(false);
    }
  };

  const handleRefineBoard = async () => {
    if (!chatInput.trim() || !generatedBoard) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsRefining(true);

    try {
      // Use the board currently being previewed as the base for refinement,
      // otherwise use the last generated/applied board.
      const boardToRefine = previewBoard || generatedBoard;

      const response = await refineBoardWithAI(
        boardToRefine,
        userMessage,
        chatMessages.map(m => ({ role: m.role, content: m.content }))
      );

      // Check if the board actually changed
      const hasChanges =
        response.board && JSON.stringify(response.board) !== JSON.stringify(boardToRefine);

      const proposalData = hasChanges && response.board ? normalizeGeneratedBoardColors(response.board) : undefined;

      setChatMessages(prev => [
        ...prev,
        {
          role: 'ai',
          content:
            response.message +
            (!hasChanges && response.board ? '\n\n*(O board não sofreu alterações visuais)*' : ''),
          proposalData,
        },
      ]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [
        ...prev,
        {
          role: 'ai',
          content: 'Desculpe, tive um problema ao tentar ajustar o board. Pode tentar de novo?',
        },
      ]);
    } finally {
      setIsRefining(false);
    }
  };

  const handleApplyProposal = (proposal: GeneratedBoard) => {
    setGeneratedBoard(normalizeGeneratedBoardColors(proposal));
    setPreviewBoard(null); // Clear preview since it's now the actual board
    setChatMessages(prev => [
      ...prev,
      { role: 'ai', content: '✅ Alterações aplicadas com sucesso!' },
    ]);
  };

  const handlePreviewToggle = (proposal: GeneratedBoard) => {
    if (previewBoard === proposal) {
      setPreviewBoard(null); // Turn off preview
    } else {
      setPreviewBoard(normalizeGeneratedBoardColors(proposal)); // Turn on preview (ensure safe colors)
    }
  };

  const handleCreateFromAI = async () => {
    // Use previewBoard if active, otherwise generatedBoard
    const boardToCreateRaw = previewBoard || generatedBoard;
    const boardToCreate = boardToCreateRaw ? normalizeGeneratedBoardColors(boardToCreateRaw) : null;
    if (!boardToCreate) return;

    // PHASE 2: Generate Strategy (The "Simulator 2")
    setIsProcessingModalOpen(true);
    setProcessingPhase('strategy');
    setProcessingStep('analyzing'); // Start with "Reading Context..."

    // Artificial delay to show the "Reading Context" step
    await new Promise(resolve => setTimeout(resolve, 1500));

    setProcessingStep('strategy'); // Move to "Defining Strategy"

    let finalStrategy = {
      goal: boardToCreate.goal,
      agentPersona: boardToCreate.agentPersona,
      entryTrigger: boardToCreate.entryTrigger,
    };

    try {
      // Generate fresh strategy based on the FINAL board structure
      // Convert GeneratedBoard to BoardStructureResult format
      const boardForStrategy = {
        boardName: boardToCreate.name,
        description: boardToCreate.description,
        stages: boardToCreate.stages,
        automationSuggestions: boardToCreate.automationSuggestions,
      };
      const strategyData = await generateBoardStrategy(boardForStrategy);
      finalStrategy = strategyData;

      setProcessingStep('finalizing');
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (error) {
      console.error('Error generating strategy in Phase 2:', error);
      // Fallback to placeholders if fails, but don't block creation
    }

    setProcessingStep('complete');
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsProcessingModalOpen(false);

    // CRASH FIX: Ensure stages is an array
    const stagesToMap = Array.isArray(boardToCreate.stages) ? boardToCreate.stages : [];

    if (stagesToMap.length === 0) {
      console.error('Board creation failed: No stages defined', boardToCreate);
      setError('Erro: O board gerado não possui estágios válidos. Tente gerar novamente.');
      return;
    }

    const boardStages: BoardStage[] = stagesToMap.map(s => ({
      id: crypto.randomUUID(),
      label: s.name || 'Nova Etapa',
      color: s.color || 'bg-slate-500',
      linkedLifecycleStage: s.linkedLifecycleStage, // Apply AI automation suggestion
    }));

    // Randomize Agent Name (Names ending in 'ia')
    const agentNames = [
      'Sofia',
      'Valeria',
      'Julia',
      'Cecilia',
      'Livia',
      'Vitoria',
      'Alicia',
      'Olivia',
      'Claudia',
      'Silvia',
    ];
    const randomName = agentNames[Math.floor(Math.random() * agentNames.length)];

    // Apply strategy and randomize name
    const finalAgentPersona = finalStrategy.agentPersona
      ? {
        ...finalStrategy.agentPersona,
        name: randomName,
        // Replace occurrences of the old name in behavior and role
        behavior: finalStrategy.agentPersona.behavior.replace(
          new RegExp(finalStrategy.agentPersona.name, 'g'),
          randomName
        ),
        role: finalStrategy.agentPersona.role.replace(
          new RegExp(finalStrategy.agentPersona.name, 'g'),
          randomName
        ),
      }
      : undefined;

    // IMPORTANT: Use boardToCreate.name (not .boardName)
    // The AI returns boardName, but it's normalized to 'name' at line ~256
    // See regression tests in BoardCreationWizard.test.tsx
    onCreate({
      name: boardToCreate.name,
      description: boardToCreate.description,
      linkedLifecycleStage: boardToCreate.linkedLifecycleStage,
      template: 'CUSTOM',
      stages: boardStages,
      isDefault: false,
      automationSuggestions: boardToCreate.automationSuggestions,
      // Strategy Fields (Freshly Generated)
      agentPersona: finalAgentPersona,
      goal: finalStrategy.goal,
      entryTrigger: finalStrategy.entryTrigger,
    });

    onClose();
    handleReset();
  };

  const startChatMode = () => {
    setIsChatMode(true);
    setChatMessages([
      {
        role: 'ai',
        content:
          'O que você gostaria de ajustar neste board? Posso adicionar etapas, mudar nomes ou sugerir novas automações.',
      },
    ]);
  };

  // Determine which board to display
  const displayBoard = previewBoard || generatedBoard;

  const isSelectHome = step === 'select' && selectMode === 'home' && !isChatMode;
  const isSelectBrowse = step === 'select' && selectMode === 'browse' && !isChatMode;
  const isAIInputStep = step === 'ai-input' && !isChatMode;
  const isAIPreviewStep = step === 'ai-preview' && !isChatMode;
  const isPlaybookPreviewStep = step === 'playbook-preview' && !isChatMode;
  // Avoid conflicting max-width classes (Tailwind order can make `lg:max-w-5xl` win).
  const panelMaxWidthClass = isChatMode
    ? 'lg:max-w-5xl'
    : isSelectHome
      ? 'sm:max-w-xl lg:max-w-xl'
      : isSelectBrowse
        ? 'sm:max-w-2xl lg:max-w-2xl'
        : isAIInputStep
          ? 'sm:max-w-2xl lg:max-w-2xl'
          : isAIPreviewStep
            ? 'sm:max-w-4xl lg:max-w-4xl'
            : isPlaybookPreviewStep
              ? 'sm:max-w-4xl lg:max-w-4xl'
              : 'lg:max-w-5xl';

  if (!isOpen) return null;

  return (
    <div className={MODAL_OVERLAY_CLASS}>
      {isInstalling && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center"
          role="status"
          aria-live="polite"
          aria-busy="true"
          // Block all pointer events to the wizard while installing
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {/* Darken + blur the background to keep progress modal in focus */}
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          <div
            className="relative z-10 w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur p-5 shadow-2xl"
            aria-label={installProgress && installProgress.total === 1 ? 'Criando board' : 'Instalando funil'}
          >
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 animate-spin text-primary-500" size={22} />
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-900 dark:text-white">
                  {installProgress && installProgress.total === 1 ? 'Criando board…' : 'Instalando funil…'}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {installProgress
                    ? `Criando board ${installProgress.current}/${installProgress.total}${installProgress.currentBoardName ? ` — ${installProgress.currentBoardName}` : ''}`
                    : 'Preparando…'}
                </div>
              </div>
            </div>
            {installProgress && installProgress.total > 0 && (
              <div className="mt-4">
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, (installProgress.current / installProgress.total) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <AIProcessingModal
        isOpen={isProcessingModalOpen}
        currentStep={processingStep}
        phase={processingPhase}
      />
      {/* Click-outside closes */}
      <div className="absolute inset-0" onClick={isInstalling ? undefined : onClose} />

      <div
        // NOTE: we hard-cap width/height by viewport to avoid overflow on small screens.
        // `dvh` handles mobile browser chrome better than `vh`.
        className={`relative z-10 w-full h-full sm:h-auto ${panelMaxWidthClass} bg-white dark:bg-dark-card rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(90dvh-1rem)] sm:max-h-[calc(90dvh-2rem)] transition-all duration-300`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-200 dark:border-white/10 shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {isChatMode ? (
              <>
                <MessageSquare size={24} className="text-primary-500" /> Refinar com IA
              </>
            ) : (
              'Criar Novo Board'
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Content Body */}
        <div className={`flex flex-1 overflow-hidden ${isChatMode ? 'flex-col lg:flex-row' : 'flex-col'}`}>
          {/* Chat Section (Only in Chat Mode) */}
          {isChatMode && (
            <div className="h-[38vh] lg:h-auto w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-white/10 flex flex-col bg-slate-50 dark:bg-dark-bg/50">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] p-3 rounded-xl text-sm whitespace-pre-wrap ${msg.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-none'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none'
                        }`}
                    >
                      {msg.content
                        .split(/(\*\*.*?\*\*)/)
                        .map((part, i) =>
                          part.startsWith('**') && part.endsWith('**') ? (
                            <strong key={i}>{part.slice(2, -2)}</strong>
                          ) : (
                            part
                          )
                        )}
                    </div>

                    {/* Proposal Actions */}
                    {msg.proposalData && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handlePreviewToggle(msg.proposalData!)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1 ${previewBoard === msg.proposalData
                            ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-500/50 dark:text-blue-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                        >
                          {previewBoard === msg.proposalData
                            ? '👁️ Esconder Preview'
                            : '👁️ Ver Preview'}
                        </button>
                        <button
                          onClick={() => handleApplyProposal(msg.proposalData!)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors flex items-center gap-1"
                        >
                          ✅ Aplicar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {isRefining && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 p-3 rounded-xl rounded-bl-none flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-primary-500" />
                      <span className="text-xs text-slate-500">
                        Pensando...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !isRefining) handleRefineBoard();
                    }}
                    placeholder="Ex: Adicione uma etapa de 'Negociação'..."
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    disabled={isRefining}
                  />
                  <button
                    onClick={handleRefineBoard}
                    disabled={!chatInput.trim() || isRefining}
                    className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Content / Preview Section */}
          <div
            className={`flex-1 overflow-y-auto custom-scrollbar ${isSelectHome ? 'p-4 sm:p-4' : 'p-4 sm:p-6'} ${isChatMode ? 'bg-slate-100 dark:bg-black/20' : ''}`}
          >
            {step === 'select' && (
              <div className="space-y-6">
                {selectMode === 'home' ? (
                  <div className="mx-auto w-full">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white text-center">
                      Como você quer começar?
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-center">
                      Escolha um caminho. O resto aparece depois.
                    </p>

                    {/* Primary CTA: AI */}
                    <button
                      onClick={() => setStep('ai-input')}
                      className="mt-4 w-full relative overflow-hidden p-1 rounded-2xl group transition-all hover:shadow-lg hover:shadow-primary-500/20"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-95 group-hover:opacity-100 transition-opacity" />
                      <div className="relative bg-white dark:bg-slate-900 rounded-[14px] px-4 py-3 flex items-center justify-center gap-3 transition-colors group-hover:bg-opacity-90 dark:group-hover:bg-opacity-90">
                        <Sparkles
                          size={18}
                          className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-pink-500"
                        />
                        <div className="flex flex-col items-center leading-tight">
                          <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-pink-600 dark:from-indigo-400 dark:to-pink-400">
                            Criar com IA
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Em 1 frase, eu monto o board pra você.
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Compact chooser list */}
                    <div className="mt-3 space-y-2">
                      <button
                        onClick={() => {
                          setSelectMode('browse');
                          setSelectBrowseFocus('playbooks');
                          setActiveTab('official');
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                            <LayoutTemplate className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              Usar um playbook (recomendado)
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Jornada completa pronta para usar.
                            </div>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setSelectMode('browse');
                          setSelectBrowseFocus('templates');
                          setActiveTab('official');
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                            <Settings className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              Usar template individual
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Um board pronto (Pré-venda, Vendas, CS…).
                            </div>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          // UX: open editor immediately (same "one click" feeling as picking a template).
                          onClose();
                          onOpenCustomModal();
                          handleReset();
                        }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                            <Plus className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white">Começar do zero</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Um board em branco.
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="mt-3 text-center">
                      <button
                        onClick={() => {
                          setSelectMode('browse');
                          setSelectBrowseFocus('community');
                          setActiveTab('community');
                        }}
                        className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      >
                        Ver templates da comunidade →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => setSelectMode('home')}
                        className="px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors font-medium"
                      >
                        ← Voltar
                      </button>

                      <div className="flex p-1 bg-slate-100 dark:bg-white/5 rounded-xl">
                        <button
                          onClick={() => {
                            setSelectBrowseFocus('playbooks');
                            setActiveTab('official');
                          }}
                          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${selectBrowseFocus === 'playbooks'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                          Playbooks
                        </button>
                        <button
                          onClick={() => {
                            setSelectBrowseFocus('templates');
                            setActiveTab('official');
                          }}
                          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${selectBrowseFocus === 'templates'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                          Templates
                        </button>
                        <button
                          onClick={() => {
                            setSelectBrowseFocus('community');
                            setActiveTab('community');
                          }}
                          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${selectBrowseFocus === 'community'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                          Comunidade
                        </button>
                      </div>
                    </div>

                    {selectBrowseFocus === 'playbooks' && (
                      <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-2 text-center">
                          <span className="text-yellow-500">⭐</span> Playbooks (Jornadas)
                        </h3>
                        <div className="flex flex-col gap-3">
                          {OFFICIAL_JOURNEYS &&
                            Object.values(OFFICIAL_JOURNEYS).map(journey => (
                              <button
                                key={journey.id}
                                onClick={() => {
                                  setSelectedPlaybookId(journey.id);
                                  setStep('playbook-preview');
                                }}
                                className="group relative w-full text-left overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-all duration-200 shadow-sm hover:shadow-md"
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-primary-50/50 to-transparent dark:from-primary-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="relative p-4 flex items-center gap-3">
                                  <div className="w-10 h-10 flex items-center justify-center bg-primary-50 dark:bg-primary-900/20 rounded-lg text-xl shrink-0 group-hover:scale-110 transition-transform duration-300">
                                    {journey.icon}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                                      {journey.name}
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                                      {journey.description}
                                    </p>
                                  </div>
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-400 text-xs">
                                      →
                                    </div>
                                  </div>
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    {selectBrowseFocus === 'templates' && (
                      <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">
                          Boards Individuais
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {(Object.keys(BOARD_TEMPLATES) as BoardTemplateType[])
                            // UX: "Personalizado" (CUSTOM) has zero stages and duplicates "Começar do zero".
                            // Keeping it here causes creation of an empty board that looks like a bug.
                            .filter((key) => key !== 'CUSTOM')
                            .map(key => {
                            const template = BOARD_TEMPLATES[key];
                            return (
                              <button
                                key={key}
                                onClick={() => {
                                  handleTemplateSelect(key);
                                }}
                                className="p-4 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl hover:border-primary-500/50 dark:hover:border-primary-500/50 hover:shadow-md transition-all text-left group flex flex-col h-full min-h-[140px]"
                              >
                                <div className="flex items-center gap-3 mb-3 shrink-0">
                                  <span className="text-2xl group-hover:scale-110 transition-transform duration-200">
                                    {template.emoji}
                                  </span>
                                  <h4 className="font-semibold text-slate-900 dark:text-white text-base group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">
                                    {template.name}
                                  </h4>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 flex-1">
                                  {template.description}
                                </p>
                                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex gap-2 shrink-0 overflow-hidden">
                                  {template.tags.slice(0, 2).map((tag, tagIndex) => (
                                    <span
                                      key={`${key}-tag-${tagIndex}`}
                                      className="px-2 py-1 rounded-md bg-slate-50 dark:bg-white/5 text-[10px] font-medium text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-white/5 whitespace-nowrap"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectBrowseFocus === 'community' && (
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                          Templates da Comunidade
                        </h3>

                        {isLoadingRegistry ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="animate-spin text-primary-500" size={32} />
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-4 mb-6">
                            {registryIndex?.templates.map(template => (
                              <button
                                key={template.id}
                                onClick={() => handleInstallJourney(template.path)}
                                disabled={isInstalling}
                                className="p-4 border-2 border-slate-200 dark:border-white/10 rounded-xl hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all text-left group disabled:opacity-50"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 flex items-center gap-2">
                                    🚀 {template.name}
                                    <span className="text-xs bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full text-slate-500">
                                      v{template.version}
                                    </span>
                                  </h4>
                                  {isInstalling && (
                                    <Loader2 className="animate-spin text-primary-500" size={16} />
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                                  {template.description}
                                </p>
                                <div className="flex gap-2 flex-wrap">
                                  {template.tags.map((tag, tagIndex) => (
                                    <span
                                      key={`${template.id}-tag-${tagIndex}`}
                                      className="px-2 py-1 rounded-md bg-white dark:bg-black/20 text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                  <span className="text-xs text-slate-400 ml-auto">
                                    por {template.author}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Removed 'Create with AI' from here to move to footer */}
              </div>
            )}

            {step === 'playbook-preview' && selectedPlaybookId && (
              <div className="h-full flex flex-col bg-slate-50 dark:bg-black/20 -m-6">
                {/* Header - Compact & Professional */}
                <div className="bg-white dark:bg-dark-card border-b border-slate-200 dark:border-white/10 py-5 px-8 shrink-0">
                  <div className="flex items-center gap-5">
                    {/* System Icon */}
                    <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/20 rounded-xl flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-500/20 shrink-0">
                      <LayoutTemplate className="w-6 h-6" />
                    </div>

                    {/* Text Content */}
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        {OFFICIAL_JOURNEYS[selectedPlaybookId].name}
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wide border border-slate-200 dark:border-white/10">
                          Playbook Oficial
                        </span>
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl leading-relaxed">
                        {OFFICIAL_JOURNEYS[selectedPlaybookId].description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Journey Timeline */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                  <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="h-px flex-1 bg-slate-300 dark:bg-white/10" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Jornada do Cliente ({(getJourneyForInstall(selectedPlaybookId)?.boards ?? OFFICIAL_JOURNEYS[selectedPlaybookId].boards).length}{' '}
                        Etapas)
                      </span>
                      <div className="h-px flex-1 bg-slate-300 dark:bg-white/10" />
                    </div>

                    {selectedPlaybookId === 'INFOPRODUCER' && (
                      <div className="mb-6 p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card">
                        <div className="flex items-start gap-3">
                          <input
                            id="include-renewals"
                            type="checkbox"
                            checked={includeSubscriptionRenewals}
                            onChange={e => setIncludeSubscriptionRenewals(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                          <div className="flex-1">
                            <label htmlFor="include-renewals" className="font-semibold text-slate-900 dark:text-white">
                              Incluir Renovações (Assinatura)
                            </label>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                              Adiciona um board opcional para controlar renovações com antecedência (180/120/90/60/30 dias).
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-8 relative">
                      {/* Vertical Line - Connected to cards */}
                      <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-200 dark:bg-white/10" />

                      {(getJourneyForInstall(selectedPlaybookId)?.boards ?? OFFICIAL_JOURNEYS[selectedPlaybookId].boards).map((board, index) => (
                        <div key={index} className="relative pl-20 group">
                          {/* Number Bubble - Vertically Centered */}
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white dark:bg-dark-card border-2 border-slate-200 dark:border-white/10 flex items-center justify-center text-lg font-bold text-slate-400 shadow-sm z-10 group-hover:border-primary-500 group-hover:text-primary-600 dark:group-hover:text-primary-400 group-hover:scale-110 transition-all duration-300">
                            {index + 1}
                          </div>

                          {/* Card */}
                          <div className="bg-white dark:bg-dark-card rounded-2xl border border-slate-200 dark:border-white/10 p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:border-primary-500/30 group-hover:-translate-y-1">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                {board.name}
                              </h4>
                              <div className="flex gap-2">
                                {index === 0 && (
                                  <span className="px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold uppercase tracking-wide">
                                    Início
                                  </span>
                                )}
                                {index ===
                                  (getJourneyForInstall(selectedPlaybookId)?.boards ?? OFFICIAL_JOURNEYS[selectedPlaybookId].boards).length - 1 && (
                                    <span className="px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] font-bold uppercase tracking-wide">
                                      Fim
                                    </span>
                                  )}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                                Etapas do Funil
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {board.columns.map((column, i) => (
                                  <div key={i} className="flex items-center group/tag">
                                    <span className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/5 group-hover/tag:border-primary-200 dark:group-hover/tag:border-primary-500/30 group-hover/tag:bg-primary-50 dark:group-hover/tag:bg-primary-900/20 transition-colors">
                                      {column.name}
                                    </span>
                                    {i < board.columns.length - 1 && (
                                      <span className="mx-2 text-slate-300 dark:text-slate-600">
                                        →
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'ai-input' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={20} className="text-primary-600 dark:text-primary-400" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Descreva seu negócio em 1 frase:
                    </h3>
                  </div>

                  <input
                    type="text"
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    placeholder="Ex: Sou tatuador, Vendo cursos online, Consultoria de TI..."
                    className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAIGenerate();
                    }}
                  />

                  {error && (
                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                      <button
                        onClick={() => {
                          onClose();
                          router.push('/settings/ai#ai-config');
                        }}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-white/10 hover:bg-slate-50 dark:hover:bg-white/15 text-slate-800 dark:text-white font-semibold rounded-lg border border-slate-200 dark:border-white/10 transition-colors"
                        type="button"
                      >
                        <Settings size={16} />
                        Configurar IA
                      </button>
                    </div>
                  )}

                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    💡 A IA vai criar um board personalizado para você!
                  </p>
                </div>
              </div>
            )}

            {step === 'ai-preview' && displayBoard && (
              <div className="space-y-6">
                {!isChatMode && (
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={20} className="text-green-600 dark:text-green-400" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Board Sugerido pela IA
                    </h3>
                  </div>
                )}

                {previewBoard && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/20 p-3 rounded-lg mb-4 flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <span className="text-lg">👁️</span>
                    <span className="text-sm font-medium">Visualizando Sugestão (Não salvo)</span>
                  </div>
                )}

                <div
                  className={`p-4 rounded-xl border ${isChatMode ? 'bg-white dark:bg-dark-card border-slate-200 dark:border-white/10 shadow-sm' : 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-500/20'}`}
                >
                  <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    📋 {displayBoard.boardName}
                  </h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    {displayBoard.description}
                  </p>

                  <div className="space-y-2">
                    {displayBoard.stages.map((stage, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-white dark:bg-dark-card rounded-lg border border-slate-100 dark:border-white/5"
                      >
                        <span className="text-lg font-semibold text-slate-400 w-6">{idx + 1}</span>
                        <div className={`w-3 h-3 rounded-full shrink-0 ${stage.color}`} />
                        <div className="flex-1">
                          <h5 className="font-semibold text-slate-900 dark:text-white">
                            {stage.name}
                          </h5>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {stage.description}
                          </p>
                        </div>
                        {stage.estimatedDuration && (
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {stage.estimatedDuration}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {displayBoard.automationSuggestions &&
                    displayBoard.automationSuggestions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          💡 Automações sugeridas:
                        </p>
                        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                          {displayBoard.automationSuggestions.map((suggestion, idx) => (
                            <li key={idx}>→ {suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Fixed Actions (only when we actually have actions) */}
        {step !== 'select' && (
          <div className="p-6 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card shrink-0">
          {step === 'playbook-preview' && selectedPlaybookId && (
            <div className="flex gap-3 justify-between items-center w-full">
              <button
                onClick={() => {
                  setStep('select');
                  setSelectedPlaybookId(null);
                }}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors font-medium"
              >
                ← Voltar
              </button>
              <button
                onClick={() => handleInstallOfficialJourney(selectedPlaybookId)}
                className="px-8 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl transition-all shadow-lg hover:shadow-primary-500/25 font-bold flex items-center gap-2"
              >
                <span className="text-lg">🚀</span> Instalar Playbook Completo
              </button>
            </div>
          )}

          {step === 'ai-input' && (
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setStep('select');
                  setError(null);
                }}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleAIGenerate}
                disabled={!aiInput.trim() || isGenerating}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Gerar Board
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'ai-preview' && (
            <div className="flex gap-3 justify-between items-center">
              {isChatMode ? (
                <div className="text-sm text-slate-500">Modo de refinamento ativo</div>
              ) : (
                <button
                  onClick={() => {
                    setStep('ai-input');
                    setGeneratedBoard(null);
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  Não é isso
                </button>
              )}

              <div className="flex gap-3">
                {!isChatMode && (
                  <button
                    onClick={startChatMode}
                    className="px-4 py-2 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white hover:bg-slate-200 dark:hover:bg-white/20 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <MessageSquare size={18} />
                    Refinar com IA
                  </button>
                )}
                <button
                  onClick={handleCreateFromAI}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors shadow-lg flex items-center gap-2"
                >
                  ✅ Perfeito! Criar Board
                </button>
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
};

'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, Loader2, Bot, User, Sparkles, Wrench, X, MessageCircle, Minimize2, Maximize2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAI } from '@/context/AIContext';
import dynamic from 'next/dynamic';
import remarkGfm from 'remark-gfm';

// Lazy load react-markdown para reduzir bundle inicial em ~35KB
// O chat geralmente inicia minimizado (startMinimized={true}), então o markdown
// só é carregado quando o usuário abre o chat e há mensagens para renderizar
const ReactMarkdown = dynamic(() => import('react-markdown'), {
    ssr: false,
    loading: () => <span className="animate-pulse text-slate-400">...</span>
});

function humanizeTestLabel(input: unknown): string | undefined {
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) return undefined;

    // Remove sufixos de dados de teste gerados automaticamente (ex.: "next-ai_<uuid>")
    return raw.replace(/\s*next-ai[_-][0-9a-f-]{8,}\s*$/i, '').trim() || undefined;
}

type ActiveObjectMetadata = {
    boardId?: string;
    boardName?: string;
    dealId?: string;
    contactId?: string;
    stages?: Array<{ id: string; name: string }>;
    dealCount?: number;
    pipelineValue?: number;
    stagnantDeals?: number;
    overdueDeals?: number;
    wonStage?: string;
    lostStage?: string;
};

export interface UIChatProps {
    /** Optional explicit context (overrides provider context) */
    boardId?: string;
    dealId?: string;
    contactId?: string;
    /** Snapshot rico do cockpit (deal/contato/atividades/notas/arquivos/scripts etc.) */
    cockpitSnapshot?: unknown;
    /**
     * Controla de onde vem o contexto:
     * - 'auto' (default): usa props e faz fallback para AIContext (global/board/deal)
     * - 'props-only': usa SOMENTE props (não lê AIContext para montar body.context)
     */
    contextMode?: 'auto' | 'props-only';
    /** Whether to show as a floating widget */
    floating?: boolean;
    /** Starting minimized state (for floating) */
    startMinimized?: boolean;
    /** On close callback (for floating) */
    onClose?: () => void;
}

/**
 * UI Chat Component using AI SDK UI
 * Uses Route Handler at /api/ai/chat with streaming and context support
 * Reads context from AIContext (set by pages like Boards)
 */
export function UIChat({
    boardId,
    dealId,
    contactId,
    cockpitSnapshot,
    contextMode = 'auto',
    floating = false,
    startMinimized = true,
    onClose
}: UIChatProps) {
    const { activeContext } = useAI();
    const [isOpen, setIsOpen] = useState(!startMinimized);
    const [isExpanded, setIsExpanded] = useState(false);

    const cockpitDealTitle = useMemo(() => {
        const s: any = cockpitSnapshot as any;
        const title = s?.deal?.title;
        return humanizeTestLabel(title) ?? (typeof title === 'string' && title.trim() ? title.trim() : undefined);
    }, [cockpitSnapshot]);

    const cockpitContactName = useMemo(() => {
        const s: any = cockpitSnapshot as any;
        const name = s?.contact?.name;
        return humanizeTestLabel(name) ?? (typeof name === 'string' && name.trim() ? name.trim() : undefined);
    }, [cockpitSnapshot]);

    // Extract FULL context from AIContext for AI SDK v6 (somente quando permitido)
    const metadata = (contextMode === 'auto'
        ? (activeContext?.activeObject?.metadata as ActiveObjectMetadata | undefined)
        : undefined);

    // Build rich context with all available info
    const context = useMemo(() => ({
        // Core IDs
        boardId: boardId ?? metadata?.boardId,
        dealId: dealId ?? metadata?.dealId,
        contactId: contactId ?? metadata?.contactId,

        // Cockpit snapshot (quando fornecido via props)
        cockpitSnapshot,

        // Board Context
        boardName:
            contextMode === 'auto'
                ? ((activeContext?.activeObject?.type === 'board'
                    ? activeContext?.activeObject?.name
                    : metadata?.boardName) ?? undefined)
                : undefined,
        stages: metadata?.stages,

        // Metrics
        dealCount: metadata?.dealCount,
        pipelineValue: metadata?.pipelineValue,
        stagnantDeals: metadata?.stagnantDeals,
        overdueDeals: metadata?.overdueDeals,

        // Board Config
        wonStage: metadata?.wonStage,
        lostStage: metadata?.lostStage,
    }), [
        boardId, dealId, contactId,
        cockpitSnapshot,
        contextMode,
        metadata?.boardId, metadata?.dealId, metadata?.contactId,
        activeContext?.activeObject?.type,
        activeContext?.activeObject?.name,
        metadata?.boardName,
        metadata?.stages, metadata?.dealCount, metadata?.pipelineValue,
        metadata?.stagnantDeals, metadata?.overdueDeals,
        metadata?.wonStage, metadata?.lostStage
    ]);

    // Dev-only: ajuda a inspecionar o contexto real enviado ao backend.
    if (process.env.NODE_ENV === 'development') {
        console.log('[UIChat Debug] Context ready (will be sent in POST /api/ai/chat body.context):', {
            id: `chat-${context.boardId || context.dealId || 'global'}`,
            context,
        });
    }

    // Use transport with dynamic body function + maxSteps for approval flow
    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: '/api/ai/chat',
                body: { context },
            }),
        [context]
    );

    const { messages, sendMessage, status, error, addToolApprovalResponse } = useChat({
        transport,
        // Re-submete automaticamente quando o usuário aprova/nega uma tool.
        // Sem isso, o clique só atualiza o estado local e a execução pode “parar”.
        sendAutomaticallyWhen: ({ messages }) => {
            // Importante: se houver múltiplas aprovações pendentes no mesmo "step" (ex.: mover vários deals),
            // não podemos re-submeter após a PRIMEIRA resposta, senão o backend tenta continuar com tool-calls
            // ainda sem tool-result, gerando erros e executando apenas parte das ações.

            let hasResponded = false;
            let hasPending = false;

            for (const m of messages) {
                if (m.role !== 'assistant') continue;
                for (const part of (m.parts as any[]) ?? []) {
                    const type = (part?.type as string) || '';
                    const isTool = type.startsWith('tool-') || type === 'dynamic-tool' || type === 'tool-invocation';
                    if (!isTool) continue;

                    if (part?.state === 'approval-responded') {
                        hasResponded = true;
                    }
                    if (part?.state === 'approval-requested' && part?.approval?.approved == null) {
                        hasPending = true;
                    }
                }
            }

            return hasResponded && !hasPending;
        },
        // @ts-expect-error - maxSteps is required for approval flow; types may be outdated
        maxSteps: 10,
    });

    const dealTitleById = useMemo(() => {
        const map = new Map<string, string>();

        const recordDeal = (d: any) => {
            if (d?.id && d?.title && !map.has(d.id)) {
                map.set(d.id, d.title);
            }
        };

        for (const m of messages) {
            for (const p of (m.parts as any[])) {
                const type = (p?.type as string) || '';
                const isToolPart = type.startsWith('tool-') || type === 'dynamic-tool' || type === 'tool-invocation';
                if (!isToolPart) continue;

                const output = p?.output;
                if (!output) continue;

                if (Array.isArray(output?.deals)) {
                    for (const d of output.deals) recordDeal(d);
                }
                // getDealDetails-like
                recordDeal(output);
            }
        }

        return map;
    }, [messages]);

    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const focusInput = () => {
        const el = inputRef.current;
        if (!el) return;
        try {
            el.focus({ preventScroll: true });
        } catch {
            // Fallback para browsers que não suportam FocusOptions
            el.focus();
        }
    };

    // UI state para cards de aprovação (agrupados).
    const [expandedApprovalGroups, setExpandedApprovalGroups] = useState<Record<string, boolean>>({});
    const [selectedApprovalsById, setSelectedApprovalsById] = useState<Record<string, boolean>>({});
    const [selectionModeByGroup, setSelectionModeByGroup] = useState<Record<string, boolean>>({});

    // Auto-scroll to bottom (somente dentro do container de mensagens)
    useEffect(() => {
        // Evita “pular”/rolar o painel ao abrir o chat (quando ainda não há mensagens)
        if (messages.length === 0) return;

        const el = messagesContainerRef.current;
        if (!el) return;

        try {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        } catch {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages.length]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            focusInput();
        }
    }, [isOpen]);

    // DEBUG: Log status changes
    useEffect(() => {
        console.log('[UIChat] Status:', status, 'Error:', error);
    }, [status, error]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('[UIChat] Submit attempt:', { input, status, canSend });
        if (!canSend) return;
        if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
        }
    };

    const isLoading = status === 'streaming' || status === 'submitted';

    // Se existir uma tool-call aguardando aprovação, não podemos aceitar novas mensagens:
    // alguns providers exigem que toda tool-call tenha um tool-result antes de continuar.
    // Caso contrário, aparece o erro “No tool output found for function call ...”.
    const pendingApprovalIds = (() => {
        const ids: string[] = [];
        for (const m of messages) {
            const parts = (m as any).parts || [];
            for (const part of parts) {
                const partType = part?.type as string | undefined;
                const isTool = partType === 'tool-invocation' || (typeof partType === 'string' && partType.startsWith('tool-'));
                if (!isTool) continue;

                const toolPart = part as any;
                if (toolPart?.state !== 'approval-requested') continue;
                if (toolPart?.approval?.approved != null) continue;

                const id = toolPart?.approval?.id || toolPart?.toolCallId;
                if (id) ids.push(id);
            }
        }
        return Array.from(new Set(ids));
    })();

    const hasPendingApprovals = pendingApprovalIds.length > 0;
    const canSend = status === 'ready' && !hasPendingApprovals;

    const extractRequestId = (text: string): string | null => {
        // Ex.: req_7a077671db1e471aa7f7b88ae828db92
        const m = text.match(/\breq_[a-z0-9]+\b/i);
        return m?.[0] ?? null;
    };

    const parseProviderError = (rawMessage: string) => {
        const msg = rawMessage.trim();
        const requestId = extractRequestId(msg);

        const has = (re: RegExp) => re.test(msg);

        // Heurísticas bem conservadoras: preferimos errar para “mensagem genérica”
        // do que inventar causa.
        const isToolApproval = /No tool output found for function call/i.test(msg);

        const isOpenAIServerError =
            has(/\bserver_error\b/i) ||
            has(/"type"\s*:\s*"server_error"/i) ||
            (has(/openai/i) && has(/\b5\d\d\b/));

        const isRateLimit =
            has(/rate[_ -]?limit/i) ||
            has(/quota/i) ||
            has(/\b429\b/);

        const isAuth =
            has(/invalid[_ -]?api[_ -]?key/i) ||
            has(/\b401\b/) ||
            has(/incorrect api key/i);

        const isModelNotFound =
            has(/model not found/i) ||
            has(/does not exist/i) ||
            has(/no such model/i);

        return {
            requestId,
            isToolApproval,
            isOpenAIServerError,
            isRateLimit,
            isAuth,
            isModelNotFound,
            raw: msg,
        };
    };

    const friendlyError = (() => {
        const msg = error?.message;
        if (!msg) return null;

        const parsed = parseProviderError(msg);

        if (parsed.isToolApproval) {
            return 'Existe uma confirmação pendente acima. Aprove ou negue a ação anterior antes de enviar uma nova mensagem.';
        }

        if (parsed.isAuth) {
            return 'Falha de autenticação com o provedor de IA. Confira a chave em Configurações → Inteligência Artificial.';
        }

        if (parsed.isModelNotFound) {
            return 'Modelo não encontrado para o provedor configurado. Confira o provedor/modelo em Configurações → Inteligência Artificial.';
        }

        if (parsed.isRateLimit) {
            return 'A IA está limitando requisições (rate limit). Aguarde alguns segundos e tente novamente.';
        }

        if (parsed.isOpenAIServerError) {
            const id = parsed.requestId ? ` (ID: ${parsed.requestId})` : '';
            return `A OpenAI parece estar instável no momento (erro interno). Tente novamente em alguns segundos. Se persistir, troque para um modelo mais estável (ex.: gpt-4o) em Configurações → IA${id}.`;
        }

        // Fallback: manter a mensagem original (útil p/ debug), mas sem deixar 100% “crua”.
        return parsed.requestId ? `${parsed.raw} (ID: ${parsed.requestId})` : parsed.raw;
    })();

    const homeHint = useMemo(() => {
        const hasDealContext = Boolean(cockpitDealTitle || context.dealId);
        const hasBoardContext = Boolean(context.boardId);

        if (hasDealContext) {
            return {
                subtitle: 'Deal • Contato • Atividades • Notas • Arquivos • Scripts',
                quickActions: [
                    {
                        label: '🧾 Diagnóstico do Deal',
                        prompt:
                            'Faça um diagnóstico completo deste deal usando o contexto do cockpit (notas, atividades e arquivos). Liste riscos, próximos passos e um plano de follow-up para 7 dias.',
                    },
                    {
                        label: '👉 Próxima ação',
                        prompt:
                            'Qual a próxima melhor ação para avançar este deal agora? Seja específico e use o histórico do cockpit para justificar.',
                    },
                    {
                        label: '✍️ Mensagem WhatsApp',
                        prompt:
                            'Escreva uma mensagem curta de follow-up para WhatsApp para este contato, baseada no estágio atual e no histórico do cockpit. Traga 2 variações.',
                    },
                    {
                        label: '✅ Tarefas da semana',
                        prompt:
                            'Crie 3 tarefas objetivas para avançar este deal nesta semana (com datas sugeridas) e descreva rapidamente o porquê de cada uma.',
                    },
                ],
            };
        }

        if (hasBoardContext) {
            return {
                subtitle: 'Pipeline • Deals • Contatos • Tarefas',
                quickActions: [
                    { label: '📊 Analisar Pipeline', prompt: 'Analise meu pipeline de vendas' },
                    { label: '⏰ Deals Parados', prompt: 'Quais deals estão parados há mais de 7 dias?' },
                    { label: '🔍 Buscar', prompt: 'Buscar deals por: ' },
                ],
            };
        }

        return {
            subtitle: 'Deals • Contatos • Tarefas',
            quickActions: [
                { label: '🔍 Buscar deals', prompt: 'Buscar deals por: ' },
                { label: '👤 Buscar contatos', prompt: 'Buscar contatos por: ' },
                { label: '✅ Próximas tarefas', prompt: 'Quais tarefas eu deveria priorizar hoje?' },
            ],
        };
    }, [cockpitDealTitle, context.boardId, context.dealId]);

    const headerSubtitle = useMemo(() => {
        // No cockpit, priorizar título do deal / nome do contato em vez de IDs.
        if (cockpitDealTitle) return `Deal: ${cockpitDealTitle}`;
        if (cockpitContactName) return `Contato: ${cockpitContactName}`;

        if (context.dealId) return `Deal: ${context.dealId.slice(0, 8)}...`;
        if (context.boardId) return `Board: ${context.boardId.slice(0, 8)}...`;
        if (context.contactId) return `Contato: ${context.contactId.slice(0, 8)}...`;
        return 'AI Assistant';
    }, [cockpitContactName, cockpitDealTitle, context.boardId, context.contactId, context.dealId]);

    const toolLabelMap: Record<string, string> = {
        moveDeal: 'Mover estágio',
        createDeal: 'Criar novo deal',
        updateDeal: 'Atualizar deal',
        markDealAsWon: 'Marcar deal como ganho',
        markDealAsLost: 'Marcar deal como perdido',
        assignDeal: 'Atribuir deal',
        createTask: 'Criar tarefa',
    };

    const formatDateTimePtBr = (isoLike: string | Date): string => {
        const d = isoLike instanceof Date ? isoLike : new Date(isoLike);
        if (Number.isNaN(d.getTime())) return String(isoLike);

        const ddmm = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d);
        const hhmm = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
        return `${ddmm} às ${hhmm}`;
    };

    const getDateBadge = (isoLike?: string): { label: string; className: string } | null => {
        if (!isoLike) return null;
        const due = new Date(isoLike);
        if (Number.isNaN(due.getTime())) return null;

        const now = new Date();
        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diffDays = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86400000);

        if (diffDays < 0) return { label: 'Atrasada', className: 'bg-red-500/15 text-red-200 border border-red-500/30' };
        if (diffDays === 0) return { label: 'Hoje', className: 'bg-slate-500/15 text-slate-200 border border-slate-500/30' };
        if (diffDays === 1) return { label: 'Amanhã', className: 'bg-blue-500/15 text-blue-200 border border-blue-500/30' };
        return null;
    };

    const sanitizeAssistantText = (text: string) => {
        // Remove UUIDs e trechos comuns do tipo "(ID: <uuid>)" para não poluir a UI.
        // Mantém o texto humano (título/contato/valor) e evita exposição de identificadores internos.
        let t = text;
        t = t.replace(/\(ID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)/gi, '');
        t = t.replace(/\bID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');
        t = t.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');
        // Não colapsar quebras de linha (senão markdown de lista vira um parágrafo com "*").
        t = t.replace(/[\t ]{2,}/g, ' ').trim();
        return t;
    };

    const summarizeToolInput = (toolName: string, input: any): string[] => {
        const lines: string[] = [];

        const dealTitleFromId = (dealId?: string) => {
            if (!dealId) return undefined;
            return dealTitleById.get(dealId);
        };

        switch (toolName) {
            case 'markDealAsLost': {
                const title = input?.dealTitle || dealTitleFromId(input?.dealId);
                if (title) lines.push(`Deal: ${title}`);
                if (input?.reason) lines.push(`Motivo: ${input.reason}`);
                break;
            }
            case 'markDealAsWon': {
                const title = input?.dealTitle || dealTitleFromId(input?.dealId);
                if (title) lines.push(`Deal: ${title}`);
                if (input?.wonValue !== undefined) lines.push(`Valor final: R$ ${Number(input.wonValue).toLocaleString('pt-BR')}`);
                break;
            }
            case 'moveDeal': {
                const title = input?.dealTitle || dealTitleFromId(input?.dealId);
                if (title) lines.push(`Deal: ${title}`);
                if (input?.stageName) lines.push(`Destino: ${input.stageName}`);
                break;
            }
            case 'createTask': {
                if (input?.title) lines.push(`Tarefa: ${input.title}`);
                if (input?.dueDate) lines.push(`Vencimento: ${formatDateTimePtBr(input.dueDate)}`);
                {
                    const title = input?.dealTitle || dealTitleFromId(input?.dealId);
                    if (title) lines.push(`Deal: ${title}`);
                }
                break;
            }
            default: {
                // Fallback: tente ao menos mostrar o título do deal, sem expor UUID.
                {
                    const title = input?.dealTitle || dealTitleFromId(input?.dealId);
                    if (title) lines.push(`Deal: ${title}`);
                }
                break;
            }
        }

        return lines.length > 0 ? lines : ['Confirma essa ação?'];
    };

    // Floating minimized button
    if (floating && !isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 p-4 bg-linear-to-r from-primary-600 to-violet-600 hover:from-primary-500 hover:to-violet-500 text-white rounded-full shadow-lg shadow-primary-500/25 transition-all hover:scale-105"
            >
                <MessageCircle className="w-6 h-6" />
            </button>
        );
    }

    // Chat content as JSX (not a component function to preserve input state)
    const chatContent = (
        <>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-700/50">
                <div className="p-2 bg-linear-to-br from-primary-500/20 to-violet-500/20 rounded-xl">
                    <Sparkles className="w-5 h-5 text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-white">NossoCRM Pilot</h2>
                    <p className="text-xs text-slate-400 truncate">
                        {headerSubtitle}
                    </p>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs ${status === 'ready'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/20 text-amber-400'
                    }`}>
                    {status === 'ready' ? 'Pronto' : 'Pensando...'}
                </div>
                {floating && (
                    <div className="flex gap-1">
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors"
                            title={isExpanded ? 'Reduzir' : 'Expandir'}
                        >
                            <Maximize2 className="w-4 h-4 text-slate-400" />
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors"
                            title="Minimizar"
                        >
                            <Minimize2 className="w-4 h-4 text-slate-400" />
                        </button>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors"
                                title="Fechar"
                            >
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Messages Area */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                        <div className="p-3 bg-linear-to-br from-primary-500/20 to-violet-500/20 rounded-2xl">
                            <Bot className="w-10 h-10 text-primary-400" />
                        </div>
                        <div>
                            <p className="text-slate-300 mb-1">Como posso ajudar?</p>
                            <p className="text-slate-500 text-xs">
                                {homeHint.subtitle}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {homeHint.quickActions.map((action) => (
                                <button
                                    key={action.label}
                                    onClick={() => {
                                        setInput(action.prompt);
                                        focusInput();
                                    }}
                                    className="px-3 py-1.5 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-600/50 rounded-lg text-xs text-slate-300 transition-all"
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((message) => {
                    const messageParts = (message.parts ?? []) as any[];

                    // Agrupa múltiplos pedidos de aprovação do mesmo tool numa única confirmação.
                    // Motivação: quando o modelo propõe várias ações repetidas (tarefas, mover deals, etc.),
                    // a UI não deve exigir dezenas de cliques (um por ação) para aprovar.
                    const getToolName = (p: any) => {
                        const partType = p?.type as string | undefined;
                        return p?.toolName || (typeof partType === 'string' && partType.startsWith('tool-') ? partType.replace('tool-', '') : undefined);
                    };

                    const approvalParts = messageParts.filter((p: any) => {
                        const partType = p?.type as string | undefined;
                        const isTool = partType === 'tool-invocation' || (typeof partType === 'string' && partType.startsWith('tool-'));
                        if (!isTool) return false;
                        return p?.state === 'approval-requested';
                    });

                    const approvalsByTool = new Map<string, any[]>();
                    for (const p of approvalParts) {
                        const name = getToolName(p) || 'ferramenta';
                        const arr = approvalsByTool.get(name) ?? [];
                        arr.push(p);
                        approvalsByTool.set(name, arr);
                    }

                    const groupedApprovals = Array.from(approvalsByTool.entries())
                        .filter(([, items]) => items.length > 1)
                        .map(([toolName, items]) => ({ toolName, items }));

                    const groupedToolCounts: Record<string, number> = {};
                    for (const { toolName, items } of groupedApprovals) {
                        groupedToolCounts[toolName] = items.length;
                    }

                    // Mini bug comum: às vezes o backend envia uma mensagem do assistente apenas com parts
                    // de tools "silenciosas" (sem necessidade de aprovação) e sem texto. Como a UI oculta
                    // essas tools, acabava aparecendo um avatar + balão vazio (geralmente junto do "Pensando...").
                    // Aqui evitamos renderizar mensagens do assistente sem conteúdo visível.
                    const hasVisibleText = messageParts.some((p: any) => {
                        if (p?.type !== 'text') return false;
                        const raw = String(p?.text ?? '').trim();
                        if (!raw) return false;
                        return message.role === 'assistant' ? sanitizeAssistantText(raw).trim().length > 0 : true;
                    });

                    const ungroupedApprovalsCount = approvalParts.filter((p: any) => {
                        const name = getToolName(p) || 'ferramenta';
                        return (groupedToolCounts[name] ?? 0) <= 1;
                    }).length;

                    const hasVisibleApprovals = groupedApprovals.length > 0 || ungroupedApprovalsCount > 0;

                    if (message.role === 'assistant' && !hasVisibleText && !hasVisibleApprovals) {
                        return null;
                    }

                    return (
                        <div
                            key={message.id}
                            className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {message.role === 'assistant' && (
                                <div className="shrink-0 w-7 h-7 rounded-full bg-linear-to-br from-primary-500 to-violet-500 flex items-center justify-center">
                                    <Bot className="w-3.5 h-3.5 text-white" />
                                </div>
                            )}
                            <div className={`max-w-[85%] ${message.role === 'user'
                                ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm'
                                : 'bg-slate-800/80 text-slate-200 rounded-2xl rounded-tl-sm border border-slate-700/50'
                                } px-3 py-2`}>

                                {groupedApprovals.length > 0 && (
                                    <div className="mt-2 space-y-2">
                                        {groupedApprovals.map(({ toolName, items }) => {
                                            const toolTitle = toolLabelMap[toolName] || toolName;
                                            const groupKey = `${message.id}:${toolName}`;
                                            const expanded = !!expandedApprovalGroups[groupKey];
                                            const selectionMode = !!selectionModeByGroup[groupKey];

                                            const getApprovalId = (toolPart: any) => toolPart?.approval?.id || toolPart?.toolCallId;

                                            const parsedItems = items
                                                .map((toolPart) => {
                                                    const toolInput = toolPart.input ?? toolPart.args;
                                                    const lines = summarizeToolInput(toolName, toolInput);
                                                    const dealLine = lines.find((l) => l.startsWith('Deal: '));
                                                    const dealTitle = dealLine ? dealLine.replace(/^Deal:\s*/, '') : (toolInput?.dealTitle || undefined);
                                                    const dueDate = toolInput?.dueDate as string | undefined;

                                                    const detailLines = lines
                                                        .filter((l) => !l.startsWith('Deal: '))
                                                        // se tiver vencimento, vamos mostrar de forma humanizada fora da lista
                                                        .filter((l) => !l.startsWith('Vencimento: '));

                                                    const main =
                                                        detailLines.find((l) => l.startsWith('Tarefa: '))?.replace(/^Tarefa:\s*/, '') ||
                                                        detailLines.find((l) => l.startsWith('Destino: '))?.replace(/^Destino:\s*/, 'Destino: ') ||
                                                        detailLines.find((l) => l.startsWith('Motivo: '))?.replace(/^Motivo:\s*/, 'Motivo: ') ||
                                                        detailLines.find((l) => l.startsWith('Valor final: '))?.replace(/^Valor final:\s*/, 'Valor final: ') ||
                                                        detailLines[0] ||
                                                        'Confirma essa ação?';

                                                    return {
                                                        toolPart,
                                                        id: getApprovalId(toolPart),
                                                        toolInput,
                                                        dealTitle: dealTitle || 'Sem deal',
                                                        dueDate,
                                                        main,
                                                        extra: detailLines.slice(1),
                                                    };
                                                })
                                                .filter((x) => !!x.id);

                                            const uniqueDeals = new Set(parsedItems.map((p) => p.dealTitle));
                                            const dueDates = parsedItems
                                                .map((p) => (p.dueDate ? new Date(p.dueDate) : null))
                                                .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
                                                .sort((a, b) => a.getTime() - b.getTime());

                                            const earliestDue = dueDates[0];
                                            const latestDue = dueDates[dueDates.length - 1];
                                            const dueSummary = (() => {
                                                if (!earliestDue) return null;
                                                const earliestStr = formatDateTimePtBr(earliestDue);
                                                if (latestDue && latestDue.getTime() !== earliestDue.getTime()) {
                                                    const latestStr = formatDateTimePtBr(latestDue);
                                                    return `Vencimentos: ${earliestStr} → ${latestStr}`;
                                                }
                                                return `Vencimento: ${formatDateTimePtBr(earliestDue)}`;
                                            })();

                                            const selectedCount = parsedItems.reduce((acc, p) => acc + ((selectedApprovalsById[p.id] ?? true) ? 1 : 0), 0);
                                            const hasPartialSelection = selectedCount > 0 && selectedCount < parsedItems.length;

                                            const setAllSelection = (value: boolean) => {
                                                setSelectedApprovalsById((prev) => {
                                                    const next = { ...prev };
                                                    for (const p of parsedItems) next[p.id] = value;
                                                    return next;
                                                });
                                            };

                                            const ensureDefaultSelection = () => {
                                                setSelectedApprovalsById((prev) => {
                                                    let changed = false;
                                                    const next = { ...prev };
                                                    for (const p of parsedItems) {
                                                        if (next[p.id] === undefined) {
                                                            next[p.id] = true;
                                                            changed = true;
                                                        }
                                                    }
                                                    return changed ? next : prev;
                                                });
                                            };

                                            const approveItems = (ids: string[], approved: boolean) => {
                                                for (const id of ids) {
                                                    addToolApprovalResponse?.({ id, approved });
                                                }
                                            };

                                            const approveAllIds = parsedItems.map((p) => p.id);
                                            const selectedIds = parsedItems.filter((p) => (selectedApprovalsById[p.id] ?? true)).map((p) => p.id);

                                            const groupedByDeal = (() => {
                                                const map = new Map<string, typeof parsedItems>();
                                                for (const p of parsedItems) {
                                                    const arr = map.get(p.dealTitle) ?? [];
                                                    arr.push(p);
                                                    map.set(p.dealTitle, arr);
                                                }
                                                return Array.from(map.entries());
                                            })();

                                            // Se todas as ações têm o mesmo "main" (ex.: moveDeal com o mesmo destino),
                                            // mostramos esse detalhe uma vez só e listamos apenas os deals.
                                            const commonMain = (() => {
                                                if (parsedItems.length === 0) return null;
                                                const first = parsedItems[0].main;
                                                const allSame = parsedItems.every((p) => p.main === first);
                                                return allSame ? first : null;
                                            })();

                                            const headerTitle = (() => {
                                                // Evita o título gigante (que quebra palavra por palavra em telas estreitas)
                                                // e traz o “parâmetro principal” pro título quando fizer sentido.
                                                if (toolName === 'moveDeal' && commonMain?.startsWith('Destino: ')) {
                                                    const dest = commonMain.replace(/^Destino:\s*/, '').trim();
                                                    return `Mover → ${dest}`;
                                                }
                                                return toolTitle;
                                            })();

                                            return (
                                                <div key={toolName} className="p-3 bg-amber-900/25 border border-amber-600/40 rounded-xl">
                                                    <div className="flex items-start gap-2">
                                                        <Wrench className="w-4 h-4 shrink-0 text-amber-200" />
                                                        <div className="min-w-0 flex-1">
                                                            {/* Linha 1: só o título (não compete com detalhes) */}
                                                            <div className="flex items-baseline gap-2 min-w-0">
                                                                <div className="text-sm font-semibold text-amber-100 whitespace-normal leading-snug">
                                                                    {headerTitle}
                                                                </div>
                                                                <span className="text-xs text-amber-200/80 shrink-0">({parsedItems.length}x)</span>
                                                            </div>

                                                            {/* Linha 2: contexto + botão */}
                                                            <div className="mt-1 flex items-start justify-between gap-3">
                                                                <div className="text-[12px] text-amber-200/80 flex flex-wrap gap-x-2 gap-y-1 min-w-0">
                                                                    <span>{uniqueDeals.size} deal{uniqueDeals.size === 1 ? '' : 's'}</span>
                                                                    {dueSummary && (
                                                                        <>
                                                                            <span className="opacity-60">•</span>
                                                                            <span>{dueSummary}</span>
                                                                        </>
                                                                    )}
                                                                    {/* Se o parâmetro principal não foi promovido pro título, mostramos como detalhe */}
                                                                    {commonMain && headerTitle === toolTitle && (
                                                                        <>
                                                                            <span className="opacity-60">•</span>
                                                                            <span className="text-amber-100/90">{commonMain}</span>
                                                                        </>
                                                                    )}
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setExpandedApprovalGroups((prev) => ({ ...prev, [groupKey]: !expanded }));
                                                                        if (!expanded) ensureDefaultSelection();
                                                                    }}
                                                                    className="shrink-0 inline-flex items-center gap-1 text-xs text-amber-200/90 hover:text-amber-100 px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors whitespace-nowrap"
                                                                    title={expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                                                                >
                                                                    {expanded ? (
                                                                        <>
                                                                            Ocultar <ChevronUp className="w-4 h-4" />
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            Detalhes <ChevronDown className="w-4 h-4" />
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {expanded && (
                                                        <div className="mt-3">
                                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                                <div className="text-[12px] text-amber-200/70">
                                                                    {selectionMode ? `Selecionadas: ${selectedCount}/${parsedItems.length}` : 'Detalhes'}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {!selectionMode ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                ensureDefaultSelection();
                                                                                setSelectionModeByGroup((prev) => ({ ...prev, [groupKey]: true }));
                                                                            }}
                                                                            className="text-[12px] text-amber-200/90 hover:text-amber-100 underline underline-offset-2"
                                                                        >
                                                                            Selecionar
                                                                        </button>
                                                                    ) : (
                                                                        <>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setAllSelection(true)}
                                                                                className="text-[12px] text-amber-200/90 hover:text-amber-100 underline underline-offset-2"
                                                                            >
                                                                                Selecionar todas
                                                                            </button>
                                                                            <span className="text-amber-200/40">·</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setAllSelection(false)}
                                                                                className="text-[12px] text-amber-200/90 hover:text-amber-100 underline underline-offset-2"
                                                                            >
                                                                                Limpar
                                                                            </button>
                                                                            <span className="text-amber-200/40">·</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setSelectionModeByGroup((prev) => ({ ...prev, [groupKey]: false }))}
                                                                                className="text-[12px] text-amber-200/90 hover:text-amber-100 underline underline-offset-2"
                                                                            >
                                                                                Concluir
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3 max-h-90 overflow-auto pr-1">
                                                                {groupedByDeal.map(([dealTitle, dealItems]) => (
                                                                    <div key={dealTitle} className="rounded-lg border border-amber-600/20 bg-black/10">
                                                                        <div className="px-3 py-2 border-b border-amber-600/15">
                                                                            <div className="text-[12px] font-semibold text-amber-100 truncate">{dealTitle}</div>
                                                                        </div>
                                                                        {/* Quando todas as ações são iguais (commonMain) e é 1 item por deal sem extras,
                                                                            a lista já faz sentido só com os nomes dos deals. Evita “Incluído” repetido. */}
                                                                        {!(commonMain && !selectionMode && dealItems.length === 1 && dealItems[0].extra.length === 0 && !dealItems[0].dueDate) && (
                                                                            <div className="px-2 py-2 space-y-1">
                                                                                {dealItems.map((p) => {
                                                                                const checked = selectedApprovalsById[p.id] ?? true;
                                                                                const dueBadge = getDateBadge(p.dueDate);
                                                                                const dueText = p.dueDate ? formatDateTimePtBr(p.dueDate) : null;

                                                                                // Se commonMain existe (ex.: mesmo "Destino" para todos):
                                                                                // - no modo normal (sem seleção) não precisamos repetir; mostramos um placeholder amigável.
                                                                                // - no modo seleção, é útil ter um rótulo por checkbox; usamos o commonMain.
                                                                                const lineMain = commonMain
                                                                                    ? (selectionMode ? commonMain : '')
                                                                                    : p.main;

                                                                                if (!selectionMode) {
                                                                                    return (
                                                                                        <div key={p.id} className="px-2 py-2 rounded-md">
                                                                                            <div className="flex items-start justify-between gap-2">
                                                                                                {lineMain ? (
                                                                                                    <div className="text-sm text-amber-100 leading-snug truncate">
                                                                                                        {lineMain}
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <div className="text-[12px] text-amber-200/70">
                                                                                                        Incluído
                                                                                                    </div>
                                                                                                )}
                                                                                                {(dueBadge || dueText) && (
                                                                                                    <div className="shrink-0 flex items-center gap-2">
                                                                                                        {dueBadge && (
                                                                                                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${dueBadge.className}`}>
                                                                                                                {dueBadge.label}
                                                                                                            </span>
                                                                                                        )}
                                                                                                        {dueText && (
                                                                                                            <span className="text-[11px] text-amber-200/80 whitespace-nowrap">
                                                                                                                {dueText}
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                            {p.extra.length > 0 && (
                                                                                                <div className="mt-1 text-[12px] text-amber-200/70 space-y-0.5">
                                                                                                    {p.extra.map((l, idx) => (
                                                                                                        <div key={idx} className="leading-snug">{l}</div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    );
                                                                                }

                                                                                return (
                                                                                    <label
                                                                                        key={p.id}
                                                                                        className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-amber-500/5 cursor-pointer"
                                                                                    >
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            className="mt-0.5"
                                                                                            checked={checked}
                                                                                            onChange={(e) => {
                                                                                                const value = e.target.checked;
                                                                                                setSelectedApprovalsById((prev) => ({ ...prev, [p.id]: value }));
                                                                                            }}
                                                                                            aria-label="Selecionar ação"
                                                                                        />
                                                                                        <div className="min-w-0 flex-1">
                                                                                            <div className="flex items-start justify-between gap-2">
                                                                                                <div className="text-sm text-amber-100 leading-snug truncate">
                                                                                                    {lineMain || 'Incluído'}
                                                                                                </div>
                                                                                                {(dueBadge || dueText) && (
                                                                                                    <div className="shrink-0 flex items-center gap-2">
                                                                                                        {dueBadge && (
                                                                                                            <span className={`px-2 py-0.5 rounded-full text-[11px] ${dueBadge.className}`}>
                                                                                                                {dueBadge.label}
                                                                                                            </span>
                                                                                                        )}
                                                                                                        {dueText && (
                                                                                                            <span className="text-[11px] text-amber-200/80 whitespace-nowrap">
                                                                                                                {dueText}
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>

                                                                                            {p.extra.length > 0 && (
                                                                                                <div className="mt-1 text-[12px] text-amber-200/70 space-y-0.5">
                                                                                                    {p.extra.map((l, idx) => (
                                                                                                        <div key={idx} className="leading-snug">{l}</div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </label>
                                                                                );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() => approveItems(approveAllIds, true)}
                                                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-all"
                                                        >
                                                            ✓ Aprovar tudo
                                                        </button>
                                                        <button
                                                            onClick={() => approveItems(approveAllIds, false)}
                                                            className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-all"
                                                        >
                                                            ✗ Negar tudo
                                                        </button>

                                                        {expanded && selectionMode && hasPartialSelection && (
                                                            <>
                                                                <button
                                                                    onClick={() => approveItems(selectedIds, true)}
                                                                    className="px-3 py-2 text-xs rounded-lg transition-all border border-amber-500/30 text-amber-100 hover:bg-amber-500/10"
                                                                >
                                                                    Aprovar selecionadas
                                                                </button>
                                                                <button
                                                                    onClick={() => approveItems(selectedIds, false)}
                                                                    className="px-3 py-2 text-xs rounded-lg transition-all border border-amber-500/30 text-amber-100 hover:bg-amber-500/10"
                                                                >
                                                                    Negar selecionadas
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {messageParts.map((part, index) => {
                                if (part.type === 'text') {
                                    const text = message.role === 'assistant'
                                        ? sanitizeAssistantText(part.text)
                                        : part.text;

                                    // Markdown só para o assistente (melhora leitura: listas, negrito, etc.).
                                    if (message.role === 'assistant') {
                                        return (
                                            <div key={index} className="text-sm leading-relaxed">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: (props) => <p className="m-0 whitespace-pre-wrap" {...props} />,
                                                        strong: (props) => <strong className="font-semibold text-slate-100" {...props} />,
                                                        em: (props) => <em className="italic" {...props} />,
                                                        ul: (props) => <ul className="m-0 mt-2 list-disc pl-5 space-y-1" {...props} />,
                                                        ol: (props) => <ol className="m-0 mt-2 list-decimal pl-5 space-y-1" {...props} />,
                                                        li: (props) => <li className="m-0" {...props} />,
                                                        code: (props) => (
                                                            <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-[0.85em]" {...props} />
                                                        ),
                                                        a: (props) => (
                                                            <a className="text-primary-300 underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />
                                                        ),
                                                    }}
                                                >
                                                    {text}
                                                </ReactMarkdown>
                                            </div>
                                        );
                                    }

                                    return <p key={index} className="text-sm whitespace-pre-wrap m-0">{text}</p>;
                                }

                                const partType = part.type as string;
                                const isTool = partType === 'tool-invocation' || partType.startsWith('tool-');

                                if (isTool) {
                                    const toolPart = part as any;
                                    const toolName = toolPart.toolName || (partType.startsWith('tool-') ? partType.replace('tool-', '') : 'ferramenta');
                                    const toolTitle = toolLabelMap[toolName] || toolName;

                                    // Se houver múltiplas aprovações do mesmo tool, renderizamos uma confirmação
                                    // agrupada acima. Então escondemos as individuais aqui.
                                    if (toolPart.state === 'approval-requested' && (groupedToolCounts[toolName] ?? 0) > 1) {
                                        return null;
                                    }

                                    console.log('[UIChat] 🔧 Handling tool part:', { type: partType, state: toolPart.state, name: toolName });

                                    if (toolPart.state === 'approval-requested') {
                                        const toolInput = toolPart.input ?? toolPart.args;
                                        const summaryLines = summarizeToolInput(toolName, toolInput);

                                        return (
                                            <div key={index} className="mt-2 p-3 bg-amber-900/30 border border-amber-600/50 rounded-lg">
                                                <div className="flex items-center gap-2 text-sm text-amber-200 mb-2">
                                                    <Wrench className="w-4 h-4" />
                                                    <span className="font-medium">Confirmar ação: {toolTitle}</span>
                                                </div>
                                                <div className="text-xs text-amber-200/80 mb-3 space-y-1">
                                                    {summaryLines.map((line, i) => (
                                                        <p key={i} className="m-0">• {line}</p>
                                                    ))}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => addToolApprovalResponse?.({
                                                            id: toolPart.approval?.id || toolPart.toolCallId,
                                                            approved: true,
                                                        })}
                                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-all"
                                                    >
                                                        ✓ Aprovar
                                                    </button>
                                                    <button
                                                        onClick={() => addToolApprovalResponse?.({
                                                            id: toolPart.approval?.id || toolPart.toolCallId,
                                                            approved: false,
                                                        })}
                                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-all"
                                                    >
                                                        ✗ Negar
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // Não renderizar invocações de tools (nome técnico/etapas) na UI.
                                    // O único caso em que mostramos tool é quando precisa de aprovação.
                                    return null;
                                }

                                return null;
                            })}
                        </div>


                        {
                            message.role === 'user' && (
                                <div className="shrink-0 w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center">
                                    <User className="w-3.5 h-3.5 text-slate-300" />
                                </div>
                            )
                        }
                    </div>
                    );
                })}

                {isLoading && (
                    <div className="flex gap-2">
                        <div className="shrink-0 w-7 h-7 rounded-full bg-linear-to-br from-primary-500 to-violet-500 flex items-center justify-center">
                            <Bot className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="bg-slate-800/80 text-slate-400 rounded-2xl rounded-tl-sm px-3 py-2 border border-slate-700/50">
                            <div className="flex items-center gap-2 text-sm">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Pensando...</span>
                            </div>
                        </div>
                    </div>
                )}

                {friendlyError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs">
                        ❌ {friendlyError}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            < form onSubmit={handleSubmit} className="p-3 border-t border-slate-700/50" >
                {hasPendingApprovals && (
                    <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
                        Você tem {pendingApprovalIds.length} confirmação{pendingApprovalIds.length === 1 ? '' : 'ões'} pendente{pendingApprovalIds.length === 1 ? '' : 's'}. Aprove ou negue acima para continuar.
                    </div>
                )}

                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Pergunte algo..."
                        disabled={!canSend}
                        className="flex-1 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || !canSend}
                        className="px-3 py-2 bg-linear-to-r from-primary-600 to-violet-600 hover:from-primary-500 hover:to-violet-500 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-xl transition-all disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                </div>
            </form >
        </>
    );

    // Floating widget - size based on isExpanded
    if (floating) {
        // Expanded: Right-side drawer panel
        if (isExpanded) {
            return (
                <>
                    {/* Overlay */}
                    <div
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
                        onClick={() => setIsExpanded(false)}
                    />
                    {/* Drawer Panel */}
                    <div className="fixed top-0 right-0 z-50 w-full max-w-lg h-full bg-slate-900 border-l border-slate-700/50 shadow-2xl shadow-black/50 flex flex-col transition-transform duration-300">
                        {chatContent}
                    </div>
                </>
            );
        }

        // Minimized: Small widget in corner
        return (
            <div className="fixed bottom-6 right-6 z-50 w-96 h-125 bg-slate-900/95 rounded-2xl border border-slate-700/50 shadow-2xl shadow-black/50 flex flex-col overflow-hidden backdrop-blur-xl transition-all duration-300">
                {chatContent}
            </div>
        );
    }

    // Inline component
    return (
        <div className="flex flex-col h-full bg-slate-900/50 rounded-2xl border border-slate-700/50 backdrop-blur-xl overflow-hidden">
            {chatContent}
        </div>
    );
}

// Export a floating version that can be added to layout
/**
 * Componente React `FloatingAIChat`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export function FloatingAIChat() {
    const [isVisible, setIsVisible] = useState(true);

    if (!isVisible) return null;

    return <UIChat floating startMinimized onClose={() => setIsVisible(false)} />;
}

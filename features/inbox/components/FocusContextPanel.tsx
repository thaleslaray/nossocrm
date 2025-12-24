import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    User,
    Phone,
    Mail,
    MessageCircle,
    Send,
    Copy,
    Plus,
    ArrowUpRight,
    Calendar,
    Clock,
    AlertTriangle,
    Zap,
    TrendingUp,
    Heart,
    ChevronRight,
    Sparkles,
    FileText,
    Target,
    X,
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    MoreHorizontal,
    Search,
    Filter,
    Download,
    Trash2,
    Loader2,
    RefreshCw,
    Building
} from 'lucide-react';
import { Deal, Activity, Contact, Board } from '@/types';
import { useAIDealAnalysis, deriveHealthFromProbability } from '../hooks/useAIDealAnalysis';
import { useDealNotes } from '../hooks/useDealNotes';
import { useDealFiles } from '../hooks/useDealFiles';
import { useQuickScripts } from '../hooks/useQuickScripts';
import { useAI } from '@/context/AIContext';
import { CallModal, CallLogData } from './CallModal';
import { ScriptEditorModal, ScriptFormData } from './ScriptEditorModal';
import { ScheduleModal, ScheduleData, ScheduleType } from './ScheduleModal';
import { generateSalesScript } from '@/lib/ai/tasksClient';
import type { ScriptCategory } from '@/lib/supabase/quickScripts';

interface FocusContextPanelProps {
    deal: Deal;
    contact?: Contact;
    board?: Board;
    activities: Activity[];
    onMoveStage: (stageId: string) => void;
    onMarkWon: () => void;
    onMarkLost: () => void;
    onAddActivity: (activity: Partial<Activity>) => void;
    onUpdateActivity: (id: string, updates: Partial<Activity>) => void;
    onClose: () => void;
    className?: string;
    isExpanded?: boolean;
}

export const FocusContextPanel: React.FC<FocusContextPanelProps> = ({
    deal,
    contact,
    board,
    activities,
    onMoveStage,
    onAddActivity,
    onClose,
    className,
    isExpanded
}) => {
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [activeTab, setActiveTab] = useState('chat');
    const [note, setNote] = useState('');
    const [copiedScript, setCopiedScript] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // AI Context Injection
    const { setContext, clearContext } = useAI();

    useEffect(() => {
        // Format recent activities for context
        const recentHistory = activities
            .slice(0, 5) // Last 5 activities
            .map(a => `[${new Date(a.date).toLocaleDateString()}] ${a.type}: ${a.title} (${a.description})`)
            .join('\n');

        setContext({
            view: { type: 'cockpit', name: 'Cockpit de Vendas' },
            activeObject: {
                type: 'deal',
                id: deal.id,
                name: deal.title,
                value: deal.value,
                status: deal.status,
                metadata: {
                    companyName: (deal as any).companyName,
                    currentProbability: deal.probability,
                    contactName: contact?.name,
                    contactRole: contact?.role,
                    recentHistory: recentHistory // Inject History
                }
            }
        });

        // Cleanup: revert to global context on close
        return () => {
            clearContext();
        };
    }, [deal, contact, activities, setContext, clearContext]);

    // Get current stage info
    const currentStage = board?.stages.find(s => s.id === deal.status);
    const currentIdx = board?.stages.findIndex(s => s.id === deal.status) ?? 0;

    // === REAL DATA HOOKS ===

    // AI-powered analysis (NBA + Health)
    const { data: aiAnalysis, isLoading: isAILoading, refetch: refetchAI } = useAIDealAnalysis(
        deal,
        currentStage?.label
    );

    // Deal notes from database
    const { notes, isLoading: isNotesLoading, createNote, deleteNote } = useDealNotes(deal.id);

    // Deal files from storage
    const { files, isLoading: isFilesLoading, uploadFile, deleteFile, downloadFile, formatFileSize } = useDealFiles(deal.id);

    // Quick scripts from database
    const { scripts, isLoading: isScriptsLoading, applyVariables, getCategoryInfo, createScript, updateScript, deleteScript } = useQuickScripts();

    // Call modal state
    const [isCallModalOpen, setIsCallModalOpen] = useState(false);
    const [callSuggestedTitle, setCallSuggestedTitle] = useState('');

    // Script editor modal state
    const [isScriptEditorOpen, setIsScriptEditorOpen] = useState(false);
    const [editingScript, setEditingScript] = useState<ScriptFormData | null>(null);

    // Schedule modal state
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [scheduleType, setScheduleType] = useState<ScheduleType>('CALL');

    // Contact handlers
    const handleWhatsApp = () => {
        if (!contact?.phone) return;
        const phone = contact.phone.replace(/\D/g, '');
        window.open(`https://wa.me/${phone}`, '_blank');
    };

    // Handle call with modal
    const handleCall = (suggestedTitle?: string) => {
        if (!contact?.phone) return;

        // Open phone dialer
        window.open(`tel:${contact.phone}`, '_self');

        // Set suggested title and open call log modal
        setCallSuggestedTitle(suggestedTitle || 'Ligação');
        setIsCallModalOpen(true);
    };

    // Handle call log save
    const handleCallLogSave = (data: CallLogData) => {
        const outcomeLabels = {
            connected: 'Atendeu',
            no_answer: 'Não atendeu',
            voicemail: 'Caixa postal',
            busy: 'Ocupado'
        };

        onAddActivity({
            dealId: deal.id,
            dealTitle: deal.title,
            type: 'CALL',
            title: data.title,
            description: `${outcomeLabels[data.outcome]} - Duração: ${Math.floor(data.duration / 60)}min ${data.duration % 60}s${data.notes ? '\n\n' + data.notes : ''}`,
            date: new Date().toISOString(),
            completed: true,
            user: { name: 'Eu', avatar: '' }
        });
    };

    // Calculate days in current stage (still local - this is real data from the deal)
    const daysInStage = useMemo(() => {
        const stageDate = deal.lastStageChangeDate || deal.createdAt;
        if (!stageDate) return 0;
        const diff = Date.now() - new Date(stageDate).getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }, [deal.lastStageChangeDate, deal.createdAt]);

    // Derive health from AI probability or fallback
    const healthScore = useMemo(() => {
        const probability = aiAnalysis?.probabilityScore ?? deal.probability ?? 50;
        return deriveHealthFromProbability(probability);
    }, [aiAnalysis?.probabilityScore, deal.probability]);

    // NBA suggestion from AI or fallback
    const nextBestAction = useMemo(() => {
        // Use new structured format from AI
        if (aiAnalysis?.action && !aiAnalysis.error) {
            const iconMap = {
                CALL: Phone,
                MEETING: Calendar,
                EMAIL: Mail,
                TASK: Target,
                WHATSAPP: MessageCircle,
            };
            return {
                action: aiAnalysis.action,
                reason: aiAnalysis.reason,
                urgency: aiAnalysis.urgency || 'medium',
                actionType: aiAnalysis.actionType || 'TASK',
                icon: iconMap[aiAnalysis.actionType] || Sparkles,
                isAI: true
            };
        }

        // Fallback when AI is unavailable
        const lastActivity = activities[0];
        const daysSinceActivity = lastActivity
            ? Math.floor((Date.now() - new Date(lastActivity.date).getTime()) / (1000 * 60 * 60 * 24))
            : 999;

        if (daysSinceActivity > 7) {
            return {
                action: 'Ligar agora',
                reason: `${daysSinceActivity} dias sem contato`,
                urgency: 'high' as const,
                actionType: 'CALL' as const,
                icon: Phone,
                isAI: false
            };
        }

        return {
            action: 'Agendar reunião',
            reason: 'Manter momentum do deal',
            urgency: 'low' as const,
            actionType: 'MEETING' as const,
            icon: Calendar,
            isAI: false
        };
    }, [aiAnalysis, activities]);

    // Snapshot completo do cockpit para a IA (equivalente ao “board envia tudo do board”)
    // Importante: esse snapshot é enviado via props-only para evitar herdar contexto global do board.
    const cockpitSnapshot = useMemo(() => {
        const stageInfo = currentStage
            ? { id: currentStage.id, label: currentStage.label, color: currentStage.color }
            : undefined;

        const boardInfo = board
            ? {
                id: board.id,
                name: board.name,
                description: board.description,
                wonStageId: board.wonStageId,
                lostStageId: board.lostStageId,
                stages: (board.stages ?? []).map((s) => ({ id: s.id, label: s.label, color: s.color })),
            }
            : undefined;

        const contactInfo = contact
            ? {
                id: contact.id,
                name: contact.name,
                role: contact.role,
                email: contact.email,
                phone: contact.phone,
                avatar: contact.avatar,
                status: contact.status,
                stage: contact.stage,
                source: contact.source,
                notes: contact.notes,
                lastInteraction: contact.lastInteraction,
                birthDate: contact.birthDate,
                lastPurchaseDate: contact.lastPurchaseDate,
                totalValue: contact.totalValue,
                clientCompanyId: contact.clientCompanyId,
            }
            : undefined;

        const dealInfo = {
            id: deal.id,
            title: deal.title,
            value: deal.value,
            status: deal.status,
            isWon: deal.isWon,
            isLost: deal.isLost,
            probability: deal.probability,
            priority: deal.priority,
            owner: deal.owner,
            ownerId: deal.ownerId,
            nextActivity: deal.nextActivity,
            tags: deal.tags,
            items: deal.items,
            customFields: deal.customFields,
            lastStageChangeDate: deal.lastStageChangeDate,
            lossReason: deal.lossReason,
            createdAt: deal.createdAt,
            updatedAt: deal.updatedAt,
            companyId: deal.companyId,
            clientCompanyId: deal.clientCompanyId,
            // Alguns fluxos ainda expõem companyName via DealView/casts
            companyName: (deal as any)?.companyName,
        };

        const activitiesLimit = 25;
        const activitiesPreview = (activities ?? []).slice(0, activitiesLimit).map((a) => ({
            id: a.id,
            type: a.type,
            title: a.title,
            description: a.description,
            date: a.date,
            completed: a.completed,
            user: a.user?.name,
        }));

        const notesLimit = 50;
        const notesPreview = (notes ?? []).slice(0, notesLimit).map((n) => ({
            id: n.id,
            content: n.content,
            created_at: n.created_at,
            updated_at: n.updated_at,
            created_by: n.created_by,
        }));

        const filesLimit = 50;
        const filesPreview = (files ?? []).slice(0, filesLimit).map((f) => ({
            id: f.id,
            file_name: f.file_name,
            file_size: f.file_size,
            mime_type: f.mime_type,
            file_path: f.file_path,
            created_at: f.created_at,
            created_by: f.created_by,
        }));

        const scriptsLimit = 50;
        const scriptsPreview = (scripts ?? []).slice(0, scriptsLimit).map((s) => ({
            id: s.id,
            title: s.title,
            category: s.category,
            template: s.template,
            icon: s.icon,
            is_system: s.is_system,
            updated_at: s.updated_at,
        }));

        return {
            meta: {
                generatedAt: new Date().toISOString(),
                source: 'cockpit',
                version: 1,
            },
            deal: dealInfo,
            contact: contactInfo,
            board: boardInfo,
            stage: stageInfo,
            cockpitSignals: {
                daysInStage,
                healthScore,
                nextBestAction,
                aiAnalysis: aiAnalysis ?? null,
                aiAnalysisLoading: isAILoading,
            },
            lists: {
                activities: {
                    total: (activities ?? []).length,
                    preview: activitiesPreview,
                    limit: activitiesLimit,
                    truncated: (activities ?? []).length > activitiesLimit,
                },
                notes: {
                    total: (notes ?? []).length,
                    preview: notesPreview,
                    loading: isNotesLoading,
                    limit: notesLimit,
                    truncated: (notes ?? []).length > notesLimit,
                },
                files: {
                    total: (files ?? []).length,
                    preview: filesPreview,
                    loading: isFilesLoading,
                    limit: filesLimit,
                    truncated: (files ?? []).length > filesLimit,
                },
                scripts: {
                    total: (scripts ?? []).length,
                    preview: scriptsPreview,
                    loading: isScriptsLoading,
                    limit: scriptsLimit,
                    truncated: (scripts ?? []).length > scriptsLimit,
                },
            },
        };
    }, [
        deal,
        contact,
        board,
        currentStage,
        activities,
        notes,
        files,
        scripts,
        daysInStage,
        healthScore,
        nextBestAction,
        aiAnalysis,
        isAILoading,
        isNotesLoading,
        isFilesLoading,
        isScriptsLoading,
    ]);

    // Quick action handlers - open modal instead of creating directly
    const handleQuickAction = (type: ScheduleType) => {
        setScheduleType(type);
        setIsScheduleModalOpen(true);
    };

    // Handle schedule modal save
    const handleScheduleSave = (data: ScheduleData) => {
        const dateTime = new Date(`${data.date}T${data.time}`);

        onAddActivity({
            type: data.type,
            title: data.title,
            description: data.description || `${data.type === 'CALL' ? 'Ligação' : data.type === 'MEETING' ? 'Reunião' : 'Tarefa'} com ${contact?.name || 'contato'}`,
            date: dateTime.toISOString(),
            completed: false
        });
    };

    // Handle NBA action execution - accepts optional actionType to override
    const handleNBAAction = (overrideActionType?: string) => {
        const { action, reason, actionType: suggestedType } = nextBestAction;
        const actionType = overrideActionType || suggestedType;

        if (actionType === 'WHATSAPP') {
            handleWhatsApp();
            return;
        }

        if (actionType === 'EMAIL' && contact?.email) {
            window.open(`mailto:${contact.email}?subject=${encodeURIComponent(action)}`);
            return;
        }

        if (actionType === 'CALL') {
            // Use handleCall with AI-suggested title
            handleCall(action);
            return;
        }

        // For MEETING and TASK, create activity directly with AI-suggested data
        const type = actionType === 'MEETING' ? 'MEETING' : 'TASK';
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);

        onAddActivity({
            type,
            title: action,
            description: `${reason} - Sugerido por IA`,
            date: tomorrow.toISOString(),
            completed: false
        });
    };

    // Copy script to clipboard
    const copyScript = (template: string, scriptId: string) => {
        const text = applyVariables(template, {
            nome: contact?.name?.split(' ')[0] || 'Cliente'
        });
        navigator.clipboard.writeText(text);
        setCopiedScript(scriptId);
        setTimeout(() => setCopiedScript(null), 2000);
    };

    // Handle note submission
    const handleNoteSubmit = async () => {
        if (!note.trim()) return;
        await createNote.mutateAsync(note);
        setNote('');
    };

    // Handle file upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await uploadFile.mutateAsync(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    if (!isExpanded) return null;

    return (
        <>
            <div className={`${isExpanded ? 'fixed inset-0 w-screen h-screen' : ''} flex flex-col bg-slate-950 ${className || ''}`}>
                {/* === HEADER with Pipeline Progress === */}
                <header className="shrink-0 border-b border-dark-border">
                    {/* Top Row: Title + Board Name (center) + Value */}
                    <div className="flex items-center justify-between px-6 py-3">
                        <div>
                            <h1 className="text-lg font-semibold text-white tracking-tight">
                                {deal.title} <span className="text-slate-500 font-normal">|</span> <span className="text-slate-400 font-normal">{(deal as any).companyName || 'Empresa'}</span>
                            </h1>
                        </div>
                        <div className="absolute left-1/2 -translate-x-1/2">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                                {board?.name || 'Board'}
                            </span>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-emerald-400 font-mono tracking-tight">
                                R$ {deal.value?.toLocaleString('pt-BR') || '0'}
                            </p>
                        </div>
                    </div>

                    {/* Pipeline Progress - The Star of the Show */}
                    <div className="px-6 pb-4 pt-1">
                        <div className="flex items-center">
                            {board?.stages.map((stage, idx) => {
                                const isActive = idx === currentIdx;
                                const isPassed = idx < currentIdx;
                                const isLast = idx === (board?.stages?.length || 0) - 1;

                                // Dynamic color from board.stages with Tailwind to HEX mapping
                                const tailwindToHex: Record<string, string> = {
                                    'bg-blue-500': '#3b82f6',
                                    'bg-yellow-500': '#eab308',
                                    'bg-purple-500': '#a855f7',
                                    'bg-green-500': '#22c55e',
                                    'bg-emerald-500': '#10b981',
                                    'bg-orange-500': '#f97316',
                                    'bg-red-500': '#ef4444',
                                    'bg-pink-500': '#ec4899',
                                    'bg-indigo-500': '#6366f1',
                                    'bg-cyan-500': '#06b6d4',
                                    'bg-teal-500': '#14b8a6',
                                    'bg-slate-500': '#64748b',
                                    'bg-gray-500': '#6b7280',
                                    'bg-violet-500': '#8b5cf6',
                                    'bg-lime-500': '#84cc16',
                                    'bg-amber-500': '#f59e0b',
                                    'bg-rose-500': '#f43f5e',
                                    'bg-sky-500': '#0ea5e9',
                                    'bg-fuchsia-500': '#d946ef',
                                };

                                const hexColor = tailwindToHex[stage.color] || '#64748b';

                                return (
                                    <React.Fragment key={stage.id}>
                                        {/* Stage Node */}
                                        <button
                                            onClick={() => onMoveStage(stage.id)}
                                            className="flex flex-col items-center gap-2 group relative"
                                        >
                                            {/* The Dot */}
                                            <div
                                                className={`relative w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 
                                                ${isActive ? 'ring-4' : isPassed ? 'hover:scale-110 opacity-80' : 'hover:scale-110'}
                                                ${!isActive && !isPassed ? 'bg-slate-700/80 hover:bg-slate-600' : ''}`}
                                                style={{
                                                    backgroundColor: (isActive || isPassed) ? hexColor : undefined,
                                                    boxShadow: isActive ? `0 0 15px ${hexColor}80` : undefined,
                                                    ['--tw-ring-color' as any]: isActive ? `${hexColor}50` : undefined,
                                                }}
                                            >
                                                {isPassed && <CheckCircle2 size={12} className="text-white" strokeWidth={3} />}
                                                {isActive && (
                                                    <>
                                                        <span
                                                            className="absolute inset-0 rounded-full animate-ping opacity-40"
                                                            style={{ backgroundColor: hexColor }}
                                                        />
                                                        <div className="w-2 h-2 rounded-full bg-white" />
                                                    </>
                                                )}
                                            </div>

                                            {/* Label */}
                                            <span
                                                className={`text-[10px] font-medium whitespace-nowrap transition-all duration-200 
                                                ${isActive ? 'font-bold' : isPassed ? 'opacity-70' : 'text-slate-500 group-hover:text-slate-300'}`}
                                                style={{
                                                    color: (isActive || isPassed) ? hexColor : undefined,
                                                }}
                                            >
                                                {stage.label}
                                            </span>
                                        </button>

                                        {/* Connecting Line */}
                                        {!isLast && (
                                            <div className="flex-1 mx-3 relative h-0.5 -mt-6">
                                                <div className="absolute inset-0 bg-slate-800 rounded-full" />
                                                <div
                                                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                                    style={{
                                                        backgroundColor: isPassed ? hexColor : 'transparent',
                                                        width: isPassed ? '100%' : 0,
                                                        opacity: isPassed ? 0.7 : 1,
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                </header>

                {/* === BODY === */}
                <div className="flex-1 flex min-h-0 overflow-hidden">

                    {/* LEFT: Contact */}
                    <aside className="w-[400px] shrink-0 border-r border-white/5 flex flex-col">

                        <div className="p-6 border-b border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    {isAILoading ? (
                                        <Loader2 size={16} className="text-primary-400 animate-spin" />
                                    ) : (
                                        <Heart size={16} className={healthScore.color} />
                                    )}
                                    <span className="text-xs uppercase tracking-wider text-slate-500 font-bold">Health</span>
                                    {aiAnalysis && !aiAnalysis.error && (
                                        <span className="text-[9px] bg-primary-500/20 text-primary-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                                            <Sparkles size={10} /> AI
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`font-mono font-bold text-2xl ${healthScore.color}`}>{healthScore.score}%</span>
                                    <button
                                        onClick={() => refetchAI()}
                                        className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-slate-300 transition-colors"
                                        title="Reanalisar com IA"
                                    >
                                        <RefreshCw size={12} />
                                    </button>
                                </div>
                            </div>
                            <div className="h-1.5 bg-slate-800/50 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${healthScore.status === 'excellent' ? 'bg-emerald-500' :
                                        healthScore.status === 'good' ? 'bg-green-500' :
                                            healthScore.status === 'warning' ? 'bg-yellow-500' :
                                                'bg-red-500'
                                        }`}
                                    style={{ width: `${healthScore.score}%` }}
                                />
                            </div>
                        </div>

                        {/* NBA - Full Width Layout */}
                        <div className={`p-4 border-b border-dark-border ${nextBestAction.urgency === 'high' ? 'bg-red-950/20' : nextBestAction.urgency === 'medium' ? 'bg-yellow-950/20' : 'bg-slate-900/30'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Zap size={14} className={`${nextBestAction.urgency === 'high' ? 'text-red-400' : nextBestAction.urgency === 'medium' ? 'text-yellow-400' : 'text-primary-400'}`} />
                                    <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Próxima Ação</span>
                                    {nextBestAction.isAI && (
                                        <span className="text-[10px] bg-primary-500/20 text-primary-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                                            <Sparkles size={9} /> AI
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => refetchAI()}
                                    className="p-1.5 hover:bg-white/5 rounded text-slate-500 hover:text-slate-300 transition-colors"
                                    title="Reanalisar"
                                >
                                    <RefreshCw size={12} />
                                </button>
                            </div>

                            {/* Icon + Text Block */}
                            <div className="flex gap-3 mb-4">
                                <div className={`p-3 rounded-xl shrink-0 ${nextBestAction.urgency === 'high' ? 'bg-red-500/15' : nextBestAction.urgency === 'medium' ? 'bg-yellow-500/15' : 'bg-primary-500/15'}`}>
                                    <nextBestAction.icon size={24} className={`${nextBestAction.urgency === 'high' ? 'text-red-400' : nextBestAction.urgency === 'medium' ? 'text-yellow-400' : 'text-primary-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-base font-semibold text-slate-100 leading-snug mb-1">
                                        {nextBestAction.action}
                                    </p>
                                    <p className="text-sm text-slate-500 leading-relaxed">
                                        {nextBestAction.reason}
                                    </p>
                                </div>
                            </div>

                            {/* Action Icons Bar */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <span className="text-[10px] text-slate-600 uppercase tracking-wider">Executar como:</span>
                                <div className="flex items-center gap-1">
                                    {[
                                        { type: 'WHATSAPP', icon: MessageCircle, label: 'WhatsApp', color: 'text-green-400 hover:bg-green-500/20' },
                                        { type: 'CALL', icon: Phone, label: 'Ligar', color: 'text-yellow-400 hover:bg-yellow-500/20' },
                                        { type: 'EMAIL', icon: Mail, label: 'Email', color: 'text-blue-400 hover:bg-blue-500/20' },
                                        { type: 'MEETING', icon: Calendar, label: 'Reunião', color: 'text-purple-400 hover:bg-purple-500/20' },
                                        { type: 'TASK', icon: Target, label: 'Tarefa', color: 'text-slate-400 hover:bg-slate-500/20' },
                                    ].map(({ type, icon: Icon, label, color }) => (
                                        <button
                                            key={type}
                                            onClick={() => handleNBAAction(type)}
                                            className={`p-2 rounded-lg transition-all ${color} ${nextBestAction.actionType === type ? 'bg-white/10 ring-1 ring-current' : ''}`}
                                            title={label}
                                        >
                                            <Icon size={16} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Main Action Button */}
                            <button
                                onClick={() => handleNBAAction()}
                                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${nextBestAction.urgency === 'high'
                                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                                    : nextBestAction.urgency === 'medium'
                                        ? 'bg-yellow-500 hover:bg-yellow-600 text-black shadow-lg shadow-yellow-500/20'
                                        : 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                                    }`}
                            >
                                <nextBestAction.icon size={16} />
                                Executar Agora
                                <ArrowRight size={16} />
                            </button>
                        </div>

                        {/* Stats - Single section */}
                        <div className="p-4 border-b border-dark-border">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="text-center">
                                    <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold block">Dias</span>
                                    <p className={`text-lg font-mono font-bold ${daysInStage > 7 ? 'text-orange-400' : 'text-slate-300'}`}>{daysInStage}</p>
                                </div>
                                <div className="text-center">
                                    <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold block">Prob</span>
                                    <p className="text-lg font-mono font-bold text-emerald-400">{deal.probability || 50}%</p>
                                </div>
                                <div className="text-center">
                                    <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold block">Ativ</span>
                                    <p className="text-lg font-mono font-bold text-blue-400">{activities.length}</p>
                                </div>
                            </div>
                        </div>

                        {/* Contact Info Card */}
                        {contact && (
                            <div className="p-4 border-b border-dark-border">
                                <div className="flex items-start gap-3">
                                    {/* Avatar */}
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-semibold text-lg shrink-0">
                                        {contact.name?.charAt(0).toUpperCase() || '?'}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-semibold text-white truncate">{contact.name}</h4>
                                            {contact.role && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">{contact.role}</span>
                                            )}
                                        </div>

                                        {/* Contact details grid */}
                                        <div className="mt-2 grid grid-cols-1 gap-1.5">
                                            {contact.phone && (
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(contact.phone || '')}
                                                    className="flex items-center gap-2 text-xs text-slate-400 hover:text-green-400 transition-colors group"
                                                >
                                                    <Phone size={12} className="text-slate-600 group-hover:text-green-400 shrink-0" />
                                                    <span className="truncate">{contact.phone}</span>
                                                    <Copy size={10} className="opacity-0 group-hover:opacity-100 ml-auto shrink-0" />
                                                </button>
                                            )}

                                            {contact.email && (
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(contact.email || '')}
                                                    className="flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-400 transition-colors group"
                                                >
                                                    <Mail size={12} className="text-slate-600 group-hover:text-cyan-400 shrink-0" />
                                                    <span className="truncate">{contact.email}</span>
                                                    <Copy size={10} className="opacity-0 group-hover:opacity-100 ml-auto shrink-0" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Extra info */}
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {contact.source && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                                                    {contact.source}
                                                </span>
                                            )}
                                            {contact.status && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${contact.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                    contact.status === 'INACTIVE' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                                                        'bg-red-500/10 text-red-400 border-red-500/20'
                                                    }`}>
                                                    {contact.status === 'ACTIVE' ? 'Ativo' : contact.status === 'INACTIVE' ? 'Inativo' : 'Churned'}
                                                </span>
                                            )}
                                            {contact.totalValue && contact.totalValue > 0 && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                                                    LTV: R$ {contact.totalValue.toLocaleString('pt-BR')}
                                                </span>
                                            )}
                                        </div>

                                        {/* Notes preview */}
                                        {contact.notes && (
                                            <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 italic">
                                                "{contact.notes}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Deal Info Card */}
                        <div className="p-4 border-b border-dark-border">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">Negócio</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${deal.priority === 'high' ? 'bg-red-500/10 text-red-400' :
                                    deal.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                                        'bg-slate-500/10 text-slate-400'
                                    }`}>
                                    {deal.priority === 'high' ? '🔥 Alta' : deal.priority === 'medium' ? 'Média' : 'Baixa'}
                                </span>
                            </div>

                            <h4 className="text-sm font-semibold text-white mb-2">{deal.title}</h4>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <span className="text-slate-600">Valor</span>
                                    <p className="text-emerald-400 font-semibold">
                                        R$ {deal.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-slate-600">Probabilidade</span>
                                    <p className="text-slate-300 font-semibold">{deal.probability || 50}%</p>
                                </div>
                                <div>
                                    <span className="text-slate-600">Criado em</span>
                                    <p className="text-slate-400">
                                        {new Date(deal.createdAt).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-slate-600">Atualizado</span>
                                    <p className="text-slate-400">
                                        {new Date(deal.updatedAt).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                            </div>

                            {/* Tags */}
                            {deal.tags && deal.tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {deal.tags.slice(0, 4).map((tag, i) => (
                                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-primary-500/10 text-primary-400 rounded">
                                            #{tag}
                                        </span>
                                    ))}
                                    {deal.tags.length > 4 && (
                                        <span className="text-[10px] text-slate-500">+{deal.tags.length - 4}</span>
                                    )}
                                </div>
                            )}

                            {/* AI Summary */}
                            {deal.aiSummary && (
                                <div className="mt-2 p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                    <div className="flex items-center gap-1 mb-1">
                                        <Sparkles size={10} className="text-primary-400" />
                                        <span className="text-[10px] text-primary-400 font-medium">Resumo IA</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 line-clamp-2">{deal.aiSummary}</p>
                                </div>
                            )}
                        </div>

                        {/* Move to Stage (Sidebar) - With Semantic Colors & Days */}
                        <div className="p-4 border-t border-white/5">
                            <p className="text-[9px] uppercase tracking-[0.1em] text-slate-600 font-medium mb-3">Pipeline</p>
                            <div className="space-y-2">
                                {board?.stages.map((stage, idx) => {
                                    const isActive = idx === currentIdx;
                                    const isPassed = idx < currentIdx;

                                    // Dynamic color from board.stages with Tailwind to HEX mapping
                                    const tailwindToHex: Record<string, string> = {
                                        'bg-blue-500': '#3b82f6',
                                        'bg-yellow-500': '#eab308',
                                        'bg-purple-500': '#a855f7',
                                        'bg-green-500': '#22c55e',
                                        'bg-emerald-500': '#10b981',
                                        'bg-orange-500': '#f97316',
                                        'bg-red-500': '#ef4444',
                                        'bg-pink-500': '#ec4899',
                                        'bg-indigo-500': '#6366f1',
                                        'bg-cyan-500': '#06b6d4',
                                        'bg-teal-500': '#14b8a6',
                                        'bg-slate-500': '#64748b',
                                        'bg-gray-500': '#6b7280',
                                        'bg-violet-500': '#8b5cf6',
                                        'bg-lime-500': '#84cc16',
                                        'bg-amber-500': '#f59e0b',
                                        'bg-rose-500': '#f43f5e',
                                        'bg-sky-500': '#0ea5e9',
                                        'bg-fuchsia-500': '#d946ef',
                                    };

                                    const hexColor = tailwindToHex[stage.color] || '#64748b';

                                    // Mock days in each stage (in real app, this would come from stageHistory)
                                    const mockDaysPerStage = [3, 12, 38, 0];
                                    const daysInThisStage = isActive ? daysInStage : (isPassed ? mockDaysPerStage[idx] || Math.floor(Math.random() * 15) + 1 : 0);

                                    return (
                                        <button
                                            key={stage.id}
                                            onClick={() => onMoveStage(stage.id)}
                                            className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-all duration-200 group
                                                ${!isActive && !isPassed ? 'bg-slate-800/30 text-slate-500 border border-transparent hover:bg-slate-800/50 hover:text-slate-400' : ''}`}
                                            style={{
                                                backgroundColor: isActive ? `${hexColor}15` : isPassed ? `${hexColor}10` : undefined,
                                                color: (isActive || isPassed) ? hexColor : undefined,
                                                borderWidth: isActive ? '1px' : undefined,
                                                borderColor: isActive ? `${hexColor}40` : undefined,
                                                boxShadow: isActive ? `0 0 12px ${hexColor}50` : undefined,
                                                opacity: isPassed ? 0.7 : 1,
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                {/* Stage Dot */}
                                                <div
                                                    className="w-2 h-2 rounded-full"
                                                    style={{
                                                        backgroundColor: (isActive || isPassed) ? hexColor : '#334155',
                                                        opacity: isPassed ? 0.5 : 1,
                                                    }}
                                                />
                                                <span className="text-xs font-medium">
                                                    {stage.label}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                {/* Days indicator */}
                                                {(isActive || isPassed) && (
                                                    <span
                                                        className="text-[10px] font-mono"
                                                        style={{
                                                            color: isActive && daysInThisStage > 7 ? '#fb923c' : (isActive || isPassed) ? hexColor : '#64748b',
                                                        }}
                                                    >
                                                        {daysInThisStage}d
                                                    </span>
                                                )}

                                                {/* Status icons */}
                                                {isPassed && <CheckCircle2 size={12} style={{ color: hexColor, opacity: 0.7 }} />}
                                                {isActive && <Target size={12} className="animate-pulse" style={{ color: hexColor }} />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Journey Summary */}
                            <div className="mt-4 pt-3 border-t border-white/5">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-slate-600 uppercase tracking-wider">Tempo no funil</span>
                                    <span className="text-slate-400 font-mono font-medium">
                                        {(() => {
                                            const totalDays = board?.stages.reduce((acc, _, idx) => {
                                                if (idx < currentIdx) return acc + ([3, 12, 38][idx] || 5);
                                                if (idx === currentIdx) return acc + daysInStage;
                                                return acc;
                                            }, 0) || 0;
                                            return `${totalDays}d total`;
                                        })()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* RIGHT: Split View (Timeline + Workspace) */}
                    <main className="flex-1 flex min-w-0 bg-slate-900/10">

                        {/* COL 1: Timeline & Interaction (Flexible Width) */}
                        <div className="flex-1 flex flex-col min-w-0 border-r border-dark-border">
                            {/* Header - Simple */}
                            <div className="shrink-0 h-12 flex items-center justify-between px-6 border-b border-white/5">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    Atividades
                                </h3>
                                <div className="flex items-center gap-1">
                                    <button className="p-1.5 hover:bg-white/5 rounded text-slate-500 hover:text-white transition-colors">
                                        <Filter size={14} />
                                    </button>
                                    <button className="p-1.5 hover:bg-white/5 rounded text-slate-500 hover:text-white transition-colors">
                                        <Search size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Activity List */}
                            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 p-6">
                                {activities.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                                        <div className="w-12 h-12 bg-slate-800/50 rounded-xl flex items-center justify-center mb-4 border border-slate-700/50">
                                            <ArrowUpRight size={24} className="text-slate-500" />
                                        </div>
                                        <p className="text-sm font-medium text-white mb-1">
                                            Nenhuma atividade
                                        </p>
                                        <p className="text-sm text-slate-500 max-w-[200px]">
                                            Comece adicionando uma nota ou agendando uma ação.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="relative pl-0 py-2">
                                        {/* Timeline line */}
                                        <div className="absolute left-[27px] top-0 bottom-0 w-px bg-slate-800/50" />

                                        {activities.slice(0, 50).map((activity, idx) => {
                                            const isLast = idx === activities.length - 1;
                                            const Icon = activity.type === 'CALL' ? Phone :
                                                activity.type === 'EMAIL' ? Mail :
                                                    activity.type === 'MEETING' ? Calendar :
                                                        activity.type === 'NOTE' ? FileText :
                                                            CheckCircle2;

                                            return (
                                                <div
                                                    key={activity.id}
                                                    className="relative pl-[54px] pr-6 py-4 group hover:bg-white/[0.02] transition-colors border-b border-white/5"
                                                >
                                                    {/* Timeline Node */}
                                                    <div className={`absolute left-[18px] top-[18px] w-[20px] h-[20px] rounded-full flex items-center justify-center z-10 
                                                    border transition-all shadow-[0_0_10px_-3px_rgba(0,0,0,0.5)]
                                                    ${activity.type === 'CALL' ? 'bg-blue-950/30 border-blue-500/30 text-blue-400 group-hover:border-blue-500 group-hover:shadow-blue-500/20' :
                                                            activity.type === 'EMAIL' ? 'bg-purple-950/30 border-purple-500/30 text-purple-400 group-hover:border-purple-500 group-hover:shadow-purple-500/20' :
                                                                activity.type === 'MEETING' ? 'bg-orange-950/30 border-orange-500/30 text-orange-400 group-hover:border-orange-500 group-hover:shadow-orange-500/20' :
                                                                    'bg-slate-900 border-slate-700 text-slate-500 group-hover:border-slate-500'
                                                        }`}
                                                    >
                                                        <Icon size={10} strokeWidth={2.5} />
                                                    </div>

                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex flex-col gap-1 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                {/* Activity Type Badge */}
                                                                {(() => {
                                                                    // For STATUS_CHANGE, use gray
                                                                    if (activity.type === 'STATUS_CHANGE' || activity.title.includes('Moveu para')) {
                                                                        return (
                                                                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide shrink-0 bg-slate-700/50 text-slate-400">
                                                                                Status
                                                                            </span>
                                                                        );
                                                                    }
                                                                    // Regular activity types
                                                                    const typeColor =
                                                                        activity.type === 'CALL' ? 'bg-blue-500/20 text-blue-400' :
                                                                            activity.type === 'EMAIL' ? 'bg-purple-500/20 text-purple-400' :
                                                                                activity.type === 'MEETING' ? 'bg-orange-500/20 text-orange-400' :
                                                                                    activity.type === 'NOTE' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                                        activity.type === 'TASK' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                                            'bg-slate-700/50 text-slate-400';
                                                                    const typeLabel =
                                                                        activity.type === 'CALL' ? 'Ligação' :
                                                                            activity.type === 'EMAIL' ? 'Email' :
                                                                                activity.type === 'MEETING' ? 'Reunião' :
                                                                                    activity.type === 'NOTE' ? 'Nota' :
                                                                                        activity.type === 'TASK' ? 'Tarefa' :
                                                                                            activity.type;
                                                                    return (
                                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide shrink-0 ${typeColor}`}>
                                                                            {typeLabel}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {/* Activity Title */}
                                                                <span className={`text-sm font-medium transition-colors ${activity.completed ? 'text-slate-300' : 'text-white'}`}>
                                                                    {activity.title.includes('Moveu para') ? (() => {
                                                                        // Extract stage name from title and find matching stage in board
                                                                        const stageName = activity.title.replace('Moveu para', '').trim();
                                                                        const matchingStage = board?.stages.find(s =>
                                                                            s.label.toLowerCase() === stageName.toLowerCase()
                                                                        );

                                                                        // Tailwind class to HEX color mapping (based on Tailwind default palette)
                                                                        const tailwindToHex: Record<string, string> = {
                                                                            'bg-blue-500': '#3b82f6',
                                                                            'bg-yellow-500': '#eab308',
                                                                            'bg-purple-500': '#a855f7',
                                                                            'bg-green-500': '#22c55e',
                                                                            'bg-emerald-500': '#10b981',
                                                                            'bg-orange-500': '#f97316',
                                                                            'bg-red-500': '#ef4444',
                                                                            'bg-pink-500': '#ec4899',
                                                                            'bg-indigo-500': '#6366f1',
                                                                            'bg-cyan-500': '#06b6d4',
                                                                            'bg-teal-500': '#14b8a6',
                                                                            'bg-slate-500': '#64748b',
                                                                            'bg-gray-500': '#6b7280',
                                                                            'bg-violet-500': '#8b5cf6',
                                                                            'bg-lime-500': '#84cc16',
                                                                            'bg-amber-500': '#f59e0b',
                                                                            'bg-rose-500': '#f43f5e',
                                                                            'bg-sky-500': '#0ea5e9',
                                                                            'bg-fuchsia-500': '#d946ef',
                                                                        };

                                                                        const hexColor = tailwindToHex[matchingStage?.color || ''] || '#64748b';

                                                                        return (
                                                                            <span className="flex items-center gap-2">
                                                                                Moveu para
                                                                                <span
                                                                                    className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border"
                                                                                    style={{
                                                                                        backgroundColor: `${hexColor}20`,
                                                                                        color: hexColor,
                                                                                        borderColor: `${hexColor}40`,
                                                                                    }}
                                                                                >
                                                                                    {stageName}
                                                                                </span>
                                                                            </span>
                                                                        );
                                                                    })() : activity.title}
                                                                </span>
                                                            </div>
                                                            {activity.description && (
                                                                <p className="text-sm text-slate-500 leading-relaxed group-hover:text-slate-400 transition-colors">
                                                                    {activity.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span className="text-[11px] text-slate-600 font-mono shrink-0 self-center">
                                                            {new Date(activity.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} - {new Date(activity.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Input Area */}
                            <div className="shrink-0 p-4 border-t border-white/5">
                                {/* Quick Actions - Agendamento */}
                                <div className="flex flex-wrap gap-2 mb-3">
                                    <button
                                        onClick={handleWhatsApp}
                                        disabled={!contact?.phone}
                                        className="px-3 py-1.5 hover:bg-green-500/10 text-slate-500 hover:text-green-400 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium rounded-md transition-colors flex items-center gap-2 group"
                                    >
                                        <MessageCircle size={14} className="group-hover:text-green-400 transition-colors" /> WhatsApp
                                    </button>
                                    <button
                                        onClick={() => contact?.email && window.open(`mailto:${contact.email}`)}
                                        disabled={!contact?.email}
                                        className="px-3 py-1.5 hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium rounded-md transition-colors flex items-center gap-2 group"
                                    >
                                        <Mail size={14} className="group-hover:text-cyan-400 transition-colors" /> Email
                                    </button>
                                    <span className="w-px h-6 bg-slate-800 self-center" />
                                    <button
                                        onClick={() => handleQuickAction('CALL')}
                                        className="px-3 py-1.5 hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 text-xs font-medium rounded-md transition-colors flex items-center gap-2 group"
                                    >
                                        <Phone size={14} className="group-hover:text-blue-400 transition-colors" /> Ag. Ligação
                                    </button>
                                    <button
                                        onClick={() => handleQuickAction('MEETING')}
                                        className="px-3 py-1.5 hover:bg-purple-500/10 text-slate-500 hover:text-purple-400 text-xs font-medium rounded-md transition-colors flex items-center gap-2 group"
                                    >
                                        <Calendar size={14} className="group-hover:text-purple-400 transition-colors" /> Ag. Reunião
                                    </button>
                                    <button
                                        onClick={() => handleQuickAction('TASK')}
                                        className="px-3 py-1.5 hover:bg-orange-500/10 text-slate-500 hover:text-orange-400 text-xs font-medium rounded-md transition-colors flex items-center gap-2 group"
                                    >
                                        <Clock size={14} className="group-hover:text-orange-400 transition-colors" /> Ag. Tarefa
                                    </button>
                                </div>

                                <div className="relative group">
                                    <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="Escreva..."
                                        className="w-full min-h-[120px] bg-slate-900/50 border border-slate-600 ring-1 ring-slate-500/30 focus:border-primary-500 focus:ring-primary-500/40 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none transition-all resize-none"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.metaKey && note.trim()) {
                                                onAddActivity({
                                                    type: 'NOTE',
                                                    title: 'Nota',
                                                    description: note,
                                                    date: new Date().toISOString(),
                                                    completed: true
                                                });
                                                setNote('');
                                            }
                                        }}
                                    />
                                    <div className="absolute right-2 bottom-2 flex items-center gap-2">
                                        <span className="text-[10px] text-slate-700 border border-slate-800 rounded px-1.5 py-0.5">
                                            ⌘ + Enter
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* COL 2: Workspace (Fixed Width) */}
                        <div className="w-[400px] flex flex-col min-h-0 bg-slate-900/20 border-l border-white/5 relative">
                            {/* Workspace Tabs */}
                            <div className="shrink-0 flex items-center px-4 h-14 border-b border-white/5 gap-4">
                                {['chat', 'notas', 'scripts', 'files'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`relative h-full flex items-center justify-center text-xs font-semibold uppercase tracking-wider transition-all ${activeTab === tab
                                            ? 'text-primary-400 shadow-[0_4px_20px_-10px_rgba(var(--primary-500),0.3)]'
                                            : 'text-slate-500 hover:text-slate-300'
                                            }`}
                                    >
                                        {tab === 'notas' ? 'Notas' : tab === 'chat' ? 'Chat IA' : tab === 'scripts' ? 'Scripts' : 'Arquivos'}
                                        {activeTab === tab && (
                                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 shadow-[0_0_15px_rgba(var(--primary-500),0.8)]" />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Global Notes (Persistent) */}
                            {/* Notes - Real persistence */}
                            {activeTab === 'notas' && (
                                <div className="flex-1 flex flex-col bg-[#1A1A1A]">
                                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notas do Deal</span>
                                        {createNote.isPending && (
                                            <span className="text-[10px] text-primary-400 flex items-center gap-1">
                                                <Loader2 size={10} className="animate-spin" /> Salvando...
                                            </span>
                                        )}
                                    </div>

                                    {/* New note input */}
                                    <div className="p-4 border-b border-white/5">
                                        <textarea
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            className="w-full bg-slate-900/50 border border-white/5 rounded-lg p-3 text-sm text-slate-300 placeholder:text-slate-600 resize-none focus:outline-none focus:border-primary-500/50 min-h-[160px]"
                                            placeholder="Escreva uma nota..."
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && e.metaKey) {
                                                    handleNoteSubmit();
                                                }
                                            }}
                                        />
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-[10px] text-slate-600">⌘+Enter para salvar</span>
                                            <button
                                                onClick={handleNoteSubmit}
                                                disabled={!note.trim() || createNote.isPending}
                                                className="px-3 py-1.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
                                            >
                                                Adicionar
                                            </button>
                                        </div>
                                    </div>

                                    {/* Notes list */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {isNotesLoading ? (
                                            <div className="flex items-center justify-center py-8">
                                                <Loader2 size={20} className="text-slate-500 animate-spin" />
                                            </div>
                                        ) : notes.length === 0 ? (
                                            <p className="text-sm text-slate-600 text-center py-8">Nenhuma nota ainda</p>
                                        ) : (
                                            notes.map((n) => (
                                                <div key={n.id} className="p-3 bg-slate-800/30 rounded-lg border border-white/5 group">
                                                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{n.content}</p>
                                                    <div className="flex justify-between items-center mt-2">
                                                        <span className="text-[10px] text-slate-600">
                                                            {new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        <button
                                                            onClick={() => deleteNote.mutate(n.id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-400 transition-all"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Quick Scripts - From database */}
                            {activeTab === 'scripts' && (
                                <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-800">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <p className="text-xs font-semibold text-slate-500 flex items-center gap-2">
                                            Templates de Venda
                                            {isScriptsLoading && <Loader2 size={12} className="animate-spin" />}
                                        </p>
                                        <button
                                            onClick={() => {
                                                setEditingScript(null);
                                                setIsScriptEditorOpen(true);
                                            }}
                                            className="flex items-center gap-1 text-[10px] px-2 py-1 bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 rounded-md transition-colors"
                                        >
                                            <Plus size={12} />
                                            Criar
                                        </button>
                                    </div>

                                    {/* AI Script Generator */}
                                    <div className="mb-4 p-3 bg-gradient-to-br from-primary-500/10 to-purple-500/10 rounded-lg border border-primary-500/20">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles size={14} className="text-primary-400" />
                                            <span className="text-xs font-medium text-white">Gerar Script com IA</span>
                                        </div>
                                        <div className="flex gap-2">
                                            {(['followup', 'closing', 'objection', 'rescue'] as ScriptCategory[]).map((type) => (
                                                <button
                                                    key={type}
                                                    onClick={async () => {
                                                        try {
                                                            const result = await generateSalesScript({
                                                                deal: { title: deal.title },
                                                                scriptType: type,
                                                                context: `Estágio: ${currentStage?.label || deal.status}. Contato: ${contact?.name || 'Cliente'}.`,
                                                            });

                                                            if (result?.script) {
                                                                setNote(result.script);
                                                                navigator.clipboard.writeText(result.script);
                                                            }
                                                        } catch (err) {
                                                            console.error('AI Script error:', err);
                                                        }
                                                    }}
                                                    className="flex-1 text-[9px] px-2 py-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors capitalize"
                                                >
                                                    {type === 'followup' ? 'Follow-up' : type === 'closing' ? 'Fechamento' : type === 'objection' ? 'Objeção' : 'Resgate'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {scripts.map((script) => {
                                            const categoryInfo = getCategoryInfo(script.category);
                                            return (
                                                <div
                                                    key={script.id}
                                                    className={`p-4 bg-slate-800/40 rounded-xl border border-white/5 hover:border-slate-600 hover:bg-slate-800/80 transition-all cursor-pointer group ${copiedScript === script.id ? 'ring-2 ring-emerald-500/50' : ''
                                                        }`}
                                                    onClick={() => {
                                                        copyScript(script.template, script.id);
                                                        setNote(applyVariables(script.template, { nome: contact?.name?.split(' ')[0] || 'Cliente' }));
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`px-2 py-0.5 rounded text-[10px] font-medium bg-${categoryInfo.color}-500/20 text-${categoryInfo.color}-400`}>
                                                                {categoryInfo.label}
                                                            </div>
                                                            <span className="text-sm font-semibold text-white">
                                                                {script.title}
                                                            </span>
                                                            {script.is_system && (
                                                                <span className="text-[9px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">Sistema</span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {copiedScript === script.id && (
                                                                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                                                                    <CheckCircle2 size={10} /> Copiado!
                                                                </span>
                                                            )}
                                                            {/* Edit/Delete for user scripts */}
                                                            {!script.is_system && (
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingScript({
                                                                                id: script.id,
                                                                                title: script.title,
                                                                                category: script.category,
                                                                                template: script.template,
                                                                                icon: script.icon,
                                                                            });
                                                                            setIsScriptEditorOpen(true);
                                                                        }}
                                                                        className="p-1 text-slate-500 hover:text-primary-400 hover:bg-primary-500/10 rounded transition-colors"
                                                                        title="Editar"
                                                                    >
                                                                        <FileText size={12} />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (confirm('Excluir este script?')) {
                                                                                deleteScript.mutate(script.id);
                                                                            }
                                                                        }}
                                                                        className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                                        title="Excluir"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 group-hover:text-slate-300">
                                                        {applyVariables(script.template, { nome: contact?.name?.split(' ')[0] || 'Cliente' })}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Files - Real Storage */}
                            {activeTab === 'files' && (
                                <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-800">
                                    {/* Upload area */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                    />
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center mb-6 transition-all cursor-pointer ${uploadFile.isPending
                                            ? 'border-primary-500 bg-primary-500/10'
                                            : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'
                                            }`}
                                    >
                                        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center mb-2">
                                            {uploadFile.isPending ? (
                                                <Loader2 size={20} className="text-primary-400 animate-spin" />
                                            ) : (
                                                <Plus size={20} className="text-slate-400" />
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-white">
                                            {uploadFile.isPending ? 'Enviando...' : 'Adicionar arquivo'}
                                        </p>
                                        <p className="text-xs text-slate-500">Clique ou arraste (máx 10MB)</p>
                                    </div>

                                    <p className="text-xs font-semibold text-slate-500 mb-3 px-1 flex items-center gap-2">
                                        Arquivos do Deal
                                        {isFilesLoading && <Loader2 size={12} className="animate-spin" />}
                                    </p>

                                    <div className="space-y-2">
                                        {files.length === 0 && !isFilesLoading ? (
                                            <p className="text-sm text-slate-600 text-center py-4">Nenhum arquivo ainda</p>
                                        ) : (
                                            files.map((file) => {
                                                const ext = file.file_name.split('.').pop()?.toUpperCase() || 'FILE';
                                                return (
                                                    <div key={file.id} className="flex items-center p-3 rounded-lg bg-slate-800/20 border border-white/5 hover:bg-slate-800/40 transition-colors group">
                                                        <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-xs font-bold text-slate-400 border border-white/5 uppercase shrink-0">
                                                            {ext.slice(0, 3)}
                                                        </div>
                                                        <div className="ml-3 flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-white truncate">{file.file_name}</p>
                                                            <p className="text-xs text-slate-500">
                                                                {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString('pt-BR')}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => downloadFile(file)}
                                                            className="p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors"
                                                        >
                                                            <Download size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => deleteFile.mutate({ fileId: file.id, filePath: file.file_path })}
                                                            className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Chat - AI Assistant Embedded */}
                            {activeTab === 'chat' && (
                                <div className="flex-1 min-h-0 bg-slate-950 overflow-hidden">
                                    <React.Suspense
                                        fallback={
                                            <div className="flex items-center justify-center h-full">
                                                <Loader2 size={24} className="animate-spin text-primary-500" />
                                            </div>
                                        }
                                    >
                                        <AIAssistant
                                            isOpen={true}
                                            onClose={() => setActiveTab('notas')}
                                            variant="sidebar"
                                            activeBoard={board}
                                            dealId={deal.id}
                                            contactId={contact?.id}
                                            cockpitSnapshot={cockpitSnapshot}
                                            contextMode="props-only"
                                        />
                                    </React.Suspense>
                                </div>
                            )}
                        </div>
                    </main>
                </div >
            </div >

            {/* Call Log Modal */}
            <CallModal
                isOpen={isCallModalOpen}
                onClose={() => setIsCallModalOpen(false)}
                onSave={handleCallLogSave}
                contactName={contact?.name || 'Contato'}
                contactPhone={contact?.phone || ''}
                suggestedTitle={callSuggestedTitle}
            />

            {/* Script Editor Modal */}
            <ScriptEditorModal
                isOpen={isScriptEditorOpen}
                onClose={() => {
                    setIsScriptEditorOpen(false);
                    setEditingScript(null);
                }}
                onSave={async (scriptData) => {
                    if (editingScript?.id) {
                        await updateScript.mutateAsync({
                            scriptId: editingScript.id,
                            input: {
                                title: scriptData.title,
                                category: scriptData.category,
                                template: scriptData.template,
                                icon: scriptData.icon,
                            },
                        });
                    } else {
                        await createScript.mutateAsync({
                            title: scriptData.title,
                            category: scriptData.category,
                            template: scriptData.template,
                            icon: scriptData.icon,
                        });
                    }
                }}
                initialData={editingScript}
                previewVariables={{
                    nome: contact?.name?.split(' ')[0] || 'Cliente',
                    empresa: 'Empresa',
                }}
            />

            {/* Schedule Modal */}
            <ScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                onSave={handleScheduleSave}
                contactName={contact?.name || 'Contato'}
                initialType={scheduleType}
            />
        </>
    );
};

// Lazy load AIAssistant to avoid circular dependencies and bundle bloat
const AIAssistant = React.lazy(() => import('@/components/AIAssistant'));

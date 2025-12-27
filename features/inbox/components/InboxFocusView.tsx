import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  SkipForward,
  Phone,
  Calendar,
  Mail,
  CheckCircle2,
  FileText,
  AlertTriangle,
  UserX,
  TrendingUp,
  Building2,
  Maximize2
} from 'lucide-react';
import { FocusItem, AISuggestion } from '../hooks/useInboxController';
import { Activity, DealView } from '@/types';
import { FocusContextPanel } from './FocusContextPanel';
import { useCRM } from '@/context/CRMContext';
import { useMoveDealSimple } from '@/lib/query/hooks';
import { useAuth } from '@/context/AuthContext';
import { InboxZeroState } from './InboxZeroState';

// Performance: reuse Intl formatter instances (avoid per-render allocations).
const PT_BR_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

function normalizeTitleKey(value: string) {
  // UX: normalize titles for robust matching (trim/collapse whitespace/remove quotes).
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ');
}

function tryExtractContactNameFromText(text?: string) {
  if (!text) return '';

  // Common patterns in the app (pt-BR):
  // - "Ligar para o cliente Amanda Ribeiro"
  // - "Reativar cliente: Amanda Ribeiro"
  const match =
    text.match(/cliente:\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i)
    || text.match(/cliente\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);

  return match?.[1] ?? '';
}

interface InboxFocusViewProps {
  currentItem: FocusItem | null;
  currentIndex: number;
  totalItems: number;
  onDone: () => void;
  onSnooze: () => void;
  onSkip: () => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Componente React `InboxFocusView`.
 *
 * @param {InboxFocusViewProps} {
  currentItem,
  currentIndex,
  totalItems,
  onDone,
  onSnooze,
  onSkip,
  onPrev,
  onNext,
} - Parâmetro `{
  currentItem,
  currentIndex,
  totalItems,
  onDone,
  onSnooze,
  onSkip,
  onPrev,
  onNext,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const InboxFocusView: React.FC<InboxFocusViewProps> = ({
  currentItem,
  currentIndex,
  totalItems,
  onDone,
  onSnooze,
  onSkip,
  onPrev,
  onNext,
}) => {
  const [showContext, setShowContext] = useState(false);
  const [manualDealId, setManualDealId] = useState('');
  const [contextSearch, setContextSearch] = useState('');
  const {
    deals,
    contacts,
    companies,
    boards,
    activeBoard,
    activities,
    updateDeal,
    addActivity,
    updateActivity,
    setSidebarCollapsed,
  } = useCRM();
  const { profile } = useAuth();

  useEffect(() => {
    // UX: when moving between items, reset any manual context selection.
    setManualDealId('');
    setContextSearch('');
  }, [currentItem?.id]);

  // Performance: build lookup maps once to avoid repeated `.find(...)` in `contextData`.
  const dealsById = useMemo(() => new Map(deals.map(d => [d.id, d])), [deals]);
  // UX: alguns itens (ex.: atividades) podem vir sem `dealId` mas com `dealTitle`.
  // Criamos um lookup por título para conseguir abrir o painel “Ver detalhes”.
  const dealsByTitleKey = useMemo(() => {
    const map = new Map<string, DealView[]>();
    for (const d of deals) {
      const key = normalizeTitleKey(d.title ?? '');
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(d);
      else map.set(key, [d]);
    }
    return map;
  }, [deals]);
  const contactsById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const boardsById = useMemo(() => new Map(boards.map(b => [b.id, b])), [boards]);

  /**
   * Performance: group & sort activities by dealId once.
   * Avoid `activities.filter(...).sort(...)` every time the focused item changes.
   */
  const activitiesByDealIdSorted = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      if (!a.dealId) continue;
      const list = map.get(a.dealId);
      if (list) list.push(a);
      else map.set(a.dealId, [a]);
    }
    for (const [dealId, list] of map) {
      list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      map.set(dealId, list);
    }
    return map;
  }, [activities]);

  // Context data for Cockpit
  const contextData = useMemo(() => {
    if (!currentItem) return null;

    let dealId = manualDealId || '';
    let contactId = '';
    let extractedContactName = '';

    if (currentItem.type === 'activity') {
      const act = currentItem.data as Activity;
      dealId = dealId || act.dealId || '';
      // Fallback: muitas telas exibem apenas `dealTitle` mesmo quando `dealId` está vazio.
      // Tentamos resolver o deal por título para permitir abrir o painel de contexto.
      if (!dealId && act.dealTitle) {
        const key = normalizeTitleKey(act.dealTitle);
        const matches = dealsByTitleKey.get(key);
        if (matches && matches.length > 0) {
          dealId = matches[0].id;
        }
      }

      // Tenta extrair nome do contato da descrição (ex: "O cliente Amanda Ribeiro não compra...")
      extractedContactName =
        tryExtractContactNameFromText(act.description)
        || tryExtractContactNameFromText(act.title)
        || '';

      // Também tenta no título (ex: "... para Amanda Ribeiro")
      if (!extractedContactName) {
        const titleMatch = act.title?.match(/para\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
        if (titleMatch) extractedContactName = titleMatch[1];
      }
    } else {
      const sugg = currentItem.data as AISuggestion;
      dealId = dealId || sugg.data.deal?.id || '';
      contactId = sugg.data.contact?.id || '';
    }

    const deal = dealId ? dealsById.get(dealId) : undefined;

    // Busca contato por ID, por contactId do deal, ou pelo nome extraído
    const primaryContactId = contactId || deal?.contactId || '';
    let contact = primaryContactId ? contactsById.get(primaryContactId) : undefined;
    if (!contact && extractedContactName) {
      const needle = extractedContactName.toLowerCase();
      contact = contacts.find(c => c.name?.toLowerCase().includes(needle));
    }

    const dealActivities = deal ? (activitiesByDealIdSorted.get(deal.id) ?? []) : [];
    const board = deal ? (boardsById.get(deal.boardId) ?? null) : activeBoard;

    // Se não tem deal mas tem contact, cria um placeholder para o Cockpit
    const nowIso = new Date().toISOString();
    const placeholderDeal = !deal && contact ? {
      id: `placeholder-${contact.id}`,
      title: `Reativar: ${contact.name}`,
      contactId: contact.id,
      boardId: activeBoard?.id || '',
      value: contact.totalValue || 0,
      status: activeBoard?.stages[0]?.id || '',
      isWon: false,
      isLost: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      probability: 30,
      priority: 'medium' as const,
      owner: { name: 'Eu', avatar: '' },
      tags: ['Resgate'],
      items: [],
    } : null;

    return {
      deal: deal || placeholderDeal,
      contact,
      activities: dealActivities,
      board,
      isPlaceholder: !deal && !!placeholderDeal
    };
  }, [currentItem, manualDealId, dealsById, dealsByTitleKey, contactsById, contacts, activitiesByDealIdSorted, boardsById, activeBoard]);

  const { moveDeal } = useMoveDealSimple(contextData?.board ?? null, []);

  const handleMoveStage = (stageId: string) => contextData?.deal && moveDeal(contextData.deal, stageId);
  const handleMarkWon = () => contextData?.deal && updateDeal(contextData.deal.id, { isWon: true, isLost: false, closedAt: new Date().toISOString() });
  const handleMarkLost = () => contextData?.deal && updateDeal(contextData.deal.id, { isWon: false, isLost: true, closedAt: new Date().toISOString() });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (currentIndex > 0) onPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentIndex < totalItems - 1) onNext();
          break;
        case 'Enter':
          e.preventDefault();
          onDone();
          break;
        case ' ': // Space bar
          e.preventDefault();
          setShowContext(!showContext);
          break;
        case 'Escape':
          if (showContext) setShowContext(false);
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          onSnooze();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          onSkip();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, totalItems, showContext, contextData, onPrev, onNext, onSnooze, onSkip, onDone]);

  useEffect(() => {
    setSidebarCollapsed(showContext);
  }, [showContext, setSidebarCollapsed]);

  const normalizedContextSearch = normalizeTitleKey(contextSearch);
  const suggestedDeals = useMemo(() => {
    // UX: if the activity has no deal/contact context (common in generic tasks),
    // allow the user to manually link a deal to bring back the Cockpit panel.
    if (!normalizedContextSearch) return deals.slice(0, 12);
    const results: DealView[] = [];
    for (const d of deals) {
      const key = normalizeTitleKey(d.title ?? '');
      if (!key) continue;
      if (key.includes(normalizedContextSearch)) results.push(d);
      if (results.length >= 12) break;
    }
    return results;
  }, [deals, normalizedContextSearch]);

  if (!currentItem) {
    return <InboxZeroState />;
  }

  const isActivity = currentItem.type === 'activity';
  const activity = isActivity ? (currentItem.data as Activity) : null;
  const suggestion = !isActivity ? (currentItem.data as AISuggestion) : null;

  // Determinar se é atrasado
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isOverdue = activity ? Date.parse(activity.date) < startOfToday.getTime() : false;

  // Ícone baseado no tipo
  const getIcon = () => {
    if (activity) {
      switch (activity.type) {
        case 'CALL': return <Phone size={24} />;
        case 'MEETING': return <Calendar size={24} />;
        case 'EMAIL': return <Mail size={24} />;
        case 'TASK': return <CheckCircle2 size={24} />;
        default: return <FileText size={24} />;
      }
    }
    if (suggestion) {
      switch (suggestion.type) {
        case 'STALLED': return <AlertTriangle size={24} />;
        case 'RESCUE': return <UserX size={24} />;
        case 'UPSELL': return <TrendingUp size={24} />;
        default: return <AlertTriangle size={24} />;
      }
    }
    return <FileText size={24} />;
  };

  // Cor do ícone
  const getIconColor = () => {
    if (isOverdue) return 'text-red-500';
    if (activity) {
      switch (activity.type) {
        case 'CALL': return 'text-blue-500';
        case 'MEETING': return 'text-purple-500';
        default: return 'text-slate-500';
      }
    }
    if (suggestion) {
      switch (suggestion.type) {
        case 'STALLED': return 'text-orange-500';
        case 'RESCUE': return 'text-red-500';
        case 'UPSELL': return 'text-green-500';
        default: return 'text-slate-500';
      }
    }
    return 'text-slate-500';
  };

  // Título e descrição
  const title = activity?.title || suggestion?.title || '';
  const description = activity?.description || suggestion?.description || '';
  const context = activity?.dealTitle || suggestion?.data.deal?.companyName || suggestion?.data.contact?.name || '';
  const value = suggestion?.data.deal?.value;

  // Horário (se for reunião/call)
  const isMeeting = activity?.type === 'MEETING' || activity?.type === 'CALL';
  const timeString = activity ? PT_BR_TIME_FORMATTER.format(new Date(activity.date)) : '';
  const hasResolvedContext = !!(contextData?.deal || contextData?.contact);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-8 animate-fade-in">
      {/* Badge de status */}
      {isOverdue && (
        <div className="mb-4 px-4 py-1.5 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full text-sm font-bold uppercase tracking-wider">
          ⚠️ Atrasado
        </div>
      )}
      {suggestion?.priority === 'high' && (
        <div className="mb-4 px-4 py-1.5 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-full text-sm font-bold uppercase tracking-wider">
          🔥 Urgente
        </div>
      )}

      {/* Horário grande (se for reunião) */}
      {isMeeting && (
        <div className="text-6xl font-bold text-slate-900 dark:text-white mb-4 font-display">
          {timeString}
        </div>
      )}

      {/* Ícone (se não for reunião) */}
      {!isMeeting && (
        <div className={`mb-6 p-4 rounded-2xl bg-slate-100 dark:bg-white/5 ${getIconColor()}`}>
          {getIcon()}
        </div>
      )}

      {/* Título */}
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white text-center mb-3 max-w-lg">
        {title}
      </h1>

      {/* Descrição */}
      {description && (
        <p className="text-slate-500 dark:text-slate-400 text-center mb-4 max-w-md">
          "{description}"
        </p>
      )}

      {/* Contexto (Deal/Empresa) */}
      {context && (
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 mb-2">
          <Building2 size={16} className="text-slate-400" />
          <span>{context}</span>
        </div>
      )}

      {/* Valor (se houver) */}
      {value && (
        <div className="text-lg font-bold text-green-600 dark:text-green-400 mb-6">
          R$ {value.toLocaleString('pt-BR')}
        </div>
      )}

      {/* Ver detalhes - sempre aparece; quando não há contexto, abre painel para vincular um deal */}
      {currentItem && (
        <div className="flex items-center justify-center my-6">
          <button
            onClick={() => setShowContext(true)}
            className="relative flex items-center gap-2 text-yellow-400/70 hover:text-yellow-400 transition-colors font-medium text-sm group cursor-pointer bg-transparent border-0"
          >
            <span
              className="absolute inset-0 -inset-x-8 -inset-y-4 rounded-full bg-yellow-400/20 opacity-75 group-hover:opacity-0 blur-sm"
              style={{
                animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
              }}
            />

            <Maximize2 size={14} className="relative z-10" />
            <span className="relative z-10">{hasResolvedContext ? 'Ver detalhes' : 'Vincular contexto'}</span>
            <kbd className="hidden group-hover:inline-flex h-5 items-center gap-1 rounded border border-yellow-500/20 bg-yellow-500/10 px-1.5 font-mono text-[10px] font-medium text-yellow-500/50 opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out translate-x-1 group-hover:translate-x-0 ml-2">
              SPACE
            </kbd>
          </button>
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-4 mt-8" role="group" aria-label="Ações">
        <button
          onClick={onSnooze}
          className="group flex items-center gap-3 px-6 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-all font-medium border border-transparent hover:border-slate-300 dark:hover:border-white/10"
        >
          <Clock size={18} aria-hidden="true" className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
          <span>Adiar</span>
          <kbd className="hidden group-hover:inline-flex h-5 items-center justify-center rounded border border-slate-300 dark:border-white/10 bg-slate-200 dark:bg-white/5 px-1.5 font-mono text-[10px] uppercase text-slate-500 font-bold opacity-0 group-hover:opacity-100 transition-all">
            A
          </kbd>
        </button>

        <button
          onClick={onDone}
          className="group flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:scale-[1.02] transition-all duration-300 font-bold text-lg border-t border-white/20 ring-1 ring-emerald-600/50"
        >
          <div className="p-1 bg-white/20 rounded-full">
            <Check size={20} aria-hidden="true" strokeWidth={3} />
          </div>
          <span className="text-shadow-sm">Feito</span>
          <kbd className="ml-1 inline-flex h-6 items-center justify-center rounded bg-black/10 px-2 font-sans text-xs text-white/70 font-semibold border border-white/10">
            ⏎
          </kbd>
        </button>

        <button
          onClick={onSkip}
          className="group flex items-center gap-3 px-6 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-all font-medium border border-transparent hover:border-slate-300 dark:hover:border-white/10"
        >
          <span>Pular</span>
          <kbd className="hidden group-hover:inline-flex h-5 items-center justify-center rounded border border-slate-300 dark:border-white/10 bg-slate-200 dark:bg-white/5 px-1.5 font-mono text-[10px] uppercase text-slate-500 font-bold opacity-0 group-hover:opacity-100 transition-all">
            P
          </kbd>
          <SkipForward size={18} aria-hidden="true" className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
        </button>
      </div>

      {/* Navegação */}
      <nav aria-label="Navegação entre itens" className="flex items-center gap-6 mt-12">
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          aria-label="Item anterior"
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5" role="group" aria-label={`Progresso: item ${currentIndex + 1} de ${totalItems}`}>
          {Array.from({ length: Math.min(totalItems, 10) }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={`w-2 h-2 rounded-full transition-all ${i === currentIndex
                ? 'w-6 bg-primary-500'
                : 'bg-slate-300 dark:bg-slate-600'
                }`}
            />
          ))}
          {totalItems > 10 && (
            <span className="text-xs text-slate-400 ml-2">+{totalItems - 10}</span>
          )}
        </div>

        <button
          onClick={onNext}
          disabled={currentIndex >= totalItems - 1}
          aria-label="Próximo item"
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={24} aria-hidden="true" />
        </button>
      </nav>



      {/* Cockpit Panel with AnimatePresence */}
      {createPortal(
        <AnimatePresence>
          {showContext && hasResolvedContext && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30
              }}
              className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm"
            >
              <FocusContextPanel
                className="h-full w-full"
                isExpanded={showContext}
                deal={contextData.deal!}
                contact={contextData.contact}
                board={contextData.board ?? undefined}
                activities={contextData.activities}
                onMoveStage={handleMoveStage}
                onMarkWon={handleMarkWon}
                onMarkLost={handleMarkLost}
                onAddActivity={addActivity}
                onUpdateActivity={updateActivity}
                onClose={() => setShowContext(false)}
              />
            </motion.div>
          )}

          {showContext && !hasResolvedContext && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30
              }}
              className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Vincular contexto"
            >
              <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 shadow-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">Vincular contexto</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Esta atividade não tem deal/contato associado. Selecione um negócio para abrir o Cockpit.
                    </div>
                  </div>
                  <button
                    onClick={() => setShowContext(false)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    aria-label="Fechar"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-4">
                  <input
                    value={contextSearch}
                    onChange={e => setContextSearch(e.target.value)}
                    placeholder="Buscar negócio pelo título…"
                    className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-primary-500/40"
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[50vh] overflow-auto pr-1">
                  {suggestedDeals.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setManualDealId(d.id)}
                      className="text-left rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 px-3 py-2 transition-colors"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{d.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{d.contactName}</div>
                    </button>
                  ))}
                  {suggestedDeals.length === 0 && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center col-span-full">
                      Nenhum negócio encontrado. Tente outro termo.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

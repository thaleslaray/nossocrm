'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity as ActivityIcon,
  BadgeCheck,
  CalendarClock,
  Check,
  Copy,
  FileText,
  Filter,
  HeartPulse,
  Inbox,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
  StickyNote,
  X,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useCRM } from '@/context/CRMContext';
import { useMoveDealSimple } from '@/lib/query/hooks';
import { normalizePhoneE164 } from '@/lib/phone';

import { useAIDealAnalysis, deriveHealthFromProbability } from '@/features/inbox/hooks/useAIDealAnalysis';
import { useDealNotes } from '@/features/inbox/hooks/useDealNotes';
import { useDealFiles } from '@/features/inbox/hooks/useDealFiles';
import { useQuickScripts } from '@/features/inbox/hooks/useQuickScripts';

import { UIChat } from '@/components/ai/UIChat';
import { CallModal, type CallLogData } from '@/features/inbox/components/CallModal';
import { MessageComposerModal, type MessageChannel, type MessageExecutedEvent } from '@/features/inbox/components/MessageComposerModal';
import { ScheduleModal, type ScheduleData, type ScheduleType } from '@/features/inbox/components/ScheduleModal';

import type { QuickScript, ScriptCategory } from '@/lib/supabase/quickScripts';
import type { Activity, Board, BoardStage, Contact, DealView } from '@/types';

type Tab = 'chat' | 'notas' | 'scripts' | 'arquivos';

// Performance: reuse Intl formatter instances (avoid creating them per call).
const PT_BR_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR');
const PT_BR_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

type StageTone = 'blue' | 'violet' | 'amber' | 'green' | 'slate';

type Stage = {
  id: string;
  label: string;
  tone: StageTone;
  rawColor?: string;
};

type TimelineItem = {
  id: string;
  at: string;
  kind: 'status' | 'call' | 'note' | 'system';
  title: string;
  subtitle?: string;
  tone?: 'success' | 'danger' | 'neutral';
};

type ToastTone = 'neutral' | 'success' | 'danger';
type ToastState = { id: string; message: string; tone: ToastTone };

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type TemplatePickerMode = 'WHATSAPP' | 'EMAIL';

type MessageLogContext = {
  source: 'template' | 'generated' | 'manual';
  origin: 'nextBestAction' | 'quickAction';
  template?: { id: string; title: string };
  aiSuggested?: boolean;
  aiActionType?: string;
};

function hashString(input: string): string {
  // Djb2-ish hash para dedupe leve (não criptográfico)
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

function humanizeTestLabel(input: string | null | undefined) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';

  // Remove sufixos de dados de teste gerados automaticamente (ex.: "next-ai_<uuid>")
  return raw.replace(/\s*next-ai[_-][0-9a-f-]{8,}\s*$/i, '').trim();
}

function buildExecutionHeader(opts: {
  channel: 'WHATSAPP' | 'EMAIL';
  context?: MessageLogContext | null;
  outsideCRM?: boolean;
}) {
  const lines: string[] = [];
  lines.push('Fonte: Cockpit');
  lines.push(`Canal: ${opts.channel === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}`);

  if (opts.outsideCRM) {
    lines.push('Fora do CRM: sim');
  }

  const ctx = opts.context;
  if (ctx) {
    const originLabel = ctx.origin === 'nextBestAction' ? 'Próxima ação' : 'Ação rápida';
    lines.push(`Origem: ${originLabel}`);
    lines.push(`Geração: ${ctx.source === 'template' ? 'Template' : ctx.source === 'generated' ? 'Gerado' : 'Manual'}`);
    if (ctx.template) {
      lines.push(`Template: ${ctx.template.title} (${ctx.template.id})`);
    }
    if (typeof ctx.aiSuggested === 'boolean') {
      lines.push(`Sugerido por IA: ${ctx.aiSuggested ? 'sim' : 'não'}`);
    }
    if (ctx.aiActionType) {
      lines.push(`Tipo IA: ${ctx.aiActionType}`);
    }
  }

  return lines.join('\n');
}

function pickEmailPrefill(applied: string, fallbackSubject: string): { subject: string; body: string } {
  const lines = applied.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*(assunto|subject)\s*:\s*/i.test(l));

  if (idx >= 0) {
    const raw = lines[idx] ?? '';
    const subject = raw.replace(/^\s*(assunto|subject)\s*:\s*/i, '').trim() || fallbackSubject;
    const body = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join('\n').trim();
    return { subject, body };
  }

  return { subject: fallbackSubject, body: applied.trim() };
}

function TemplatePickerModal({
  isOpen,
  onClose,
  mode,
  scripts,
  isLoading,
  variables,
  applyVariables,
  getCategoryInfo,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  mode: TemplatePickerMode;
  scripts: QuickScript[];
  isLoading: boolean;
  variables: Record<string, string>;
  applyVariables: (template: string, vars: Record<string, string>) => string;
  getCategoryInfo: (cat: ScriptCategory) => { label: string; color: string };
  onPick: (script: QuickScript) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | ScriptCategory>('all');

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setCategory('all');
  }, [isOpen, mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = category === 'all' ? scripts : scripts.filter((s) => s.category === category);
    if (!q) return base;
    return base.filter((s) => {
      const hay = `${s.title}\n${s.template}`.toLowerCase();
      return hay.includes(q);
    });
  }, [category, query, scripts]);

  const title = mode === 'WHATSAPP' ? 'Templates · WhatsApp' : 'Templates · E-mail';

  if (!isOpen) return null;

  const categories: Array<{ key: 'all' | ScriptCategory; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'followup', label: 'Follow-up' },
    { key: 'intro', label: 'Apresentação' },
    { key: 'objection', label: 'Objeções' },
    { key: 'closing', label: 'Fechamento' },
    { key: 'rescue', label: 'Resgate' },
    { key: 'other', label: 'Outros' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4 rounded-2xl border border-white/10 bg-slate-950 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-100 truncate">{title}</div>
            <div className="text-[11px] text-slate-500">Escolha um script persistido e eu preencho a mensagem com variáveis do deal/contato.</div>
          </div>
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/3 p-2 text-slate-300 hover:bg-white/5"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por título ou texto…"
                  className="w-full rounded-xl border border-white/10 bg-white/3 px-9 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={
                      category === c.key
                        ? 'rounded-full bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/20 px-2.5 py-1 text-[11px] font-semibold'
                        : 'rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/10'
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-500">
              Variáveis: <span className="font-mono">{'{nome}'}</span>, <span className="font-mono">{'{empresa}'}</span>,{' '}
              <span className="font-mono">{'{valor}'}</span>, <span className="font-mono">{'{produto}'}</span>
            </div>

            <div className="h-105 overflow-auto rounded-2xl border border-white/10 bg-white/2">
              {isLoading ? (
                <div className="p-4 text-sm text-slate-400">Carregando scripts…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-slate-400">Nenhum template encontrado.</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filtered.map((s) => {
                    const info = getCategoryInfo(s.category);
                    const preview = applyVariables(s.template, variables);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left p-4 hover:bg-white/5 transition-colors"
                        onClick={() => onPick(s)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${scriptCategoryChipClass(info.color)}`}
                              >
                                {info.label}
                              </span>
                              <span className="truncate text-sm font-semibold text-slate-100">{s.title}</span>
                              {s.is_system ? <span className="text-[10px] text-slate-500">Sistema</span> : null}
                            </div>
                            <div className="mt-2 text-xs text-slate-400 line-clamp-3 whitespace-pre-wrap">{preview}</div>
                          </div>
                          <div className="shrink-0 text-[11px] font-semibold text-cyan-200">Usar</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function scriptCategoryChipClass(color: string): string {
  // Mantém classes estáticas (Tailwind) e evita template strings dinâmicas.
  switch (color) {
    case 'blue':
      return 'bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/20';
    case 'orange':
      return 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/20';
    case 'green':
      return 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/20';
    case 'purple':
      return 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/20';
    case 'yellow':
      return 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/20';
    default:
      return 'bg-slate-500/15 text-slate-200 ring-1 ring-slate-500/20';
  }
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function formatAtISO(iso: string): string {
  const d = new Date(iso);
  const dd = PT_BR_DATE_FORMATTER.format(d);
  const tt = PT_BR_TIME_FORMATTER.format(d);
  return `${dd} · ${tt}`;
}

function formatCurrencyBRL(value: number): string {
  try {
    return BRL_CURRENCY_FORMATTER.format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

function stageToneFromBoardColor(color?: string): StageTone {
  const c = (color ?? '').toLowerCase();
  if (c.includes('emerald') || c.includes('green')) return 'green';
  if (c.includes('violet') || c.includes('purple')) return 'violet';
  if (c.includes('amber') || c.includes('yellow') || c.includes('orange')) return 'amber';
  if (c.includes('blue') || c.includes('sky') || c.includes('cyan')) return 'blue';
  return 'slate';
}

function toneToBg(tone: StageTone): string {
  switch (tone) {
    case 'blue':
      return 'bg-sky-500';
    case 'violet':
      return 'bg-violet-500';
    case 'amber':
      return 'bg-amber-500';
    case 'green':
      return 'bg-emerald-500';
    default:
      return 'bg-slate-600';
  }
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const cls =
    tone === 'success'
      ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/20'
      : tone === 'danger'
        ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/20'
        : 'bg-white/5 text-slate-200 ring-1 ring-white/10';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>
  );
}

function Panel({
  title,
  icon,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/3 ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          {icon}
          <span className="uppercase tracking-wide text-slate-400">{title}</span>
        </div>
        {right}
      </div>
      <div className={`p-4 ${bodyClassName ?? ''}`}>{children}</div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'text-slate-100 border-b-2 border-cyan-400'
          : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent'
      }
    >
      <span className="px-2 py-2 text-xs font-semibold uppercase tracking-wide">{children}</span>
    </button>
  );
}

function normalizeReason(raw?: string) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s*-\s*Sugerido por IA\s*$/i, '').trim();
}

function formatSlot(d: Date) {
  const day = d.toLocaleDateString('pt-BR', { weekday: 'short' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

function proposeTwoSlots() {
  const a = new Date();
  a.setDate(a.getDate() + 1);
  a.setHours(10, 0, 0, 0);

  const b = new Date();
  b.setDate(b.getDate() + 2);
  b.setHours(15, 0, 0, 0);

  return { a, b };
}

function buildSuggestedWhatsAppMessage(opts: {
  contact?: Contact;
  deal?: DealView;
  actionType: string;
  action: string;
  reason?: string;
}) {
  const { contact, deal, actionType, action, reason } = opts;

  const firstName = contact?.name?.split(' ')[0] || '';
  const greeting = firstName ? `Oi ${firstName}, tudo bem?` : 'Oi, tudo bem?';
  const r = normalizeReason(reason);
  const dealTitle = deal?.title?.trim();
  const dealCtx = dealTitle ? ` sobre ${dealTitle}` : '';

  const { a, b } = proposeTwoSlots();
  const reasonSentence = r ? `\n\nPensei nisso porque ${r.charAt(0).toLowerCase()}${r.slice(1)}.` : '';

  if (actionType === 'MEETING') {
    return (
      `${greeting}` +
      `\n\nQueria marcar um papo rápido (15 min)${dealCtx} pra alinharmos os próximos passos.` +
      `${reasonSentence}` +
      `\n\nVocê consegue ${formatSlot(a)} ou ${formatSlot(b)}? Se preferir, me diga um horário bom pra você.`
    );
  }

  if (actionType === 'CALL') {
    return (
      `${greeting}` +
      `\n\nPodemos fazer uma ligação rapidinha${dealCtx}?` +
      `${reasonSentence}` +
      `\n\nVocê prefere ${formatSlot(a)} ou ${formatSlot(b)}?`
    );
  }

  if (actionType === 'TASK') {
    return (
      `${greeting}` +
      `\n\nSó pra alinharmos${dealCtx}: ${action.trim()}.` +
      `${reasonSentence}` +
      `\n\nPode me confirmar quando conseguir?`
    );
  }

  const cleanAction = action?.trim();
  const actionLine = cleanAction ? `\n\n${cleanAction}${dealTitle ? ` (${dealTitle})` : ''}.` : '';
  return `${greeting}${actionLine}${reasonSentence}`;
}

function buildSuggestedEmailBody(opts: {
  contact?: Contact;
  deal?: DealView;
  actionType: string;
  action: string;
  reason?: string;
}) {
  const { contact, deal, actionType, action, reason } = opts;

  const firstName = contact?.name?.split(' ')[0] || '';
  const greeting = firstName ? `Olá ${firstName},` : 'Olá,';
  const r = normalizeReason(reason);
  const dealTitle = deal?.title?.trim();
  const { a, b } = proposeTwoSlots();

  const reasonSentence = r ? `\n\nMotivo: ${r}.` : '';
  const dealSentence = dealTitle ? `\n\nAssunto: ${dealTitle}.` : '';

  if (actionType === 'MEETING') {
    return (
      `${greeting}` +
      `\n\nQueria marcar uma conversa rápida (15 min) para alinharmos próximos passos.` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nVocê teria disponibilidade em ${formatSlot(a)} ou ${formatSlot(b)}?` +
      `\n\nAbs,`
    );
  }

  if (actionType === 'CALL') {
    return (
      `${greeting}` +
      `\n\nPodemos falar rapidamente por telefone?` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nSugestões de horário: ${formatSlot(a)} ou ${formatSlot(b)}.` +
      `\n\nAbs,`
    );
  }

  if (actionType === 'TASK') {
    return (
      `${greeting}` +
      `\n\n${action.trim()}.` +
      `${dealSentence}` +
      `${reasonSentence}` +
      `\n\nAbs,`
    );
  }

  return (
    `${greeting}` +
    `\n\n${action.trim()}.` +
    `${dealSentence}` +
    `${reasonSentence}` +
    `\n\nAbs,`
  );
}

export default function DealCockpitClient({ dealId }: { dealId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const { profile, user } = useAuth();

  const {
    loading: crmLoading,
    error: crmError,
    refresh: refreshCRM,
    deals,
    contacts,
    boards,
    activities,
    addActivity,
    updateDeal,
  } = useCRM();

  const [tab, setTab] = useState<Tab>('chat');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | TimelineItem['kind']>('all');
  const [showSystemEvents, setShowSystemEvents] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  const [noteDraftTimeline, setNoteDraftTimeline] = useState('');
  const [dealNoteDraft, setDealNoteDraft] = useState('');

  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callSuggestedTitle, setCallSuggestedTitle] = useState('Ligação');

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageChannel, setMessageChannel] = useState<MessageChannel>('WHATSAPP');
  const [messagePrefill, setMessagePrefill] = useState<{ subject?: string; message?: string } | null>(null);
  const [messageLogContext, setMessageLogContext] = useState<MessageLogContext | null>(null);
  const [messageLogDedupe, setMessageLogDedupe] = useState<{ key: string; at: number } | null>(null);

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleInitial, setScheduleInitial] = useState<{
    type?: ScheduleType;
    title?: string;
    description?: string;
  } | null>(null);

  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [templatePickerMode, setTemplatePickerMode] = useState<TemplatePickerMode>('WHATSAPP');

  const defaultChecklist: ChecklistItem[] = useMemo(
    () => [
      { id: 'qualify', text: 'Qualificar (dor, urgência, orçamento, decisor)', done: false },
      { id: 'next-step', text: 'Definir próximo passo (data + responsável)', done: false },
      { id: 'materials', text: 'Enviar material / proposta', done: false },
      { id: 'stakeholders', text: 'Mapear decisores e objeções', done: false },
    ],
    []
  );

  const [checklist, setChecklist] = useState<ChecklistItem[]>(defaultChecklist);
  const [checklistDraft, setChecklistDraft] = useState('');

  const actor = useMemo(() => {
    const name =
      profile?.nickname?.trim() ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
      user?.email?.split('@')[0] ||
      'Usuário';

    return {
      name,
      avatar: profile?.avatar_url ?? '',
    };
  }, [profile?.avatar_url, profile?.first_name, profile?.last_name, profile?.nickname, user?.email]);

  // Performance: build lookup maps once (avoid repeated `.find(...)` in memos).
  const dealsById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const boardsById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);

  /**
   * Performance: group & sort activities by dealId once.
   * Avoid filter+sort per selectedDeal change.
   */
  const activitiesByDealIdSorted = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities ?? []) {
      if (!a.dealId) continue;
      const list = map.get(a.dealId);
      if (list) list.push(a);
      else map.set(a.dealId, [a]);
    }
    for (const [id, list] of map) {
      list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      map.set(id, list);
    }
    return map;
  }, [activities]);

  const selectedDeal = useMemo(() => {
    if (dealId) return dealsById.get(dealId) ?? null;
    return deals[0] ?? null;
  }, [deals, dealsById, dealId]);

  const sortedDeals = useMemo(() => {
    return (deals ?? []).slice().sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [deals]);

  const selectedContact = useMemo(() => {
    if (!selectedDeal) return null;
    return contactsById.get(selectedDeal.contactId) ?? null;
  }, [contactsById, selectedDeal]);

  const selectedBoard = useMemo(() => {
    if (!selectedDeal) return null;
    return boardsById.get(selectedDeal.boardId) ?? null;
  }, [boardsById, selectedDeal]);

  const templateVariables = useMemo(() => {
    const nome = selectedContact?.name?.split(' ')[0]?.trim() || 'Cliente';
    const empresa = selectedDeal?.clientCompanyName?.trim() || selectedDeal?.companyName?.trim() || 'Empresa';
    const valor = typeof selectedDeal?.value === 'number' ? formatCurrencyBRL(selectedDeal.value) : '';
    const produto = selectedDeal?.items?.[0]?.name?.trim() || selectedDeal?.title?.trim() || 'Produto';

    return {
      nome,
      empresa,
      valor,
      produto,
    };
  }, [
    selectedContact?.name,
    selectedDeal?.clientCompanyName,
    selectedDeal?.companyName,
    selectedDeal?.items,
    selectedDeal?.title,
    selectedDeal?.value,
  ]);

  const dealActivities = useMemo(() => {
    if (!selectedDeal) return [] as Activity[];
    return activitiesByDealIdSorted.get(selectedDeal.id) ?? [];
  }, [activitiesByDealIdSorted, selectedDeal]);

  const { moveDeal } = useMoveDealSimple(selectedBoard as Board | null, []);

  const stages: Stage[] = useMemo(() => {
    const ss: BoardStage[] = selectedBoard?.stages ?? [];
    return ss.map((s) => ({
      id: s.id,
      label: s.label,
      tone: stageToneFromBoardColor(s.color),
      rawColor: s.color,
    }));
  }, [selectedBoard]);

  const stageId = selectedDeal?.status ?? '';
  const stageSelection = useMemo(() => {
    if (!stages.length) return { stageIndex: 0, activeStage: undefined as Stage | undefined };
    let idx = 0;
    for (let i = 0; i < stages.length; i += 1) {
      if (stages[i]?.id === stageId) {
        idx = i;
        break;
      }
    }
    return { stageIndex: Math.max(0, idx), activeStage: stages[idx] ?? stages[0] };
  }, [stageId, stages]);
  const stageIndex = stageSelection.stageIndex;
  const activeStage = stageSelection.activeStage ?? stages[0];

  const { data: aiAnalysis, isLoading: aiLoading, refetch: refetchAI } = useAIDealAnalysis(
    selectedDeal,
    selectedDeal?.stageLabel
  );

  const health = useMemo(() => {
    const probability = aiAnalysis?.probabilityScore ?? selectedDeal?.probability ?? 50;
    return deriveHealthFromProbability(probability);
  }, [aiAnalysis?.probabilityScore, selectedDeal?.probability]);

  const nextBestAction = useMemo(() => {
    if (aiAnalysis?.action && !aiAnalysis.error) {
      return {
        action: aiAnalysis.action,
        reason: aiAnalysis.reason,
        urgency: aiAnalysis.urgency,
        actionType: aiAnalysis.actionType,
        isAI: true,
      };
    }

    return {
      action: 'Analisar deal manualmente',
      reason: 'Sem sugestão da IA no momento',
      urgency: 'low' as const,
      actionType: 'TASK' as const,
      isAI: false,
    };
  }, [aiAnalysis]);

  const { notes, isLoading: isNotesLoading, createNote, deleteNote } = useDealNotes(selectedDeal?.id);
  const { files, isLoading: isFilesLoading, uploadFile, deleteFile, downloadFile, formatFileSize } = useDealFiles(selectedDeal?.id);
  const { scripts, isLoading: isScriptsLoading, applyVariables, getCategoryInfo } = useQuickScripts();

  const cockpitSnapshot = useMemo(() => {
    if (!selectedDeal) return null;

    const stageInfo = activeStage
      ? { id: activeStage.id, label: activeStage.label, color: activeStage.rawColor ?? '' }
      : undefined;

    const boardInfo = selectedBoard
      ? {
          id: selectedBoard.id,
          name: selectedBoard.name,
          description: selectedBoard.description,
          wonStageId: selectedBoard.wonStageId,
          lostStageId: selectedBoard.lostStageId,
          stages: (selectedBoard.stages ?? []).map((s) => ({ id: s.id, label: s.label, color: s.color })),
        }
      : undefined;

    const contactInfo = selectedContact
      ? {
          id: selectedContact.id,
          name: selectedContact.name,
          role: selectedContact.role,
          email: selectedContact.email,
          phone: selectedContact.phone,
          avatar: selectedContact.avatar,
          status: selectedContact.status,
          stage: selectedContact.stage,
          source: selectedContact.source,
          notes: selectedContact.notes,
          lastInteraction: selectedContact.lastInteraction,
          birthDate: selectedContact.birthDate,
          lastPurchaseDate: selectedContact.lastPurchaseDate,
          totalValue: selectedContact.totalValue,
          clientCompanyId: selectedContact.clientCompanyId,
        }
      : undefined;

    const dealInfo = {
      id: selectedDeal.id,
      title: selectedDeal.title,
      value: selectedDeal.value,
      status: selectedDeal.status,
      isWon: selectedDeal.isWon,
      isLost: selectedDeal.isLost,
      probability: selectedDeal.probability,
      priority: selectedDeal.priority,
      owner: selectedDeal.owner,
      ownerId: selectedDeal.ownerId,
      nextActivity: selectedDeal.nextActivity,
      tags: selectedDeal.tags,
      items: selectedDeal.items,
      customFields: selectedDeal.customFields,
      lastStageChangeDate: selectedDeal.lastStageChangeDate,
      lossReason: selectedDeal.lossReason,
      createdAt: selectedDeal.createdAt,
      updatedAt: selectedDeal.updatedAt,
      companyId: selectedDeal.companyId,
      clientCompanyId: selectedDeal.clientCompanyId,
      companyName: selectedDeal.companyName,
      clientCompanyName: selectedDeal.clientCompanyName,
      stageLabel: selectedDeal.stageLabel,
    };

    const activitiesLimit = 25;
    const activitiesPreview = (dealActivities ?? []).slice(0, activitiesLimit).map((a) => ({
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
        source: 'deal-cockpit',
        version: 1,
      },
      deal: dealInfo,
      contact: contactInfo,
      board: boardInfo,
      stage: stageInfo,
      cockpitSignals: {
        nextBestAction,
        aiAnalysis: aiAnalysis ?? null,
        aiAnalysisLoading: aiLoading,
      },
      lists: {
        activities: {
          total: (dealActivities ?? []).length,
          preview: activitiesPreview,
          limit: activitiesLimit,
          truncated: (dealActivities ?? []).length > activitiesLimit,
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
    selectedDeal,
    selectedContact,
    selectedBoard,
    activeStage,
    dealActivities,
    notes,
    files,
    scripts,
    nextBestAction,
    aiAnalysis,
    aiLoading,
    isNotesLoading,
    isFilesLoading,
    isScriptsLoading,
  ]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    for (const a of dealActivities) {
      const kind: TimelineItem['kind'] = a.type === 'CALL' ? 'call' : a.type === 'STATUS_CHANGE' ? 'status' : 'note';

      const tone: TimelineItem['tone'] =
        a.type === 'STATUS_CHANGE'
          ? `${a.title ?? ''} ${a.description ?? ''}`.toLowerCase().includes('ganh')
            ? 'success'
            : `${a.title ?? ''} ${a.description ?? ''}`.toLowerCase().includes('perd')
              ? 'danger'
              : 'neutral'
          : undefined;

      const subtitle = a.description?.trim() ? a.description.trim() : undefined;

      items.push({
        id: a.id,
        at: formatAtISO(a.date),
        kind,
        title: a.title || a.type,
        subtitle,
        tone,
      });
    }

    return items;
  }, [dealActivities]);

  const filteredTimelineItems = useMemo(() => {
    return timelineItems.filter((t) => {
      if (!showSystemEvents && t.kind === 'system') return false;
      if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return `${t.title} ${t.subtitle ?? ''}`.toLowerCase().includes(q);
    });
  }, [kindFilter, query, showSystemEvents, timelineItems]);

  const latestNonSystem = useMemo(() => timelineItems.find((t) => t.kind !== 'system') ?? null, [timelineItems]);
  const latestCall = useMemo(() => timelineItems.find((t) => t.kind === 'call') ?? null, [timelineItems]);
  const latestMove = useMemo(() => timelineItems.find((t) => t.kind === 'status') ?? null, [timelineItems]);

  const pushToast = useCallback((message: string, tone: ToastTone = 'neutral') => {
    const id = uid('toast');
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 2400);
  }, []);

  const copyToClipboard = useCallback(
    async (label: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        pushToast(`${label} copiado`, 'success');
      } catch {
        pushToast(`Não foi possível copiar ${label.toLowerCase()}`, 'danger');
      }
    },
    [pushToast]
  );

  const openMessageComposer = useCallback(
    (channel: MessageChannel, prefill?: { subject?: string; message?: string }, ctx?: MessageLogContext | null) => {
      setMessageChannel(channel);
      setMessagePrefill(prefill ?? null);
      setMessageLogContext(ctx ?? null);
      setIsMessageModalOpen(true);
    },
    []
  );

  const openScheduleModal = useCallback((initial?: { type?: ScheduleType; title?: string; description?: string }) => {
    setScheduleInitial(initial ?? null);
    setIsScheduleModalOpen(true);
  }, []);

  const openTemplatePicker = useCallback((mode: TemplatePickerMode) => {
    setTemplatePickerMode(mode);
    setIsTemplatePickerOpen(true);
  }, []);

  const handlePickTemplate = useCallback(
    (script: QuickScript) => {
      if (!selectedDeal) return;

      const applied = applyVariables(script.template, templateVariables);

      if (templatePickerMode === 'WHATSAPP') {
        openMessageComposer(
          'WHATSAPP',
          { message: applied },
          {
            source: 'template',
            origin: 'nextBestAction',
            template: { id: script.id, title: script.title },
            aiSuggested: nextBestAction.isAI,
            aiActionType: nextBestAction.actionType,
          }
        );
        setIsTemplatePickerOpen(false);
        return;
      }

      const fallbackSubject = `Sobre ${selectedDeal.title}`;
      const { subject, body } = pickEmailPrefill(applied, fallbackSubject);
      openMessageComposer(
        'EMAIL',
        { subject, message: body },
        {
          source: 'template',
          origin: 'nextBestAction',
          template: { id: script.id, title: script.title },
          aiSuggested: nextBestAction.isAI,
          aiActionType: nextBestAction.actionType,
        }
      );
      setIsTemplatePickerOpen(false);
    },
    [
      applyVariables,
      nextBestAction.actionType,
      nextBestAction.isAI,
      openMessageComposer,
      selectedDeal,
      templatePickerMode,
      templateVariables,
    ]
  );

  const setDealInUrl = useCallback(
    (nextDealId: string) => {
      // Rota canônica: /deals/[dealId]/cockpit
      if (pathname?.includes('/deals/') && pathname.endsWith('/cockpit')) {
        if (!nextDealId) return;
        router.replace(`/deals/${nextDealId}/cockpit`);
        return;
      }

      // Compat (ponte): /labs/deal-cockpit-mock?dealId=...
      const sp = new URLSearchParams(searchParams?.toString());
      if (nextDealId) sp.set('dealId', nextDealId);
      else sp.delete('dealId');
      router.replace(`?${sp.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const normalizeChecklist = useCallback(
    (raw: unknown): ChecklistItem[] | null => {
      if (!Array.isArray(raw)) return null;
      const items: ChecklistItem[] = [];
      for (const it of raw) {
        if (!it || typeof it !== 'object') continue;
        const anyIt = it as any;
        const id = typeof anyIt.id === 'string' && anyIt.id ? anyIt.id : uid('chk');
        const text = typeof anyIt.text === 'string' ? anyIt.text.trim() : '';
        const done = Boolean(anyIt.done);
        if (!text) continue;
        items.push({ id, text, done });
      }
      return items.length ? items : [];
    },
    []
  );

  const loadChecklistFromDeal = useCallback(() => {
    const raw = (selectedDeal?.customFields as any)?.cockpitChecklist;
    const parsed = normalizeChecklist(raw);
    setChecklist(parsed ?? defaultChecklist);
    setChecklistDraft('');
  }, [defaultChecklist, normalizeChecklist, selectedDeal?.customFields]);

  useEffect(() => {
    loadChecklistFromDeal();
  }, [loadChecklistFromDeal, selectedDeal?.id]);

  const persistChecklist = useCallback(
    async (next: ChecklistItem[]) => {
      if (!selectedDeal) return;
      setChecklist(next);

      const nextCustomFields = {
        ...(selectedDeal.customFields ?? {}),
        cockpitChecklist: next,
      };
      try {
        await updateDeal(selectedDeal.id, { customFields: nextCustomFields });
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível salvar o checklist.'), 'danger');
      }
    },
    [pushToast, selectedDeal, updateDeal]
  );

  const handleMessageExecuted = useCallback(
    async (ev: MessageExecutedEvent) => {
      if (!selectedDeal) return;

      const payloadKey = `${ev.channel}|${ev.subject ?? ''}|${ev.message ?? ''}`;
      const nextKey = hashString(payloadKey);
      const now = Date.now();

      // Dedupe best-effort (duplo clique / evento repetido)
      if (messageLogDedupe && messageLogDedupe.key === nextKey && now - messageLogDedupe.at < 1500) {
        return;
      }
      setMessageLogDedupe({ key: nextKey, at: now });

      const header = buildExecutionHeader({
        channel: ev.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL',
        context: messageLogContext,
      });

      if (ev.channel === 'WHATSAPP') {
        const msg = ev.message?.trim() ? ev.message.trim() : 'Mensagem enviada via WhatsApp.';
        try {
          await addActivity({
            dealId: selectedDeal.id,
            dealTitle: selectedDeal.title,
            type: 'NOTE',
            title: 'WhatsApp',
            description: `${header}\n\n---\n\n${msg}`,
            date: new Date().toISOString(),
            completed: true,
            user: actor,
          });
          pushToast('WhatsApp registrado', 'success');
          setMessageLogContext(null);
        } catch (e) {
          pushToast(errorMessage(e, 'Não foi possível registrar o WhatsApp.'), 'danger');
        }
        return;
      }

      const subject = ev.subject?.trim() ? ev.subject.trim() : 'Email';
      const body = ev.message?.trim() ? ev.message.trim() : 'Email enviado.';

      try {
        await addActivity({
          dealId: selectedDeal.id,
          dealTitle: selectedDeal.title,
          type: 'EMAIL',
          title: subject,
          description: `${header}\nAssunto: ${subject}\n\n---\n\n${body}`,
          date: new Date().toISOString(),
          completed: true,
          user: actor,
        });
        pushToast('Email registrado', 'success');
        setMessageLogContext(null);
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível registrar o email.'), 'danger');
      }
    },
    [addActivity, actor, messageLogContext, messageLogDedupe, pushToast, selectedDeal]
  );

  const handleScheduleSave = useCallback(
    async (data: ScheduleData) => {
      if (!selectedDeal) return;

      // data.date = YYYY-MM-DD, data.time = HH:mm
      const when = new Date(`${data.date}T${data.time}:00`);
      try {
        await addActivity({
          dealId: selectedDeal.id,
          dealTitle: selectedDeal.title,
          type: data.type,
          title: data.title,
          description: data.description,
          date: when.toISOString(),
          completed: false,
          user: actor,
        });
        pushToast('Atividade agendada', 'success');
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível agendar a atividade.'), 'danger');
      }
    },
    [addActivity, actor, pushToast, selectedDeal]
  );

  const handleCall = useCallback(
    (suggestedTitle?: string) => {
      if (!selectedContact?.phone) {
        pushToast('Contato sem telefone', 'danger');
        return;
      }
      setCallSuggestedTitle(suggestedTitle || 'Ligação');
      setIsCallModalOpen(true);
    },
    [pushToast, selectedContact?.phone]
  );

  const handleCallLogSave = useCallback(
    async (data: CallLogData) => {
      if (!selectedDeal) return;

      const outcomeLabels = {
        connected: 'Atendeu',
        no_answer: 'Não atendeu',
        voicemail: 'Caixa postal',
        busy: 'Ocupado',
      };

      try {
        await addActivity({
          dealId: selectedDeal.id,
          dealTitle: selectedDeal.title,
          type: 'CALL',
          title: data.title,
          description: `${outcomeLabels[data.outcome]} - Duração: ${Math.floor(data.duration / 60)}min ${data.duration % 60}s${
            data.notes ? `\n\n${data.notes}` : ''
          }`,
          date: new Date().toISOString(),
          completed: true,
          user: actor,
        });

        pushToast('Ligação registrada', 'success');
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível registrar a ligação.'), 'danger');
      }
    },
    [addActivity, actor, pushToast, selectedDeal]
  );

  const handleExecuteNext = useCallback(async () => {
    if (!selectedDeal) return;

    const { action, reason, actionType } = nextBestAction;

    if (actionType === 'CALL') {
      handleCall(action);
      return;
    }

    if (actionType === 'WHATSAPP') {
      openMessageComposer(
        'WHATSAPP',
        {
          message: buildSuggestedWhatsAppMessage({
            contact: selectedContact ?? undefined,
            deal: selectedDeal,
            actionType: 'TASK',
            action,
            reason,
          }),
        },
        {
          source: 'generated',
          origin: 'nextBestAction',
          aiSuggested: nextBestAction.isAI,
          aiActionType: nextBestAction.actionType,
        }
      );
      return;
    }

    if (actionType === 'EMAIL') {
      openMessageComposer(
        'EMAIL',
        {
          subject: action,
          message: buildSuggestedEmailBody({
            contact: selectedContact ?? undefined,
            deal: selectedDeal,
            actionType: 'TASK',
            action,
            reason,
          }),
        },
        {
          source: 'generated',
          origin: 'nextBestAction',
          aiSuggested: nextBestAction.isAI,
          aiActionType: nextBestAction.actionType,
        }
      );
      return;
    }

    // MEETING/TASK: agenda (modal real)
    if (actionType === 'MEETING') {
      openScheduleModal({
        type: 'MEETING',
        title: action,
        description: `${reason} - Sugerido por IA`,
      });
      return;
    }

    openScheduleModal({
      type: 'TASK',
      title: action,
      description: `${reason} - Sugerido por IA`,
    });
  }, [handleCall, nextBestAction, openMessageComposer, openScheduleModal, selectedContact, selectedDeal]);

  const handleStageChange = useCallback(
    async (nextStageId: string) => {
      if (!selectedDeal) return;
      if (!selectedBoard) return;
      if (nextStageId === selectedDeal.status) return;

      try {
        await moveDeal(selectedDeal, nextStageId);
        const next = selectedBoard.stages.find((s) => s.id === nextStageId);
        pushToast(`Etapa: ${next?.label ?? 'Atualizada'}`, 'success');

        // Log na timeline (best-effort)
        try {
          await addActivity({
            dealId: selectedDeal.id,
            dealTitle: selectedDeal.title,
            type: 'STATUS_CHANGE',
            title: 'Moveu para',
            description: next?.label ?? 'Etapa atualizada',
            date: new Date().toISOString(),
            completed: true,
            user: actor,
          });
        } catch {
          // Não bloqueia o fluxo principal
          pushToast('Etapa atualizada (sem log)', 'neutral');
        }
      } catch (e) {
        pushToast(errorMessage(e, 'Não foi possível mover etapa.'), 'danger');
      }
    },
    [addActivity, actor, moveDeal, pushToast, selectedBoard, selectedDeal]
  );

  if (crmError) {
    return (
      <div className="h-dvh bg-slate-950 text-slate-100 flex items-center justify-center p-8">
        <div className="max-w-xl w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Cockpit</div>
            <div className="text-xs text-slate-300">/deals/[dealId]/cockpit</div>
          </div>
          <div className="mt-3 text-sm text-slate-100">Não foi possível carregar os dados do CRM.</div>
          <div className="mt-2 text-xs text-rose-100/80 wrap-break-word">{crmError}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              onClick={() => void refreshCRM()}
            >
              Recarregar
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-white/8"
              onClick={() => router.push('/boards')}
            >
              Ir para Boards
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (crmLoading && (!deals || deals.length === 0)) {
    return (
      <div className="h-dvh bg-slate-950 text-slate-100 flex items-center justify-center p-8">
        <div className="max-w-xl w-full rounded-2xl border border-white/10 bg-white/3 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Cockpit</div>
            <div className="text-xs text-slate-400">Carregando…</div>
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-4 w-2/3 rounded bg-white/10 animate-pulse" />
            <div className="h-4 w-full rounded bg-white/10 animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="mt-4 text-xs text-slate-500">Buscando deals, boards e atividades do seu workspace…</div>
        </div>
      </div>
    );
  }

  if (!selectedDeal || !selectedBoard) {
    return (
      <div className="h-dvh bg-slate-950 text-slate-100 flex items-center justify-center p-8">
        <div className="max-w-xl w-full rounded-2xl border border-white/10 bg-white/3 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Cockpit</div>
            <div className="text-xs text-slate-400">/deals/[dealId]/cockpit</div>
          </div>
          <div className="mt-3 text-sm text-slate-300">Não encontrei nenhum deal carregado no contexto.</div>
          <div className="mt-2 text-xs text-slate-500">
            Dica: abra o app normal (Boards) para carregar dados. Quando houver deals carregados, você consegue trocar aqui mesmo pelo seletor no topo.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
              onClick={() => void refreshCRM()}
            >
              Recarregar
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-white/8"
              onClick={() => router.push('/boards')}
            >
              Ir para Boards
            </button>
          </div>
        </div>
      </div>
    );
  }

  const deal = selectedDeal;
  const board = selectedBoard;
  const contact = selectedContact;

  const companyName = deal.clientCompanyName || deal.companyName || 'Empresa';

  const phoneE164 = normalizePhoneE164(contact?.phone);

  return (
    <div className="h-dvh overflow-hidden bg-slate-950 text-slate-100">
      {toast ? (
        <div className="fixed right-6 top-6 z-50">
          <div
            className={
              toast.tone === 'success'
                ? 'flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 shadow-xl shadow-black/30'
                : toast.tone === 'danger'
                  ? 'flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm text-rose-100 shadow-xl shadow-black/30'
                  : 'flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-slate-100 shadow-xl shadow-black/30'
            }
            role="status"
            aria-live="polite"
          >
            {toast.tone === 'success' ? <Check className="h-4 w-4" /> : toast.tone === 'danger' ? <X className="h-4 w-4" /> : null}
            <div className="min-w-0 truncate">{toast.message}</div>
          </div>
        </div>
      ) : null}

      {/* Top pipeline bar */}
      <div className="sticky top-0 z-40 h-16 border-b border-white/5 bg-black/40 backdrop-blur">
        <div className="flex h-16 w-full items-center px-6 2xl:px-10">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <select
                  className="max-w-90 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100 outline-none hover:bg-white/8 focus:ring-2 focus:ring-cyan-400/30"
                  value={deal.id}
                  onChange={(e) => setDealInUrl(e.target.value)}
                  aria-label="Selecionar deal"
                >
                  {sortedDeals.map((d) => {
                    const labelCompany = d.clientCompanyName || d.companyName || 'Empresa';
                    return (
                      <option key={d.id} value={d.id} className="bg-slate-950">
                        {humanizeTestLabel(d.title) || d.title} — {labelCompany}
                      </option>
                    );
                  })}
                </select>
                <div className="text-xs text-slate-500">|</div>
                <div className="truncate text-xs text-slate-400">{companyName}</div>
                {crmLoading ? <div className="ml-2 text-[11px] text-slate-600">Sincronizando…</div> : null}
              </div>
              <div className="mt-1 text-[11px] text-slate-600">{board.name ?? 'Pipeline'}</div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-emerald-300">{formatCurrencyBRL(deal.value ?? 0)}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Etapa: <span className="font-semibold text-slate-300">{activeStage?.label ?? '—'}</span>
              </div>
            </div>
          </div>

          <div
            className="ml-8 grid flex-1 gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, stages.length)}, minmax(0, 1fr))` }}
          >
            {stages.map((s, idx) => {
              const isActive = idx === stageIndex;
              const isDone = idx < stageIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => void handleStageChange(s.id)}
                  title={`Mover para ${s.label}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-1.5 flex-1 rounded-full ${isDone || isActive ? toneToBg(s.tone) : 'bg-white/10'}`} />
                    <div
                      className={`h-2 w-2 rounded-full ${isActive ? toneToBg(s.tone) : isDone ? 'bg-white/30' : 'bg-white/10'}`}
                    />
                  </div>
                  <div className={`mt-1 text-[11px] ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{s.label}</div>
                </button>
              );
            })}
          </div>

          <div className="ml-8 hidden text-[11px] text-slate-600 xl:block">Clique nas etapas para mover o deal (real)</div>
        </div>
      </div>

      {/* Cockpit layout */}
      <div className="h-[calc(100dvh-64px)] w-full overflow-hidden px-6 py-4 2xl:px-10">
        <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[360px_1fr_420px] lg:items-stretch">
          {/* Left rail */}
          <div className="flex min-h-0 flex-col gap-4 overflow-auto pr-1">
            <Panel
              title="Health"
              icon={<HeartPulse className="h-4 w-4 text-emerald-300" />}
              right={<Chip tone={health.status === 'excellent' || health.status === 'good' ? 'success' : 'neutral'}>{health.score}%</Chip>}
              className="shrink-0"
            >
              <div className="h-2 w-full rounded-full bg-white/10">
                <div
                  className={`h-2 rounded-full ${
                    health.status === 'excellent'
                      ? 'bg-emerald-500'
                      : health.status === 'good'
                        ? 'bg-green-500'
                        : health.status === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                  }`}
                  style={{ width: `${health.score}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-500">IA + probabilidade do deal.</div>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/3 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
                  onClick={() => void refetchAI()}
                  title="Reanalisar com IA"
                >
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    {aiLoading ? 'Analisando…' : 'Reanalisar'}
                  </span>
                </button>
              </div>
            </Panel>

            <Panel title="Próxima ação" icon={<BadgeCheck className="h-4 w-4 text-cyan-300" />} className="shrink-0">
              <div className="text-sm font-semibold text-slate-100">{nextBestAction.action}</div>
              <div className="mt-1 text-xs text-slate-400">{nextBestAction.reason}</div>
              <div className="mt-2 text-[11px] text-slate-500">
                Aqui EXECUTA (e tenta registrar o que dá). No rodapé da timeline você REGISTRA atividades rápidas que aconteceram fora do CRM.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 hover:bg-rose-500"
                  onClick={() => void handleExecuteNext()}
                >
                  <ActivityIcon className="h-4 w-4" />
                  Executar agora
                </button>

                <div className="grid w-full grid-cols-4 gap-2">
                  <button
                    type="button"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/3 px-2 py-2 hover:bg-white/5"
                    title="Ligar (abre modal de ligação)"
                    aria-label="Ligar"
                    onClick={() => handleCall('Ligação')}
                  >
                    <Phone className="h-4 w-4 text-slate-200" />
                    <span className="text-[10px] font-semibold text-slate-300">Ligar</span>
                  </button>

                  <button
                    type="button"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/3 px-2 py-2 hover:bg-white/5"
                    title="Preparar WhatsApp"
                    aria-label="Preparar WhatsApp"
                    onClick={() =>
                      openMessageComposer(
                        'WHATSAPP',
                        {
                          message: buildSuggestedWhatsAppMessage({
                            contact: contact ?? undefined,
                            deal,
                            actionType: nextBestAction.actionType,
                            action: nextBestAction.action,
                            reason: nextBestAction.reason,
                          }),
                        },
                        {
                          source: 'generated',
                          origin: 'nextBestAction',
                          aiSuggested: nextBestAction.isAI,
                          aiActionType: nextBestAction.actionType,
                        }
                      )
                    }
                  >
                    <Sparkles className="h-4 w-4 text-slate-200" />
                    <span className="text-[10px] font-semibold text-slate-300">Gerar WA</span>
                  </button>

                  <button
                    type="button"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/3 px-2 py-2 hover:bg-white/5"
                    title="Preparar e-mail"
                    aria-label="Preparar e-mail"
                    onClick={() =>
                      openMessageComposer(
                        'EMAIL',
                        {
                          subject: `Sobre ${deal.title}`,
                          message: buildSuggestedEmailBody({
                            contact: contact ?? undefined,
                            deal,
                            actionType: nextBestAction.actionType,
                            action: nextBestAction.action,
                            reason: nextBestAction.reason,
                          }),
                        },
                        {
                          source: 'generated',
                          origin: 'nextBestAction',
                          aiSuggested: nextBestAction.isAI,
                          aiActionType: nextBestAction.actionType,
                        }
                      )
                    }
                  >
                    <Inbox className="h-4 w-4 text-slate-200" />
                    <span className="text-[10px] font-semibold text-slate-300">E-mail</span>
                  </button>

                  <button
                    type="button"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/3 px-2 py-2 hover:bg-white/5"
                    title="Agendar (cria uma tarefa simples)"
                    aria-label="Agendar"
                    onClick={() => openScheduleModal({ type: 'TASK', title: 'Agendar próximo passo', description: 'Criado no cockpit.' })}
                  >
                    <CalendarClock className="h-4 w-4 text-slate-200" />
                    <span className="text-[10px] font-semibold text-slate-300">Agendar</span>
                  </button>
                </div>

                <div className="grid w-full grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/2 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
                    title="Usar um template persistido (Quick Scripts)"
                    onClick={() => openTemplatePicker('WHATSAPP')}
                    disabled={isScriptsLoading || scripts.length === 0}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Template WhatsApp
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/2 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
                    title="Usar um template persistido (Quick Scripts)"
                    onClick={() => openTemplatePicker('EMAIL')}
                    disabled={isScriptsLoading || scripts.length === 0}
                  >
                    <Inbox className="h-4 w-4" />
                    Template E-mail
                  </button>
                </div>
              </div>
            </Panel>

            <Panel
              title="Dados"
              icon={<FileText className="h-4 w-4 text-slate-300" />}
              className="flex min-h-0 flex-1 flex-col"
              bodyClassName="min-h-0 flex-1 overflow-auto"
            >
              <div className="flex min-h-0 flex-col gap-3">
                <div>
                  <div className="min-w-0">
                    <div
                      className="text-sm font-semibold text-slate-100 truncate"
                      title={contact?.name ?? ''}
                    >
                      {humanizeTestLabel(contact?.name) || contact?.name || '—'}
                    </div>
                    <div className="mt-1 text-xs text-slate-400 truncate" title={selectedContact?.role ?? ''}>
                      {selectedContact?.role ?? ''}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Tel</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-slate-200">{phoneE164 ?? ''}</span>
                        <button
                          type="button"
                          className="rounded-lg border border-white/10 bg-white/2 p-1.5 text-slate-300 hover:bg-white/5"
                          title="Copiar telefone"
                          onClick={() => phoneE164 && void copyToClipboard('Telefone', phoneE164)}
                          disabled={!phoneE164}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Email</span>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-slate-200">{contact?.email ?? ''}</span>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg border border-white/10 bg-white/2 p-1.5 text-slate-300 hover:bg-white/5"
                          title="Copiar email"
                          onClick={() => contact?.email && void copyToClipboard('Email', contact.email)}
                          disabled={!contact?.email}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Origem</span>
                      <span className="text-slate-200">{contact?.source ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Status</span>
                      <span className="text-slate-200">{contact?.status ?? '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/2 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sinais</div>
                  <div className="mt-2 space-y-1 text-xs text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Último evento</span>
                      <span className="truncate text-slate-200">
                        {latestNonSystem
                          ? `${latestNonSystem.title}${latestNonSystem.subtitle ? ` — ${latestNonSystem.subtitle}` : ''}`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Última ligação</span>
                      <span className="truncate text-slate-200">{latestCall ? latestCall.at : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Etapa</span>
                      <span className="text-slate-200">{activeStage?.label ?? '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/2 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resumo</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-white/10 bg-white/2 p-2">
                      <div className="text-slate-500">Valor</div>
                      <div className="mt-0.5 font-semibold text-slate-100">{formatCurrencyBRL(deal.value ?? 0)}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/2 p-2">
                      <div className="text-slate-500">Probabilidade</div>
                      <div className="mt-0.5 font-semibold text-slate-100">{deal.probability ?? 50}%</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/2 p-2">
                      <div className="text-slate-500">Dono</div>
                      <div className="mt-0.5 font-semibold text-slate-100">{deal.owner?.name ?? '—'}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/2 p-2">
                      <div className="text-slate-500">Última mudança</div>
                      <div className="mt-0.5 truncate font-semibold text-slate-100">{latestMove ? latestMove.at : formatAtISO(deal.updatedAt)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          {/* Center */}
          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Atividades</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={
                      kindFilter === 'all'
                        ? 'rounded-full bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-slate-100 ring-1 ring-white/10'
                        : 'rounded-full bg-white/3 px-3 py-1.5 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10 hover:bg-white/5'
                    }
                    onClick={() => setKindFilter('all')}
                  >
                    Tudo
                  </button>
                  {(['call', 'note', 'status'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={
                        kindFilter === k
                          ? 'rounded-full bg-cyan-500/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 ring-1 ring-cyan-500/20'
                          : 'rounded-full bg-white/3 px-3 py-1.5 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10 hover:bg-white/5'
                      }
                      onClick={() => setKindFilter(k)}
                    >
                      {k === 'call' ? 'Ligações' : k === 'note' ? 'Notas' : 'Mudanças'}
                    </button>
                  ))}

                  <button
                    type="button"
                    className={
                      showSystemEvents
                        ? 'rounded-full bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-500/20'
                        : 'rounded-full bg-white/3 px-3 py-1.5 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10 hover:bg-white/5'
                    }
                    onClick={() => setShowSystemEvents((v) => !v)}
                    title="System events (hoje: quase tudo vem de Activity)"
                  >
                    Sistemas
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/3 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar"
                    className="w-44 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
                  />
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/3 p-2 hover:bg-white/5"
                  title="Filtros"
                  onClick={() => pushToast('Use os chips para filtrar', 'neutral')}
                >
                  <Filter className="h-4 w-4 text-slate-200" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/3">
              <div className="flex-1 min-h-0 overflow-auto divide-y divide-white/10">
                  {filteredTimelineItems.length === 0 ? (
                    <div className="px-6 py-10 text-center">
                      <div className="text-sm font-semibold text-slate-200">
                        {timelineItems.length === 0 ? 'Sem atividades ainda' : 'Sem resultados'}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {timelineItems.length === 0
                          ? 'Quando você registrar uma nota, ligação ou mudança de etapa, ela aparece aqui.'
                          : 'Tente limpar busca e filtros para ver tudo novamente.'}
                      </div>
                      {timelineItems.length !== 0 ? (
                        <div className="mt-4 flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                            onClick={() => {
                              setQuery('');
                              setKindFilter('all');
                              setShowSystemEvents(false);
                            }}
                          >
                            Limpar filtros
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    filteredTimelineItems.map((t) => (
                      <div key={t.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-200">{t.title}</span>
                              {t.subtitle ? (
                                t.title === 'Moveu para' ? (
                                  <Chip tone={t.tone === 'success' ? 'success' : t.tone === 'danger' ? 'danger' : 'neutral'}>{t.subtitle}</Chip>
                                ) : (
                                  <span className="truncate text-xs text-slate-400">{t.subtitle}</span>
                                )
                              ) : null}
                            </div>
                            {t.title !== 'Moveu para' && t.subtitle ? (
                              <div className="mt-0.5 text-[11px] text-slate-500">{t.subtitle}</div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-[11px] text-slate-500">{t.at}</div>
                        </div>
                      </div>
                    ))
                  )}
              </div>

              <div className="border-t border-white/10 px-4 py-3">
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                    title="Use quando a atividade aconteceu fora do CRM"
                  >
                    Registrar (fora do CRM):
                  </span>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 hover:text-slate-200"
                    onClick={async () => {
                      const header = buildExecutionHeader({
                        channel: 'WHATSAPP',
                        context: { source: 'manual', origin: 'quickAction' },
                        outsideCRM: true,
                      });
                      try {
                        await addActivity({
                          dealId: deal.id,
                          dealTitle: deal.title,
                          type: 'NOTE',
                          title: 'WhatsApp',
                          description: `${header}\n\n---\n\nMensagem enviada (registrado fora do CRM).`,
                          date: new Date().toISOString(),
                          completed: true,
                          user: actor,
                        });
                        pushToast('WhatsApp registrado', 'success');
                      } catch (e) {
                        pushToast(errorMessage(e, 'Não foi possível registrar o WhatsApp.'), 'danger');
                      }
                    }}
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 hover:text-slate-200"
                    onClick={async () => {
                      const header = buildExecutionHeader({
                        channel: 'EMAIL',
                        context: { source: 'manual', origin: 'quickAction' },
                        outsideCRM: true,
                      });
                      try {
                        await addActivity({
                          dealId: deal.id,
                          dealTitle: deal.title,
                          type: 'EMAIL',
                          title: 'Email',
                          description: `${header}\nAssunto: Email\n\n---\n\nEnviado (registrado fora do CRM).`,
                          date: new Date().toISOString(),
                          completed: true,
                          user: actor,
                        });
                        pushToast('Email registrado', 'success');
                      } catch (e) {
                        pushToast(errorMessage(e, 'Não foi possível registrar o email.'), 'danger');
                      }
                    }}
                  >
                    <Inbox className="h-4 w-4" /> Email
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 hover:text-slate-200"
                    onClick={async () => {
                      try {
                        await addActivity({
                          dealId: deal.id,
                          dealTitle: deal.title,
                          type: 'CALL',
                          title: 'Ligação',
                          description: 'Fonte: Cockpit\nFora do CRM: sim\n\n---\n\nRealizada (registrado fora do CRM).',
                          date: new Date().toISOString(),
                          completed: true,
                          user: actor,
                        });
                        pushToast('Ligação registrada', 'success');
                      } catch (e) {
                        pushToast(errorMessage(e, 'Não foi possível registrar a ligação.'), 'danger');
                      }
                    }}
                  >
                    <Phone className="h-4 w-4" /> Ligação
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 hover:text-slate-200"
                    onClick={async () => {
                      try {
                        await addActivity({
                          dealId: deal.id,
                          dealTitle: deal.title,
                          type: 'MEETING',
                          title: 'Reunião',
                          description: 'Fonte: Cockpit\nFora do CRM: sim\n\n---\n\nRegistrada fora do CRM.',
                          date: new Date().toISOString(),
                          completed: true,
                          user: actor,
                        });
                        pushToast('Reunião registrada', 'success');
                      } catch (e) {
                        pushToast(errorMessage(e, 'Não foi possível registrar a reunião.'), 'danger');
                      }
                    }}
                  >
                    <CalendarClock className="h-4 w-4" /> Reunião
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 hover:text-slate-200"
                    onClick={async () => {
                      try {
                        await addActivity({
                          dealId: deal.id,
                          dealTitle: deal.title,
                          type: 'TASK',
                          title: 'Tarefa',
                          description: 'Fonte: Cockpit\nFora do CRM: sim\n\n---\n\nCriada (registrado fora do CRM).',
                          date: new Date().toISOString(),
                          completed: true,
                          user: actor,
                        });
                        pushToast('Tarefa registrada', 'success');
                      } catch (e) {
                        pushToast(errorMessage(e, 'Não foi possível registrar a tarefa.'), 'danger');
                      }
                    }}
                  >
                    <ActivityIcon className="h-4 w-4" /> Tarefa
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom row: nota + (placeholder) */}
            <div className="grid min-h-0 gap-4 lg:grid-cols-2 lg:max-h-[30dvh]">
              <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/3 p-4">
                <label className="block text-xs font-semibold text-slate-400">Escreva…</label>
                <textarea
                  value={noteDraftTimeline}
                  onChange={(e) => setNoteDraftTimeline(e.target.value)}
                  className="mt-2 min-h-0 flex-1 w-full resize-none rounded-xl border border-white/10 bg-white/2 p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600"
                  placeholder="Notas, resumo da call, próximos passos…"
                />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500">Isso vira uma Activity NOTE (log do deal).</div>
                  <button
                    type="button"
                    className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                    onClick={async () => {
                      const text = noteDraftTimeline.trim();
                      if (!text) {
                        pushToast('Escreva uma nota antes de salvar', 'danger');
                        return;
                      }

                      try {
                        await addActivity({
                          dealId: deal.id,
                          dealTitle: deal.title,
                          type: 'NOTE',
                          title: 'Nota',
                          description: text,
                          date: new Date().toISOString(),
                          completed: true,
                          user: actor,
                        });

                        setNoteDraftTimeline('');
                        pushToast('Nota salva', 'success');
                      } catch (e) {
                        pushToast(errorMessage(e, 'Não foi possível salvar a nota.'), 'danger');
                      }
                    }}
                  >
                    Salvar
                  </button>
                </div>
              </div>

              <Panel
                title="Execução"
                icon={<ActivityIcon className="h-4 w-4 text-amber-200" />}
                right={<Chip tone="success">Real</Chip>}
                className="flex min-h-0 flex-col"
                bodyClassName="min-h-0 flex-1 overflow-auto"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500">Checklist persistido por deal (salvo em customFields).</div>
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 bg-white/2 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
                    onClick={loadChecklistFromDeal}
                    title="Recarregar do deal"
                  >
                    Recarregar
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {checklist.length === 0 ? (
                    <div className="text-sm text-slate-400">Sem itens. Adicione abaixo.</div>
                  ) : (
                    checklist.map((it) => (
                      <div key={it.id} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/2 p-2.5">
                        <button
                          type="button"
                          className={
                            it.done
                              ? 'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500 text-slate-950'
                              : 'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/15 bg-white/3 text-slate-200 hover:bg-white/5'
                          }
                          aria-label={it.done ? 'Marcar como não feito' : 'Marcar como feito'}
                          onClick={() => {
                            const next = checklist.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x));
                            void persistChecklist(next);
                          }}
                        >
                          {it.done ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                        <div className={it.done ? 'flex-1 text-sm text-slate-500 line-through' : 'flex-1 text-sm text-slate-200'}>
                          {it.text}
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-white/10 bg-white/2 p-1.5 text-slate-300 hover:bg-white/5"
                          title="Remover"
                          onClick={() => {
                            const next = checklist.filter((x) => x.id !== it.id);
                            void persistChecklist(next);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={checklistDraft}
                    onChange={(e) => setChecklistDraft(e.target.value)}
                    placeholder="Adicionar item…"
                    className="h-10 flex-1 rounded-xl border border-white/10 bg-white/2 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    className="h-10 rounded-xl bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
                    disabled={!checklistDraft.trim()}
                    onClick={() => {
                      const text = checklistDraft.trim();
                      if (!text) return;
                      setChecklistDraft('');
                      const next = [...checklist, { id: uid('chk'), text, done: false }];
                      void persistChecklist(next);
                    }}
                  >
                    Adicionar
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-600">Dica: isso fica no deal atual e aparece igual quando você trocar de deal.</div>
              </Panel>
            </div>
          </div>

          {/* Right rail */}
          <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-white/3">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">NossoCRM Pilot</div>
                    <div className="text-[11px] text-slate-500">Deal: {humanizeTestLabel(deal.title) || deal.title}</div>
                  </div>
                </div>
                <Chip tone="success">Real</Chip>
              </div>

              <div className="flex items-center gap-4 px-4 shrink-0">
                <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
                  Chat IA
                </TabButton>
                <TabButton active={tab === 'notas'} onClick={() => setTab('notas')}>
                  Notas
                </TabButton>
                <TabButton active={tab === 'scripts'} onClick={() => setTab('scripts')}>
                  Scripts
                </TabButton>
                <TabButton active={tab === 'arquivos'} onClick={() => setTab('arquivos')}>
                  Arquivos
                </TabButton>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden p-4">
                {tab === 'chat' ? (
                  <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-white/2 overflow-hidden">
                    <UIChat
                      boardId={board.id}
                      dealId={deal.id}
                      contactId={contact?.id}
                      cockpitSnapshot={cockpitSnapshot ?? undefined}
                      contextMode="props-only"
                      floating={false}
                      startMinimized={false}
                    />
                  </div>
                ) : tab === 'notas' ? (
                  <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-white/2 p-4 overflow-auto">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                      <StickyNote className="h-4 w-4" />
                      Notas do deal (persistidas)
                    </div>

                    <div className="mt-3">
                      <textarea
                        value={dealNoteDraft}
                        onChange={(e) => setDealNoteDraft(e.target.value)}
                        className="w-full min-h-27.5 resize-none rounded-xl border border-white/10 bg-white/3 p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600"
                        placeholder="Escreva uma nota persistida…"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-500">Salva em deal_notes.</div>
                        <button
                          type="button"
                          className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
                          disabled={!dealNoteDraft.trim() || createNote.isPending}
                          onClick={async () => {
                            const content = dealNoteDraft.trim();
                            if (!content) return;
                            await createNote.mutateAsync(content);
                            setDealNoteDraft('');
                            pushToast('Nota persistida salva', 'success');
                          }}
                        >
                          {createNote.isPending ? 'Salvando…' : 'Adicionar'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      {isNotesLoading ? (
                        <div className="text-sm text-slate-400">Carregando…</div>
                      ) : notes.length === 0 ? (
                        <div className="text-sm text-slate-400">Sem notas ainda.</div>
                      ) : (
                        <div className="space-y-2">
                          {notes.map((n) => (
                            <div key={n.id} className="rounded-2xl border border-white/10 bg-white/3 p-3">
                              <div className="whitespace-pre-wrap text-sm text-slate-200">{n.content}</div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <div className="text-[11px] text-slate-500">{formatAtISO(n.created_at)}</div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="rounded-lg border border-white/10 bg-white/2 p-1.5 text-slate-300 hover:bg-white/5"
                                    title="Copiar nota"
                                    onClick={() => void copyToClipboard('Nota', n.content)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-200 hover:bg-rose-500/15"
                                    title="Excluir"
                                    onClick={() => void deleteNote.mutate(n.id)}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : tab === 'scripts' ? (
                  <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-white/2 p-4 overflow-auto">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                        <FileText className="h-4 w-4" /> Scripts (persistidos)
                      </div>
                      <div className="text-[11px] text-slate-500">{isScriptsLoading ? 'Carregando…' : `${scripts.length} itens`}</div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {scripts.map((s) => {
                        const info = getCategoryInfo(s.category);
                        const preview = applyVariables(s.template, templateVariables);
                        return (
                          <div key={s.id} className="rounded-2xl border border-white/10 bg-white/3 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${scriptCategoryChipClass(info.color)}`}>
                                    {info.label}
                                  </span>
                                  <div className="truncate text-sm font-semibold text-slate-100">{s.title}</div>
                                </div>
                                <div className="mt-1 line-clamp-3 text-xs text-slate-400 whitespace-pre-wrap">{preview}</div>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-white/10 bg-white/2 p-2 text-slate-200 hover:bg-white/5"
                                title="Copiar"
                                onClick={() => void copyToClipboard('Script', preview)}
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-white/2 p-4 overflow-auto">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                        <Inbox className="h-4 w-4" /> Arquivos (storage)
                      </div>
                      <div className="text-[11px] text-slate-500">{isFilesLoading ? 'Carregando…' : `${files.length} itens`}</div>
                    </div>

                    <div className="mt-3">
                      <input
                        type="file"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          await uploadFile.mutateAsync(f);
                          e.currentTarget.value = '';
                          pushToast('Arquivo enviado', 'success');
                        }}
                        className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-white/15"
                      />
                    </div>

                    <div className="mt-3 space-y-2">
                      {files.length === 0 && !isFilesLoading ? (
                        <div className="text-sm text-slate-400">Nenhum arquivo.</div>
                      ) : (
                        files.map((f) => (
                          <div key={f.id} className="rounded-2xl border border-white/10 bg-white/3 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-100">{f.file_name}</div>
                                <div className="mt-1 text-xs text-slate-400">
                                  {formatFileSize(f.file_size)} • {formatAtISO(f.created_at)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-white/10 bg-white/2 p-2 text-slate-200 hover:bg-white/5"
                                  onClick={() => downloadFile(f)}
                                  title="Download"
                                >
                                  <Inbox className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-rose-200 hover:bg-rose-500/15"
                                  onClick={() => void deleteFile.mutate({ fileId: f.id, filePath: f.file_path })}
                                  title="Excluir"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/3 px-4 py-3 shrink-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                <span>Contexto</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold text-slate-500">{crmLoading ? 'Sincronizando…' : 'Pronto'}</div>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/2 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
                  onClick={() => void refreshCRM()}
                  title="Recarregar dados do CRM"
                >
                  Recarregar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        onSave={handleCallLogSave}
        contactName={contact?.name || 'Contato'}
        contactPhone={contact?.phone || ''}
        suggestedTitle={callSuggestedTitle}
      />

      <TemplatePickerModal
        isOpen={isTemplatePickerOpen}
        onClose={() => setIsTemplatePickerOpen(false)}
        mode={templatePickerMode}
        scripts={scripts}
        isLoading={isScriptsLoading}
        variables={templateVariables}
        applyVariables={applyVariables}
        getCategoryInfo={getCategoryInfo}
        onPick={handlePickTemplate}
      />

      <MessageComposerModal
        isOpen={isMessageModalOpen}
        onClose={() => {
          setIsMessageModalOpen(false);
          setMessagePrefill(null);
          setMessageLogContext(null);
        }}
        channel={messageChannel}
        contactName={contact?.name || 'Contato'}
        contactEmail={contact?.email}
        contactPhone={contact?.phone}
        initialSubject={messagePrefill?.subject}
        initialMessage={messagePrefill?.message}
        onExecuted={(ev) => void handleMessageExecuted(ev)}
        aiContext={{
          cockpitSnapshot: cockpitSnapshot ?? undefined,
          nextBestAction: {
            action: nextBestAction.action,
            reason: nextBestAction.reason,
            actionType: nextBestAction.actionType,
            urgency: nextBestAction.urgency,
          },
        }}
      />

      <ScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setScheduleInitial(null);
        }}
        onSave={(data) => void handleScheduleSave(data)}
        contactName={contact?.name || 'Contato'}
        initialType={scheduleInitial?.type}
        initialTitle={scheduleInitial?.title}
        initialDescription={scheduleInitial?.description}
      />
    </div>
  );
}

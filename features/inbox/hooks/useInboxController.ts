import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, Deal, DealView, Contact } from '@/types';
import type { ParsedAction } from '@/types/aiActions';
import { useToast } from '@/context/ToastContext';
import { usePersistedState } from '@/hooks/usePersistedState';
import {
  useActivities,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
} from '@/lib/query/hooks/useActivitiesQuery';
import { useAuth } from '@/context/AuthContext';
import { useContacts, useCreateContact, useUpdateContact } from '@/lib/query/hooks/useContactsQuery';
import {
  useDealsView,
  useCreateDeal,
  useUpdateDeal,
} from '@/lib/query/hooks/useDealsQuery';
import { useDefaultBoard } from '@/lib/query/hooks/useBoardsQuery';
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync';
import { useHiddenSuggestionIds, useRecordSuggestionInteraction } from '@/lib/query/hooks/useAISuggestionsQuery';
import { SuggestionType } from '@/lib/supabase/aiSuggestions';
import { isDebugMode, generateFakeContacts, fakeDeal } from '@/lib/debug';
import { supabase } from '@/lib/supabase/client';

// Tipos para sugestões de IA (BIRTHDAY removido - será implementado em widget separado)
export type AISuggestionType = 'UPSELL' | 'RESCUE' | 'STALLED';

export interface AISuggestion {
  id: string;
  type: AISuggestionType;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  data: {
    deal?: DealView;
    contact?: Contact;
  };
  createdAt: string;
}

export type ViewMode = 'overview' | 'list' | 'focus';

// Item unificado para o modo Focus (atividade ou sugestão)
export interface FocusItem {
  id: string;
  type: 'activity' | 'suggestion';
  priority: number; // 0 = mais urgente
  data: Activity | AISuggestion;
}

/**
 * Hook React `useInboxController` que encapsula uma lógica reutilizável.
 * @returns {{ isLoading: boolean; viewMode: ViewMode; setViewMode: Dispatch<SetStateAction<ViewMode>>; briefing: string | null; isGeneratingBriefing: boolean; ... 23 more ...; handleSelectActivity: (id: string) => void; }} Retorna um valor do tipo `{ isLoading: boolean; viewMode: ViewMode; setViewMode: Dispatch<SetStateAction<ViewMode>>; briefing: string | null; isGeneratingBriefing: boolean; ... 23 more ...; handleSelectActivity: (id: string) => void; }`.
 */
export const useInboxController = () => {
  // Auth (single-tenant com multiusuário). Mantemos profile para permissões/owner.
  const { profile } = useAuth();

  // TanStack Query hooks
  const { data: activities = [], isLoading: activitiesLoading } = useActivities();
  const { data: contacts = [], isLoading: contactsLoading } = useContacts();
  const { data: deals = [], isLoading: dealsLoading } = useDealsView();
  const { data: defaultBoard } = useDefaultBoard();

  const createActivityMutation = useCreateActivity();
  const updateActivityMutation = useUpdateActivity();
  const deleteActivityMutation = useDeleteActivity();
  const createContactMutation = useCreateContact();
  const updateContactMutation = useUpdateContact();
  const createDealMutation = useCreateDeal();
  const updateDealMutation = useUpdateDeal();

  // Enable realtime sync
  useRealtimeSync('activities');
  useRealtimeSync('deals');

  const activeBoardId = defaultBoard?.id || '';
  const activeBoard = defaultBoard;

  const { showToast } = useToast();

  // State para modo de visualização (persiste no localStorage)
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('inbox_view_mode', 'overview');
  const [focusIndex, setFocusIndex] = useState(0);

  // Persisted AI suggestion interactions
  const { data: hiddenSuggestionIds = new Set<string>() } = useHiddenSuggestionIds();
  const recordInteraction = useRecordSuggestionInteraction();

  // State para briefing
  const [briefing, setBriefing] = useState<string | null>(null);
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);

  const isLoading = activitiesLoading || contactsLoading || dealsLoading;

  // --- Datas de referência ---
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);

  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }, []);

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  /**
   * Performance: avoid parsing/sorting dates three times.
   * We bucket activities in one pass using timestamps, then sort once per bucket.
   */
  const activityBuckets = useMemo(() => {
    const overdue: Array<{ a: Activity; ts: number }> = [];
    const todayList: Array<{ a: Activity; ts: number }> = [];
    const upcoming: Array<{ a: Activity; ts: number }> = [];

    const todayTs = today.getTime();
    const tomorrowTs = tomorrow.getTime();

    for (const a of activities) {
      if (a.completed) continue;
      const ts = Date.parse(a.date);
      if (ts < todayTs) overdue.push({ a, ts });
      else if (ts < tomorrowTs) todayList.push({ a, ts });
      else upcoming.push({ a, ts });
    }

    overdue.sort((x, y) => x.ts - y.ts);
    todayList.sort((x, y) => x.ts - y.ts);
    upcoming.sort((x, y) => x.ts - y.ts);

    return {
      overdue: overdue.map(x => x.a),
      today: todayList.map(x => x.a),
      upcoming: upcoming.map(x => x.a),
    };
  }, [activities, today, tomorrow]);

  // --- Atividades Filtradas ---
  const overdueActivities = activityBuckets.overdue;
  const todayActivities = activityBuckets.today;
  const upcomingActivities = activityBuckets.upcoming;

  // Separar Compromissos (CALL, MEETING) vs Tarefas (TASK, EMAIL, NOTE)
  const todayMeetings = useMemo(
    () => todayActivities.filter(a => a.type === 'CALL' || a.type === 'MEETING'),
    [todayActivities]
  );

  const todayTasks = useMemo(
    () => todayActivities.filter(a => a.type !== 'CALL' && a.type !== 'MEETING'),
    [todayActivities]
  );

  // --- Sugestões de IA (do Radar) ---
  const currentMonth = new Date().getMonth() + 1;

  // Aniversariantes do mês
  const birthdaysThisMonth = useMemo(
    () =>
      contacts.filter(c => {
        if (!c.birthDate) return false;
        const birthMonth = parseInt(c.birthDate.split('-')[1]);
        return birthMonth === currentMonth;
      }),
    [contacts, currentMonth]
  );

  // Negócios estagnados (> 7 dias sem update)
  const stalledDeals = useMemo(
    () =>
      deals.filter(d => {
        const isClosed = d.isWon || d.isLost;
        const lastUpdateTs = Date.parse(d.updatedAt);
        return !isClosed && lastUpdateTs < sevenDaysAgo.getTime();
      }),
    [deals, sevenDaysAgo]
  );

  // Oportunidades de Upsell (ganhos há > 30 dias)
  const upsellDeals = useMemo(
    () =>
      deals.filter(d => {
        const isWon = d.isWon;
        const lastUpdateTs = Date.parse(d.updatedAt);
        return isWon && lastUpdateTs < thirtyDaysAgo.getTime();
      }),
    [deals, thirtyDaysAgo]
  );

  // Clientes em risco de churn (inativos há > 30 dias)
  const rescueContacts = useMemo(
    () =>
      contacts.filter(c => {
        // Padrão de mercado: considerar apenas clientes ativos (não leads)
        if (c.status !== 'ACTIVE' || c.stage !== 'CUSTOMER') return false;

        const createdAtTs = Date.parse(c.createdAt);

        // Sem histórico: carência de 30d após criação
        if (!c.lastInteraction && !c.lastPurchaseDate) {
          return createdAtTs < thirtyDaysAgo.getTime();
        }

        // Com histórico: pega a data mais recente entre interação e compra
        const lastInteractionTs = c.lastInteraction ? Date.parse(c.lastInteraction) : null;
        const lastPurchaseTs = c.lastPurchaseDate ? Date.parse(c.lastPurchaseDate) : null;
        const lastActivityTs =
          lastInteractionTs != null && lastPurchaseTs != null
            ? Math.max(lastInteractionTs, lastPurchaseTs)
            : lastInteractionTs ?? lastPurchaseTs;

        return lastActivityTs !== null && lastActivityTs < thirtyDaysAgo.getTime();
      }),
    [contacts, thirtyDaysAgo]
  );

  // Smart Scoring: Calculate priority based on value, probability, and time
  // Performance: keep scoring fn stable to avoid invalidating memoized pipelines.
  const calculateDealScore = useCallback((deal: DealView, type: 'STALLED' | 'UPSELL'): number => {
    const value = deal.value || 0;
    const probability = deal.probability || 50;
    const daysSinceUpdate = Math.floor((Date.now() - Date.parse(deal.updatedAt)) / (1000 * 60 * 60 * 24));

    // Base score from value (log scale to handle big differences)
    const valueScore = Math.log10(Math.max(value, 1)) * 10;

    // Probability factor (higher prob = higher urgency for stalled, lower for upsell)
    const probFactor = type === 'STALLED' ? probability / 100 : (100 - probability) / 100;

    // Time decay: older = more urgent
    const timeFactor = Math.min(daysSinceUpdate / 30, 2); // Cap at 2x for very old deals

    return (valueScore * probFactor * (1 + timeFactor));
  }, []);

  // Gerar sugestões de IA como objetos com scoring inteligente
  const aiSuggestions = useMemo((): AISuggestion[] => {
    const suggestions: AISuggestion[] = [];
    const nowIso = new Date().toISOString();

    // Stalled/Rescue - Score and rank
    const scoredStalledDeals = stalledDeals
      .map(deal => ({ deal, score: calculateDealScore(deal, 'STALLED') }))
      .sort((a, b) => b.score - a.score);

    scoredStalledDeals.forEach(({ deal, score }) => {
      const id = `stalled-${deal.id}`;
      if (!hiddenSuggestionIds.has(id)) {
        const daysSinceUpdate = Math.floor((Date.now() - Date.parse(deal.updatedAt)) / (1000 * 60 * 60 * 24));
        suggestions.push({
          id,
          type: 'STALLED',
          title: `Negócio Parado (${daysSinceUpdate}d)`,
          description: `${deal.title} - R$ ${deal.value.toLocaleString('pt-BR')} • ${deal.probability}% probabilidade`,
          priority: score > 30 ? 'high' : score > 15 ? 'medium' : 'low',
          data: { deal },
          createdAt: nowIso,
        });
      }
    });

    // Upsell - Score and rank
    const scoredUpsellDeals = upsellDeals
      .map(deal => ({ deal, score: calculateDealScore(deal, 'UPSELL') }))
      .sort((a, b) => b.score - a.score);

    scoredUpsellDeals.forEach(({ deal, score }) => {
      const id = `upsell-${deal.id}`;
      if (!hiddenSuggestionIds.has(id)) {
        const daysSinceClose = Math.floor((Date.now() - Date.parse(deal.updatedAt)) / (1000 * 60 * 60 * 24));
        suggestions.push({
          id,
          type: 'UPSELL',
          title: `Oportunidade de Upsell`,
          description: `${deal.companyName} fechou há ${daysSinceClose} dias • R$ ${deal.value.toLocaleString('pt-BR')}`,
          priority: score > 25 ? 'high' : score > 10 ? 'medium' : 'low',
          data: { deal },
          createdAt: nowIso,
        });
      }
    });

    // Clientes em risco de churn (RESCUE)
    rescueContacts.forEach(contact => {
      const id = `rescue-${contact.id}`;
      if (!hiddenSuggestionIds.has(id)) {
        const lastDate = contact.lastInteraction || contact.lastPurchaseDate;
        const daysSince = lastDate
          ? Math.floor((Date.now() - Date.parse(lastDate)) / (1000 * 60 * 60 * 24))
          : null;

        suggestions.push({
          id,
          type: 'RESCUE',
          title: `Risco de Churn`,
          description: daysSince
            ? `${contact.name} não interage há ${daysSince} dias`
            : `${contact.name} nunca interagiu - reative!`,
          priority: daysSince && daysSince > 60 ? 'high' : 'medium',
          data: { contact },
          createdAt: nowIso,
        });
      }
    });

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [upsellDeals, stalledDeals, rescueContacts, hiddenSuggestionIds, calculateDealScore]);

  // --- Gerar Briefing via Edge Function (sem necessidade de API key no localStorage) ---
  useEffect(() => {
    let isMounted = true;
    const fetchBriefing = async () => {
      if (briefing) return;

      // Skip AI call if there's nothing to analyze (database empty or no pending items)
      const hasData = birthdaysThisMonth.length > 0 || stalledDeals.length > 0 ||
        overdueActivities.length > 0 || upsellDeals.length > 0;

      if (!hasData) {
        setBriefing('Sua inbox está limpa! Nenhuma pendência no momento. 🎉');
        return;
      }

      setIsGeneratingBriefing(true);

      try {
        const radarData = {
          birthdays: birthdaysThisMonth.map(c => ({ name: c.name, birthDate: c.birthDate })),
          stalledDeals: stalledDeals.length,
          overdueActivities: overdueActivities.length,
          upsellDeals: upsellDeals.length,
        };

        const { generateDailyBriefing } = await import('@/lib/ai/tasksClient');
        const text = await generateDailyBriefing(radarData);

        if (isMounted) {
          setBriefing(text || 'Nenhuma pendência crítica. Bom trabalho!');
        }
      } catch (error: any) {
        if (isMounted) {
          // Fallback message if AI proxy fails
          const fallback = `Você tem ${overdueActivities.length} atividades atrasadas, ${stalledDeals.length} negócios parados e ${upsellDeals.length} oportunidades de upsell.`;
          setBriefing(fallback);
        }
      } finally {
        if (isMounted) {
          setIsGeneratingBriefing(false);
        }
      }
    };

    fetchBriefing();
    return () => {
      isMounted = false;
    };
  }, [birthdaysThisMonth.length, stalledDeals.length, overdueActivities.length, upsellDeals.length]);

  // --- Handlers para Atividades ---

  const handleCreateAction = (action: ParsedAction) => {
    createActivityMutation.mutate({
      activity: {
        title: action.title,
        type: action.type,
        description: '',
        date: action.date || new Date().toISOString(),
        dealId: '',
        dealTitle: '',
        completed: false,
        user: { name: 'Eu', avatar: '' },
      },
    });

    showToast(`Atividade criada: ${action.title}`, 'success');
  };

  const handleCompleteActivity = (id: string) => {
    const activity = activities.find(a => a.id === id);
    if (activity) {
      updateActivityMutation.mutate(
        { id, updates: { completed: !activity.completed } },
        {
          onSuccess: () => {
            showToast(activity.completed ? 'Atividade reaberta' : 'Atividade concluída!', 'success');
          },
        }
      );
    }
  };

  const handleSnoozeActivity = (id: string, days: number = 1) => {
    const activity = activities.find(a => a.id === id);
    if (activity) {
      const newDate = new Date(activity.date);
      newDate.setDate(newDate.getDate() + days);
      updateActivityMutation.mutate(
        { id, updates: { date: newDate.toISOString() } },
        {
          onSuccess: () => {
            showToast(`Adiado para ${newDate.toLocaleDateString('pt-BR')}`, 'success');
          },
        }
      );
    }
  };

  const handleDiscardActivity = (id: string) => {
    deleteActivityMutation.mutate(id, {
      onSuccess: () => {
        showToast('Atividade removida', 'info');
      },
    });
  };

  // --- Handlers para Sugestões de IA ---

  const handleAcceptSuggestion = (suggestion: AISuggestion) => {
    switch (suggestion.type) {
      case 'UPSELL':
        if (suggestion.data.deal && activeBoard) {
          const deal = suggestion.data.deal;
          createDealMutation.mutate({
            title: `Renovação/Upsell: ${deal.title}`,
            boardId: activeBoardId,
            status: activeBoard.stages[0]?.id || 'NEW',
            value: Math.round(deal.value * 1.2),
            probability: 30,
            priority: 'medium',
            contactId: deal.contactId,
            companyId: deal.companyId,
            tags: ['Upsell'],
            items: [],
            customFields: {},
            owner: { name: 'Eu', avatar: '' },
            isWon: false,
            isLost: false,
          });
          showToast(`Oportunidade de Upsell criada!`, 'success');
        }
        break;

      case 'STALLED':
        if (suggestion.data.deal) {
          const deal = suggestion.data.deal;

          // Transforme “deal parado” em trabalho rastreável (não só um update vazio).
          const due = new Date();
          due.setDate(due.getDate() + 1);
          due.setHours(10, 0, 0, 0);

          createActivityMutation.mutate({
            activity: {
              title: `Follow-up: ${deal.title}`,
              type: 'TASK',
              description: 'Deal parado — fazer follow-up para destravar o próximo passo',
              date: due.toISOString(),
              dealId: deal.id,
              contactId: deal.contactId,
              clientCompanyId: deal.clientCompanyId,
              participantContactIds: deal.contactId ? [deal.contactId] : [],
              dealTitle: deal.title,
              completed: false,
              user: { name: 'Eu', avatar: '' },
            },
          });

          showToast('Follow-up criado para reativar o negócio', 'success');
        }
        break;

      case 'RESCUE':
        if (suggestion.data.contact) {
          const c = suggestion.data.contact;
          createActivityMutation.mutate({
            activity: {
              title: `Reativar cliente: ${c.name}`,
              type: 'CALL',
              description: 'Cliente em risco de churn - ligar para reativar',
              date: new Date().toISOString(),
              dealId: '',
              contactId: c.id,
              clientCompanyId: c.clientCompanyId || c.companyId,
              participantContactIds: [c.id],
              dealTitle: '',
              completed: false,
              user: { name: 'Eu', avatar: '' },
            },
          });
          showToast('Tarefa de reativação criada!', 'success');
        }
        break;
    }
    // Persist to database
    const entityType = suggestion.data.deal ? 'deal' : 'contact';
    const entityId = suggestion.data.deal?.id || suggestion.data.contact?.id || '';
    recordInteraction.mutate({
      suggestionType: suggestion.type as SuggestionType,
      entityType,
      entityId,
      action: 'ACCEPTED',
    });
  };

  const seedInboxDebug = useCallback(async () => {
    if (!isDebugMode()) {
      showToast('Ative o Debug Mode para usar o Seed Inbox.', 'info');
      return;
    }
    if (!supabase || !profile?.id || !activeBoardId || !activeBoard?.stages?.length) {
      showToast('Supabase/board não configurado para seed.', 'error');
      return;
    }

    try {
      const now = new Date();
      const fortyDaysAgo = new Date(now);
      fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);
      const tenDaysAgo = new Date(now);
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      // Cliente em risco (sem interação, criado há > 30d)
      const [seedContact] = generateFakeContacts(1);
      const createdContact = await createContactMutation.mutateAsync({
        name: seedContact.name,
        email: seedContact.email,
        phone: seedContact.phone,
        role: seedContact.role,
        companyId: '',
        status: 'ACTIVE',
        stage: 'CUSTOMER',
        totalValue: 0,
      } as any);

      await supabase
        .from('contacts')
        .update({ created_at: fortyDaysAgo.toISOString() })
        .eq('id', createdContact.id);

      const firstStage = activeBoard.stages[0];

      // Deal ganho há > 30d (Upsell)
      const upsell = fakeDeal();
      const upsellDeal = await createDealMutation.mutateAsync({
        title: `Upsell - ${upsell.title}`,
        contactId: createdContact.id,
        companyId: createdContact.clientCompanyId || createdContact.companyId,
        boardId: activeBoardId,
        status: firstStage.id,
        value: 12000,
        probability: 90,
        priority: 'high',
        tags: ['Upsell'],
        items: [],
        customFields: {},
        owner: { name: 'Eu', avatar: '' },
        isWon: true,
        isLost: false,
      } as any);

      await supabase
        .from('deals')
        .update({ updated_at: fortyDaysAgo.toISOString(), is_won: true })
        .eq('id', upsellDeal.id);

      // Deal parado há > 7d (Stalled)
      const stalled = fakeDeal();
      const stalledDeal = await createDealMutation.mutateAsync({
        title: `Stalled - ${stalled.title}`,
        contactId: createdContact.id,
        companyId: createdContact.clientCompanyId || createdContact.companyId,
        boardId: activeBoardId,
        status: firstStage.id,
        value: 8000,
        probability: 60,
        priority: 'medium',
        tags: ['Stalled'],
        items: [],
        customFields: {},
        owner: { name: 'Eu', avatar: '' },
        isWon: false,
        isLost: false,
      } as any);

      await supabase
        .from('deals')
        .update({ updated_at: tenDaysAgo.toISOString() })
        .eq('id', stalledDeal.id);

      // Garante que o cliente também tem histórico antigo (alternativo ao created_at)
      updateContactMutation.mutate({
        id: createdContact.id,
        updates: { lastPurchaseDate: fortyDaysAgo.toISOString() },
      } as any);

      showToast('Seed Inbox criado (Upsell, Stalled, Rescue). Abra a Inbox.', 'success');
    } catch (e) {
      showToast(`Erro ao seedar Inbox: ${(e as Error).message}`, 'error');
    }
  }, [activeBoard, activeBoardId, createContactMutation, createDealMutation, profile?.id, showToast, updateContactMutation]);

  const handleDismissSuggestion = (suggestionId: string) => {
    const suggestion = aiSuggestions.find(s => s.id === suggestionId);

    // IMPORTANT: UUIDs contain '-', so never do suggestionId.split('-').
    const suggestionType = (suggestion?.type || suggestionId.slice(0, suggestionId.indexOf('-') === -1 ? undefined : suggestionId.indexOf('-')))
      .toString()
      .toUpperCase() as SuggestionType;

    const entityId = suggestion?.data.deal?.id
      || suggestion?.data.contact?.id
      || (suggestionId.includes('-') ? suggestionId.slice(suggestionId.indexOf('-') + 1) : '');

    const entityType: 'deal' | 'contact' = suggestion?.data.deal
      ? 'deal'
      : suggestion?.data.contact
        ? 'contact'
        : (suggestionType === 'RESCUE' ? 'contact' : 'deal');

    if (!entityId) return;

    recordInteraction.mutate({
      suggestionType,
      entityType,
      entityId,
      action: 'DISMISSED',
    });
    showToast('Sugestão descartada', 'info');
  };

  const handleSnoozeSuggestion = (suggestionId: string) => {
    const suggestion = aiSuggestions.find(s => s.id === suggestionId);

    // IMPORTANT: UUIDs contain '-', so never do suggestionId.split('-').
    const suggestionType = (suggestion?.type || suggestionId.slice(0, suggestionId.indexOf('-') === -1 ? undefined : suggestionId.indexOf('-')))
      .toString()
      .toUpperCase() as SuggestionType;

    const entityId = suggestion?.data.deal?.id
      || suggestion?.data.contact?.id
      || (suggestionId.includes('-') ? suggestionId.slice(suggestionId.indexOf('-') + 1) : '');

    const entityType: 'deal' | 'contact' = suggestion?.data.deal
      ? 'deal'
      : suggestion?.data.contact
        ? 'contact'
        : (suggestionType === 'RESCUE' ? 'contact' : 'deal');

    if (!entityId) return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    recordInteraction.mutate({
      suggestionType,
      entityType,
      entityId,
      action: 'SNOOZED',
      snoozedUntil: tomorrow,
    });
    showToast('Sugestão adiada para amanhã', 'info');
  };

  // --- Métricas ---
  const stats = useMemo(
    () => ({
      overdueCount: overdueActivities.length,
      todayCount: todayActivities.length,
      suggestionsCount: aiSuggestions.length,
      totalPending: overdueActivities.length + todayActivities.length + aiSuggestions.length,
    }),
    [overdueActivities, todayActivities, aiSuggestions]
  );

  const isInboxZero = stats.totalPending === 0;

  // --- Focus Mode: Fila unificada ordenada por prioridade ---
  const focusQueue = useMemo((): FocusItem[] => {
    const items: FocusItem[] = [];

    // 1. Atrasados (prioridade 0-99)
    overdueActivities.forEach((activity, i) => {
      items.push({
        id: activity.id,
        type: 'activity',
        priority: i,
        data: activity,
      });
    });

    // 2. Sugestões de alta prioridade (prioridade 100-199)
    aiSuggestions
      .filter(s => s.priority === 'high')
      .forEach((suggestion, i) => {
        items.push({
          id: suggestion.id,
          type: 'suggestion',
          priority: 100 + i,
          data: suggestion,
        });
      });

    // 3. Hoje - Reuniões primeiro por horário (prioridade 200-299)
    todayMeetings.forEach((activity, i) => {
      items.push({
        id: activity.id,
        type: 'activity',
        priority: 200 + i,
        data: activity,
      });
    });

    // 4. Hoje - Tarefas (prioridade 300-399)
    todayTasks.forEach((activity, i) => {
      items.push({
        id: activity.id,
        type: 'activity',
        priority: 300 + i,
        data: activity,
      });
    });

    // 5. Sugestões de média/baixa prioridade (prioridade 400+)
    aiSuggestions
      .filter(s => s.priority !== 'high')
      .forEach((suggestion, i) => {
        items.push({
          id: suggestion.id,
          type: 'suggestion',
          priority: 400 + i,
          data: suggestion,
        });
      });

    return items.sort((a, b) => a.priority - b.priority);
  }, [overdueActivities, todayMeetings, todayTasks, aiSuggestions]);

  // Item atual no modo Focus
  const currentFocusItem = focusQueue[focusIndex] || null;

  // Navegação do Focus Mode
  const handleFocusNext = useCallback(() => {
    if (focusIndex < focusQueue.length - 1) {
      setFocusIndex(prev => prev + 1);
    }
  }, [focusIndex, focusQueue.length]);

  const handleFocusPrev = useCallback(() => {
    if (focusIndex > 0) {
      setFocusIndex(prev => prev - 1);
    }
  }, [focusIndex]);

  const handleFocusSkip = useCallback(() => {
    // Pula para o próximo (sem completar)
    handleFocusNext();
    showToast('Pulado para o próximo', 'info');
  }, [handleFocusNext, showToast]);

  const handleFocusDone = useCallback(() => {
    const item = currentFocusItem;
    if (!item) return;

    if (item.type === 'activity') {
      handleCompleteActivity(item.id);
    } else {
      handleAcceptSuggestion(item.data as AISuggestion);
    }

    // Mantém no mesmo índice (próximo item "sobe")
    // Só avança se era o último
    if (focusIndex >= focusQueue.length - 1) {
      setFocusIndex(Math.max(0, focusQueue.length - 2));
    }
  }, [
    currentFocusItem,
    focusIndex,
    focusQueue.length,
    handleCompleteActivity,
    handleAcceptSuggestion,
  ]);

  const handleFocusSnooze = useCallback(() => {
    const item = currentFocusItem;
    if (!item) return;

    if (item.type === 'activity') {
      handleSnoozeActivity(item.id, 1);
    } else {
      handleSnoozeSuggestion(item.id);
    }

    // Mantém no mesmo índice
    if (focusIndex >= focusQueue.length - 1) {
      setFocusIndex(Math.max(0, focusQueue.length - 2));
    }
  }, [
    currentFocusItem,
    focusIndex,
    focusQueue.length,
    handleSnoozeActivity,
    handleSnoozeSuggestion,
  ]);

  // Reset do índice quando a fila muda
  useEffect(() => {
    if (focusIndex >= focusQueue.length) {
      setFocusIndex(Math.max(0, focusQueue.length - 1));
    }
  }, [focusQueue.length, focusIndex]);

  return {
    // Loading
    isLoading,

    // View Mode
    viewMode,
    setViewMode,

    // Briefing
    briefing,
    isGeneratingBriefing,

    // Atividades
    overdueActivities,
    todayActivities,
    todayMeetings,
    todayTasks,
    upcomingActivities,

    // Sugestões de IA
    aiSuggestions,

    // Focus Mode
    focusQueue,
    focusIndex,
    setFocusIndex,
    currentFocusItem,
    handleFocusNext,
    handleFocusPrev,
    handleFocusSkip,
    handleFocusDone,
    handleFocusSnooze,

    // Stats
    stats,
    isInboxZero,

    // Handlers de Atividades
    handleCompleteActivity,
    handleSnoozeActivity,
    handleDiscardActivity,

    // Handlers de Sugestões
    handleAcceptSuggestion,
    handleDismissSuggestion,
    handleSnoozeSuggestion,
    seedInboxDebug,
    handleSelectActivity: (id: string) => {
      const index = focusQueue.findIndex(item => item.id === id);
      if (index !== -1) {
        setFocusIndex(index);
        setViewMode('focus');
      }
    },
  };
};

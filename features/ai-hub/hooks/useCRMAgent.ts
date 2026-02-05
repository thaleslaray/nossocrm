import { useState, useCallback, useRef } from 'react';
import { streamText, tool, ModelMessage, stepCountIs } from 'ai';
import { z } from 'zod';
import { useCRM } from '@/context/CRMContext';
import { useSettings } from '@/context/settings/SettingsContext';
import { getModel } from '@/lib/ai/config';
import { Activity, Deal } from '@/types';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
}

interface UseCRMAgentOptions {
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
}

/**
 * Hook React `useCRMAgent` que encapsula uma lógica reutilizável.
 *
 * @param {UseCRMAgentOptions} options - Opções de configuração.
 * @returns {{ messages: AgentMessage[]; isLoading: boolean; error: Error | null; sendMessage: (content: string) => Promise<void>; clearMessages: () => void; stopGeneration: () => void; }} Retorna um valor do tipo `{ messages: AgentMessage[]; isLoading: boolean; error: Error | null; sendMessage: (content: string) => Promise<void>; clearMessages: () => void; stopGeneration: () => void; }`.
 */
export function useCRMAgent(options: UseCRMAgentOptions = {}) {
  const {
    deals,
    contacts,
    activities,
    addActivity,
    updateActivity,
    updateDeal,
    addDeal,
    activeBoard,
    aiApiKey,
  } = useCRM();

  const { aiProvider, aiModel } = useSettings();

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cria o modelo usando provider e model das configurações do usuário
  const getConfiguredModel = useCallback(() => {
    if (!aiApiKey) {
      throw new Error('API Key não configurada. Vá em Configurações > IA para adicionar.');
    }
    return getModel(aiProvider, aiApiKey, aiModel);
  }, [aiApiKey, aiProvider, aiModel]);

  // ============================================
  // EXECUTORES DAS TOOLS (conectam com o CRM)
  // ============================================

  const toolExecutors = {
    // LEITURA
    searchDeals: async ({ query, status, minValue, maxValue, limit = 10 }: {
      query?: string;
      status?: string;
      minValue?: number;
      maxValue?: number;
      limit?: number;
    }) => {
      let filtered = [...deals];

      if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(d =>
          (d.title || '').toLowerCase().includes(q) ||
          (d.companyName || '').toLowerCase().includes(q)
        );
      }
      if (status) {
        filtered = filtered.filter(d => d.status === status);
      }
      if (minValue !== undefined) {
        filtered = filtered.filter(d => d.value >= minValue);
      }
      if (maxValue !== undefined) {
        filtered = filtered.filter(d => d.value <= maxValue);
      }

      const results = filtered.slice(0, limit).map(d => ({
        id: d.id,
        title: d.title,
        value: d.value,
        status: d.status,
        company: d.companyName,
        probability: d.probability,
      }));

      return {
        count: results.length,
        totalValue: results.reduce((sum, d) => sum + d.value, 0),
        deals: results,
      };
    },

    getContact: async ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      const found = contacts.find(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );

      if (!found) {
        return { found: false, message: `Contato "${query}" não encontrado.` };
      }

      return {
        found: true,
        contact: {
          id: found.id,
          name: found.name,
          email: found.email,
          phone: found.phone,
          companyId: found.companyId,
          status: found.status,
          stage: found.stage,
        },
      };
    },

    getActivitiesToday: async ({ includeCompleted = false }: { includeCompleted?: boolean }) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let filtered = activities.filter(a => {
        const actDate = new Date(a.date);
        return actDate >= today && actDate < tomorrow;
      });

      if (!includeCompleted) {
        filtered = filtered.filter(a => !a.completed);
      }

      return {
        count: filtered.length,
        activities: filtered.map(a => ({
          id: a.id,
          title: a.title,
          type: a.type,
          time: new Date(a.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          completed: a.completed,
          deal: a.dealTitle,
        })),
      };
    },

    getOverdueActivities: async ({ limit = 5 }: { limit?: number }) => {
      const now = new Date();
      const overdue = activities
        .filter(a => !a.completed && new Date(a.date) < now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, limit);

      return {
        count: overdue.length,
        activities: overdue.map(a => ({
          id: a.id,
          title: a.title,
          type: a.type,
          daysOverdue: Math.floor((now.getTime() - new Date(a.date).getTime()) / (1000 * 60 * 60 * 24)),
          deal: a.dealTitle,
        })),
      };
    },

    getPipelineStats: async () => {
      const activeDeals = deals.filter(d => !d.isWon && !d.isLost);
      const wonDeals = deals.filter(d => d.isWon);
      const lostDeals = deals.filter(d => d.isLost);

      return {
        totalDeals: deals.length,
        activeDeals: activeDeals.length,
        pipelineValue: activeDeals.reduce((sum, d) => sum + d.value, 0),
        wonDeals: wonDeals.length,
        wonValue: wonDeals.reduce((sum, d) => sum + d.value, 0),
        lostDeals: lostDeals.length,
        winRate: deals.length > 0
          ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length || 1)) * 100)
          : 0,
      };
    },

    getDealDetails: async ({ dealId }: { dealId: string }) => {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) {
        return { found: false, message: 'Deal não encontrado.' };
      }

      const dealActivities = activities.filter(a => a.dealId === dealId);

      return {
        found: true,
        deal: {
          id: deal.id,
          title: deal.title,
          value: deal.value,
          status: deal.status,
          probability: deal.probability,
          company: deal.companyName,
          contact: deal.contactName,
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt,
          activities: dealActivities.length,
          tags: deal.tags,
        },
      };
    },

    // ESCRITA
    createActivity: async ({ title, type, date, description, contactName, dealTitle }: {
      title: string;
      type: 'MEETING' | 'CALL' | 'TASK' | 'EMAIL';
      date: string;
      description?: string;
      contactName?: string;
      dealTitle?: string;
    }) => {
      const newActivity: Activity = {
        id: crypto.randomUUID(),
        dealId: '',
        dealTitle: dealTitle || '',
        title,
        type,
        description: description || '',
        date,
        user: { name: 'Eu', avatar: '' },
        completed: false,
      };

      addActivity(newActivity);

      return {
        success: true,
        message: `Atividade "${title}" criada para ${new Date(date).toLocaleDateString('pt-BR')}`,
        activity: { id: newActivity.id, title, type, date },
      };
    },

    completeActivity: async ({ activityId }: { activityId: string }) => {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) {
        return { success: false, message: 'Atividade não encontrada.' };
      }

      updateActivity(activityId, { completed: true });

      return {
        success: true,
        message: `Atividade "${activity.title}" marcada como concluída!`,
      };
    },

    moveDeal: async ({ dealId, newStatus }: { dealId: string; newStatus: string }) => {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) {
        return { success: false, message: 'Deal não encontrado.' };
      }

      updateDeal(dealId, { status: newStatus as Deal['status'] });

      return {
        success: true,
        message: `Deal "${deal.title}" movido para ${newStatus}`,
        previousStatus: deal.status,
        newStatus,
      };
    },

    updateDealValue: async ({ dealId, newValue }: { dealId: string; newValue: number }) => {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) {
        return { success: false, message: 'Deal não encontrado.' };
      }

      const oldValue = deal.value;
      updateDeal(dealId, { value: newValue });

      return {
        success: true,
        message: `Valor do deal "${deal.title}" atualizado de R$${oldValue.toLocaleString()} para R$${newValue.toLocaleString()}`,
      };
    },

    createDeal: async ({ title, value, contactName, companyName, description }: {
      title: string;
      value: number;
      contactName?: string;
      companyName?: string;
      description?: string;
    }) => {
      // Buscar contato e empresa pelos nomes (se fornecidos)
      let contactId = '';
      let companyId = '';

      if (contactName) {
        const found = contacts.find(c =>
          (c.name || '').toLowerCase().includes(contactName.toLowerCase())
        );
        if (found) {
          contactId = found.id;
          companyId = found.companyId || '';
        }
      }

      const newDeal: Deal = {
        id: crypto.randomUUID(),
        boardId: activeBoard?.id || '',
        title,
        value,
        items: [],
        status: activeBoard?.stages[0]?.id || 'LEAD',
        priority: 'medium',
        probability: 20,
        contactId,
        companyId,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        owner: { name: 'Eu', avatar: '' },
        isWon: false,
        isLost: false,
      };

      addDeal(newDeal);

      return {
        success: true,
        message: `Deal "${title}" criado com valor de R$${value.toLocaleString()}`,
        deal: { id: newDeal.id, title, value, status: newDeal.status },
      };
    },

    // ANÁLISE
    analyzeStagnantDeals: async ({ daysStagnant = 7 }: { daysStagnant?: number }) => {
      const now = new Date();
      const threshold = new Date(now.getTime() - daysStagnant * 24 * 60 * 60 * 1000);

      const stagnant = deals
        .filter(d => {
          if (['CLOSED_WON', 'CLOSED_LOST'].includes(d.status)) return false;
          const updated = new Date(d.updatedAt);
          return updated < threshold;
        })
        .sort((a, b) => b.value - a.value);

      return {
        count: stagnant.length,
        totalValueAtRisk: stagnant.reduce((sum, d) => sum + d.value, 0),
        deals: stagnant.slice(0, 5).map(d => ({
          id: d.id,
          title: d.title,
          value: d.value,
          status: d.status,
          daysSinceUpdate: Math.floor((now.getTime() - new Date(d.updatedAt).getTime()) / (1000 * 60 * 60 * 24)),
        })),
      };
    },

    suggestNextAction: async ({ dealId }: { dealId: string }) => {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) {
        return { success: false, message: 'Deal não encontrado.' };
      }

      const dealActivities = activities.filter(a => a.dealId === dealId);
      const lastActivity = dealActivities.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];

      let suggestion = '';
      let priority = 'medium';

      if (!lastActivity) {
        suggestion = 'Fazer primeiro contato - agendar reunião de descoberta';
        priority = 'high';
      } else {
        const daysSinceContact = Math.floor(
          (Date.now() - new Date(lastActivity.date).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceContact > 7) {
          suggestion = `Fazer follow-up - último contato foi há ${daysSinceContact} dias`;
          priority = 'high';
        } else if (deal.probability >= 70) {
          suggestion = 'Deal com alta probabilidade - verificar se está pronto para fechamento';
        } else if (deal.probability >= 40) {
          suggestion = 'Continuar negociação e resolver possíveis objeções';
        } else {
          suggestion = 'Continuar nurturing com conteúdo relevante';
        }
      }

      return {
        deal: deal.title,
        suggestion,
        priority,
        context: {
          isWon: deal.isWon,
          isLost: deal.isLost,
          value: deal.value,
          lastActivity: lastActivity?.title || 'Nenhuma',
        },
      };
    },
  };

  // ============================================
  // FUNÇÃO PRINCIPAL DE ENVIO
  // ============================================

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    // Abort controller para cancelar se necessário
    abortControllerRef.current = new AbortController();

    try {
      const model = getConfiguredModel();

      // Converte mensagens para o formato do SDK
      const coreMessages: ModelMessage[] = [
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content },
      ];

      // Define as tools com execute
      const tools = {
        searchDeals: tool({
          description: 'Busca deals/oportunidades no CRM',
          inputSchema: z.object({
            query: z.string().optional(),
            status: z.string().optional(),
            minValue: z.number().optional(),
            maxValue: z.number().optional(),
            limit: z.number().default(10),
          }),
          execute: toolExecutors.searchDeals,
        }),
        getContact: tool({
          description: 'Busca informações de um contato',
          inputSchema: z.object({
            query: z.string(),
          }),
          execute: toolExecutors.getContact,
        }),
        getActivitiesToday: tool({
          description: 'Retorna atividades de hoje',
          inputSchema: z.object({
            includeCompleted: z.boolean().default(false),
          }),
          execute: toolExecutors.getActivitiesToday,
        }),
        getOverdueActivities: tool({
          description: 'Retorna atividades atrasadas',
          inputSchema: z.object({
            limit: z.number().default(5),
          }),
          execute: toolExecutors.getOverdueActivities,
        }),
        getPipelineStats: tool({
          description: 'Estatísticas do pipeline',
          inputSchema: z.object({}),
          execute: toolExecutors.getPipelineStats,
        }),
        getDealDetails: tool({
          description: 'Detalhes de um deal',
          inputSchema: z.object({
            dealId: z.string(),
          }),
          execute: toolExecutors.getDealDetails,
        }),
        createActivity: tool({
          description: 'Cria uma nova atividade',
          inputSchema: z.object({
            title: z.string(),
            type: z.enum(['MEETING', 'CALL', 'TASK', 'EMAIL']),
            date: z.string(),
            description: z.string().optional(),
            contactName: z.string().optional(),
            dealTitle: z.string().optional(),
          }),
          execute: toolExecutors.createActivity,
        }),
        completeActivity: tool({
          description: 'Marca atividade como concluída',
          inputSchema: z.object({
            activityId: z.string(),
          }),
          execute: toolExecutors.completeActivity,
        }),
        moveDeal: tool({
          description: 'Move deal para outro estágio',
          inputSchema: z.object({
            dealId: z.string(),
            newStatus: z.enum(['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']),
          }),
          execute: toolExecutors.moveDeal,
        }),
        updateDealValue: tool({
          description: 'Atualiza valor do deal',
          inputSchema: z.object({
            dealId: z.string(),
            newValue: z.number(),
          }),
          execute: toolExecutors.updateDealValue,
        }),
        createDeal: tool({
          description: 'Cria novo deal',
          inputSchema: z.object({
            title: z.string(),
            value: z.number(),
            contactName: z.string().optional(),
            companyName: z.string().optional(),
            description: z.string().optional(),
          }),
          execute: toolExecutors.createDeal,
        }),
        analyzeStagnantDeals: tool({
          description: 'Analisa deals parados',
          inputSchema: z.object({
            daysStagnant: z.number().default(7),
          }),
          execute: toolExecutors.analyzeStagnantDeals,
        }),
        suggestNextAction: tool({
          description: 'Sugere próxima ação para deal',
          inputSchema: z.object({
            dealId: z.string(),
          }),
          execute: toolExecutors.suggestNextAction,
        }),
      };

      const result = streamText({
        model,
        system: `Você é o assistente inteligente do FlowCRM. Você tem acesso completo ao CRM e pode:

- Buscar e analisar deals, contatos e atividades
- Criar novas atividades, deals e tarefas
- Mover deals entre estágios do pipeline
- Analisar riscos e sugerir próximas ações

REGRAS:
1. Sempre use as ferramentas disponíveis para buscar dados reais antes de responder
2. Seja conciso e direto nas respostas
3. Quando criar algo, confirme o que foi criado
4. Quando analisar, forneça insights acionáveis
5. Use valores em Reais (R$) formatados
6. Datas em formato brasileiro (dd/mm/aaaa)

Você é proativo - se perceber oportunidades ou riscos, mencione-os.`,
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(5), // Permite multi-step automático
        abortSignal: abortControllerRef.current.signal,
      });

      // Streaming da resposta
      let fullText = '';

      for await (const chunk of result.textStream) {
        fullText += chunk;
        // Atualiza a mensagem em tempo real
        setMessages(prev => {
          const existing = prev.find(m => m.id === 'streaming');
          if (existing) {
            return prev.map(m =>
              m.id === 'streaming' ? { ...m, content: fullText } : m
            );
          }
          return [...prev, {
            id: 'streaming',
            role: 'assistant' as const,
            content: fullText,
          }];
        });
      }

      // Finaliza a mensagem
      setMessages(prev =>
        prev.map(m =>
          m.id === 'streaming'
            ? { ...m, id: crypto.randomUUID() }
            : m
        )
      );

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Ignorar abort
        return;
      }
      setError(err instanceof Error ? err : new Error('Erro desconhecido'));
      console.error('CRM Agent Error:', err);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, getModel, deals, contacts, activities, addActivity, updateActivity, updateDeal, addDeal, activeBoard]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    stopGeneration,
  };
}

// Route Handler for AI CRM Agent - /api/ai/crm-agent
// Substitui o streamText client-side do useCRMAgent (que expunha API keys no browser).

import { streamText, tool, UIMessage, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getModel } from '@/lib/ai/config';
import { AI_DEFAULT_MODELS } from '@/lib/ai/defaults';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

export const maxDuration = 60;

type AIProvider = 'google';

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * Recebe as mensagens do `useChat` (via `DefaultChatTransport`),
 * autentica o usuário, busca a API key da org no banco e executa
 * o agente CRM server-side via `streamText`.
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Stream de resposta compatível com useChat.
 */
export async function POST(req: Request) {
    // Mitigação CSRF: endpoint autenticado por cookies.
    if (!isAllowedOrigin(req)) {
        return new Response('Forbidden', { status: 403 });
    }

    const supabase = await createClient();

    // 1. Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    // 2. Parse body
    const body = await req.json().catch(() => null);
    const messages: UIMessage[] = (body?.messages ?? []) as UIMessage[];

    // 3. Get profile + organization
    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, first_name, nickname')
        .eq('id', user.id)
        .maybeSingle();

    const organizationId = profile?.organization_id ?? null;
    if (!organizationId) {
        return new Response(
            'Perfil sem organização. Finalize o setup para vincular seu usuário antes de usar a IA.',
            { status: 409 }
        );
    }

    // 4. Get AI settings from org
    const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('ai_enabled, ai_provider, ai_model, ai_google_key')
        .eq('organization_id', organizationId)
        .maybeSingle();

    const aiEnabled = typeof (orgSettings as any)?.ai_enabled === 'boolean'
        ? (orgSettings as any).ai_enabled
        : true;

    if (!aiEnabled) {
        return new Response(
            'IA desativada pela organização. Um admin pode ativar em Configurações → Central de I.A.',
            { status: 403 }
        );
    }

    const provider: AIProvider = 'google';
    const modelId: string | null = orgSettings?.ai_model ?? null;
    const apiKey: string | null = orgSettings?.ai_google_key ?? null;

    if (!apiKey) {
        return new Response(
            'API key não configurada para Google Gemini. Configure em Configurações → Inteligência Artificial.',
            { status: 400 }
        );
    }

    const resolvedModelId =
        modelId || AI_DEFAULT_MODELS[provider as keyof typeof AI_DEFAULT_MODELS] || AI_DEFAULT_MODELS.google;

    const model = getModel(provider, apiKey, resolvedModelId);

    // 5. Build tools — todas executam server-side com Supabase
    const tools = {
        // ---- LEITURA ----
        searchDeals: tool({
            description: 'Busca deals/oportunidades no CRM por nome, empresa ou status',
            inputSchema: z.object({
                query: z.string().optional().describe('Texto para buscar no título ou empresa'),
                status: z.string().optional().describe('Filtrar por status (ex: LEAD, NEGOTIATION, CLOSED_WON)'),
                minValue: z.number().optional(),
                maxValue: z.number().optional(),
                limit: z.number().default(10),
            }),
            execute: async ({ query, status, minValue, maxValue, limit }) => {
                let dbQuery = supabase
                    .from('deals')
                    .select('id, title, value, stage_id, probability, is_won, is_lost, contacts(name), companies(name)')
                    .eq('organization_id', organizationId)
                    .limit(limit);

                if (minValue !== undefined) dbQuery = dbQuery.gte('value', minValue);
                if (maxValue !== undefined) dbQuery = dbQuery.lte('value', maxValue);

                const { data: deals } = await dbQuery;
                if (!deals) return { count: 0, deals: [] };

                let filtered = deals;
                if (query) {
                    const q = query.toLowerCase();
                    filtered = filtered.filter(d =>
                        (d.title || '').toLowerCase().includes(q) ||
                        ((d as any).companies?.name || '').toLowerCase().includes(q)
                    );
                }
                if (status) {
                    filtered = filtered.filter(d => d.stage_id === status || (d as any).stage_id === status);
                }

                const results = filtered.map(d => ({
                    id: d.id,
                    title: d.title,
                    value: d.value,
                    stageId: d.stage_id,
                    company: (d as any).companies?.name,
                    contact: (d as any).contacts?.name,
                    probability: d.probability,
                    isWon: d.is_won,
                    isLost: d.is_lost,
                }));

                return {
                    count: results.length,
                    totalValue: results.reduce((sum, d) => sum + (d.value || 0), 0),
                    deals: results,
                };
            },
        }),

        getContact: tool({
            description: 'Busca informações de um contato pelo nome ou email',
            inputSchema: z.object({
                query: z.string().describe('Nome ou email do contato'),
            }),
            execute: async ({ query }) => {
                const q = `%${query}%`;
                const { data: contacts } = await supabase
                    .from('contacts')
                    .select('id, name, email, phone, status, company_id')
                    .eq('organization_id', organizationId)
                    .or(`name.ilike.${q},email.ilike.${q}`)
                    .limit(1);

                const found = contacts?.[0];
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
                        companyId: found.company_id,
                        status: found.status,
                    },
                };
            },
        }),

        getActivitiesToday: tool({
            description: 'Retorna as atividades agendadas para hoje',
            inputSchema: z.object({
                includeCompleted: z.boolean().default(false),
            }),
            execute: async ({ includeCompleted }) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                let dbQuery = supabase
                    .from('activities')
                    .select('id, title, type, date, completed, deal_id, deals(title)')
                    .eq('organization_id', organizationId)
                    .gte('date', today.toISOString())
                    .lt('date', tomorrow.toISOString());

                if (!includeCompleted) {
                    dbQuery = dbQuery.eq('completed', false);
                }

                const { data: activities } = await dbQuery;
                if (!activities) return { count: 0, activities: [] };

                return {
                    count: activities.length,
                    activities: activities.map(a => ({
                        id: a.id,
                        title: a.title,
                        type: a.type,
                        time: new Date(a.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                        completed: a.completed,
                        deal: (a as any).deals?.title,
                    })),
                };
            },
        }),

        getOverdueActivities: tool({
            description: 'Retorna atividades atrasadas (não concluídas com data no passado)',
            inputSchema: z.object({
                limit: z.number().default(5),
            }),
            execute: async ({ limit }) => {
                const now = new Date().toISOString();

                const { data: activities } = await supabase
                    .from('activities')
                    .select('id, title, type, date, deals(title)')
                    .eq('organization_id', organizationId)
                    .eq('completed', false)
                    .lt('date', now)
                    .order('date', { ascending: true })
                    .limit(limit);

                if (!activities) return { count: 0, activities: [] };

                const nowMs = Date.now();
                return {
                    count: activities.length,
                    activities: activities.map(a => ({
                        id: a.id,
                        title: a.title,
                        type: a.type,
                        daysOverdue: Math.floor((nowMs - new Date(a.date).getTime()) / (1000 * 60 * 60 * 24)),
                        deal: (a as any).deals?.title,
                    })),
                };
            },
        }),

        getPipelineStats: tool({
            description: 'Retorna estatísticas gerais do pipeline: total de deals, valor, taxa de vitória',
            inputSchema: z.object({}),
            execute: async () => {
                const { data: deals } = await supabase
                    .from('deals')
                    .select('id, value, is_won, is_lost')
                    .eq('organization_id', organizationId);

                if (!deals) return { totalDeals: 0 };

                const activeDeals = deals.filter(d => !d.is_won && !d.is_lost);
                const wonDeals = deals.filter(d => d.is_won);
                const lostDeals = deals.filter(d => d.is_lost);

                return {
                    totalDeals: deals.length,
                    activeDeals: activeDeals.length,
                    pipelineValue: activeDeals.reduce((sum, d) => sum + (d.value || 0), 0),
                    wonDeals: wonDeals.length,
                    wonValue: wonDeals.reduce((sum, d) => sum + (d.value || 0), 0),
                    lostDeals: lostDeals.length,
                    winRate: (wonDeals.length + lostDeals.length) > 0
                        ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
                        : 0,
                };
            },
        }),

        getDealDetails: tool({
            description: 'Retorna detalhes completos de um deal pelo ID',
            inputSchema: z.object({
                dealId: z.string(),
            }),
            execute: async ({ dealId }) => {
                const { data: deal } = await supabase
                    .from('deals')
                    .select('id, title, value, stage_id, probability, is_won, is_lost, created_at, updated_at, contacts(name), companies(name)')
                    .eq('id', dealId)
                    .eq('organization_id', organizationId)
                    .maybeSingle();

                if (!deal) return { found: false, message: 'Deal não encontrado.' };

                const { count: activitiesCount } = await supabase
                    .from('activities')
                    .select('id', { count: 'exact', head: true })
                    .eq('deal_id', dealId)
                    .eq('organization_id', organizationId);

                return {
                    found: true,
                    deal: {
                        id: deal.id,
                        title: deal.title,
                        value: deal.value,
                        stageId: deal.stage_id,
                        probability: deal.probability,
                        company: (deal as any).companies?.name,
                        contact: (deal as any).contacts?.name,
                        createdAt: deal.created_at,
                        updatedAt: deal.updated_at,
                        isWon: deal.is_won,
                        isLost: deal.is_lost,
                        activitiesCount: activitiesCount ?? 0,
                    },
                };
            },
        }),

        analyzeStagnantDeals: tool({
            description: 'Analisa deals que não foram atualizados há N dias (parados no pipeline)',
            inputSchema: z.object({
                daysStagnant: z.number().default(7),
            }),
            execute: async ({ daysStagnant }) => {
                const threshold = new Date(Date.now() - daysStagnant * 24 * 60 * 60 * 1000).toISOString();

                const { data: deals } = await supabase
                    .from('deals')
                    .select('id, title, value, stage_id, updated_at')
                    .eq('organization_id', organizationId)
                    .eq('is_won', false)
                    .eq('is_lost', false)
                    .lt('updated_at', threshold)
                    .order('value', { ascending: false })
                    .limit(10);

                if (!deals) return { count: 0, deals: [] };

                const nowMs = Date.now();
                return {
                    count: deals.length,
                    totalValueAtRisk: deals.reduce((sum, d) => sum + (d.value || 0), 0),
                    deals: deals.slice(0, 5).map(d => ({
                        id: d.id,
                        title: d.title,
                        value: d.value,
                        stageId: d.stage_id,
                        daysSinceUpdate: Math.floor((nowMs - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
                    })),
                };
            },
        }),

        // ---- ESCRITA ----
        createActivity: tool({
            description: 'Cria uma nova atividade (reunião, tarefa, ligação ou email) no CRM',
            inputSchema: z.object({
                title: z.string(),
                type: z.enum(['MEETING', 'CALL', 'TASK', 'EMAIL']),
                date: z.string().describe('Data/hora ISO 8601'),
                description: z.string().optional(),
                dealId: z.string().optional().describe('ID do deal relacionado'),
            }),
            execute: async ({ title, type, date, description, dealId }) => {
                const { data, error } = await supabase
                    .from('activities')
                    .insert({
                        organization_id: organizationId,
                        user_id: user.id,
                        title,
                        type,
                        date,
                        description: description ?? null,
                        deal_id: dealId ?? null,
                        completed: false,
                    })
                    .select('id')
                    .single();

                if (error) {
                    return { success: false, message: `Erro ao criar atividade: ${error.message}` };
                }

                return {
                    success: true,
                    message: `Atividade "${title}" criada para ${new Date(date).toLocaleDateString('pt-BR')}`,
                    activity: { id: data.id, title, type, date },
                };
            },
        }),

        completeActivity: tool({
            description: 'Marca uma atividade como concluída',
            inputSchema: z.object({
                activityId: z.string(),
            }),
            execute: async ({ activityId }) => {
                const { data: activity } = await supabase
                    .from('activities')
                    .select('title')
                    .eq('id', activityId)
                    .eq('organization_id', organizationId)
                    .maybeSingle();

                if (!activity) {
                    return { success: false, message: 'Atividade não encontrada.' };
                }

                const { error } = await supabase
                    .from('activities')
                    .update({ completed: true })
                    .eq('id', activityId)
                    .eq('organization_id', organizationId);

                if (error) {
                    return { success: false, message: `Erro ao concluir atividade: ${error.message}` };
                }

                return {
                    success: true,
                    message: `Atividade "${activity.title}" marcada como concluída!`,
                };
            },
        }),

        moveDeal: tool({
            description: 'Move um deal para outro estágio do pipeline',
            inputSchema: z.object({
                dealId: z.string(),
                newStageId: z.string().describe('ID do estágio de destino'),
            }),
            execute: async ({ dealId, newStageId }) => {
                const { data: deal } = await supabase
                    .from('deals')
                    .select('title, stage_id')
                    .eq('id', dealId)
                    .eq('organization_id', organizationId)
                    .maybeSingle();

                if (!deal) {
                    return { success: false, message: 'Deal não encontrado.' };
                }

                const { error } = await supabase
                    .from('deals')
                    .update({ stage_id: newStageId, updated_at: new Date().toISOString() })
                    .eq('id', dealId)
                    .eq('organization_id', organizationId);

                if (error) {
                    return { success: false, message: `Erro ao mover deal: ${error.message}` };
                }

                return {
                    success: true,
                    message: `Deal "${deal.title}" movido para o novo estágio`,
                    previousStageId: deal.stage_id,
                    newStageId,
                };
            },
        }),

        updateDealValue: tool({
            description: 'Atualiza o valor de um deal',
            inputSchema: z.object({
                dealId: z.string(),
                newValue: z.number(),
            }),
            execute: async ({ dealId, newValue }) => {
                const { data: deal } = await supabase
                    .from('deals')
                    .select('title, value')
                    .eq('id', dealId)
                    .eq('organization_id', organizationId)
                    .maybeSingle();

                if (!deal) {
                    return { success: false, message: 'Deal não encontrado.' };
                }

                const { error } = await supabase
                    .from('deals')
                    .update({ value: newValue, updated_at: new Date().toISOString() })
                    .eq('id', dealId)
                    .eq('organization_id', organizationId);

                if (error) {
                    return { success: false, message: `Erro ao atualizar valor: ${error.message}` };
                }

                return {
                    success: true,
                    message: `Valor do deal "${deal.title}" atualizado de R$${(deal.value || 0).toLocaleString('pt-BR')} para R$${newValue.toLocaleString('pt-BR')}`,
                };
            },
        }),

        createDeal: tool({
            description: 'Cria um novo deal/oportunidade no CRM',
            inputSchema: z.object({
                title: z.string(),
                value: z.number(),
                boardId: z.string().describe('ID do board/pipeline onde o deal será criado'),
                stageId: z.string().optional().describe('ID do estágio inicial (usa o primeiro estágio do board se omitido)'),
                contactName: z.string().optional(),
                companyName: z.string().optional(),
                description: z.string().optional(),
            }),
            execute: async ({ title, value, boardId, stageId, contactName }) => {
                // Resolver stageId se não fornecido
                let resolvedStageId = stageId;
                if (!resolvedStageId) {
                    const { data: firstStage } = await supabase
                        .from('board_stages')
                        .select('id')
                        .eq('board_id', boardId)
                        .order('"order"', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                    resolvedStageId = firstStage?.id;
                }

                if (!resolvedStageId) {
                    return { success: false, message: 'Não foi possível determinar o estágio inicial do deal.' };
                }

                // Resolver contactId se fornecido
                let contactId: string | null = null;
                if (contactName) {
                    const { data: contact } = await supabase
                        .from('contacts')
                        .select('id')
                        .eq('organization_id', organizationId)
                        .ilike('name', `%${contactName}%`)
                        .limit(1)
                        .maybeSingle();
                    contactId = contact?.id ?? null;
                }

                const { data, error } = await supabase
                    .from('deals')
                    .insert({
                        organization_id: organizationId,
                        board_id: boardId,
                        stage_id: resolvedStageId,
                        title,
                        value,
                        contact_id: contactId,
                        probability: 20,
                        is_won: false,
                        is_lost: false,
                    })
                    .select('id')
                    .single();

                if (error) {
                    return { success: false, message: `Erro ao criar deal: ${error.message}` };
                }

                return {
                    success: true,
                    message: `Deal "${title}" criado com valor de R$${value.toLocaleString('pt-BR')}`,
                    deal: { id: data.id, title, value, stageId: resolvedStageId },
                };
            },
        }),

        suggestNextAction: tool({
            description: 'Sugere a próxima ação recomendada para um deal com base no histórico',
            inputSchema: z.object({
                dealId: z.string(),
            }),
            execute: async ({ dealId }) => {
                const { data: deal } = await supabase
                    .from('deals')
                    .select('title, value, probability, is_won, is_lost')
                    .eq('id', dealId)
                    .eq('organization_id', organizationId)
                    .maybeSingle();

                if (!deal) {
                    return { success: false, message: 'Deal não encontrado.' };
                }

                const { data: lastActivity } = await supabase
                    .from('activities')
                    .select('title, date')
                    .eq('deal_id', dealId)
                    .eq('organization_id', organizationId)
                    .order('date', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                let suggestion = '';
                let priority = 'medium';

                if (!lastActivity) {
                    suggestion = 'Fazer primeiro contato — agendar reunião de descoberta';
                    priority = 'high';
                } else {
                    const daysSinceContact = Math.floor(
                        (Date.now() - new Date(lastActivity.date).getTime()) / (1000 * 60 * 60 * 24)
                    );

                    if (daysSinceContact > 7) {
                        suggestion = `Fazer follow-up — último contato foi há ${daysSinceContact} dias`;
                        priority = 'high';
                    } else if ((deal.probability ?? 0) >= 70) {
                        suggestion = 'Deal com alta probabilidade — verificar se está pronto para fechamento';
                    } else if ((deal.probability ?? 0) >= 40) {
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
                        isWon: deal.is_won,
                        isLost: deal.is_lost,
                        value: deal.value,
                        lastActivity: lastActivity?.title ?? 'Nenhuma',
                    },
                };
            },
        }),
    };

    // 6. Stream response
    const result = streamText({
        model,
        system: `Você é o assistente inteligente do NossoCRM. Você tem acesso completo ao CRM e pode:

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

Você é proativo — se perceber oportunidades ou riscos, mencione-os.`,
        messages: await convertToModelMessages(messages),
        tools,
        stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
}

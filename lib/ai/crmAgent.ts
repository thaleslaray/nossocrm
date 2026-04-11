import { ToolLoopAgent, stepCountIs } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { CRMCallOptionsSchema, type CRMCallOptions } from '@/types/ai';
import { createCRMTools } from './tools';
import { formatPriorityPtBr } from '@/lib/utils/priority';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from './defaults';

type AIProvider = 'google';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampText(v: unknown, max = 240): string | undefined {
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (!s) return undefined;
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
}

function formatCockpitSnapshotForPrompt(snapshot: any): string[] {
    if (!snapshot || typeof snapshot !== 'object') return [];

    const lines: string[] = [];

    const deal = snapshot.deal;
    if (deal && typeof deal === 'object') {
        const title = clampText(deal.title, 120) || clampText(deal.name, 120);
        const value = typeof deal.value === 'number' ? deal.value : undefined;
        const probability = typeof deal.probability === 'number' ? deal.probability : undefined;
        const priority = clampText(deal.priority, 30);
        const status = clampText(deal.status, 80);
        lines.push(`🧾 Deal (cockpit): ${title ?? '(sem título)'}${value != null ? ` — R$ ${value.toLocaleString('pt-BR')}` : ''}`);
        if (probability != null) lines.push(`   - Probabilidade: ${probability}%`);
        if (priority) lines.push(`   - Prioridade: ${formatPriorityPtBr(priority)}`);
        if (status) lines.push(`   - Status/Stage ID: ${status}`);
        const lossReason = clampText(deal.lossReason, 200);
        if (lossReason) lines.push(`   - Motivo perda: ${lossReason}`);
    }

    const stage = snapshot.stage;
    if (stage && typeof stage === 'object') {
        const label = clampText(stage.label, 80);
        if (label) lines.push(`🏷️ Estágio atual (label): ${label}`);
    }

    const contact = snapshot.contact;
    if (contact && typeof contact === 'object') {
        const name = clampText(contact.name, 80);
        const role = clampText(contact.role, 80);
        const email = clampText(contact.email, 120);
        const phone = clampText(contact.phone, 60);
        lines.push(`👤 Contato (cockpit): ${name ?? '(sem nome)'}${role ? ` — ${role}` : ''}`);
        if (email) lines.push(`   - Email: ${email}`);
        if (phone) lines.push(`   - Telefone: ${phone}`);
        const notes = clampText(contact.notes, 220);
        if (notes) lines.push(`   - Notas do contato: ${notes}`);

        // Campos de viagem (travel-first customization)
        const destino = clampText(contact.destino_viagem, 80);
        const dataViagem = clampText(contact.data_viagem, 30);
        const categoriaViagem = clampText(contact.categoria_viagem, 30);
        const urgenciaViagem = clampText(contact.urgencia_viagem, 30);
        const origemLead = clampText(contact.origem_lead, 30);
        if (destino) lines.push(`   - Destino: ${destino}`);
        if (dataViagem) lines.push(`   - Data viagem: ${dataViagem}`);
        if (categoriaViagem) lines.push(`   - Categoria: ${categoriaViagem}`);
        if (urgenciaViagem) lines.push(`   - Urgência: ${urgenciaViagem}`);
        if (origemLead) lines.push(`   - Origem lead: ${origemLead}`);
        const qtdAdultos = typeof contact.quantidade_adultos === 'number' ? contact.quantidade_adultos : undefined;
        const qtdCriancas = typeof contact.quantidade_criancas === 'number' ? contact.quantidade_criancas : undefined;
        if (qtdAdultos != null) lines.push(`   - Adultos: ${qtdAdultos}`);
        if (qtdCriancas != null) lines.push(`   - Crianças: ${qtdCriancas}`);
    }

    const signals = snapshot.cockpitSignals;
    if (signals && typeof signals === 'object') {
        if (typeof signals.daysInStage === 'number') {
            lines.push(`⏱️ Dias no estágio: ${signals.daysInStage}`);
        }

        const nba = signals.nextBestAction;
        if (nba && typeof nba === 'object') {
            const action = clampText(nba.action, 120);
            const reason = clampText(nba.reason, 160);
            if (action) lines.push(`👉 Próxima melhor ação (cockpit): ${action}${reason ? ` — ${reason}` : ''}`);
        }

        const ai = signals.aiAnalysis;
        if (ai && typeof ai === 'object') {
            const action = clampText(ai.action, 120);
            const reason = clampText(ai.reason, 180);
            if (action) lines.push(`🤖 Sinal da IA (cockpit): ${action}${reason ? ` — ${reason}` : ''}`);
        }
    }

    const lists = snapshot.lists;
    if (lists && typeof lists === 'object') {
        const activitiesTotal = lists.activities?.total;
        if (typeof activitiesTotal === 'number') {
            const preview = Array.isArray(lists.activities?.preview) ? lists.activities.preview.slice(0, 6) : [];
            lines.push(`🗂️ Atividades no cockpit: ${activitiesTotal}`);
            for (const a of preview) {
                const t = clampText(a?.type, 30);
                const title = clampText(a?.title, 120);
                const date = clampText(a?.date, 40);
                if (t || title) lines.push(`   - ${date ? `[${date}] ` : ''}${t ? `${t}: ` : ''}${title ?? ''}`.trim());
            }
        }

        const notesTotal = lists.notes?.total;
        if (typeof notesTotal === 'number') {
            lines.push(`📝 Notas no cockpit: ${notesTotal}`);
        }

        const filesTotal = lists.files?.total;
        if (typeof filesTotal === 'number') {
            lines.push(`📎 Arquivos no cockpit: ${filesTotal}`);
        }

        const scriptsTotal = lists.scripts?.total;
        if (typeof scriptsTotal === 'number') {
            const preview = Array.isArray(lists.scripts?.preview) ? lists.scripts.preview.slice(0, 6) : [];
            lines.push(`💬 Scripts no cockpit: ${scriptsTotal}`);
            for (const s of preview) {
                const title = clampText(s?.title, 80);
                const cat = clampText(s?.category, 30);
                if (title) lines.push(`   - ${cat ? `(${cat}) ` : ''}${title}`);
            }
        }
    }

    return lines;
}


/**
 * Build context prompt from call options
 * This injects rich context into the system prompt at runtime
 */
function buildContextPrompt(options: CRMCallOptions): string {
    const parts: string[] = [];

    if (options.boardId) {
        parts.push(`📋 Board ID: ${options.boardId}`);
        if (options.boardName) parts.push(`   Nome: ${options.boardName}`);
    }

    if (options.dealId) {
        parts.push(`💼 Deal ID: ${options.dealId}`);
    }

    if (options.contactId) {
        parts.push(`👤 Contato ID: ${options.contactId}`);
    }

    if (options.stages && options.stages.length > 0) {
        const stageList = options.stages.map(s => `${s.name} (${s.id})`).join(', ');
        parts.push(`🎯 Estágios: ${stageList}`);
    }

    if (options.dealCount !== undefined) {
        parts.push(`📊 Métricas:`);
        parts.push(`   - Deals: ${options.dealCount}`);
        if (options.pipelineValue) parts.push(`   - Pipeline: R$ ${options.pipelineValue.toLocaleString('pt-BR')}`);
        if (options.stagnantDeals) parts.push(`   - Parados: ${options.stagnantDeals}`);
        if (options.overdueDeals) parts.push(`   - Atrasados: ${options.overdueDeals}`);
    }

    if (options.wonStage) parts.push(`✅ Estágio Ganho: ${options.wonStage}`);
    if (options.lostStage) parts.push(`❌ Estágio Perdido: ${options.lostStage}`);

    if (options.userName) {
        parts.push(`👋 Usuário: ${options.userName}`);
    }

    if ((options as any).cockpitSnapshot) {
        const lines = formatCockpitSnapshotForPrompt((options as any).cockpitSnapshot);
        if (lines.length > 0) {
            parts.push('');
            parts.push('====== CONTEXTO DO COCKPIT ======');
            parts.push(...lines);
        }
    }

    return parts.length > 0
        ? `\n\n====== CONTEXTO DO USUÁRIO ======\n${parts.join('\n')}`
        : '';
}

/**
 * Base instructions for the CRM Agent
 */
const BASE_INSTRUCTIONS = `Você é o NossoCRM Pilot, um assistente de vendas inteligente. 🚀

PERSONALIDADE:
- Seja proativo, amigável e analítico
- Use emojis com moderação (máximo 2 por resposta)
- Respostas naturais (evite listas robóticas)
- Máximo 2 parágrafos por resposta

FERRAMENTAS (15 disponíveis):
📊 ANÁLISE: analyzePipeline, getBoardMetrics
🔍 BUSCA: searchDeals, searchContacts, listDealsByStage, listStagnantDeals, listOverdueDeals, getDealDetails
⚡ AÇÕES: moveDeal, createDeal, updateDeal, markDealAsWon, markDealAsLost, assignDeal, createTask

MEMÓRIA DA CONVERSA (MUITO IMPORTANTE):
- USE as informações das mensagens anteriores! Se você já buscou deals antes, use esses IDs.
- Quando o usuário diz "esse deal", "ele", "o único", "o que acabei de ver" - use o ID do deal mencionado antes.
- NÃO busque novamente se você já tem as informações na conversa.
- Se a última busca retornou 1 deal, use o ID dele automaticamente.
- Para markDealAsWon/Lost: passe o dealId que você já conhece da conversa.
- Para moveDeal: use o dealId do deal que o usuário está se referindo.

REGRAS:
- Sempre explique os resultados das ferramentas
- Se der erro, informe de forma amigável
- Use o boardId do contexto automaticamente quando disponível
- Para buscas (deals/contatos): ao chamar ferramentas de busca, passe APENAS o termo (ex.: "Nike"), sem frases como "buscar deal Nike".
- Para ações que alteram dados (criar, mover, marcar, atualizar, atribuir, criar tarefa):
    - NÃO peça confirmação em texto (não peça “sim/não”, “você confirma?”, etc.)
    - Chame a ferramenta diretamente; a UI já vai mostrar um card único de Aprovar/Negar
    - Só faça perguntas se faltar informação para executar (ex.: qual deal? qual estágio?)
- PRIORIZE usar IDs que você já conhece antes de buscar novamente

APRESENTAÇÃO (MUITO IMPORTANTE):
- NÃO mostre IDs/UUIDs para o usuário final (ex.: "(ID: ...)")
- NÃO cite nomes internos de tools (ex.: "listStagnantDeals", "markDealAsWon")
- Sempre prefira: título do deal (nome do card) + contato + valor + estágio (quando fizer sentido)`;

/**
 * Factory function to create a CRM Agent with dynamic context
 * 
 * @param context - Type-safe context from the request
 * @param userId - Current user ID
 * @param apiKey - Google AI API key from organization_settings
 * @param modelId - Model to use (default from AI_DEFAULT_MODELS)
 */
export async function createCRMAgent(
    context: CRMCallOptions,
    userId: string,
    apiKey: string,
    modelId: string = AI_DEFAULT_MODELS.google,
    provider: AIProvider = AI_DEFAULT_PROVIDER
) {
    console.log('[CRMAgent] 🤖 Creating agent with context:', {
        boardId: context.boardId,
        boardName: context.boardName,
        stagesCount: context.stages?.length,
        userId,
        modelId,
        provider,
    });

    const google = createGoogleGenerativeAI({ apiKey });
    const model = google(modelId);

    // Create tools with context injected
    const tools = createCRMTools(context, userId);

    console.log('[CRMAgent] 🛠️ Tools created. Checking markDealAsWon config:', {
        needsApproval: (tools.markDealAsWon as any).needsApproval,
        description: tools.markDealAsWon.description
    });

    return new ToolLoopAgent({
        model,
        callOptionsSchema: CRMCallOptionsSchema,
        instructions: BASE_INSTRUCTIONS,
        // prepareCall runs ONCE at the start - injects initial context
        prepareCall: ({ options, ...settings }) => {
            return {
                ...settings,
                instructions: settings.instructions + buildContextPrompt(options),
            };
        },
        // prepareStep runs on EACH STEP - extracts and injects dynamic context
        prepareStep: async ({ messages, stepNumber, steps }) => {
            // Extract dealIds from previous tool results
            const foundDealIds: string[] = [];
            const foundDeals: Array<{ id: string; title: string }> = [];

            for (const step of steps) {
                // Check tool results for deal information
                if (step.toolResults) {
                    for (const result of step.toolResults) {
                        const data = ((result as any).result ?? (result as any).output ?? (result as any).data ?? result) as any;
                        // Extract deals from listDealsByStage, searchDeals, etc.
                        if (data?.deals && Array.isArray(data.deals)) {
                            for (const deal of data.deals) {
                                if (deal.id && !foundDealIds.includes(deal.id)) {
                                    foundDealIds.push(deal.id);
                                    foundDeals.push({ id: deal.id, title: deal.title || 'Unknown' });
                                }
                            }
                        }
                        // Extract single deal from getDealDetails
                        if (data?.id && data?.title && !foundDealIds.includes(data.id)) {
                            foundDealIds.push(data.id);
                            foundDeals.push({ id: data.id, title: data.title });
                        }
                    }
                }
            }

            // If we found deals, inject a context reminder
            if (foundDeals.length > 0) {
                const lastDeal = foundDeals[foundDeals.length - 1];
                const contextReminder = `\n\n[CONTEXTO DA CONVERSA: Você já obteve informações sobre ${foundDeals.length} deal(s). O último mencionado foi "${lastDeal.title}" (ID: ${lastDeal.id}). Use este ID automaticamente quando o usuário se referir a "esse deal", "ele", "o único", etc.]`;

                console.log('[CRMAgent] 💡 Injecting context reminder:', {
                    dealsFound: foundDeals.length,
                    lastDeal
                });

                // Add a system message with context (modifying messages)
                const systemMessage = messages[0];
                if (systemMessage && systemMessage.role === 'system') {
                    const enhancedSystem = {
                        ...systemMessage,
                        content: typeof systemMessage.content === 'string'
                            ? systemMessage.content + contextReminder
                            : systemMessage.content
                    };
                    return {
                        messages: [enhancedSystem, ...messages.slice(1)]
                    };
                }
            }

            return {}; // No modifications needed
        },
        tools,
        stopWhen: stepCountIs(10),
    });
}

/**
 * Export type for frontend type-safety
 */
export type CRMAgentType = Awaited<ReturnType<typeof createCRMAgent>>;

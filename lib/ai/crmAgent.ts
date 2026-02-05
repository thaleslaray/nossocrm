import { ToolLoopAgent, stepCountIs } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CRMCallOptionsSchema, type CRMCallOptions } from '@/types/ai';
import { createCRMTools } from './tools';
import { formatPriorityPtBr } from '@/lib/utils/priority';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from './defaults';

type AIProvider = 'google' | 'openai' | 'anthropic';

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

function createRetryingFetch(
    baseFetch: typeof fetch,
    opts: {
        label: string;
        retries: number;
        baseDelayMs: number;
        maxDelayMs: number;
        modelFallback?: {
            /** Se o body JSON tiver esse model, substitui por `toModel` em retries (attempt >= 1). */
            fromModels: string[];
            toModel: string;
            /** Só aplicar fallback em respostas com status retryable (default: 429 e 5xx) */
            statuses?: number[];
        };
    }
) {
    const { label, retries, baseDelayMs, maxDelayMs } = opts;

    const isRetryableStatus = (status: number) => {
        // 408: timeout, 429: rate limit, 5xx: instabilidade do provedor.
        return status === 408 || status === 429 || (status >= 500 && status <= 599);
    };

    const shouldApplyModelFallback = (status: number | undefined) => {
        const fb = opts.modelFallback;
        if (!fb) return false;
        if (status == null) return false;

        // Se o caller forneceu uma lista de status, respeitar.
        if (Array.isArray(fb.statuses) && fb.statuses.length > 0) {
            return fb.statuses.includes(status);
        }

        // Default: 429 e 5xx.
        return status === 429 || (status >= 500 && status <= 599);
    };

    const maybeRewriteModelInBody = (body: unknown, attempt: number, lastStatus?: number) => {
        const fb = opts.modelFallback;
        if (!fb) return body;

        // Só tentar fallback a partir do segundo attempt (attempt >= 1)
        if (attempt < 1) return body;
        if (!shouldApplyModelFallback(lastStatus)) return body;

        if (typeof body !== 'string') return body;

        try {
            const parsed = JSON.parse(body);
            const current = parsed?.model;
            if (typeof current !== 'string') return body;
            if (!fb.fromModels.includes(current)) return body;

            parsed.model = fb.toModel;
            const rewritten = JSON.stringify(parsed);

            console.warn(`[${label}] Falling back model`, {
                from: current,
                to: fb.toModel,
                attempt,
                lastStatus,
            });

            return rewritten;
        } catch {
            return body;
        }
    };

    const extractRequestId = (res: Response) => {
        // OpenAI costuma enviar request-id em um desses headers.
        return (
            res.headers.get('x-request-id') ||
            res.headers.get('openai-request-id') ||
            res.headers.get('request-id') ||
            undefined
        );
    };

    const canRetryBody = (body: any): boolean => {
        // Evitar retries quando o body é stream não-reutilizável.
        // Strings/ArrayBuffer/Uint8Array/etc são OK.
        if (body == null) return true;
        if (typeof body === 'string') return true;
        if (body instanceof ArrayBuffer) return true;
        if (typeof Uint8Array !== 'undefined' && body instanceof Uint8Array) return true;
        if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
        // FormData geralmente é reusável, mas em alguns ambientes pode falhar; preferir não retry.
        if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
        // ReadableStream: não retry.
        if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return false;
        return false;
    };

    return async (input: RequestInfo | URL, init?: RequestInit) => {
        const bodyRetryable = !(input instanceof Request) && !canRetryBody(init?.body);
        if (bodyRetryable) {
            // Melhor fazer uma chamada única do que tentar retry e falhar ao reusar body.
            return baseFetch(input, init);
        }

        // Quando o SDK chama fetch passando um Request pronto, precisamos "bufferizar" o body
        // para poder refazer a request (e aplicar fallback de model) em retries.
        // Isso é especialmente importante para requests JSON do OpenAI.
        let bufferedFromRequest:
            | {
                url: string;
                init: RequestInit;
                jsonBodyText?: string;
                contentType?: string;
            }
            | undefined;

        const getSignal = () => {
            if (init?.signal) return init.signal;
            if (input instanceof Request) return input.signal;
            return undefined;
        };

        const makeRequest = async (attempt: number, lastStatus?: number) => {
            if (input instanceof Request) {
                // 1) Primeiro build: extrair headers/método/url e, se possível, o body JSON.
                if (!bufferedFromRequest) {
                    const headers = new Headers(input.headers);
                    const contentType = headers.get('content-type') || undefined;

                    let jsonBodyText: string | undefined;
                    const method = input.method || 'GET';
                    const hasBody = method !== 'GET' && method !== 'HEAD';

                    if (hasBody) {
                        try {
                            // clone() para não consumir o Request original.
                            const bodyText = await input.clone().text();
                            // Só guardar se parece JSON; senão, não tentamos reescrever model.
                            if (
                                (contentType && /application\/json/i.test(contentType)) ||
                                bodyText.trim().startsWith('{')
                            ) {
                                jsonBodyText = bodyText;
                            }
                        } catch {
                            // Se não conseguimos ler o body, seguimos sem fallback de model.
                            jsonBodyText = undefined;
                        }
                    }

                    // Recriar RequestInit "mínimo". Não copiamos tudo porque alguns campos
                    // podem não estar disponíveis/ser relevantes no runtime do Next.
                    bufferedFromRequest = {
                        url: input.url,
                        contentType,
                        jsonBodyText,
                        init: {
                            method,
                            headers,
                            // sinal/abort vem de getSignal(), aplicado no Request.
                        },
                    };
                }

                // 2) Se temos body JSON bufferizado, conseguimos aplicar fallback de model.
                const rewritten = maybeRewriteModelInBody(bufferedFromRequest.jsonBodyText, attempt, lastStatus);
                const nextInit: RequestInit = {
                    ...bufferedFromRequest.init,
                    body: rewritten as any,
                    signal: getSignal(),
                };

                return new Request(bufferedFromRequest.url, nextInit);
            }

            const rewrittenBody = maybeRewriteModelInBody(init?.body, attempt, lastStatus);
            const nextInit: RequestInit = rewrittenBody === init?.body ? init ?? {} : { ...(init ?? {}), body: rewrittenBody as any };
            return new Request(input, nextInit);
        };

        let lastResponse: Response | undefined;
        let lastStatus: number | undefined;
        for (let attempt = 0; attempt <= retries; attempt++) {
            if (getSignal()?.aborted) {
                // Respeitar abort sem tentar novamente.
                throw new DOMException('The operation was aborted.', 'AbortError');
            }

            try {
                const req = await makeRequest(attempt, lastStatus);
                const res = await baseFetch(req);
                lastResponse = res;
                lastStatus = res.status;

                if (!isRetryableStatus(res.status) || attempt === retries) {
                    return res;
                }

                const requestId = extractRequestId(res);
                const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
                const jitter = Math.floor(Math.random() * 120);
                console.warn(`[${label}] Retryable response (${res.status}). Retrying...`, {
                    attempt: attempt + 1,
                    retries,
                    delayMs: delay + jitter,
                    requestId,
                });
                await sleep(delay + jitter);
            } catch (err: any) {
                if (attempt === retries) throw err;

                const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
                const jitter = Math.floor(Math.random() * 120);
                console.warn(`[${label}] Fetch error. Retrying...`, {
                    attempt: attempt + 1,
                    retries,
                    delayMs: delay + jitter,
                    message: String(err?.message || err),
                });
                await sleep(delay + jitter);
            }
        }

        // Segurança: nunca deve chegar aqui.
        return lastResponse ?? baseFetch(input, init);
    };
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

    // Create provider client with org-specific API key
    // NOTE: Model IDs are stored in organization_settings and passed through.
    const model = (() => {
        switch (provider) {
            case 'google': {
                const google = createGoogleGenerativeAI({ apiKey });
                return google(modelId);
            }
            case 'openai': {
                const openai = createOpenAI({
                    apiKey,
                    fetch: createRetryingFetch(fetch, {
                        label: 'OpenAI',
                        retries: 2,
                        baseDelayMs: 350,
                        maxDelayMs: 2000,
                        modelFallback: {
                            // Muitos modelos "preview"/novos oscilam mais; aqui fazemos fallback automático
                            // para um modelo estável sem exigir intervenção do usuário.
                            fromModels: [modelId],
                            toModel: AI_DEFAULT_MODELS.openai,
                            // Default já cobre 429/5xx; manter explícito só para clareza.
                            statuses: [429, 500, 502, 503, 504],
                        },
                    }),
                });
                return openai(modelId);
            }
            case 'anthropic': {
                const anthropic = createAnthropic({ apiKey });
                return anthropic(modelId);
            }
            default: {
                // Should be unreachable due to type, but keep runtime safety.
                const google = createGoogleGenerativeAI({ apiKey });
                return google(modelId);
            }
        }
    })();

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

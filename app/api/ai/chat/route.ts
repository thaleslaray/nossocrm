// Route Handler for AI Chat - /api/ai/chat
// Full integration with AI SDK v6 ToolLoopAgent + createAgentUIStreamResponse

import { createAgentUIStreamResponse, UIMessage } from 'ai';
import { createCRMAgent } from '@/lib/ai/crmAgent';
import { createClient } from '@/lib/supabase/server';
import { AI_DEFAULT_MODELS } from '@/lib/ai/defaults';
import type { CRMCallOptions } from '@/types/ai';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { isAIFeatureEnabled } from '@/lib/ai/features/server';

export const maxDuration = 60;

type AIProvider = 'google' | 'openai' | 'anthropic';

function asOptionalString(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
}

function asOptionalNumber(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asOptionalStages(
    v: unknown
): Array<{ id: string; name: string }> | undefined {
    if (!Array.isArray(v)) return undefined;

    const stages: Array<{ id: string; name: string }> = [];
    for (const item of v) {
        const maybe = item as any;
        if (typeof maybe?.id === 'string' && typeof maybe?.name === 'string') {
            stages.push({ id: maybe.id, name: maybe.name });
        }
    }

    return stages.length ? stages : undefined;
}

function asOptionalCockpitSnapshot(v: unknown): unknown | undefined {
    if (v == null) return undefined;
    if (typeof v !== 'object') return undefined;

    // Guardrail: evita payloads gigantes que podem estourar limites ou degradar streaming.
    try {
        const text = JSON.stringify(v);
        // ~80KB costuma ser um bom compromisso (contexto rico sem virar “dump”).
        if (text.length > 80_000) {
            console.warn('[AI Chat] cockpitSnapshot too large; ignoring.', {
                bytes: text.length,
            });
            return undefined;
        }
    } catch {
        // Se não serializa, não é seguro/útil como contexto.
        return undefined;
    }

    return v;
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
    // Mitigação CSRF: endpoint autenticado por cookies.
    if (!isAllowedOrigin(req)) {
        return new Response('Forbidden', { status: 403 });
    }

    const supabase = await createClient();

    // 0. Parse request body early (we may need boardId to recover a missing profile.organization_id)
    const body = await req.json().catch(() => null);
    const messages: UIMessage[] = (body?.messages ?? []) as UIMessage[];
    const rawContext = (body?.context ?? {}) as Record<string, unknown>;

    // 1. Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    // 2. Get profile with organization + role (RBAC)
    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, first_name, nickname, role')
        .eq('id', user.id)
        .single();

    // Alguns usuários legados podem existir sem organization_id no profile (ex.: signup sem raw_user_meta_data).
    // Se veio boardId no contexto e o board é visível para o usuário autenticado (RLS), inferimos a org com segurança.
    let organizationId = profile?.organization_id ?? null;
    if (!organizationId) {
        const boardId = typeof rawContext?.boardId === 'string' ? rawContext.boardId : null;
        if (boardId) {
            const { data: board, error: boardError } = await supabase
                .from('boards')
                .select('organization_id')
                .eq('id', boardId)
                .maybeSingle();

            if (boardError) {
                console.warn('[AI Chat] Failed to infer organization from board:', { boardId, message: boardError.message });
            }

            if (board?.organization_id) {
                organizationId = board.organization_id;

                // Best-effort: persistir no profile para corrigir de vez.
                const { error: updateProfileError } = await supabase
                    .from('profiles')
                    .update({ organization_id: organizationId, updated_at: new Date().toISOString() })
                    .eq('id', user.id);

                if (updateProfileError) {
                    console.warn('[AI Chat] Failed to backfill profile.organization_id:', { message: updateProfileError.message });
                }
            }
        }
    }

    if (!organizationId) {
        return new Response(
            'Profile sem organização. Finalize o setup (ou re-login) para vincular seu usuário a uma organização antes de usar a IA.',
            { status: 409 }
        );
    }

    // 3. Get AI settings (org-wide: organization_settings é a fonte de verdade)
    const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('ai_enabled, ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key')
        .eq('organization_id', organizationId)
        .maybeSingle();

    const aiEnabled = typeof (orgSettings as any)?.ai_enabled === 'boolean' ? (orgSettings as any).ai_enabled : true;
    if (!aiEnabled) {
        return new Response(
            'IA desativada pela organização. Um admin pode ativar em Configurações → Central de I.A.',
            { status: 403 }
        );
    }

    const chatEnabled = await isAIFeatureEnabled(supabase as any, organizationId, 'ai_chat_agent');
    if (!chatEnabled) {
        return new Response(
            'Função de IA desativada: Chat do agente (Pilot).',
            { status: 403 }
        );
    }

    const provider = (orgSettings?.ai_provider ?? 'google') as AIProvider;
    const modelId: string | null = orgSettings?.ai_model ?? null;

    const apiKey: string | null =
        provider === 'google'
            ? (orgSettings?.ai_google_key ?? null)
            : provider === 'openai'
                ? (orgSettings?.ai_openai_key ?? null)
                : (orgSettings?.ai_anthropic_key ?? null);

    if (!apiKey) {
        const providerLabel = provider === 'google' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI' : 'Anthropic';
        return new Response(
            `API key não configurada para ${providerLabel}. Configure em Configurações → Inteligência Artificial.`,
            { status: 400 }
        );
    }

    const resolvedModelId =
        modelId || AI_DEFAULT_MODELS[provider as keyof typeof AI_DEFAULT_MODELS] || AI_DEFAULT_MODELS.google;

    // 5. Build type-safe context for agent
    const context: CRMCallOptions = {
        organizationId,
        boardId: asOptionalString(rawContext.boardId),
        dealId: asOptionalString(rawContext.dealId),
        contactId: asOptionalString(rawContext.contactId),
        boardName: asOptionalString(rawContext.boardName),
        stages: asOptionalStages(rawContext.stages),
        dealCount: asOptionalNumber(rawContext.dealCount),
        pipelineValue: asOptionalNumber(rawContext.pipelineValue),
        stagnantDeals: asOptionalNumber(rawContext.stagnantDeals),
        overdueDeals: asOptionalNumber(rawContext.overdueDeals),
        wonStage: asOptionalString(rawContext.wonStage),
        lostStage: asOptionalString(rawContext.lostStage),
        cockpitSnapshot: asOptionalCockpitSnapshot((rawContext as any)?.cockpitSnapshot),
        userId: user.id,
        userName: profile?.nickname || profile?.first_name || user.email,
        userRole: (profile as any)?.role,
    };

    const rawContextSummary = {
        ...rawContext,
        // Evita dump gigante no console.
        cockpitSnapshot: (rawContext as any)?.cockpitSnapshot ? '[provided]' : undefined,
    };

    console.log('[AI Chat] 📨 Request received:', {
        messagesCount: messages?.length,
        rawContext: rawContextSummary,
        context: {
            organizationId: context.organizationId,
            boardId: context.boardId,
            dealId: context.dealId,
            boardName: context.boardName,
            stagesCount: context.stages?.length,
            cockpitSnapshot: context.cockpitSnapshot ? '[provided]' : undefined,
            userName: context.userName,
        },
        ai: {
            provider,
            modelId: resolvedModelId,
        },
    });

    // 6. Create agent with API key and context
    let agent: Awaited<ReturnType<typeof createCRMAgent>>;
    try {
        agent = await createCRMAgent(context, user.id, apiKey, resolvedModelId, provider);
    } catch (err: any) {
        const message = String(err?.message || err || 'Erro desconhecido');
        // Ex.: quando o provider é Gemini mas o modelId é OpenAI (ou vice-versa), o SDK retorna mensagens parecidas.
        console.warn('[AI Chat] Failed to create agent/model:', { provider, modelId: resolvedModelId, message });
        return new Response(
            `Falha ao inicializar o modelo de IA (${provider} / ${resolvedModelId}). Verifique o provedor, o modelo selecionado e a chave de API.\n\nDetalhes: ${message}`,
            { status: 400 }
        );
    }

    // 7. Return streaming response using AI SDK v6 createAgentUIStreamResponse
    return createAgentUIStreamResponse<CRMCallOptions>({
        agent,
        uiMessages: messages,
        options: context,
    });
}

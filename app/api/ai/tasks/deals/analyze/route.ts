import { generateText, Output } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { AnalyzeLeadInputSchema, AnalyzeLeadOutputSchema } from '@/lib/ai/tasks/schemas';
import { getResolvedPrompt } from '@/lib/ai/prompts/server';
import { renderPromptTemplate } from '@/lib/ai/prompts/render';
import { isAIFeatureEnabled } from '@/lib/ai/features/server';

export const maxDuration = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
  try {
    const { model, supabase, organizationId } = await requireAITaskContext(req);
    const enabled = await isAIFeatureEnabled(supabase as any, organizationId, 'ai_deal_analyze');
    if (!enabled) {
      return json({ error: { code: 'AI_FEATURE_DISABLED', message: 'Função de IA desativada: Análise de deal.' } }, 403);
    }

    const body = await req.json().catch(() => null);
    const { deal, stageLabel } = AnalyzeLeadInputSchema.parse(body);

    const value = deal?.value ?? 0;
    const formattedValue = typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value);

    const resolved = await getResolvedPrompt(supabase, organizationId, 'task_deals_analyze');
    const prompt = renderPromptTemplate(resolved?.content || '', {
      dealTitle: deal?.title || '',
      dealValue: formattedValue,
      stageLabel: stageLabel || deal?.status || '',
      probability: deal?.probability || 50,
    });

    const result = await generateText({
      model,
      maxRetries: 3,
      output: Output.object({ schema: AnalyzeLeadOutputSchema }),
      prompt,
    });

    return json(result.output);
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/deals/analyze] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao executar tarefa de IA.' } }, 500);
  }
}

import { generateText, Output } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateBoardStructureInputSchema, BoardStructureOutputSchema } from '@/lib/ai/tasks/schemas';
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
    const enabled = await isAIFeatureEnabled(supabase as any, organizationId, 'ai_board_generate_structure');
    if (!enabled) {
      return json({ error: { code: 'AI_FEATURE_DISABLED', message: 'Função de IA desativada: Gerar estrutura de board.' } }, 403);
    }

    const body = await req.json().catch(() => null);
    const { description, lifecycleStages } = GenerateBoardStructureInputSchema.parse(body);

    const lifecycleList =
      Array.isArray(lifecycleStages) && lifecycleStages.length > 0
        ? lifecycleStages.map(s => ({ id: s.id || '', name: s.name || String(s) }))
        : [
            { id: 'LEAD', name: 'Lead' },
            { id: 'MQL', name: 'MQL' },
            { id: 'PROSPECT', name: 'Oportunidade' },
            { id: 'CUSTOMER', name: 'Cliente' },
            { id: 'OTHER', name: 'Outros' },
          ];

    const resolved = await getResolvedPrompt(supabase, organizationId, 'task_boards_generate_structure');
    const prompt = renderPromptTemplate(resolved?.content || '', {
      description,
      lifecycleJson: JSON.stringify(lifecycleList),
    });

    const result = await generateText({
      model,
      maxRetries: 3,
      output: Output.object({ schema: BoardStructureOutputSchema }),
      prompt,
    });

    return json(result.output);
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/boards/generate-structure] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar estrutura do board.' } }, 500);
  }
}

import { generateObject } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateBoardStructureInputSchema, BoardStructureOutputSchema } from '@/lib/ai/tasks/schemas';

export const maxDuration = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function POST(req: Request) {
  try {
    const { model } = await requireAITaskContext(req);

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

    const result = await generateObject({
      model,
      maxRetries: 3,
      schema: BoardStructureOutputSchema,
      prompt: `Crie uma estrutura de board Kanban para: ${description}.
LIFECYCLES: ${JSON.stringify(lifecycleList)}
Crie 4-7 estágios com cores Tailwind. Português do Brasil.`,
    });

    return json(result.object);
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/boards/generate-structure] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar estrutura do board.' } }, 500);
  }
}

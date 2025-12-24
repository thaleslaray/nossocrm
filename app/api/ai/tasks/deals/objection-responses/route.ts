import { generateObject } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateObjectionResponseInputSchema, ObjectionResponseOutputSchema } from '@/lib/ai/tasks/schemas';

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
    const { deal, objection } = GenerateObjectionResponseInputSchema.parse(body);

    const result = await generateObject({
      model,
      maxRetries: 3,
      schema: ObjectionResponseOutputSchema,
      prompt: `Objeção: "${objection}" no deal "${deal?.title}".
Gere 3 respostas práticas (Empática, Valor, Pergunta). Responda em português do Brasil no formato:
{"responses": ["...", "...", "..."]}`,
    });

    return json(result.object);
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/deals/objection-responses] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar respostas de objeção.' } }, 500);
  }
}

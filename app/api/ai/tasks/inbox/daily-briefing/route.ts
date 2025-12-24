import { generateText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateDailyBriefingInputSchema } from '@/lib/ai/tasks/schemas';

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
    const { radarData } = GenerateDailyBriefingInputSchema.parse(body);

    const result = await generateText({
      model,
      maxRetries: 3,
      prompt: `Briefing diário. Dados: ${JSON.stringify({ radarData })}. Resuma prioridades em português do Brasil.`,
    });

    return json({ text: result.text });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/inbox/daily-briefing] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar briefing.' } }, 500);
  }
}

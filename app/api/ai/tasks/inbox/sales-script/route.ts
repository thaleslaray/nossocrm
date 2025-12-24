import { generateText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateSalesScriptInputSchema } from '@/lib/ai/tasks/schemas';

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
    const { deal, scriptType, context } = GenerateSalesScriptInputSchema.parse(body);

    const result = await generateText({
      model,
      maxRetries: 3,
      prompt: `Gere script de vendas (${scriptType || 'geral'}).
Deal: ${deal?.title}. Contexto: ${context || ''}.
Seja natural, 4 parágrafos max. Português do Brasil.`,
    });

    return json({ script: result.text, scriptType, generatedFor: deal?.title });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/inbox/sales-script] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar script.' } }, 500);
  }
}

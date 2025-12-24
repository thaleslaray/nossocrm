import { generateObject } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { AnalyzeLeadInputSchema, AnalyzeLeadOutputSchema } from '@/lib/ai/tasks/schemas';

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
    const { deal, stageLabel } = AnalyzeLeadInputSchema.parse(body);

    const value = deal?.value ?? 0;
    const formattedValue = typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value);

    const result = await generateObject({
      model,
      maxRetries: 3,
      schema: AnalyzeLeadOutputSchema,
      prompt: `Você é um coach de vendas analisando um deal de CRM. Seja DIRETO e ACIONÁVEL.
DEAL:
- Título: ${deal?.title}
- Valor: R$ ${formattedValue}
- Estágio: ${stageLabel || deal?.status}
- Probabilidade: ${deal?.probability || 50}%
RETORNE:
1. action: Verbo no infinitivo + complemento curto (máx 50 chars).
2. reason: Por que fazer isso AGORA (máx 80 chars).
3. actionType: CALL, MEETING, EMAIL, TASK ou WHATSAPP
4. urgency: low, medium, high
5. probabilityScore: 0-100
Seja conciso. Português do Brasil.`,
    });

    return json(result.object);
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/deals/analyze] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao executar tarefa de IA.' } }, 500);
  }
}

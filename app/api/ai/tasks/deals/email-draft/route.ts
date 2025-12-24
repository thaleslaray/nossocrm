import { generateText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { GenerateEmailDraftInputSchema } from '@/lib/ai/tasks/schemas';

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
    const { deal } = GenerateEmailDraftInputSchema.parse(body);

    const result = await generateText({
      model,
      maxRetries: 3,
      prompt: `Gere um rascunho de email profissional para:
- Contato: ${deal?.contactName || 'Cliente'}
- Empresa: ${deal?.companyName || 'Empresa'}
- Deal: ${deal?.title}
Escreva um email conciso e eficaz em português do Brasil.`,
    });

    return json({ text: result.text });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    console.error('[api/ai/tasks/deals/email-draft] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar rascunho de e-mail.' } }, 500);
  }
}

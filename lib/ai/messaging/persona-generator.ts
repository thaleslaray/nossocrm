/**
 * Gera persona_prompt automaticamente a partir do business_context e agent_goal.
 * Usado no onboarding UX (Tela 1 e 2).
 *
 * Usa o Vercel AI SDK (generateText) pois é uma operação de CRM, não de messaging.
 */

import { generateText } from 'ai';
import { getModel } from '@/lib/ai/config';
import type { OrgAIConfig } from '@/lib/ai/agent/agent.service';

export async function generatePersonaPrompt({
  businessContext,
  agentGoal,
  aiConfig,
  scrapedWebContent,
}: {
  businessContext: string;
  agentGoal: string;
  aiConfig: OrgAIConfig;
  scrapedWebContent?: string;
}): Promise<string> {
  const model = getModel(aiConfig.provider, aiConfig.apiKey, aiConfig.model);

  const webSection = scrapedWebContent
    ? `\nCONTEÚDO DO SITE DA EMPRESA (extraído automaticamente):\n${scrapedWebContent}\n`
    : '';

  const { text } = await generateText({
    model,
    prompt: `Você é um especialista em criar personas de IA para agentes de vendas.
Com base no contexto de negócio e objetivo abaixo, gere um system prompt completo para um agente de vendas.

CONTEXTO DO NEGÓCIO:
${businessContext}
${webSection}
OBJETIVO DO AGENTE:
${agentGoal}

Gere um system prompt profissional que:
1. Define a identidade e tom do agente (formal/informal, nome, etc.) — use as informações reais da empresa se disponíveis no conteúdo do site
2. Explica o objetivo principal de forma clara
3. Lista 5-7 regras de comportamento específicas para este negócio
4. Inclui o que o agente NUNCA deve fazer
5. Mantém respostas concisas (máximo 3-4 frases por mensagem)
6. Nunca revela que é uma IA
7. Se houver conteúdo do site, incorpore detalhes reais (serviços, diferenciais, linguagem da marca)

Retorne APENAS o system prompt, sem explicações adicionais.`,
  });

  return text.trim();
}

/**
 * Sugere handoff keywords com base no objetivo do agente.
 */
export async function suggestHandoffKeywords({
  agentGoal,
  aiConfig,
}: {
  agentGoal: string;
  aiConfig: OrgAIConfig;
}): Promise<string[]> {
  const model = getModel(aiConfig.provider, aiConfig.apiKey, aiConfig.model);

  const { text } = await generateText({
    model,
    prompt: `Com base neste objetivo de agente de vendas:
"${agentGoal}"

Sugira 5-8 palavras ou frases que, quando ditas pelo lead, indicam que ele quer falar com um humano.
Exemplos: "falar com atendente", "humano", "gerente", "responsável"

Retorne apenas as keywords separadas por vírgula, sem explicações.`,
  });

  return text
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

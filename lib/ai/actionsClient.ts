'use client';

import { callAIProxy, isConsentError, isRateLimitError } from '@/lib/supabase/ai-proxy';
import type { Deal, DealView, LifecycleStage } from '@/types';
import type { ParsedAction } from '@/types/aiActions';

/**
 * Cliente de alto nível para as actions de IA.
 *
 * Observação: a configuração (API key/modelo) é tratada server-side em `/api/ai/actions`.
 * O parâmetro `config` (legado) é aceito apenas para compatibilidade de assinatura.
 */
export interface AIConfigLegacy {
  provider: 'google';
  apiKey: string;
  model: string;
  thinking: boolean;
  search: boolean;
  anthropicCaching: boolean;
}

export type AnalyzeLeadResult = {
  action: string;
  reason: string;
  actionType: 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'WHATSAPP';
  urgency: 'low' | 'medium' | 'high';
  probabilityScore: number;
  /** Campo legacy usado em algumas telas */
  suggestion: string;
};

/**
 * Função pública `analyzeLead` do projeto.
 *
 * @param {Deal | DealView} deal - Parâmetro `deal`.
 * @param {AIConfigLegacy | undefined} _config - Parâmetro `_config`.
 * @param {string | undefined} stageLabel - Parâmetro `stageLabel`.
 * @returns {Promise<AnalyzeLeadResult>} Retorna um valor do tipo `Promise<AnalyzeLeadResult>`.
 */
export async function analyzeLead(
  deal: Deal | DealView,
  _config?: AIConfigLegacy,
  stageLabel?: string
): Promise<AnalyzeLeadResult> {
  try {
    const result = await callAIProxy<Omit<AnalyzeLeadResult, 'suggestion'>>('analyzeLead', {
      deal: {
        title: deal.title,
        value: deal.value,
        status: deal.status,
        probability: deal.probability,
        priority: deal.priority,
      },
      stageLabel,
    });

    return {
      ...result,
      suggestion: `${result.action} — ${result.reason}`,
    };
  } catch (error) {
    console.error('Error analyzing lead:', error);

    const fallbackScore = deal.probability ?? 50;

    if (isConsentError(error)) {
      return {
        action: 'Configurar consentimento',
        reason: 'Consentimento necessário para usar IA',
        actionType: 'TASK',
        urgency: 'medium',
        probabilityScore: fallbackScore,
        suggestion: 'Consentimento necessário para usar IA. Vá em Configurações → Inteligência Artificial.',
      };
    }

    if (isRateLimitError(error)) {
      return {
        action: 'Tentar novamente',
        reason: 'Limite de requisições atingido',
        actionType: 'TASK',
        urgency: 'low',
        probabilityScore: fallbackScore,
        suggestion: 'Limite de requisições atingido. Tente novamente em alguns minutos.',
      };
    }

    return {
      action: 'Revisar manualmente',
      reason: 'Não foi possível obter análise da IA',
      actionType: 'TASK',
      urgency: 'low',
      probabilityScore: fallbackScore,
      suggestion: 'Não foi possível obter análise da IA.',
    };
  }
}

/**
 * Função pública `generateEmailDraft` do projeto.
 *
 * @param {Deal | DealView} deal - Parâmetro `deal`.
 * @param {AIConfigLegacy | undefined} _config - Parâmetro `_config`.
 * @param {string | undefined} stageLabel - Parâmetro `stageLabel`.
 * @returns {Promise<string>} Retorna um valor do tipo `Promise<string>`.
 */
export async function generateEmailDraft(
  deal: Deal | DealView,
  _config?: AIConfigLegacy,
  stageLabel?: string
): Promise<string> {
  try {
    return await callAIProxy<string>('generateEmailDraft', {
      deal: {
        title: deal.title,
        value: deal.value,
        status: deal.status,
        contactName: 'contactName' in deal ? deal.contactName : undefined,
        companyName: 'companyName' in deal ? deal.companyName : undefined,
      },
      stageLabel,
    });
  } catch (error) {
    console.error('Error generating email:', error);
    if (isConsentError(error)) return 'Consentimento necessário para usar IA.';
    if (isRateLimitError(error)) return 'Limite de requisições atingido.';
    return 'Erro ao gerar e-mail.';
  }
}

/**
 * Função pública `generateObjectionResponse` do projeto.
 *
 * @param {Deal | DealView} deal - Parâmetro `deal`.
 * @param {string} objection - Parâmetro `objection`.
 * @param {AIConfigLegacy | undefined} _config - Parâmetro `_config`.
 * @returns {Promise<string[]>} Retorna um valor do tipo `Promise<string[]>`.
 */
export async function generateObjectionResponse(
  deal: Deal | DealView,
  objection: string,
  _config?: AIConfigLegacy
): Promise<string[]> {
  try {
    return await callAIProxy<string[]>('generateObjectionResponse', {
      deal: { title: deal.title, value: deal.value },
      objection,
    });
  } catch (error) {
    console.error('Error generating objections:', error);
    if (isConsentError(error)) return ['Consentimento necessário para usar IA.'];
    if (isRateLimitError(error)) return ['Limite de requisições atingido.'];
    return ['Não foi possível gerar respostas.'];
  }
}

export interface GeneratedBoard {
  name: string;
  description: string;
  stages: {
    name: string;
    description: string;
    color: string;
    linkedLifecycleStage: string;
    estimatedDuration?: string;
  }[];
  automationSuggestions: string[];
  goal: {
    description: string;
    kpi: string;
    targetValue: string;
    currentValue?: string;
  };
  agentPersona: {
    name: string;
    role: string;
    behavior: string;
  };
  entryTrigger: string;
  confidence: number;
  boardName?: string;
  linkedLifecycleStage?: string;
}

/**
 * Função pública `generateBoardStructure` do projeto.
 *
 * @param {string} description - Parâmetro `description`.
 * @param {LifecycleStage[]} lifecycleStages - Parâmetro `lifecycleStages`.
 * @param {AIConfigLegacy | undefined} _config - Parâmetro `_config`.
 * @returns {Promise<{ boardName: string; description: string; stages: { name: string; description: string; color: string; linkedLifecycleStage: string; estimatedDuration?: string | undefined; }[]; automationSuggestions: string[]; }>} Retorna um valor do tipo `Promise<{ boardName: string; description: string; stages: { name: string; description: string; color: string; linkedLifecycleStage: string; estimatedDuration?: string | undefined; }[]; automationSuggestions: string[]; }>`.
 */
export async function generateBoardStructure(
  description: string,
  lifecycleStages: LifecycleStage[] = [],
  _config?: AIConfigLegacy
): Promise<{
  boardName: string;
  description: string;
  stages: GeneratedBoard['stages'];
  automationSuggestions: string[];
}> {
  return await callAIProxy('generateBoardStructure', {
    description,
    lifecycleStages: lifecycleStages.map(s => ({ id: s.id, name: s.name })),
  });
}

/**
 * Função pública `generateBoardStrategy` do projeto.
 *
 * @param {{ boardName: string; description: string; stages: { name: string; description: string; color: string; linkedLifecycleStage: string; estimatedDuration?: string | undefined; }[]; automationSuggestions: string[]; }} boardData - Parâmetro `boardData`.
 * @param {AIConfigLegacy | undefined} _config - Parâmetro `_config`.
 * @returns {Promise<Pick<GeneratedBoard, "goal" | "agentPersona" | "entryTrigger">>} Retorna um valor do tipo `Promise<Pick<GeneratedBoard, "goal" | "agentPersona" | "entryTrigger">>`.
 */
export async function generateBoardStrategy(
  boardData: {
    boardName: string;
    description: string;
    stages: GeneratedBoard['stages'];
    automationSuggestions: string[];
  },
  _config?: AIConfigLegacy
): Promise<Pick<GeneratedBoard, 'goal' | 'agentPersona' | 'entryTrigger'>> {
  try {
    return await callAIProxy('generateBoardStrategy', { boardData });
  } catch (error) {
    console.error('Error generating strategy:', error);
    return {
      goal: { description: 'Definir meta', kpi: 'N/A', targetValue: '0' },
      agentPersona: { name: 'Assistente', role: 'Operador', behavior: 'Ajudar no processo.' },
      entryTrigger: 'Novos itens',
    };
  }
}

/**
 * Função pública `refineBoardWithAI` do projeto.
 *
 * @param {GeneratedBoard} currentBoard - Parâmetro `currentBoard`.
 * @param {string} userInstruction - Parâmetro `userInstruction`.
 * @param {AIConfigLegacy | undefined} _config - Parâmetro `_config`.
 * @param {{ role: "user" | "ai"; content: string; }[] | undefined} chatHistory - Parâmetro `chatHistory`.
 * @returns {Promise<{ message: string; board: GeneratedBoard | null; }>} Retorna um valor do tipo `Promise<{ message: string; board: GeneratedBoard | null; }>`.
 */
export async function refineBoardWithAI(
  currentBoard: GeneratedBoard,
  userInstruction: string,
  _config?: AIConfigLegacy,
  chatHistory?: { role: 'user' | 'ai'; content: string }[]
): Promise<{ message: string; board: GeneratedBoard | null }> {
  const result = await callAIProxy<{ message: string; board: GeneratedBoard | null }>('refineBoardWithAI', {
    currentBoard,
    userInstruction,
    chatHistory,
  });

  // SAFETY MERGE: se IA não retornar campos de estratégia, preserva do board atual.
  if (result.board) {
    result.board = {
      ...currentBoard,
      ...result.board,
      goal: result.board.goal || currentBoard.goal,
      agentPersona: result.board.agentPersona || currentBoard.agentPersona,
      entryTrigger: result.board.entryTrigger || currentBoard.entryTrigger,
    };
  }

  return result;
}

/**
 * Função pública `parseNaturalLanguageAction` do projeto.
 *
 * @param {string} text - Parâmetro `text`.
 * @returns {Promise<ParsedAction>} Retorna um valor do tipo `Promise<ParsedAction>`.
 */
export async function parseNaturalLanguageAction(text: string): Promise<ParsedAction> {
  return await callAIProxy<ParsedAction>('parseNaturalLanguageAction', { text });
}

export type RewriteMessageDraftInput = {
  channel: 'WHATSAPP' | 'EMAIL';
  currentSubject?: string;
  currentMessage?: string;
  nextBestAction?: {
    action?: string;
    reason?: string;
    actionType?: 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'WHATSAPP';
    urgency?: 'low' | 'medium' | 'high';
  };
  cockpitSnapshot?: unknown;
};

export type RewriteMessageDraftResult = {
  subject?: string;
  message: string;
};

/**
 * Função pública `rewriteMessageDraft` do projeto.
 *
 * @param {RewriteMessageDraftInput} input - Parâmetro `input`.
 * @param {AIConfigLegacy | undefined} _config - Parâmetro `_config`.
 * @returns {Promise<RewriteMessageDraftResult>} Retorna um valor do tipo `Promise<RewriteMessageDraftResult>`.
 */
export async function rewriteMessageDraft(
  input: RewriteMessageDraftInput,
  _config?: AIConfigLegacy
): Promise<RewriteMessageDraftResult> {
  return await callAIProxy<RewriteMessageDraftResult>('rewriteMessageDraft', input);
}

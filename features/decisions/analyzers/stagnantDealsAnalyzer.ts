/**
 * Stagnant Deals Analyzer
 * Detecta deals que estão parados há muito tempo sem atividade
 */

import { DealView, Activity } from '@/types';
import { Decision, AnalyzerResult, AnalyzerConfig, SuggestedAction } from '../types';

export const stagnantDealsConfig: AnalyzerConfig = {
  id: 'stagnant_deals',
  name: 'Deals Parados',
  description: 'Detecta deals sem atividade há mais de X dias',
  enabled: true,
  params: {
    minDaysStagnant: 7,
    criticalDaysStagnant: 14,
    excludeStatuses: ['CLOSED_WON', 'CLOSED_LOST'],
    minDealValue: 0,
  },
  maxDecisionsPerRun: 10,
  cooldownDays: 3,
};

/**
 * Performance: `getLastActivityForDeal` used to filter+sort for every deal.
 * We now pre-index latest completed activity per deal in O(A).
 */
function buildLatestCompletedActivityByDealId(activities: Activity[]): Map<string, Activity> {
  const map = new Map<string, Activity>();
  const tsByDealId = new Map<string, number>();

  for (const a of activities) {
    if (!a.dealId) continue;
    if (!a.completed) continue;

    const ts = Date.parse(a.date);
    const prev = tsByDealId.get(a.dealId);
    if (prev === undefined || ts > prev) {
      tsByDealId.set(a.dealId, ts);
      map.set(a.dealId, a);
    }
  }

  return map;
}

function generateReasoning(
  deal: DealView, 
  daysSinceActivity: number, 
  lastActivity?: Activity
): string {
  const parts: string[] = [];
  
  if (daysSinceActivity > 14) {
    parts.push(`Este deal está parado há ${daysSinceActivity} dias, o que é crítico.`);
  } else {
    parts.push(`Este deal não tem atividade há ${daysSinceActivity} dias.`);
  }

  if (lastActivity) {
    const activityType = lastActivity.type === 'CALL' ? 'uma ligação' :
                        lastActivity.type === 'EMAIL' ? 'um email' :
                        lastActivity.type === 'MEETING' ? 'uma reunião' : 'uma tarefa';
    parts.push(`A última interação foi ${activityType}: "${lastActivity.title}".`);
    
    // Suggest alternative based on last activity
    if (lastActivity.type === 'EMAIL') {
      parts.push('Como a última tentativa foi por email, sugerimos uma ligação para ter resposta mais rápida.');
    } else if (lastActivity.type === 'CALL') {
      parts.push('Já tentamos ligar antes. Uma reunião presencial ou por vídeo pode destravar a negociação.');
    }
  } else {
    parts.push('Não há registro de atividades anteriores com este cliente.');
  }

  if (deal.value > 50000) {
    parts.push(`Com valor de R$ ${deal.value.toLocaleString('pt-BR')}, este deal merece atenção prioritária.`);
  }

  return parts.join(' ');
}

function generateSuggestedAction(
  deal: DealView, 
  lastActivity?: Activity
): SuggestedAction {
  // Default: schedule a call
  let actionType: 'CALL' | 'MEETING' | 'EMAIL' = 'CALL';
  let label = 'Agendar Ligação';
  let icon = 'Phone';
  
  // If last activity was call, suggest meeting
  if (lastActivity?.type === 'CALL') {
    actionType = 'MEETING';
    label = 'Agendar Reunião';
    icon = 'Calendar';
  }
  // If last was email, suggest call
  else if (lastActivity?.type === 'EMAIL') {
    actionType = 'CALL';
    label = 'Agendar Ligação';
    icon = 'Phone';
  }

  // Schedule for tomorrow at 10am
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  return {
    id: crypto.randomUUID(),
    type: 'create_activity',
    label,
    icon,
    payload: {
      activityType: actionType,
      activityTitle: `Follow-up: ${deal.title}`,
      activityDate: tomorrow.toISOString(),
      activityDescription: `Retomar contato após ${lastActivity ? 'última atividade: ' + lastActivity.title : 'período sem interação'}`,
      dealId: deal.id,
      contactId: deal.contactId,
    },
    preview: {
      title: `Follow-up: ${deal.title}`,
      scheduledFor: tomorrow.toISOString(),
      recipient: deal.contactName || deal.companyName,
    },
    requiresConfirmation: true,
    allowEdit: true,
  };
}

function generateAlternativeActions(deal: DealView): SuggestedAction[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  return [
    {
      id: crypto.randomUUID(),
      type: 'create_activity',
      label: 'Enviar Email',
      icon: 'Mail',
      payload: {
        activityType: 'EMAIL',
        activityTitle: `Email de Follow-up: ${deal.title}`,
        activityDate: new Date().toISOString(),
        dealId: deal.id,
        contactId: deal.contactId,
      },
      requiresConfirmation: true,
      allowEdit: true,
    },
    {
      id: crypto.randomUUID(),
      type: 'send_message',
      label: 'WhatsApp',
      icon: 'MessageCircle',
      payload: {
        channel: 'whatsapp',
        recipient: deal.contactName,
        messageTemplate: `Olá! Gostaria de retomar nossa conversa sobre ${deal.title}. Podemos agendar uma call essa semana?`,
        dealId: deal.id,
        contactId: deal.contactId,
      },
      requiresConfirmation: true,
      allowEdit: true,
    },
  ];
}

export function analyzeStagnantDeals(
  deals: DealView[],
  activities: Activity[],
  config: AnalyzerConfig = stagnantDealsConfig
): AnalyzerResult {
  const params = config.params as {
    minDaysStagnant: number;
    criticalDaysStagnant: number;
    excludeStatuses: string[];
    minDealValue: number;
  };

  const nowTs = Date.now();
  const nowIso = new Date(nowTs).toISOString();
  const decisions: Decision[] = [];
  let analyzed = 0;

  // Filter deals first
  const eligibleDeals = deals.filter(deal => {
    if (params.excludeStatuses.includes(deal.status)) return false;
    if (deal.value < params.minDealValue) return false;
    return true;
  });

  const latestCompletedActivityByDealId = buildLatestCompletedActivityByDealId(activities);

  for (const deal of eligibleDeals) {
    analyzed++;
    
    const lastActivity = latestCompletedActivityByDealId.get(deal.id);
    
    let daysSinceActivity: number;
    if (lastActivity) {
      daysSinceActivity = Math.floor(
        (nowTs - Date.parse(lastActivity.date)) / (1000 * 60 * 60 * 24)
      );
    } else {
      // If no activity, use deal creation date (approximate with 30 days)
      daysSinceActivity = 30;
    }

    if (daysSinceActivity >= params.minDaysStagnant) {
      const priority = daysSinceActivity >= params.criticalDaysStagnant ? 'critical' : 
                      daysSinceActivity >= 10 ? 'high' : 'medium';

      decisions.push({
        id: crypto.randomUUID(),
        type: 'stagnant_deal',
        priority,
        category: 'follow_up',
        title: `Deal "${deal.title}" parado há ${daysSinceActivity} dias`,
        description: `${deal.companyName || 'Empresa não informada'} • R$ ${deal.value.toLocaleString('pt-BR')} • Estágio: ${deal.stageLabel}`,
        reasoning: generateReasoning(deal, daysSinceActivity, lastActivity),
        dealId: deal.id,
        contactId: deal.contactId,
        suggestedAction: generateSuggestedAction(deal, lastActivity),
        alternativeActions: generateAlternativeActions(deal),
        status: 'pending',
        createdAt: nowIso,
        expiresAt: new Date(nowTs + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      });

      // Respect max decisions limit
      if (decisions.length >= config.maxDecisionsPerRun) {
        break;
      }
    }
  }

  // Sort by priority and days stagnant
  decisions.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return {
    analyzerId: config.id,
    analyzerName: config.name,
    decisions,
    metadata: {
      executedAt: nowIso,
      itemsAnalyzed: analyzed,
      decisionsGenerated: decisions.length,
    },
  };
}

export default analyzeStagnantDeals;

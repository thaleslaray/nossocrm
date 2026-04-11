import { tool } from 'ai';
import { z } from 'zod';

// ============================================
// TOOLS DE LEITURA (Consulta de dados)
// ============================================

export const searchDeals = tool({
  description: 'Busca deals/oportunidades no CRM por título, status, valor ou tags',
  inputSchema: z.object({
    query: z.string().optional().describe('Texto para buscar no título do deal'),
    status: z.string().optional().describe('Status do deal (ex: LEAD, QUALIFIED, PROPOSAL, NEGOTIATION, CLOSED_WON, CLOSED_LOST)'),
    minValue: z.number().optional().describe('Valor mínimo do deal'),
    maxValue: z.number().optional().describe('Valor máximo do deal'),
    limit: z.number().default(10).describe('Número máximo de resultados'),
  }),
});

export const getContact = tool({
  description: 'Busca informações de um contato específico por nome ou email',
  inputSchema: z.object({
    query: z.string().describe('Nome ou email do contato para buscar'),
  }),
});

export const getActivitiesToday = tool({
  description: 'Retorna as atividades de hoje (reuniões, ligações, tarefas)',
  inputSchema: z.object({
    includeCompleted: z.boolean().default(false).describe('Incluir atividades já concluídas'),
  }),
});

export const getOverdueActivities = tool({
  description: 'Retorna atividades atrasadas que precisam de atenção',
  inputSchema: z.object({
    limit: z.number().default(5).describe('Número máximo de resultados'),
  }),
});

export const getPipelineStats = tool({
  description: 'Retorna estatísticas do pipeline: total de deals, valor total, taxa de conversão',
  inputSchema: z.object({}),
});

export const getDealDetails = tool({
  description: 'Retorna detalhes completos de um deal específico',
  inputSchema: z.object({
    dealId: z.string().describe('ID do deal'),
  }),
});

// ============================================
// TOOLS DE ESCRITA (Ações no CRM)
// ============================================

export const createActivity = tool({
  description: 'Cria uma nova atividade (reunião, ligação, tarefa, email)',
  inputSchema: z.object({
    title: z.string().describe('Título da atividade'),
    type: z.enum(['MEETING', 'CALL', 'TASK', 'EMAIL']).describe('Tipo da atividade'),
    date: z.string().describe('Data e hora no formato ISO (ex: 2025-12-01T14:00:00)'),
    description: z.string().optional().describe('Descrição ou notas'),
    contactName: z.string().optional().describe('Nome do contato relacionado'),
    dealTitle: z.string().optional().describe('Título do deal relacionado'),
  }),
});

export const completeActivity = tool({
  description: 'Marca uma atividade como concluída',
  inputSchema: z.object({
    activityId: z.string().describe('ID da atividade'),
  }),
});

export const moveDeal = tool({
  description: 'Move um deal para outro estágio do pipeline',
  inputSchema: z.object({
    dealId: z.string().describe('ID do deal'),
    newStatus: z.enum(['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'])
      .describe('Novo status/estágio do deal'),
  }),
});

export const updateDealValue = tool({
  description: 'Atualiza o valor de um deal',
  inputSchema: z.object({
    dealId: z.string().describe('ID do deal'),
    newValue: z.number().describe('Novo valor do deal'),
  }),
});

export const createDeal = tool({
  description: 'Cria um novo deal/oportunidade no pipeline',
  inputSchema: z.object({
    title: z.string().describe('Título do deal'),
    value: z.number().describe('Valor estimado'),
    contactName: z.string().optional().describe('Nome do contato principal'),
    companyName: z.string().optional().describe('Nome da empresa'),
    description: z.string().optional().describe('Descrição do deal'),
  }),
});

// ============================================
// TOOLS DE ANÁLISE (Insights)
// ============================================

export const analyzeStagnantDeals = tool({
  description: 'Analisa deals que estão parados há muito tempo e precisam de atenção',
  inputSchema: z.object({
    daysStagnant: z.number().default(7).describe('Número de dias sem atualização'),
  }),
});

export const suggestNextAction = tool({
  description: 'Sugere a próxima melhor ação para um deal específico',
  inputSchema: z.object({
    dealId: z.string().describe('ID do deal para analisar'),
  }),
});

// Exporta todos os tools agrupados
export const crmTools = {
  // Leitura
  searchDeals,
  getContact,
  getActivitiesToday,
  getOverdueActivities,
  getPipelineStats,
  getDealDetails,
  // Escrita
  createActivity,
  completeActivity,
  moveDeal,
  updateDealValue,
  createDeal,
  // Análise
  analyzeStagnantDeals,
  suggestNextAction,
};

export type PromptCatalogItem = {
  /** Key estável usado pelo código para buscar o prompt */
  key: string;
  /** Nome humano na UI */
  title: string;
  /** Onde esse prompt é usado (para auditoria/descoberta) */
  usedBy: string[];
  /** Template padrão (fallback) */
  defaultTemplate: string;
  /** Ajuda/observações para quem vai editar */
  notes?: string;
};

/**
 * Catálogo de prompts “default” do sistema.
 * - A Central de I.A lista tudo daqui.
 * - O backend pode sobrescrever via `ai_prompt_templates` (override por organização).
 */
export const PROMPT_CATALOG: PromptCatalogItem[] = [
  {
    key: 'task_inbox_sales_script',
    title: 'Inbox · Script de vendas',
    usedBy: ['app/api/ai/tasks/inbox/sales-script', 'app/api/ai/actions → generateSalesScript'],
    defaultTemplate:
      `Gere script de vendas ({{scriptType}}).\n` +
      `Deal: {{dealTitle}}. Contexto: {{context}}.\n` +
      `Seja natural, 4 parágrafos max. Português do Brasil.`,
    notes:
      'Variáveis: scriptType, dealTitle, context. Dica: mantenha curto para WhatsApp e evite jargões.',
  },
  {
    key: 'task_inbox_daily_briefing',
    title: 'Inbox · Briefing diário',
    usedBy: ['app/api/ai/tasks/inbox/daily-briefing', 'app/api/ai/actions → generateDailyBriefing'],
    defaultTemplate: `Briefing diário. Dados: {{dataJson}}. Resuma prioridades em português do Brasil.`,
    notes: 'Variáveis: dataJson (JSON string).',
  },
  {
    key: 'task_deals_objection_responses',
    title: 'Deals · Respostas de objeção (3 opções)',
    usedBy: ['app/api/ai/tasks/deals/objection-responses', 'app/api/ai/actions → generateObjectionResponse'],
    defaultTemplate:
      `Objeção: "{{objection}}" no deal "{{dealTitle}}".\n` +
      `Gere 3 respostas práticas (Empática, Valor, Pergunta). Português do Brasil.`,
    notes: 'Variáveis: objection, dealTitle.',
  },
  {
    key: 'task_deals_email_draft',
    title: 'Deals · Rascunho de e-mail',
    usedBy: ['app/api/ai/tasks/deals/email-draft', 'app/api/ai/actions → generateEmailDraft'],
    defaultTemplate:
      `Gere um rascunho de email profissional para:\n` +
      `- Contato: {{contactName}}\n` +
      `- Empresa: {{companyName}}\n` +
      `- Deal: {{dealTitle}}\n` +
      `Escreva um email conciso e eficaz em português do Brasil.`,
    notes: 'Variáveis: contactName, companyName, dealTitle.',
  },
  {
    key: 'task_deals_analyze',
    title: 'Deals · Análise (coach) para próxima ação',
    usedBy: ['app/api/ai/tasks/deals/analyze', 'app/api/ai/actions → analyzeLead'],
    defaultTemplate:
      `Você é um coach de vendas analisando um deal de CRM. Seja DIRETO e ACIONÁVEL.\n` +
      `DEAL:\n` +
      `- Título: {{dealTitle}}\n` +
      `- Valor: R$ {{dealValue}}\n` +
      `- Estágio: {{stageLabel}}\n` +
      `- Probabilidade: {{probability}}%\n` +
      `RETORNE:\n` +
      `1. action: Verbo no infinitivo + complemento curto (máx 50 chars).\n` +
      `2. reason: Por que fazer isso AGORA (máx 80 chars).\n` +
      `3. actionType: CALL, MEETING, EMAIL, TASK ou WHATSAPP\n` +
      `4. urgency: low, medium, high\n` +
      `5. probabilityScore: 0-100\n` +
      `Seja conciso. Português do Brasil.`,
    notes: 'Variáveis: dealTitle, dealValue, stageLabel, probability.',
  },
  {
    key: 'task_boards_generate_structure',
    title: 'Boards · Gerar estrutura de board (Kanban)',
    usedBy: ['app/api/ai/tasks/boards/generate-structure', 'app/api/ai/actions → generateBoardStructure'],
    defaultTemplate:
      `Crie uma estrutura de board Kanban para: {{description}}.\n` +
      `LIFECYCLES: {{lifecycleJson}}\n` +
      `Crie 4-7 estágios com cores Tailwind. Português do Brasil.`,
    notes: 'Variáveis: description, lifecycleJson (JSON string).',
  },
  {
    key: 'task_boards_generate_strategy',
    title: 'Boards · Gerar estratégia (meta/KPI/persona)',
    usedBy: ['app/api/ai/tasks/boards/generate-strategy', 'app/api/ai/actions → generateBoardStrategy'],
    defaultTemplate:
      `Defina estratégia para board: {{boardName}}.\n` +
      `Meta, KPI, Persona. Português do Brasil.`,
    notes: 'Variáveis: boardName.',
  },
  {
    key: 'task_boards_refine',
    title: 'Boards · Refinar board com instruções (chat)',
    usedBy: ['app/api/ai/tasks/boards/refine', 'app/api/ai/actions → refineBoardWithAI'],
    defaultTemplate:
      `Ajuste o board com base na instrução: "{{userInstruction}}".\n` +
      `{{boardContext}}\n` +
      `{{historyContext}}\n` +
      `Se for conversa, retorne board: null.`,
    notes:
      'Variáveis: userInstruction, boardContext (texto), historyContext (texto). Deixe claro quando não for pra alterar board.',
  },
  {
    key: 'agent_crm_base_instructions',
    title: 'Agente · System prompt base (CRM Pilot)',
    usedBy: ['lib/ai/crmAgent → BASE_INSTRUCTIONS', 'app/api/ai/chat'],
    defaultTemplate:
      `Você é o NossoCRM Pilot, assistente de vendas especializado em agência de viagens. 🚀\n` +
      `\n` +
      `CONTEXTO DO NEGÓCIO:\n` +
      `- Você atua em uma agência de viagens\n` +
      `- Os leads têm destino, data de viagem, número de passageiros e categoria (econômica/intermediária/premium)\n` +
      `- Urgência dos leads: imediato, curto prazo, médio prazo, planejando\n` +
      `- Origens comuns de leads: Instagram, Facebook, Google, Site, WhatsApp, indicação\n` +
      `\n` +
      `CAMPOS DO CONTATO (schema do banco):\n` +
      `- destino_viagem: destino de viagem desejado pelo cliente (ex: Cancún, Paris, Fernando de Noronha)\n` +
      `- data_viagem: data prevista para a viagem (formato ISO, exibir em pt-BR)\n` +
      `- quantidade_adultos: número de adultos na viagem (mínimo 1)\n` +
      `- quantidade_criancas: número de crianças na viagem (0 quando não há)\n` +
      `- idade_criancas: idades das crianças em texto livre (ex: “4 e 8 anos”)\n` +
      `- categoria_viagem: categoria da viagem — 'economica' (melhor custo-benefício), 'intermediaria' (conforto e qualidade), 'premium' (experiência de luxo)\n` +
      `- urgencia_viagem: urgência do cliente — 'imediato' (até 30 dias), 'curto_prazo' (1–3 meses), 'medio_prazo' (3–6 meses), 'planejando' (mais de 6 meses / sem pressa)\n` +
      `- origem_lead: canal de origem — 'instagram', 'facebook', 'google', 'site', 'whatsapp', 'indicacao', 'outro'\n` +
      `- indicado_por: nome de quem indicou o cliente (presente quando origem_lead = 'indicacao')\n` +
      `- observacoes_viagem: observações adicionais sobre a viagem (preferências de hotel, orçamento, necessidades especiais)\n` +
      `\n` +
      `EXEMPLOS DE PERGUNTAS QUE VOCÊ DEVE SABER RESPONDER:\n` +
      `- “Quais contatos querem viajar para Cancún?” → filtre por destino_viagem\n` +
      `- “Mostre leads com categoria Premium parados há mais de 7 dias” → filtre por categoria_viagem = premium + updated_at\n` +
      `- “Quantos contatos têm urgência imediata?” → filtre por urgencia_viagem = imediato\n` +
      `- “Liste leads que vieram pelo Instagram” → filtre por origem_lead = instagram\n` +
      `- “Quais contatos têm crianças na viagem?” → filtre por quantidade_criancas > 0\n` +
      `\n` +
      `PERSONALIDADE:\n` +
      `- Seja proativo, amigável e analítico\n` +
      `- Use emojis com moderação (máximo 2 por resposta)\n` +
      `- Respostas naturais (evite listas robóticas)\n` +
      `- Máximo 2 parágrafos por resposta\n` +
      `\n` +
      `REGRAS:\n` +
      `- Sempre explique os resultados das ferramentas\n` +
      `- Se der erro, informe de forma amigável\n` +
      `- Não mostre IDs/UUIDs para o usuário final\n` +
      `- Ao sugerir abordagem, considere o destino, a urgência e a categoria da viagem\n`,
    notes:
      'Importante: esse prompt é “sensível”. Mudanças ruins degradam o agente e podem quebrar fluxos. Ideal ter versionamento e botão “reset”.',
  },
];

/**
 * Função pública `getPromptCatalogMap` do projeto.
 * @returns {Record<string, PromptCatalogItem>} Retorna um valor do tipo `Record<string, PromptCatalogItem>`.
 */
export function getPromptCatalogMap(): Record<string, PromptCatalogItem> {
  return Object.fromEntries(PROMPT_CATALOG.map((p) => [p.key, p]));
}


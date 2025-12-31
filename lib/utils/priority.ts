/**
 * Priority label helpers (PT-BR).
 *
 * We store priorities as `low|medium|high` in most places, but some legacy/mock
 * data may still carry `Low|Medium|High`. Normalize all to PT-BR labels for UI.
 */
export function formatPriorityPtBr(priority: string | null | undefined): string {
  const p = String(priority ?? '')
    .trim()
    .toLowerCase();

  switch (p) {
    case 'high':
    case 'alta':
    case 'alto':
      return 'Alta';
    case 'medium':
    case 'media':
    case 'média':
      return 'Média';
    case 'low':
    case 'baixa':
    case 'baixo':
      return 'Baixa';
    case 'critical':
    case 'critica':
    case 'crítica':
      return 'Crítica';
    default:
      // Best-effort: show original string (keeps debuggability for unexpected values).
      return String(priority ?? '');
  }
}

/**
 * Função pública `priorityAriaLabelPtBr` do projeto.
 *
 * @param {string | null | undefined} priority - Parâmetro `priority`.
 * @returns {string} Retorna um valor do tipo `string`.
 */
export function priorityAriaLabelPtBr(priority: string | null | undefined): string {
  const label = formatPriorityPtBr(priority);
  if (!label) return '';
  return `prioridade ${label.toLowerCase()}`;
}


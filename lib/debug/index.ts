/**
 * Debug Mode - Sistema de geração de dados fake para testes
 * 
 * Ativar: localStorage.setItem('DEBUG_MODE', 'true')
 * Desativar: localStorage.removeItem('DEBUG_MODE')
 * 
 * Ou via console: window.enableDebugMode() / window.disableDebugMode()
 */

import { faker } from '@faker-js/faker/locale/pt_BR';

// ============================================
// DEBUG MODE CHECK
// ============================================

export const DEBUG_MODE_EVENT = 'debug_mode_changed';

/**
 * Função pública `isDebugMode` do projeto.
 * @returns {boolean} Retorna um valor do tipo `boolean`.
 */
export const isDebugMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('DEBUG_MODE') === 'true';
};

/**
 * Função pública `enableDebugMode` do projeto.
 * @returns {void} Não retorna valor.
 */
export const enableDebugMode = (): void => {
  localStorage.setItem('DEBUG_MODE', 'true');
  window.dispatchEvent(new CustomEvent(DEBUG_MODE_EVENT));
  console.log('🐛 Debug mode ENABLED');
};

/**
 * Função pública `disableDebugMode` do projeto.
 * @returns {void} Não retorna valor.
 */
export const disableDebugMode = (): void => {
  localStorage.removeItem('DEBUG_MODE');
  window.dispatchEvent(new CustomEvent(DEBUG_MODE_EVENT));
  console.log('🐛 Debug mode DISABLED');
};

// Expõe no window para fácil acesso via console
if (typeof window !== 'undefined') {
  (window as any).enableDebugMode = enableDebugMode;
  (window as any).disableDebugMode = disableDebugMode;
  (window as any).isDebugMode = isDebugMode;
}

// ============================================
// FAKE DATA GENERATORS
// ============================================

/**
 * Função pública `fakeContact` do projeto.
 * @returns {{ name: string; email: string; phone: string; role: string; companyName: string; }} Retorna um valor do tipo `{ name: string; email: string; phone: string; role: string; companyName: string; }`.
 */
export const fakeContact = () => ({
  name: faker.person.fullName(),
  email: faker.internet.email().toLowerCase(),
  // Evita `fromRegExp` (pode gerar barra invertida em alguns ambientes)
  phone: (() => {
    const ddd = faker.number.int({ min: 11, max: 99 });
    const subscriber = `${faker.number.int({ min: 0, max: 99999999 })}`.padStart(8, '0');
    return `+55${ddd}9${subscriber}`;
  })(),
  role: faker.person.jobTitle(),
  companyName: faker.company.name(),
  // Campos de viagem (agência de viagens)
  destino_viagem: faker.helpers.arrayElement(['Cancún', 'Lisboa', 'Paris', 'Orlando', 'Miami', 'Maldivas', 'Roma']),
  data_viagem: faker.date.soon({ days: 180 }).toISOString().split('T')[0],
  quantidade_adultos: faker.number.int({ min: 1, max: 4 }),
  quantidade_criancas: faker.number.int({ min: 0, max: 2 }),
  idade_criancas: '',
  categoria_viagem: faker.helpers.arrayElement(['economica', 'intermediaria', 'premium'] as const),
  urgencia_viagem: faker.helpers.arrayElement(['imediato', 'curto_prazo', 'medio_prazo', 'planejando'] as const),
  origem_lead: faker.helpers.arrayElement(['instagram', 'facebook', 'google', 'site', 'whatsapp', 'indicacao', 'outro'] as const),
  indicado_por: '',
  observacoes_viagem: '',
});

/**
 * Função pública `fakeCompany` do projeto.
 * @returns {{ name: string; industry: "Tecnologia" | "Varejo" | "Saúde" | "Educação" | "Financeiro" | "Indústria" | "Serviços" | "Construção" | "Alimentação" | "Logística"; website: string; employees: "1-10" | ... 3 more ... | "500+"; }} Retorna um valor do tipo `{ name: string; industry: "Tecnologia" | "Varejo" | "Saúde" | "Educação" | "Financeiro" | "Indústria" | "Serviços" | "Construção" | "Alimentação" | "Logística"; website: string; employees: "1-10" | ... 3 more ... | "500+"; }`.
 */
export const fakeCompany = () => ({
  name: faker.company.name(),
  industry: faker.helpers.arrayElement([
    'Tecnologia',
    'Varejo',
    'Saúde',
    'Educação',
    'Financeiro',
    'Indústria',
    'Serviços',
    'Construção',
    'Alimentação',
    'Logística',
  ]),
  website: faker.internet.url(),
  employees: faker.helpers.arrayElement(['1-10', '11-50', '51-200', '201-500', '500+']),
});

/**
 * Função pública `fakeDeal` do projeto.
 * @returns {{ title: string; value: number; probability: 50 | 80 | 10 | 60 | 30 | 20 | 40 | 70 | 90; priority: "low" | "medium" | "high"; tags: ("Urgente" | "Enterprise" | "Renovação" | "Upsell" | "Novo Cliente" | "Indicação")[]; notes: string; }} Retorna um valor do tipo `{ title: string; value: number; probability: 50 | 80 | 10 | 60 | 30 | 20 | 40 | 70 | 90; priority: "low" | "medium" | "high"; tags: ("Urgente" | "Enterprise" | "Renovação" | "Upsell" | "Novo Cliente" | "Indicação")[]; notes: string; }`.
 */
export const fakeDeal = () => ({
  title: `${faker.commerce.productAdjective()} ${faker.commerce.product()}`,
  value: faker.number.int({ min: 1000, max: 500000 }),
  probability: faker.helpers.arrayElement([10, 20, 30, 40, 50, 60, 70, 80, 90]),
  priority: faker.helpers.arrayElement(['low', 'medium', 'high'] as const),
  tags: faker.helpers.arrayElements(
    ['Urgente', 'Enterprise', 'Renovação', 'Upsell', 'Novo Cliente', 'Indicação'],
    faker.number.int({ min: 0, max: 3 })
  ),
  notes: faker.lorem.sentence(),
});

/**
 * Função pública `fakeActivity` do projeto.
 * @returns {{ title: "Reunião de apresentação" | "Ligação de follow-up" | "Enviar proposta comercial" | "Demo do produto" | "Negociar contrato" | "Visita ao cliente" | "Apresentar case de sucesso" | "Alinhar expectativas"; description: string; type: "CALL" | ... 2 more ... | "TASK"; date: string; }} Retorna um valor do tipo `{ title: "Reunião de apresentação" | "Ligação de follow-up" | "Enviar proposta comercial" | "Demo do produto" | "Negociar contrato" | "Visita ao cliente" | "Apresentar case de sucesso" | "Alinhar expectativas"; description: string; type: "CALL" | ... 2 more ... | "TASK"; date: string; }`.
 */
export const fakeActivity = () => ({
  title: faker.helpers.arrayElement([
    'Reunião de apresentação',
    'Ligação de follow-up',
    'Enviar proposta comercial',
    'Demo do produto',
    'Negociar contrato',
    'Visita ao cliente',
    'Apresentar case de sucesso',
    'Alinhar expectativas',
  ]),
  description: faker.lorem.sentence(),
  type: faker.helpers.arrayElement(['CALL', 'MEETING', 'TASK', 'EMAIL'] as const),
  date: faker.date.soon({ days: 14 }).toISOString(),
});

/**
 * Função pública `fakeProduct` do projeto.
 * @returns {{ name: string; price: number; description: string; }} Retorna um valor do tipo `{ name: string; price: number; description: string; }`.
 */
export const fakeProduct = () => ({
  name: faker.commerce.productName(),
  price: faker.number.float({ min: 100, max: 10000, fractionDigits: 2 }),
  description: faker.commerce.productDescription(),
});

// ============================================
// BULK GENERATORS
// ============================================

/**
 * Função pública `generateFakeContacts` do projeto.
 *
 * @param {number} count - Parâmetro `count`.
 * @returns {{ name: string; email: string; phone: string; role: string; companyName: string; }[]} Retorna um valor do tipo `{ name: string; email: string; phone: string; role: string; companyName: string; }[]`.
 */
export const generateFakeContacts = (count: number = 5) => {
  return Array.from({ length: count }, () => fakeContact());
};

/**
 * Função pública `generateFakeDeals` do projeto.
 *
 * @param {number} count - Parâmetro `count`.
 * @returns {{ title: string; value: number; probability: 50 | 80 | 10 | 60 | 30 | 20 | 40 | 70 | 90; priority: "low" | "medium" | "high"; tags: ("Urgente" | "Enterprise" | "Renovação" | "Upsell" | "Novo Cliente" | "Indicação")[]; notes: string; }[]} Retorna um valor do tipo `{ title: string; value: number; probability: 50 | 80 | 10 | 60 | 30 | 20 | 40 | 70 | 90; priority: "low" | "medium" | "high"; tags: ("Urgente" | "Enterprise" | "Renovação" | "Upsell" | "Novo Cliente" | "Indicação")[]; notes: string; }[]`.
 */
export const generateFakeDeals = (count: number = 5) => {
  return Array.from({ length: count }, () => fakeDeal());
};

// ============================================
// DEBUG BUTTON STYLES
// ============================================

export const debugButtonStyles = {
  base: 'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors',
  primary: 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700 dark:hover:bg-purple-800/40',
  secondary: 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700',
  danger: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700 dark:hover:bg-red-800/40',
};

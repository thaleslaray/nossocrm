/**
 * @fileoverview Serviço de registro de templates de jornadas do CRM.
 * 
 * Este serviço busca definições de templates de boards e jornadas
 * de um repositório externo no GitHub, permitindo templates pré-configurados
 * para diferentes tipos de negócio.
 * 
 * @module services/registryService
 */

import { RegistryIndex, JourneyDefinition } from '@/types';

/**
 * URL base do repositório de templates no GitHub.
 * @constant
 */
const REGISTRY_BASE_URL = 'https://raw.githubusercontent.com/thaleslaray/crm-templates/main';

/**
 * Busca o índice de templates disponíveis.
 * 
 * O índice contém metadados sobre todos os templates de jornada
 * disponíveis no repositório, incluindo nome, descrição e caminho.
 * 
 * @returns Promise com o índice de templates disponíveis.
 * @throws Error se não for possível buscar o registro.
 * 
 * @example
 * ```typescript
 * const registry = await fetchRegistry();
 * console.log(registry.templates); // Lista de templates disponíveis
 * ```
 */
export const fetchRegistry = async (): Promise<RegistryIndex> => {
    try {
        const response = await fetch(`${REGISTRY_BASE_URL}/registry.json`);
        if (!response.ok) throw new Error('Failed to fetch registry');
        return await response.json();
    } catch (error) {
        console.error('Error fetching registry:', error);
        throw error;
    }
};

/**
 * Busca a definição de uma jornada específica pelo caminho do template.
 * 
 * @param templatePath - Caminho relativo do template no repositório.
 * @returns Promise com a definição completa da jornada.
 * @throws Error se não for possível buscar o template.
 * 
 * @example
 * ```typescript
 * const journey = await fetchTemplateJourney('sales/b2b-saas');
 * console.log(journey.stages); // Estágios da jornada
 * ```
 */
export const fetchTemplateJourney = async (templatePath: string): Promise<JourneyDefinition> => {
    try {
        const response = await fetch(`${REGISTRY_BASE_URL}/${templatePath}/journey.json`);
        if (!response.ok) throw new Error('Failed to fetch template journey');
        return await response.json();
    } catch (error) {
        console.error('Error fetching template journey:', error);
        throw error;
    }
};

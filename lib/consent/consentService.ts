/**
 * @fileoverview Serviço de gerenciamento de consentimentos LGPD.
 * 
 * Este módulo gerencia os consentimentos do usuário para compliance com a LGPD
 * (Lei Geral de Proteção de Dados). Suporta múltiplos tipos de consentimento,
 * versionamento, revogação e exportação de histórico.
 * 
 * @module services/consentService
 * @see {@link https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm LGPD}
 */

import { supabase } from '@/lib/supabase/client';

/**
 * Tipos de consentimento suportados pelo sistema.
 * 
 * @typedef {'terms' | 'privacy' | 'marketing' | 'analytics' | 'data_processing'} ConsentType
 */
export type ConsentType = 'terms' | 'privacy' | 'marketing' | 'analytics' | 'data_processing';

/**
 * Registro de consentimento do usuário no banco de dados.
 * 
 * @interface UserConsent
 * @property {string} id - ID único do registro.
 * @property {string} user_id - ID do usuário que deu o consentimento.
 * @property {ConsentType} consent_type - Tipo do consentimento.
 * @property {string} version - Versão do documento consentido.
 * @property {string} consented_at - Data/hora do consentimento (ISO 8601).
 * @property {string | null} ip_address - IP do usuário no momento.
 * @property {string | null} user_agent - User agent do navegador.
 * @property {string | null} revoked_at - Data/hora da revogação, se aplicável.
 */
export interface UserConsent {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  version: string;
  consented_at: string;
  ip_address: string | null;
  user_agent: string | null;
  revoked_at: string | null;
}

/**
 * Registro simplificado de status de consentimento.
 * 
 * @interface ConsentRecord
 * @property {ConsentType} type - Tipo do consentimento.
 * @property {string} version - Versão atual do documento.
 * @property {boolean} consented - Se o usuário consentiu na versão atual.
 * @property {string} [consentedAt] - Data do consentimento, se existir.
 */
export interface ConsentRecord {
  type: ConsentType;
  version: string;
  consented: boolean;
  consentedAt?: string;
}

/**
 * Versões atuais dos documentos de consentimento.
 * Ao atualizar um documento, incrementar a versão força re-consentimento.
 * 
 * @constant
 */
export const CONSENT_VERSIONS: Record<ConsentType, string> = {
  terms: '1.0.0',
  privacy: '1.0.0',
  marketing: '1.0.0',
  analytics: '1.0.0',
  data_processing: '1.0.0',
};

/**
 * Consentimentos obrigatórios para uso da plataforma.
 * Sem estes, o usuário não pode acessar funcionalidades principais.
 * 
 * @constant
 */
export const REQUIRED_CONSENTS: ConsentType[] = ['terms', 'privacy', 'data_processing'];

/**
 * Consentimentos opcionais (marketing e analytics).
 * 
 * @constant
 */
export const OPTIONAL_CONSENTS: ConsentType[] = ['marketing', 'analytics'];

/**
 * Serviço de gerenciamento de consentimentos LGPD.
 * 
 * @class ConsentService
 * 
 * @example
 * ```typescript
 * // Verificar se tem consentimentos obrigatórios
 * const hasRequired = await consentService.hasRequiredConsents();
 * 
 * // Dar consentimento
 * await consentService.giveConsent('terms');
 * 
 * // Revogar consentimento
 * await consentService.revokeConsent('marketing');
 * ```
 */
class ConsentService {
  /**
   * Busca todos os consentimentos ativos do usuário atual.
   * 
   * @returns Promise com array de consentimentos ativos (não revogados).
   */
  async getUserConsents(): Promise<UserConsent[]> {
    const { data, error } = await supabase
      .from('user_consents')
      .select('*')
      .is('revoked_at', null)
      .order('consented_at', { ascending: false });

    if (error) {
      console.error('Error fetching consents:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Verifica se o usuário deu todos os consentimentos obrigatórios.
   * 
   * Compara com as versões atuais dos documentos - consentimentos
   * de versões antigas são considerados inválidos.
   * 
   * @returns Promise<boolean> - true se todos os consentimentos obrigatórios estão válidos.
   */
  async hasRequiredConsents(): Promise<boolean> {
    const consents = await this.getUserConsents();
    
    return REQUIRED_CONSENTS.every((requiredType) => {
      const consent = consents.find(c => c.consent_type === requiredType);
      if (!consent) return false;
      
      // Check if consent is for current version
      return consent.version === CONSENT_VERSIONS[requiredType];
    });
  }

  /**
   * Identifica quais consentimentos obrigatórios estão faltando ou desatualizados.
   * 
   * @returns Promise com array de tipos de consentimento que precisam ser dados.
   */
  async getMissingConsents(): Promise<ConsentType[]> {
    const consents = await this.getUserConsents();
    
    return REQUIRED_CONSENTS.filter((requiredType) => {
      const consent = consents.find(c => c.consent_type === requiredType);
      if (!consent) return true;
      
      // Check if consent is for current version
      return consent.version !== CONSENT_VERSIONS[requiredType];
    });
  }

  /**
   * Registra o consentimento do usuário para um tipo específico.
   * 
   * Automaticamente revoga qualquer consentimento anterior do mesmo tipo
   * antes de registrar o novo.
   * 
   * @param type - Tipo de consentimento a ser dado.
   * @param options - Opções adicionais (IP, user agent).
   * @param options.ipAddress - Endereço IP do usuário.
   * @param options.userAgent - User agent do navegador.
   * @returns Promise<boolean> - true se o consentimento foi registrado com sucesso.
   */
  async giveConsent(
    type: ConsentType,
    options?: { ipAddress?: string; userAgent?: string }
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No user logged in');
      return false;
    }

    // First, revoke any existing consent of this type
    await this.revokeConsent(type);

    const { error } = await supabase
      .from('user_consents')
      .insert({
        user_id: user.id,
        consent_type: type,
        version: CONSENT_VERSIONS[type],
        ip_address: options?.ipAddress || null,
        user_agent: options?.userAgent || navigator.userAgent,
      });

    if (error) {
      console.error('Error giving consent:', error);
      return false;
    }

    return true;
  }

  /**
   * Registra múltiplos consentimentos de uma vez.
   * 
   * Útil para onboarding onde o usuário aceita todos os termos juntos.
   * 
   * @param types - Array de tipos de consentimento.
   * @param options - Opções adicionais (IP, user agent).
   * @returns Promise<boolean> - true se todos foram registrados com sucesso.
   */
  async giveConsents(
    types: ConsentType[],
    options?: { ipAddress?: string; userAgent?: string }
  ): Promise<boolean> {
    const results = await Promise.all(
      types.map(type => this.giveConsent(type, options))
    );
    
    return results.every(r => r);
  }

  /**
   * Revoga um consentimento previamente dado.
   * 
   * Implementa o direito de revogação da LGPD.
   * 
   * @param type - Tipo de consentimento a ser revogado.
   * @returns Promise<boolean> - true se a revogação foi registrada.
   */
  async revokeConsent(type: ConsentType): Promise<boolean> {
    const { error } = await supabase
      .from('user_consents')
      .update({ revoked_at: new Date().toISOString() })
      .eq('consent_type', type)
      .is('revoked_at', null);

    if (error) {
      console.error('Error revoking consent:', error);
      return false;
    }

    return true;
  }

  /**
   * Obtém o status de todos os tipos de consentimento.
   * 
   * Retorna um mapa com status de cada tipo, indicando se está
   * consentido na versão atual.
   * 
   * @returns Promise com mapa de status por tipo de consentimento.
   */
  async getConsentStatus(): Promise<Record<ConsentType, ConsentRecord>> {
    const consents = await this.getUserConsents();
    
    const allTypes: ConsentType[] = [...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS];
    
    return allTypes.reduce((acc, type) => {
      const consent = consents.find(c => c.consent_type === type);
      acc[type] = {
        type,
        version: CONSENT_VERSIONS[type],
        consented: consent?.version === CONSENT_VERSIONS[type],
        consentedAt: consent?.consented_at,
      };
      return acc;
    }, {} as Record<ConsentType, ConsentRecord>);
  }

  /**
   * Exporta o histórico completo de consentimentos do usuário.
   * 
   * Implementa o direito de acesso da LGPD - permite ao usuário
   * visualizar todo o histórico de consentimentos e revogações.
   * 
   * @returns Promise com array completo do histórico de consentimentos.
   */
  async exportConsentHistory(): Promise<UserConsent[]> {
    const { data, error } = await supabase
      .from('user_consents')
      .select('*')
      .order('consented_at', { ascending: false });

    if (error) {
      console.error('Error exporting consent history:', error);
      return [];
    }

    return data || [];
  }
}

/**
 * Instância singleton do serviço de consentimentos.
 * Use esta instância para todas as operações de consentimento.
 * 
 * @example
 * ```typescript
 * import { consentService } from '@/lib/consent/consentService';
 * 
 * const hasConsent = await consentService.hasRequiredConsents();
 * ```
 */
export const consentService = new ConsentService();

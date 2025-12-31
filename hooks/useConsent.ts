/**
 * @fileoverview Hook de Gerenciamento de Consentimentos LGPD
 * 
 * Hook React que fornece interface completa para gerenciar consentimentos
 * de usuário conforme requisitos da LGPD (Lei Geral de Proteção de Dados).
 * 
 * @module hooks/useConsent
 * 
 * Funcionalidades:
 * - Verificação de status de consentimento
 * - Gestão de consentimentos obrigatórios e opcionais
 * - Controle automático de modal de consentimento
 * - Revogação de consentimentos
 * - Cache inteligente com TanStack Query
 * 
 * @example
 * ```tsx
 * function App() {
 *   const { 
 *     hasRequiredConsents, 
 *     shouldShowConsentModal, 
 *     giveConsents 
 *   } = useConsent();
 *   
 *   if (shouldShowConsentModal) {
 *     return <ConsentModal onAccept={() => giveConsents(['terms', 'privacy'])} />;
 *   }
 *   
 *   return <MainApp />;
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  consentService, 
  ConsentType, 
  ConsentRecord, 
  REQUIRED_CONSENTS,
  OPTIONAL_CONSENTS 
} from '@/lib/consent/consentService';

/**
 * Retorno do hook useConsent
 * 
 * @interface UseConsentReturn
 */
export interface UseConsentReturn {
  /** Mapa de status de consentimento por tipo */
  consents: Record<ConsentType, ConsentRecord> | null;
  /** Se está carregando dados iniciais */
  isLoading: boolean;
  /** Erro se houver falha na operação */
  error: Error | null;
  /** Se usuário tem todos os consentimentos obrigatórios */
  hasRequiredConsents: boolean;
  /** Lista de tipos de consentimento faltantes */
  missingConsents: ConsentType[];
  /** Concede consentimento para um tipo específico */
  giveConsent: (type: ConsentType) => Promise<boolean>;
  /** Concede múltiplos consentimentos de uma vez */
  giveConsents: (types: ConsentType[]) => Promise<boolean>;
  /** Revoga um consentimento específico */
  revokeConsent: (type: ConsentType) => Promise<boolean>;
  /** Recarrega status de consentimento do servidor */
  refetch: () => void;
  /** Se o modal de consentimento deve ser exibido */
  shouldShowConsentModal: boolean;
}

/**
 * Hook para gerenciamento de consentimentos LGPD
 * 
 * Fornece interface reativa para verificar, conceder e revogar
 * consentimentos do usuário. Gerencia automaticamente a exibição
 * do modal de consentimento quando necessário.
 * 
 * @returns {UseConsentReturn} Estado e funções de controle de consentimento
 * 
 * @example
 * ```tsx
 * function PrivacySettings() {
 *   const { consents, giveConsent, revokeConsent } = useConsent();
 *   
 *   return (
 *     <div>
 *       <Toggle
 *         checked={consents?.marketing?.consented}
 *         onChange={(checked) => 
 *           checked ? giveConsent('marketing') : revokeConsent('marketing')
 *         }
 *         label="Aceitar comunicações de marketing"
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useConsent(): UseConsentReturn {
  const queryClient = useQueryClient();
  const [shouldShowModal, setShouldShowModal] = useState(false);

  // Fetch consent status
  const { 
    data: consents, 
    isLoading, 
    error,
    refetch 
  } = useQuery({
    queryKey: ['user-consents'],
    queryFn: () => consentService.getConsentStatus(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Calculate missing consents
  const missingConsents = consents
    ? REQUIRED_CONSENTS.filter(type => !consents[type]?.consented)
    : [];

  const hasRequiredConsents = missingConsents.length === 0;

  // Update modal visibility
  useEffect(() => {
    if (!isLoading && !hasRequiredConsents) {
      setShouldShowModal(true);
    } else {
      setShouldShowModal(false);
    }
  }, [isLoading, hasRequiredConsents]);

  // Give consent mutation
  const giveConsentMutation = useMutation({
    mutationFn: async (type: ConsentType) => {
      return consentService.giveConsent(type);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-consents'] });
    },
  });

  // Give multiple consents mutation
  const giveConsentsMutation = useMutation({
    mutationFn: async (types: ConsentType[]) => {
      return consentService.giveConsents(types);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-consents'] });
    },
  });

  // Revoke consent mutation
  const revokeConsentMutation = useMutation({
    mutationFn: async (type: ConsentType) => {
      return consentService.revokeConsent(type);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-consents'] });
    },
  });

  const giveConsent = useCallback(async (type: ConsentType) => {
    try {
      const result = await giveConsentMutation.mutateAsync(type);
      return result;
    } catch {
      return false;
    }
  }, [giveConsentMutation]);

  const giveConsents = useCallback(async (types: ConsentType[]) => {
    try {
      const result = await giveConsentsMutation.mutateAsync(types);
      return result;
    } catch {
      return false;
    }
  }, [giveConsentsMutation]);

  const revokeConsent = useCallback(async (type: ConsentType) => {
    try {
      const result = await revokeConsentMutation.mutateAsync(type);
      return result;
    } catch {
      return false;
    }
  }, [revokeConsentMutation]);

  return {
    consents: consents || null,
    isLoading,
    error: error as Error | null,
    hasRequiredConsents,
    missingConsents,
    giveConsent,
    giveConsents,
    revokeConsent,
    refetch,
    shouldShowConsentModal: shouldShowModal,
  };
}

export { REQUIRED_CONSENTS, OPTIONAL_CONSENTS };

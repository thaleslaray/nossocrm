/**
 * useAIEnabled Hook - Verifica se IA está habilitada
 * 
 * SIMPLIFICADO: IA está habilitada se o usuário configurou uma API Key.
 * A ação de adicionar a key = consentimento implícito (LGPD compliant).
 * 
 * @example
 * const { isAIEnabled, goToSettings } = useAIEnabled();
 * 
 * if (!isAIEnabled) {
 *   return <NoAIMessage onConfigure={goToSettings} />;
 * }
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrgSettings } from '@/lib/query/hooks/useOrgSettingsQuery';

export interface UseAIEnabledResult {
  /** Se a IA está habilitada (tem API Key configurada) */
  isAIEnabled: boolean;
  /** A API Key configurada */
  apiKey: string | null;
  /** Provider configurado */
  provider: 'google';
  /** Navega para as configurações de IA */
  goToSettings: () => void;
}

/**
 * Hook React `useAIEnabled` que encapsula uma lógica reutilizável.
 * @returns {UseAIEnabledResult} Retorna um valor do tipo `UseAIEnabledResult`.
 */
export function useAIEnabled(): UseAIEnabledResult {
  const router = useRouter();
  const { data: settings } = useOrgSettings();
  const aiProvider = settings?.aiProvider;
  const aiOrgEnabled = settings?.aiOrgEnabled;
  const aiKeyConfigured = settings?.aiKeyConfigured;

  const isAIEnabled = Boolean(aiOrgEnabled && aiKeyConfigured);

  const goToSettings = useCallback(() => {
    router.push('/settings/ai#ai-config');
  }, [router]);

  return {
    isAIEnabled,
    apiKey: null,
    provider: aiProvider || 'google',
    goToSettings,
  };
}

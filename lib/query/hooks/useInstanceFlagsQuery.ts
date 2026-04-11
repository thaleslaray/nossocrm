/**
 * @fileoverview Instance Feature Flags Query
 *
 * Hook para ler flags de features controlados pelo operador do SaaS.
 * A tabela `instance_feature_flags` só pode ser escrita via service_role —
 * org admins têm acesso de leitura apenas.
 *
 * @module lib/query/hooks/useInstanceFlagsQuery
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

// =============================================================================
// Types
// =============================================================================

export interface InstanceFeatureFlags {
  whatsapp_calling_access: boolean;
}

const DEFAULT_FLAGS: InstanceFeatureFlags = {
  whatsapp_calling_access: false,
};

// =============================================================================
// Hook
// =============================================================================

/**
 * Retorna os feature flags do operador para a org atual.
 * Se a row não existir (org antiga sem seed), retorna os defaults (tudo false).
 */
export function useInstanceFlagsQuery() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: queryKeys.instanceFlags.byOrg(orgId ?? ''),
    queryFn: async (): Promise<InstanceFeatureFlags> => {
      if (!supabase || !orgId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('instance_feature_flags')
        .select('whatsapp_calling_access')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) throw error;

      // Row may not exist for older orgs (trigger only runs on new inserts)
      if (!data) return DEFAULT_FLAGS;

      return {
        whatsapp_calling_access: data.whatsapp_calling_access ?? false,
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // 5 min — flags mudam raramente
  });
}

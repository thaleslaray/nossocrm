/**
 * Evolution API helper utilities.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EvolutionCredentials } from './client';

/**
 * Build Evolution API credentials from a WhatsApp instance record
 * and organization settings.
 */
export async function getEvolutionCredentials(
  supabase: SupabaseClient,
  instance: {
    instance_token: string;
    evolution_instance_name?: string;
    instance_id: string;
    organization_id: string;
  },
): Promise<EvolutionCredentials> {
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('evolution_api_url')
    .eq('organization_id', instance.organization_id)
    .single();

  if (!orgSettings?.evolution_api_url) {
    throw new Error('Evolution API URL não configurada. Acesse Configurações > WhatsApp para configurar.');
  }

  return {
    baseUrl: orgSettings.evolution_api_url,
    apiKey: instance.instance_token,
    instanceName: instance.evolution_instance_name || instance.instance_id,
  };
}

/**
 * Get Evolution API global credentials (URL + global API key) from organization settings.
 * Used for instance creation/deletion which requires the global API key.
 */
export async function getEvolutionGlobalConfig(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ baseUrl: string; globalApiKey: string }> {
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('evolution_api_url, evolution_api_key')
    .eq('organization_id', organizationId)
    .single();

  if (!orgSettings?.evolution_api_url || !orgSettings?.evolution_api_key) {
    throw new Error('Evolution API não configurada. Acesse Configurações > WhatsApp para configurar URL e API Key.');
  }

  return {
    baseUrl: orgSettings.evolution_api_url,
    globalApiKey: orgSettings.evolution_api_key,
  };
}

/**
 * Generate a unique Evolution API instance name from org ID and user-provided name.
 * Must be unique across the Evolution API server.
 */
export function generateInstanceName(organizationId: string, displayName: string): string {
  const sanitized = displayName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove accents
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')         // Trim leading/trailing hyphens
    .slice(0, 30);                   // Limit length

  const orgSuffix = organizationId.slice(0, 8);
  return `crm-${orgSuffix}-${sanitized}`;
}

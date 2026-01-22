/**
 * @fileoverview Serviço Supabase para Agency Settings Module.
 *
 * Gerencia perfil da agência (único por organização) e catálogo de serviços.
 * Integrado com sistema de tráfego pago e pipeline de vendas.
 */

import { supabase } from './client';
import { AgencyProfile, AgencyService } from '@/types';
import { sanitizeUUID } from './utils';

// =============================================================================
// Organization inference (client-side, RLS-safe)
// =============================================================================
let cachedOrgId: string | null = null;
let cachedOrgUserId: string | null = null;

async function getCurrentOrganizationId(): Promise<string | null> {
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (cachedOrgUserId === user.id && cachedOrgId) return cachedOrgId;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (error) return null;

  const orgId = sanitizeUUID((profile as any)?.organization_id);
  cachedOrgUserId = user.id;
  cachedOrgId = orgId;
  return orgId;
}

// =============================================================================
// AGENCY PROFILE - Types & Transformers
// =============================================================================

type DbAgencyProfile = {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
  logo_url: string | null;
  primary_color: string | null;
  monthly_goal: number | null;
  client_goal: number | null;
  created_at: string;
  updated_at: string;
};

function transformAgencyProfile(db: DbAgencyProfile): AgencyProfile {
  return {
    id: db.id,
    organizationId: db.organization_id || undefined,
    name: db.name,
    description: db.description || undefined,
    phone: db.phone || undefined,
    email: db.email || undefined,
    instagram: db.instagram || undefined,
    website: db.website || undefined,
    logoUrl: db.logo_url || undefined,
    primaryColor: db.primary_color || '#6366F1',
    monthlyGoal: db.monthly_goal ? Number(db.monthly_goal) : 0,
    clientGoal: db.client_goal || 0,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

// =============================================================================
// AGENCY SERVICES - Types & Transformers
// =============================================================================

type DbAgencyService = {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  price: number;
  commission: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function transformAgencyService(db: DbAgencyService): AgencyService {
  return {
    id: db.id,
    organizationId: db.organization_id || undefined,
    name: db.name,
    description: db.description || undefined,
    price: Number(db.price ?? 0),
    commission: db.commission ? Number(db.commission) : undefined,
    active: db.active ?? true,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

// =============================================================================
// AGENCY PROFILE SERVICE
// =============================================================================

export const agencyProfileService = {
  /**
   * Get agency profile for current organization
   * Returns null if no profile exists yet
   */
  async getProfile(): Promise<{ data: AgencyProfile | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const organizationId = await getCurrentOrganizationId();
      if (!organizationId) return { data: null, error: new Error('Organização não encontrada') };

      const { data, error } = await supabase
        .from('agency_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) return { data: null, error };
      if (!data) return { data: null, error: null };

      return { data: transformAgencyProfile(data as DbAgencyProfile), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Create or update agency profile (upsert)
   * Since each organization can only have one profile, this is essentially an upsert operation
   */
  async upsertProfile(input: Partial<Omit<AgencyProfile, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>): Promise<{ data: AgencyProfile | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const organizationId = await getCurrentOrganizationId();
      if (!organizationId) return { data: null, error: new Error('Organização não encontrada') };

      // Check if profile exists
      const { data: existing } = await supabase
        .from('agency_profiles')
        .select('id')
        .eq('organization_id', organizationId)
        .maybeSingle();

      const payload: Record<string, unknown> = {
        organization_id: organizationId,
      };

      if (input.name !== undefined) payload.name = input.name;
      if (input.description !== undefined) payload.description = input.description || null;
      if (input.phone !== undefined) payload.phone = input.phone || null;
      if (input.email !== undefined) payload.email = input.email || null;
      if (input.instagram !== undefined) payload.instagram = input.instagram || null;
      if (input.website !== undefined) payload.website = input.website || null;
      if (input.logoUrl !== undefined) payload.logo_url = input.logoUrl || null;
      if (input.primaryColor !== undefined) payload.primary_color = input.primaryColor || '#6366F1';
      if (input.monthlyGoal !== undefined) payload.monthly_goal = input.monthlyGoal || 0;
      if (input.clientGoal !== undefined) payload.client_goal = input.clientGoal || 0;

      if (existing) {
        // Update existing profile
        payload.updated_at = new Date().toISOString();

        const { data, error } = await supabase
          .from('agency_profiles')
          .update(payload)
          .eq('id', existing.id)
          .select('*')
          .single();

        if (error) return { data: null, error };
        return { data: transformAgencyProfile(data as DbAgencyProfile), error: null };
      } else {
        // Create new profile
        const { data, error } = await supabase
          .from('agency_profiles')
          .insert(payload)
          .select('*')
          .single();

        if (error) return { data: null, error };
        return { data: transformAgencyProfile(data as DbAgencyProfile), error: null };
      }
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },
};

// =============================================================================
// AGENCY SERVICES SERVICE
// =============================================================================

export const agencyServicesService = {
  /**
   * Get all services for current organization
   */
  async getAll(): Promise<{ data: AgencyService[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };

      const { data, error } = await supabase
        .from('agency_services')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return { data: [], error };

      const rows = (data || []) as DbAgencyService[];
      return { data: rows.map(transformAgencyService), error: null };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  /**
   * Get only active services (for dropdowns)
   */
  async getActive(): Promise<{ data: AgencyService[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };

      const { data, error } = await supabase
        .from('agency_services')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true });

      if (error) return { data: [], error };

      const rows = (data || []) as DbAgencyService[];
      return { data: rows.map(transformAgencyService), error: null };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  /**
   * Create a new service
   */
  async create(input: {
    name: string;
    price: number;
    commission?: number;
    description?: string;
    active?: boolean;
  }): Promise<{ data: AgencyService | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const organizationId = await getCurrentOrganizationId();

      const { data, error } = await supabase
        .from('agency_services')
        .insert({
          name: input.name,
          price: input.price,
          commission: input.commission || null,
          description: input.description || null,
          active: input.active !== undefined ? input.active : true,
          organization_id: organizationId,
        })
        .select('*')
        .single();

      if (error) return { data: null, error };
      return { data: transformAgencyService(data as DbAgencyService), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Update a service
   */
  async update(
    id: string,
    updates: Partial<{
      name: string;
      price: number;
      commission?: number;
      description?: string;
      active: boolean;
    }>
  ): Promise<{ data: AgencyService | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.price !== undefined) payload.price = updates.price;
      if (updates.commission !== undefined) payload.commission = updates.commission || null;
      if (updates.description !== undefined) payload.description = updates.description || null;
      if (updates.active !== undefined) payload.active = updates.active;
      payload.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('agency_services')
        .update(payload)
        .eq('id', sanitizeUUID(id))
        .select('*')
        .single();

      if (error) return { data: null, error };
      return { data: transformAgencyService(data as DbAgencyService), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Delete a service (hard delete)
   * Note: Consider using soft delete (active: false) instead in production
   */
  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      const { error } = await supabase
        .from('agency_services')
        .delete()
        .eq('id', sanitizeUUID(id));

      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Toggle service active status (soft delete)
   */
  async toggleActive(id: string): Promise<{ data: AgencyService | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      // Get current status
      const { data: current, error: fetchError } = await supabase
        .from('agency_services')
        .select('active')
        .eq('id', sanitizeUUID(id))
        .single();

      if (fetchError) return { data: null, error: fetchError };

      // Toggle
      const { data, error } = await supabase
        .from('agency_services')
        .update({
          active: !(current as any).active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sanitizeUUID(id))
        .select('*')
        .single();

      if (error) return { data: null, error };
      return { data: transformAgencyService(data as DbAgencyService), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },
};

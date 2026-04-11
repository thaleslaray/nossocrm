'use client';

/**
 * TanStack Query hooks for Lead Routing Rules
 *
 * Manages automatic lead/deal creation rules when messages arrive.
 * Maps channels → boards/stages.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type {
  LeadRoutingRuleView,
  CreateLeadRoutingRuleInput,
  UpdateLeadRoutingRuleInput,
} from '@/lib/messaging/types';

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch all lead routing rules with denormalized data.
 */
export function useLeadRoutingRules() {
  const { user, profile, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.leadRoutingRules.all,
    queryFn: async (): Promise<LeadRoutingRuleView[]> => {
      const { data, error } = await supabase
        .from('lead_routing_rules')
        .select(`
          *,
          channel:messaging_channels!channel_id (
            id,
            name,
            channel_type,
            external_identifier,
            business_unit_id,
            business_unit:business_units!business_unit_id (
              id,
              name
            )
          ),
          board:boards!board_id (
            id,
            name
          ),
          stage:board_stages!stage_id (
            id,
            name,
            order
          )
        `)
        .eq('organization_id', profile!.organization_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((row): LeadRoutingRuleView => {
        const channel = row.channel as {
          id: string;
          name: string;
          channel_type: string;
          external_identifier: string;
          business_unit_id: string;
          business_unit: { id: string; name: string } | null;
        } | null;

        const board = row.board as { id: string; name: string } | null;
        const stage = row.stage as { id: string; name: string; order: number } | null;

        return {
          id: row.id,
          organizationId: row.organization_id,
          channelId: row.channel_id,
          boardId: row.board_id,
          stageId: row.stage_id,
          enabled: row.enabled,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          // Channel info
          channelName: channel?.name || 'Canal desconhecido',
          channelType: channel?.channel_type || 'whatsapp',
          channelExternalId: channel?.external_identifier || '',
          // Business Unit info
          businessUnitId: channel?.business_unit_id || '',
          businessUnitName: channel?.business_unit?.name || 'Sem unidade',
          // Board info
          boardName: board?.name || null,
          // Stage info
          stageName: stage?.name || null,
          stagePosition: stage?.order ?? null,
        };
      });
    },
    staleTime: 60 * 1000, // 1 minute
    enabled: !authLoading && !!user && !!profile?.organization_id,
  });
}

/**
 * Fetch channels that don't have routing rules yet (for "add rule" UI).
 */
export function useChannelsWithoutRoutingRules() {
  const { user, profile, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.leadRoutingRules.channelsWithoutRules(),
    queryFn: async () => {
      // Get all channels
      const { data: channels, error: channelsErr } = await supabase
        .from('messaging_channels')
        .select(`
          id,
          name,
          channel_type,
          external_identifier,
          business_unit_id,
          business_unit:business_units!business_unit_id (
            id,
            name
          )
        `)
        .eq('organization_id', profile!.organization_id)
        .eq('status', 'connected')
        .is('deleted_at', null)
        .order('name');

      if (channelsErr) throw channelsErr;

      // Get channels that already have rules
      const { data: rules, error: rulesErr } = await supabase
        .from('lead_routing_rules')
        .select('channel_id')
        .eq('organization_id', profile!.organization_id);

      if (rulesErr) throw rulesErr;

      const channelsWithRules = new Set(rules?.map((r) => r.channel_id) || []);

      // Filter out channels that already have rules
      return (channels || [])
        .filter((c) => !channelsWithRules.has(c.id))
        .map((c) => {
          const bu = c.business_unit as unknown as { id: string; name: string } | null;
          return {
            id: c.id,
            name: c.name,
            channelType: c.channel_type,
            externalIdentifier: c.external_identifier,
            businessUnitId: c.business_unit_id,
            businessUnitName: bu?.name || 'Sem unidade',
          };
        });
    },
    staleTime: 30 * 1000,
    enabled: !authLoading && !!user && !!profile?.organization_id,
  });
}

/**
 * Fetch boards with their stages for the destination selector.
 */
export function useBoardsWithStages() {
  const { user, profile, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: [...queryKeys.boardsWithStages.all, profile?.organization_id],
    queryFn: async () => {
      // Guard clause
      if (!profile?.organization_id) {
        return [];
      }

      const { data, error } = await supabase
        .from('boards')
        .select(`
          id,
          name,
          board_stages!board_stages_board_id_fkey (
            id,
            name,
            order
          )
        `)
        .eq('organization_id', profile.organization_id)
        .is('deleted_at', null)
        .order('name');

      if (error) throw error;

      return (data || []).map((b) => {
        const rawStages = (b.board_stages || []) as { id: string; name: string; order: number }[];
        return {
          id: b.id,
          name: b.name,
          stages: rawStages
            .sort((a, z) => a.order - z.order)
            .map((s) => ({
              id: s.id,
              name: s.name,
              position: s.order,
            })),
        };
      });
    },
    staleTime: 60 * 1000,
    enabled: !authLoading && !!user && !!profile?.organization_id,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create a new lead routing rule.
 */
export function useCreateLeadRoutingRule() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateLeadRoutingRuleInput) => {
      const { data, error } = await supabase
        .from('lead_routing_rules')
        .insert({
          organization_id: profile!.organization_id,
          channel_id: input.channelId,
          board_id: input.boardId || null,
          stage_id: input.stageId || null,
          enabled: input.enabled ?? true,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.leadRoutingRules.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.leadRoutingRules.channelsWithoutRules(),
      });
    },
  });
}

/**
 * Update an existing lead routing rule.
 */
export function useUpdateLeadRoutingRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ruleId,
      input,
    }: {
      ruleId: string;
      input: UpdateLeadRoutingRuleInput;
    }) => {
      const updates: Record<string, unknown> = {};
      if (input.boardId !== undefined) updates.board_id = input.boardId;
      if (input.stageId !== undefined) updates.stage_id = input.stageId;
      if (input.enabled !== undefined) updates.enabled = input.enabled;

      const { error } = await supabase
        .from('lead_routing_rules')
        .update(updates)
        .eq('id', ruleId);

      if (error) throw error;
      return { ruleId };
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.leadRoutingRules.all,
      });
    },
  });
}

/**
 * Delete a lead routing rule.
 */
export function useDeleteLeadRoutingRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from('lead_routing_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
      return { ruleId };
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.leadRoutingRules.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.leadRoutingRules.channelsWithoutRules(),
      });
    },
  });
}

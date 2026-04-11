'use client';

/**
 * TanStack Query hooks for WhatsApp Templates (HSM)
 *
 * Templates must be pre-approved by Meta before use outside the 24h window.
 * These hooks manage fetching, syncing, and sending templates.
 *
 * @module lib/query/hooks/useTemplatesQuery
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../queryKeys';
import { useAuth } from '@/context/AuthContext';
import type {
  MessagingTemplate,
  TemplateStatus,
  TemplateCategory,
  TemplateComponentParam,
} from '@/lib/messaging/types';

// =============================================================================
// TYPES
// =============================================================================

interface TemplatesFilters {
  status?: TemplateStatus;
  category?: TemplateCategory;
}

interface SendTemplateInput {
  conversationId: string;
  templateId: string;
  parameters?: {
    header?: TemplateParameterInput[];
    body?: TemplateParameterInput[];
    buttons?: { index: number; parameters: TemplateParameterInput[] }[];
  };
}

interface TemplateParameterInput {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { code: string; amount: number };
  dateTime?: { fallbackValue: string };
  image?: { link: string };
  document?: { link: string; filename?: string };
  video?: { link: string };
}

interface SyncResult {
  success: boolean;
  synced: number;
  total: number;
  templates: MessagingTemplate[];
}

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch templates for a channel.
 *
 * @param channelId - The channel ID
 * @param filters - Optional filters for status and category
 */
export function useTemplatesQuery(channelId: string | null, filters?: TemplatesFilters) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingTemplates.byChannel(channelId || ''),
    queryFn: async (): Promise<MessagingTemplate[]> => {
      if (!channelId) return [];

      const params = new URLSearchParams({ channelId });
      if (filters?.status) params.append('status', filters.status);
      if (filters?.category) params.append('category', filters.category);

      const response = await fetch(`/api/messaging/templates?${params.toString()}`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to fetch templates');
      }

      const data = await response.json();
      return data.templates || [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !authLoading && !!user && !!channelId,
  });
}

/**
 * Fetch only approved templates for a channel.
 * Useful for the template selector in message composer.
 *
 * @param channelId - The channel ID
 */
export function useApprovedTemplatesQuery(channelId: string | null) {
  const { user, loading: authLoading } = useAuth();

  return useQuery({
    queryKey: queryKeys.messagingTemplates.approved(channelId || ''),
    queryFn: async (): Promise<MessagingTemplate[]> => {
      if (!channelId) return [];

      const params = new URLSearchParams({
        channelId,
        status: 'approved',
      });

      const response = await fetch(`/api/messaging/templates?${params.toString()}`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to fetch templates');
      }

      const data = await response.json();
      return data.templates || [];
    },
    staleTime: 2 * 60 * 1000,
    enabled: !authLoading && !!user && !!channelId,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Sync templates from Meta WhatsApp Cloud API.
 * This fetches the latest templates from Meta and updates our database.
 */
export function useTemplateSyncMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string): Promise<SyncResult> => {
      const response = await fetch('/api/messaging/templates/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to sync templates');
      }

      return response.json();
    },
    onSettled: (_, _err, channelId) => {
      // Invalidate templates queries for this channel
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingTemplates.byChannel(channelId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingTemplates.approved(channelId),
      });
    },
  });
}

/**
 * Send a template message.
 * Creates a message record and sends via the provider.
 */
export function useSendTemplateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendTemplateInput) => {
      const response = await fetch('/api/messaging/messages/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || error.message || 'Failed to send template');
      }

      return response.json();
    },
    onSettled: (_, _err, variables) => {
      // Invalidate messages for the conversation
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingMessages.byConversation(variables.conversationId),
      });
      // Invalidate conversation (last message updated)
      queryClient.invalidateQueries({
        queryKey: queryKeys.messagingConversations.all,
      });
    },
  });
}

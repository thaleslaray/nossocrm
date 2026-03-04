/**
 * React Query hooks for WhatsApp entities.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import type {
  WhatsAppInstance,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppAIConfig,
  WhatsAppAIConfigUpdate,
  WhatsAppInstanceCreate,
} from '@/types/whatsapp';

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ---------------------------------------------------------------------------
// INSTANCES
// ---------------------------------------------------------------------------

export function useWhatsAppInstances() {
  return useQuery({
    queryKey: queryKeys.whatsappInstances.all,
    queryFn: () => fetchJson<WhatsAppInstance[]>('/api/whatsapp/instances'),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useWhatsAppInstance(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.whatsappInstances.detail(id ?? ''),
    queryFn: () => fetchJson<WhatsAppInstance & { liveStatus?: unknown }>(`/api/whatsapp/instances/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateWhatsAppInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WhatsAppInstanceCreate) =>
      fetchJson<WhatsAppInstance>('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsappInstances.all });
    },
  });
}

export function useUpdateWhatsAppInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string } & Partial<WhatsAppInstance>) =>
      fetchJson<WhatsAppInstance>(`/api/whatsapp/instances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsappInstances.all });
    },
  });
}

export function useDeleteWhatsAppInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<void>(`/api/whatsapp/instances/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsappInstances.all });
    },
  });
}

export function useConfigureWebhooks() {
  return useMutation({
    mutationFn: (instanceId: string) =>
      fetchJson<{ ok: boolean; webhookUrl: string; message: string }>(
        `/api/whatsapp/instances/${instanceId}/configure-webhooks`,
        { method: 'POST' },
      ),
  });
}

export function useSyncChats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) =>
      fetchJson<{ synced: number; total: number }>(
        `/api/whatsapp/instances/${instanceId}/sync-chats`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsappConversations.all });
    },
  });
}

export function useWhatsAppQRCode(instanceId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.whatsappInstances.detail(instanceId ?? ''), 'qrcode'],
    queryFn: () => fetchJson<{ value: string; connected?: boolean }>(`/api/whatsapp/instances/${instanceId}/qrcode`),
    enabled: !!instanceId,
    refetchInterval: 20_000, // QR code expires every 20s
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// CONVERSATIONS
// ---------------------------------------------------------------------------

export function useWhatsAppConversations(options?: {
  instanceId?: string;
  status?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (options?.instanceId) params.set('instanceId', options.instanceId);
  if (options?.status) params.set('status', options.status);
  if (options?.search) params.set('search', options.search);

  const qs = params.toString();
  return useQuery({
    queryKey: queryKeys.whatsappConversations.list(options ?? {}),
    queryFn: () => fetchJson<WhatsAppConversation[]>(`/api/whatsapp/conversations${qs ? `?${qs}` : ''}`),
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// MESSAGES
// ---------------------------------------------------------------------------

export function useWhatsAppMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.whatsappMessages.byConversation(conversationId ?? ''),
    queryFn: () => fetchJson<WhatsAppMessage[]>(`/api/whatsapp/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
    staleTime: 10 * 1000,
  });
}

export function useSendWhatsAppMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, text, quotedMessageId }: {
      conversationId: string;
      text: string;
      quotedMessageId?: string;
    }) =>
      fetchJson<WhatsAppMessage>(`/api/whatsapp/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, quotedMessageId }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: queryKeys.whatsappMessages.byConversation(vars.conversationId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.whatsappConversations.all });
    },
  });
}

// ---------------------------------------------------------------------------
// AI CONTROL
// ---------------------------------------------------------------------------

export function useWhatsAppAIControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, action, reason }: {
      conversationId: string;
      action: 'pause' | 'resume';
      reason?: string;
    }) =>
      fetchJson<{ ok: boolean; ai_active: boolean }>(`/api/whatsapp/conversations/${conversationId}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.whatsappConversations.all });
    },
  });
}

// ---------------------------------------------------------------------------
// AI CONFIG
// ---------------------------------------------------------------------------

export function useWhatsAppAIConfig(instanceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.whatsappAIConfig.detail(instanceId ?? ''),
    queryFn: () => fetchJson<WhatsAppAIConfig | null>(`/api/whatsapp/instances/${instanceId}/ai-config`),
    enabled: !!instanceId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateWhatsAppAIConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, ...updates }: { instanceId: string } & WhatsAppAIConfigUpdate) =>
      fetchJson<WhatsAppAIConfig>(`/api/whatsapp/instances/${instanceId}/ai-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: queryKeys.whatsappAIConfig.detail(vars.instanceId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// INTELLIGENCE (combined endpoint)
// ---------------------------------------------------------------------------

import type {
  ChatMemory,
  WhatsAppFollowUp,
  ConversationLabel,
  LeadScore,
  ConversationSummary,
  WhatsAppLabel,
} from '@/types/whatsapp';

interface ConversationIntelligenceData {
  memories: ChatMemory[];
  leadScore: LeadScore | null;
  labels: ConversationLabel[];
  followUps: WhatsAppFollowUp[];
  summary: ConversationSummary | null;
}

export function useConversationIntelligence(conversationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.whatsappIntelligence.byConversation(conversationId ?? ''),
    queryFn: () => fetchJson<ConversationIntelligenceData>(`/api/whatsapp/conversations/${conversationId}/intelligence`),
    enabled: !!conversationId,
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// LABELS
// ---------------------------------------------------------------------------

export function useWhatsAppLabels() {
  return useQuery({
    queryKey: queryKeys.whatsappLabels.all,
    queryFn: () => fetchJson<WhatsAppLabel[]>('/api/whatsapp/labels'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAssignLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, labelId }: { conversationId: string; labelId: string }) =>
      fetchJson<ConversationLabel>(`/api/whatsapp/conversations/${conversationId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: queryKeys.whatsappIntelligence.byConversation(vars.conversationId),
      });
    },
  });
}

export function useRemoveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, labelId }: { conversationId: string; labelId: string }) =>
      fetchJson<void>(`/api/whatsapp/conversations/${conversationId}/labels?labelId=${labelId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: queryKeys.whatsappIntelligence.byConversation(vars.conversationId),
      });
    },
  });
}

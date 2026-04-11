/**
 * @fileoverview Secure AI Tool Collections
 *
 * Implementa o padrão Lightfield "Contextual Tool Collections" para segurança:
 * - Data Access Gated by User ID
 * - LLM Never Directly Issues Queries
 * - Securely Inject Dependencies
 *
 * Princípios:
 * 1. LLM chama tools, nunca SQL direto
 * 2. Todas queries filtradas por organization_id
 * 3. Dependências (supabase, userId, etc.) injetadas no momento da criação
 * 4. Tools de alta impact requerem confirmação humana (HITL)
 *
 * @module lib/ai/agent/secure-tools
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AIProvider } from '../config';
import { sanitizePostgrestValue } from '@/lib/utils/sanitize';

// =============================================================================
// Types
// =============================================================================

export interface ToolContext {
  /** ID do usuário autenticado (se disponível) */
  userId?: string;
  /** ID da organização - SEMPRE obrigatório */
  organizationId: string;
  /** Cliente Supabase com service role para operações de agent */
  supabase: SupabaseClient;
  /** Permissões do usuário */
  permissions: UserPermissions;
  /** Configuração de AI */
  aiConfig: {
    provider: AIProvider;
    apiKey: string;
    model: string;
  };
  /** Threshold para HITL (confidence abaixo disso requer confirmação) */
  hitlThreshold: number;
}

export interface UserPermissions {
  canViewDeals: boolean;
  canUpdateDeals: boolean;
  canSendMessages: boolean;
  canAdvanceStages: boolean;
  canAccessContacts: boolean;
  /** Role do usuário (para logs) */
  role: 'admin' | 'user' | 'agent';
}

export interface ToolDefinition<TParams extends z.ZodTypeAny, TResult> {
  name: string;
  description: string;
  parameters: TParams;
  /** Se retorna true, a tool requer confirmação humana antes de executar */
  requiresConfirmation?: (params: z.infer<TParams>) => boolean;
  /** Executa a tool com os parâmetros */
  execute: (
    params: z.infer<TParams>,
    userEdits?: UserEdits
  ) => Promise<ToolExecutionResult<TResult>>;
}

export interface UserEdits {
  approved: boolean;
  /** Se usuário editou os parâmetros antes de aprovar */
  editedParams?: Record<string, unknown>;
  /** Notas adicionais do usuário */
  notes?: string;
}

export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  /** Status do HITL */
  hitlStatus?: 'auto_executed' | 'awaiting_confirmation' | 'approved' | 'rejected' | 'edited';
  /** Se a tool requer confirmação, inclui os dados para a UI */
  pendingConfirmation?: {
    toolName: string;
    params: unknown;
    reason: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// =============================================================================
// Tool Permission Error
// =============================================================================

export class ToolPermissionError extends Error {
  code: string;

  constructor(message: string, code = 'PERMISSION_DENIED') {
    super(message);
    this.name = 'ToolPermissionError';
    this.code = code;
  }
}

// =============================================================================
// Tool Schemas
// =============================================================================

export const SearchDealsSchema = z.object({
  query: z.string().optional().describe('Texto para buscar no título do deal'),
  status: z
    .enum(['open', 'won', 'lost', 'all'])
    .optional()
    .describe('Filtrar por status do deal'),
  limit: z.number().min(1).max(50).optional().default(10).describe('Máximo de resultados'),
});

export const AdvanceStageSchema = z.object({
  dealId: z.string().uuid().describe('ID do deal a ser avançado'),
  targetStageId: z.string().uuid().describe('ID do estágio destino'),
  reason: z.string().describe('Motivo do avanço'),
  confidence: z.number().min(0).max(1).describe('Confiança da avaliação (0-1)'),
  criteriaEvaluation: z
    .array(
      z.object({
        criterion: z.string(),
        met: z.boolean(),
        confidence: z.number().min(0).max(1),
        evidence: z.string().nullable(),
      })
    )
    .describe('Avaliação de cada critério'),
});

export const SendMessageSchema = z.object({
  conversationId: z.string().uuid().describe('ID da conversa'),
  content: z.string().min(1).max(2000).describe('Conteúdo da mensagem'),
});

export const GetDealContextSchema = z.object({
  dealId: z.string().uuid().describe('ID do deal'),
});

export const SearchContactsSchema = z.object({
  query: z.string().describe('Nome, email ou telefone para buscar'),
  limit: z.number().min(1).max(20).optional().default(5),
});

// =============================================================================
// Tool Collection Factory
// =============================================================================

/**
 * Cria uma coleção de tools com dependências injetadas.
 *
 * Padrão Lightfield: "Contextual Tool Collections"
 * - Cada tool recebe context no momento da criação
 * - organization_id SEMPRE injetado nas queries
 * - LLM não controla filtros de segurança
 *
 * @param context - Contexto com dependências (supabase, orgId, permissions)
 */
export function createSecureToolCollection(context: ToolContext) {
  const { supabase, organizationId, permissions, hitlThreshold } = context;

  return {
    // =========================================================================
    // Search Deals - Busca deals da organização
    // =========================================================================
    searchDeals: {
      name: 'search_deals',
      description: 'Busca deals da organização por título ou status',
      parameters: SearchDealsSchema,

      async execute(params: z.infer<typeof SearchDealsSchema>): Promise<ToolExecutionResult> {
        if (!permissions.canViewDeals) {
          throw new ToolPermissionError('Sem permissão para visualizar deals');
        }

        let query = supabase
          .from('deals')
          .select(
            `
            id,
            title,
            value,
            status,
            stage_id,
            board_stages!inner (name),
            contacts!inner (name, email, phone),
            created_at
          `
          )
          .eq('organization_id', organizationId) // SEMPRE filtrado!
          .is('deleted_at', null)
          .limit(params.limit || 10);

        // Filtro de texto
        if (params.query) {
          const sanitized = sanitizePostgrestValue(params.query);
          const safeQuery = sanitized.replace(/[%_\\]/g, (c) => `\\${c}`);
          query = query.ilike('title', `%${safeQuery}%`);
        }

        // Filtro de status
        if (params.status && params.status !== 'all') {
          query = query.eq('status', params.status);
        }

        const { data, error } = await query;

        if (error) {
          return {
            success: false,
            error: { code: 'QUERY_ERROR', message: error.message },
          };
        }

        return {
          success: true,
          data,
          hitlStatus: 'auto_executed',
        };
      },
    } as ToolDefinition<typeof SearchDealsSchema, unknown>,

    // =========================================================================
    // Advance Stage - Avança deal para próximo estágio (HITL)
    // =========================================================================
    advanceStage: {
      name: 'advance_lead_stage',
      description: 'Avança o lead para o próximo estágio do funil',
      parameters: AdvanceStageSchema,

      // HITL: requer confirmação se confidence < threshold
      requiresConfirmation(params: z.infer<typeof AdvanceStageSchema>) {
        return params.confidence < hitlThreshold;
      },

      async execute(
        params: z.infer<typeof AdvanceStageSchema>,
        userEdits?: UserEdits
      ): Promise<ToolExecutionResult> {
        if (!permissions.canAdvanceStages) {
          throw new ToolPermissionError('Sem permissão para avançar estágios');
        }

        // Se requer confirmação e não foi editado/aprovado, retorna pending
        const needsConfirmation = params.confidence < hitlThreshold;
        if (needsConfirmation && !userEdits) {
          return {
            success: false,
            hitlStatus: 'awaiting_confirmation',
            pendingConfirmation: {
              toolName: 'advance_lead_stage',
              params,
              reason: `Confiança de ${Math.round(params.confidence * 100)}% está abaixo do threshold de ${Math.round(hitlThreshold * 100)}%`,
            },
          };
        }

        // Se usuário rejeitou
        if (userEdits && !userEdits.approved) {
          return {
            success: false,
            message: 'Avanço rejeitado pelo usuário',
            hitlStatus: 'rejected',
          };
        }

        // Determinar parâmetros finais (originais ou editados)
        const finalStageId = (userEdits?.editedParams?.targetStageId as string) || params.targetStageId;
        const finalReason = (userEdits?.editedParams?.reason as string) || params.reason;

        // Verificar se deal pertence à organização
        const { data: deal, error: dealError } = await supabase
          .from('deals')
          .select('id, stage_id, title')
          .eq('id', params.dealId)
          .eq('organization_id', organizationId) // SEMPRE filtrado!
          .single();

        if (dealError || !deal) {
          return {
            success: false,
            error: { code: 'DEAL_NOT_FOUND', message: 'Deal não encontrado na organização' },
          };
        }

        // Verificar se estágio destino é válido
        const { data: targetStage, error: stageError } = await supabase
          .from('board_stages')
          .select('id, name, board_id')
          .eq('id', finalStageId)
          .single();

        if (stageError || !targetStage) {
          return {
            success: false,
            error: { code: 'STAGE_NOT_FOUND', message: 'Estágio destino não encontrado' },
          };
        }

        // Validar que o estágio destino pertence ao mesmo board do deal atual
        const { data: currentStage } = await supabase
          .from('board_stages')
          .select('board_id')
          .eq('id', deal.stage_id)
          .single();

        if (currentStage && targetStage.board_id !== currentStage.board_id) {
          return {
            success: false,
            error: { code: 'INVALID_STAGE', message: 'Estágio destino pertence a outro board' },
          };
        }

        // Atualizar deal
        const { error: updateError } = await supabase
          .from('deals')
          .update({
            stage_id: finalStageId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', params.dealId)
          .eq('organization_id', organizationId);

        if (updateError) {
          return {
            success: false,
            error: { code: 'UPDATE_ERROR', message: updateError.message },
          };
        }

        // Registrar atividade
        await supabase.from('deal_activities').insert({
          deal_id: params.dealId,
          organization_id: organizationId,
          type: 'stage_change',
          description: userEdits
            ? `Estágio avançado (aprovado por usuário): ${finalReason}`
            : `Estágio avançado automaticamente: ${finalReason}`,
          metadata: {
            from_stage_id: deal.stage_id,
            to_stage_id: finalStageId,
            triggered_by: userEdits ? 'user_approved' : 'ai_agent_auto',
            confidence: params.confidence,
            criteria_evaluation: params.criteriaEvaluation,
            was_edited: !!userEdits?.editedParams,
            user_notes: userEdits?.notes,
          },
        });

        return {
          success: true,
          data: {
            dealId: params.dealId,
            newStageId: finalStageId,
            newStageName: targetStage.name,
          },
          hitlStatus: userEdits ? (userEdits.editedParams ? 'edited' : 'approved') : 'auto_executed',
          message: `Deal "${deal.title}" avançado para "${targetStage.name}"`,
        };
      },
    } as ToolDefinition<typeof AdvanceStageSchema, unknown>,

    // =========================================================================
    // Send Message - Envia mensagem (sempre requer HITL)
    // =========================================================================
    sendMessage: {
      name: 'send_message',
      description: 'Envia mensagem para o lead na conversa',
      parameters: SendMessageSchema,

      // Mensagens SEMPRE requerem confirmação
      requiresConfirmation() {
        return true;
      },

      async execute(
        params: z.infer<typeof SendMessageSchema>,
        userEdits?: UserEdits
      ): Promise<ToolExecutionResult> {
        if (!permissions.canSendMessages) {
          throw new ToolPermissionError('Sem permissão para enviar mensagens');
        }

        // Sempre requer confirmação
        if (!userEdits) {
          return {
            success: false,
            hitlStatus: 'awaiting_confirmation',
            pendingConfirmation: {
              toolName: 'send_message',
              params,
              reason: 'Mensagens sempre requerem aprovação antes de enviar',
            },
          };
        }

        if (!userEdits.approved) {
          return {
            success: false,
            message: 'Envio de mensagem rejeitado pelo usuário',
            hitlStatus: 'rejected',
          };
        }

        // Verificar se conversa pertence à organização
        const { data: conversation, error: convError } = await supabase
          .from('messaging_conversations')
          .select('id, channel_id')
          .eq('id', params.conversationId)
          .eq('organization_id', organizationId) // SEMPRE filtrado!
          .single();

        if (convError || !conversation) {
          return {
            success: false,
            error: {
              code: 'CONVERSATION_NOT_FOUND',
              message: 'Conversa não encontrada na organização',
            },
          };
        }

        // Conteúdo final (original ou editado)
        const finalContent = (userEdits.editedParams?.content as string) || params.content;

        // Inserir mensagem
        const { data: message, error: insertError } = await supabase
          .from('messaging_messages')
          .insert({
            conversation_id: params.conversationId,
            direction: 'outbound',
            content: { type: 'text', text: finalContent },
            content_type: 'text',
            status: 'pending',
            sender_type: 'agent',
            metadata: {
              sent_by: 'ai_agent',
              user_approved: true,
              was_edited: !!userEdits.editedParams,
            },
          })
          .select('id')
          .single();

        if (insertError) {
          return {
            success: false,
            error: { code: 'INSERT_ERROR', message: insertError.message },
          };
        }

        return {
          success: true,
          data: { messageId: message.id },
          hitlStatus: userEdits.editedParams ? 'edited' : 'approved',
          message: 'Mensagem enviada com sucesso',
        };
      },
    } as ToolDefinition<typeof SendMessageSchema, unknown>,

    // =========================================================================
    // Get Deal Context - Busca contexto completo de um deal
    // =========================================================================
    getDealContext: {
      name: 'get_deal_context',
      description: 'Busca contexto completo de um deal incluindo contato, estágio e histórico',
      parameters: GetDealContextSchema,

      async execute(params: z.infer<typeof GetDealContextSchema>): Promise<ToolExecutionResult> {
        if (!permissions.canViewDeals) {
          throw new ToolPermissionError('Sem permissão para visualizar deals');
        }

        const { data: deal, error } = await supabase
          .from('deals')
          .select(
            `
            id,
            title,
            value,
            status,
            notes,
            stage_id,
            board_stages!inner (
              id,
              name,
              "order",
              board_id,
              boards!inner (name, type)
            ),
            contacts!inner (
              id,
              name,
              email,
              phone,
              company_name
            ),
            created_at,
            updated_at
          `
          )
          .eq('id', params.dealId)
          .eq('organization_id', organizationId) // SEMPRE filtrado!
          .single();

        if (error || !deal) {
          return {
            success: false,
            error: { code: 'DEAL_NOT_FOUND', message: 'Deal não encontrado na organização' },
          };
        }

        // Buscar últimas atividades
        const { data: activities } = await supabase
          .from('deal_activities')
          .select('id, type, description, created_at')
          .eq('deal_id', params.dealId)
          .order('created_at', { ascending: false })
          .limit(5);

        return {
          success: true,
          data: {
            deal,
            recentActivities: activities || [],
          },
          hitlStatus: 'auto_executed',
        };
      },
    } as ToolDefinition<typeof GetDealContextSchema, unknown>,

    // =========================================================================
    // Search Contacts - Busca contatos da organização
    // =========================================================================
    searchContacts: {
      name: 'search_contacts',
      description: 'Busca contatos por nome, email ou telefone',
      parameters: SearchContactsSchema,

      async execute(params: z.infer<typeof SearchContactsSchema>): Promise<ToolExecutionResult> {
        if (!permissions.canAccessContacts) {
          throw new ToolPermissionError('Sem permissão para acessar contatos');
        }

        // Sanitize for PostgREST filter syntax (strips , . ( ) * \)
        // then also escape SQL ILIKE wildcards (% _)
        const safeQuery = sanitizePostgrestValue(params.query).replace(/[%_]/g, (c: string) => `\\${c}`);

        const { data, error } = await supabase
          .from('contacts')
          .select('id, name, email, phone, company_name, lifecycle_stage, created_at')
          .eq('organization_id', organizationId) // SEMPRE filtrado!
          .is('deleted_at', null)
          .or(`name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`)
          .limit(params.limit || 5);

        if (error) {
          return {
            success: false,
            error: { code: 'QUERY_ERROR', message: error.message },
          };
        }

        return {
          success: true,
          data,
          hitlStatus: 'auto_executed',
        };
      },
    } as ToolDefinition<typeof SearchContactsSchema, unknown>,
  };
}

// =============================================================================
// Helper: Create Agent Permissions
// =============================================================================

/**
 * Cria permissões padrão para o AI Agent.
 * Agent tem permissões de leitura, mas ações de escrita requerem HITL.
 */
export function createAgentPermissions(): UserPermissions {
  return {
    canViewDeals: true,
    canUpdateDeals: true, // Atualização requer HITL via threshold
    canSendMessages: true, // Sempre requer HITL
    canAdvanceStages: true, // Requer HITL se confidence < threshold
    canAccessContacts: true,
    role: 'agent',
  };
}

/**
 * Cria permissões para usuário autenticado baseado no role.
 */
export function createUserPermissions(role: 'admin' | 'user'): UserPermissions {
  if (role === 'admin') {
    return {
      canViewDeals: true,
      canUpdateDeals: true,
      canSendMessages: true,
      canAdvanceStages: true,
      canAccessContacts: true,
      role: 'admin',
    };
  }

  return {
    canViewDeals: true,
    canUpdateDeals: true,
    canSendMessages: true,
    canAdvanceStages: true,
    canAccessContacts: true,
    role: 'user',
  };
}

// =============================================================================
// Types Export
// =============================================================================

export type SecureToolCollection = ReturnType<typeof createSecureToolCollection>;

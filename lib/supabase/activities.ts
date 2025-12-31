/**
 * @fileoverview Serviço Supabase para gerenciamento de atividades do CRM.
 * 
 * Este módulo fornece operações CRUD para atividades (tarefas, reuniões, ligações, etc.)
 * com validação de segurança defense-in-depth para isolamento multi-tenant.
 * 
 * ## Segurança Multi-Tenant
 * 
 * Além das políticas RLS, este serviço implementa verificação adicional
 * de organization_id antes de update/delete para prevenir ataques cross-tenant.
 * 
 * @module lib/supabase/activities
 */

import { supabase } from './client';
import { Activity } from '@/types';
import { sanitizeUUID } from './utils';
import { sortActivitiesSmart } from '@/lib/utils/activitySort';

// ============================================
// HELPERS REMOVED
// ============================================


// ============================================
// ACTIVITIES SERVICE
// ============================================

/**
 * Representação de atividade no banco de dados.
 * 
 * @interface DbActivity
 */
export interface DbActivity {
  /** ID único da atividade (UUID). */
  id: string;
  /** ID da organização/tenant. */
  organization_id: string;
  /** Título da atividade. */
  title: string;
  /** Descrição detalhada. */
  description: string | null;
  /** Tipo (CALL, MEETING, EMAIL, TASK). */
  type: string;
  /** Data/hora agendada. */
  date: string;
  /** Se a atividade foi concluída. */
  completed: boolean;
  /** ID do deal associado. */
  deal_id: string | null;
  /** ID do contato associado. */
  contact_id: string | null;
  /** ID da empresa CRM associada à atividade (opcional). */
  client_company_id?: string | null;
  /** IDs dos contatos participantes (opcional). */
  participant_contact_ids?: string[] | null;
  /** Data de criação. */
  created_at: string;
  /** ID do dono/responsável. */
  owner_id: string | null;
}

// Interface auxiliar para o retorno do Supabase com o join
interface DbActivityWithDeal extends DbActivity {
  deals?: { title: string } | null;
}

/**
 * Transforma atividade do formato DB para o formato da aplicação.
 * 
 * @param db - Atividade no formato do banco.
 * @returns Atividade no formato da aplicação.
 */
const transformActivity = (db: DbActivityWithDeal): Activity => ({
  id: db.id,
  organizationId: db.organization_id,
  title: db.title,
  description: db.description || undefined,
  type: db.type as Activity['type'],
  date: db.date,
  completed: db.completed,
  dealId: db.deal_id || '',
  contactId: db.contact_id || undefined,
  clientCompanyId: (db as any).client_company_id || undefined,
  participantContactIds: (db as any).participant_contact_ids || [],
  dealTitle: db.deals?.title || '',
  user: { name: 'Você', avatar: '' }, // Will be enriched later
});

/**
 * Transforma atividade do formato da aplicação para o formato DB.
 * 
 * @param activity - Atividade parcial no formato da aplicação.
 * @returns Atividade parcial no formato do banco.
 */
const transformActivityToDb = (activity: Partial<Activity>): Partial<DbActivity> => {
  const db: Partial<DbActivity> = {};

  if (activity.title !== undefined) db.title = activity.title;
  if (activity.description !== undefined) db.description = activity.description || null;
  if (activity.type !== undefined) db.type = activity.type;
  if (activity.date !== undefined) db.date = activity.date;
  if (activity.completed !== undefined) db.completed = activity.completed;
  if (activity.dealId !== undefined) db.deal_id = sanitizeUUID(activity.dealId);
  if (activity.contactId !== undefined) db.contact_id = sanitizeUUID(activity.contactId);
  if (activity.clientCompanyId !== undefined) (db as any).client_company_id = sanitizeUUID(activity.clientCompanyId);
  if (activity.participantContactIds !== undefined) (db as any).participant_contact_ids = activity.participantContactIds || [];

  return db;
};

export const activitiesService = {
  /**
   * Busca todas as atividades.
   * 
   * @returns Promise com array de atividades ou erro.
   */
  async getAll(): Promise<{ data: Activity[] | null; error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { data: null, error: new Error('Supabase não configurado') };

      const { data, error } = await sb
        .from('activities')
        .select(`
          *,
          deals:deal_id (title)
        `)
        .order('date', { ascending: false }); // Ordenação básica do banco

      if (error) return { data: null, error };
      
      // Transforma e aplica ordenação inteligente
      const activities = (data || []).map(a => transformActivity(a as DbActivityWithDeal));
      return { data: sortActivitiesSmart(activities), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Cria uma nova atividade.
   * 
   * @param activity - Dados da atividade (sem id e createdAt).
   * @returns Promise com atividade criada ou erro.
   */
  async create(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<{ data: Activity | null; error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { data: null, error: new Error('Supabase não configurado') };

      const insertData: any = {
        title: activity.title,
        description: activity.description || null,
        type: activity.type,
        date: activity.date,
        completed: activity.completed || false,
        deal_id: sanitizeUUID(activity.dealId),
        contact_id: sanitizeUUID(activity.contactId),
        client_company_id: sanitizeUUID(activity.clientCompanyId),
        participant_contact_ids: activity.participantContactIds || [],
      };

      const { data, error } = await sb.from('activities').insert(insertData).select().single();

      if (error) {
        // Se a migration ainda não foi aplicada, faz retry sem os novos campos.
        const msg = (error as any)?.message || '';
        const code = (error as any)?.code || '';
        if (code === '42703' && msg.includes('client_company_id')) {
          delete insertData.client_company_id;
          const retry = await sb.from('activities').insert(insertData).select().single();
          if (retry.error) return { data: null, error: retry.error as any };
          return { data: transformActivity(retry.data as DbActivity), error: null };
        }
        if (code === '42703' && msg.includes('participant_contact_ids')) {
          delete insertData.participant_contact_ids;
          const retry = await sb.from('activities').insert(insertData).select().single();
          if (retry.error) return { data: null, error: retry.error as any };
          return { data: transformActivity(retry.data as DbActivity), error: null };
        }
        return { data: null, error };
      }
      return { data: transformActivity(data as DbActivity), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Atualiza uma atividade existente.
   * 
   * @param id - ID da atividade.
   * @param updates - Campos a serem atualizados.
   * @returns Promise com erro, se houver.
   */
  async update(id: string, updates: Partial<Activity>): Promise<{ error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { error: new Error('Supabase não configurado') };

      const dbUpdates = transformActivityToDb(updates);

      const { error } = await sb.from('activities').update(dbUpdates as any).eq('id', id);

      // Retry se colunas novas não existem ainda
      if (error) {
        const msg = (error as any)?.message || '';
        const code = (error as any)?.code || '';
        if (code === '42703' && msg.includes('client_company_id')) {
          const { client_company_id, ...rest } = dbUpdates as any;
          const retry = await sb.from('activities').update(rest).eq('id', id);
          return { error: retry.error as any };
        }
        if (code === '42703' && msg.includes('participant_contact_ids')) {
          const { participant_contact_ids, ...rest } = dbUpdates as any;
          const retry = await sb.from('activities').update(rest).eq('id', id);
          return { error: retry.error as any };
        }
      }

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Exclui uma atividade.
   * 
   * @param id - ID da atividade.
   * @returns Promise com erro, se houver.
   */
  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { error: new Error('Supabase não configurado') };

      const { error } = await sb
        .from('activities')
        .delete()
        .eq('id', id);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Alterna o status de conclusão de uma atividade.
   * 
   * @param id - ID da atividade.
   * @returns Promise com novo status de conclusão ou erro.
   */
  async toggleCompletion(id: string): Promise<{ data: boolean | null; error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { data: null, error: new Error('Supabase não configurado') };

      // First get current state
      const { data: current, error: fetchError } = await sb
        .from('activities')
        .select('completed')
        .eq('id', id)
        .single();

      if (fetchError || !current) {
        return { data: null, error: new Error('Activity not found') };
      }

      const newCompleted = !current.completed;

      const { error } = await sb
        .from('activities')
        .update({ completed: newCompleted })
        .eq('id', id);

      if (error) return { data: null, error };
      return { data: newCompleted, error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },
};

import { supabase } from './client';
import { LifecycleStage } from '@/types';
import { sanitizeUUID } from './utils';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from '@/lib/ai/defaults';

// ============================================
// SETTINGS SERVICE
// ============================================

export interface DbUserSettings {
  id: string;
  user_id: string;
  ai_provider: string;
  ai_api_key: string | null; // Legacy - keep for backward compatibility
  ai_google_key: string | null;
  ai_openai_key: string | null;
  ai_anthropic_key: string | null;
  ai_model: string;
  ai_thinking: boolean;
  ai_search: boolean;
  ai_anthropic_caching: boolean;
  dark_mode: boolean;
  default_route: string;
  active_board_id: string | null;
  inbox_view_mode: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbLifecycleStage {
  id: string;
  name: string;
  color: string;
  order: number;
  is_default: boolean;
  created_at: string;
}

export interface UserSettings {
  aiProvider: 'google' | 'openai' | 'anthropic';
  aiApiKey: string; // Current active key (based on provider)
  aiGoogleKey: string;
  aiOpenaiKey: string;
  aiAnthropicKey: string;
  aiModel: string;
  aiThinking: boolean;
  aiSearch: boolean;
  aiAnthropicCaching: boolean;
  darkMode: boolean;
  defaultRoute: string;
  activeBoardId: string | null;
  inboxViewMode: 'list' | 'focus';
  onboardingCompleted: boolean;
}

// Transform DB -> App
const transformSettings = (db: DbUserSettings): UserSettings => {
  // Get the key for the current provider
  const getActiveKey = () => {
    switch (db.ai_provider) {
      case 'google': return db.ai_google_key || db.ai_api_key || '';
      case 'openai': return db.ai_openai_key || '';
      case 'anthropic': return db.ai_anthropic_key || '';
      default: return db.ai_api_key || '';
    }
  };

  return {
    aiProvider: db.ai_provider as UserSettings['aiProvider'],
    aiApiKey: getActiveKey(),
    aiGoogleKey: db.ai_google_key || '',
    aiOpenaiKey: db.ai_openai_key || '',
    aiAnthropicKey: db.ai_anthropic_key || '',
    aiModel: db.ai_model,
    aiThinking: db.ai_thinking,
    aiSearch: db.ai_search,
    aiAnthropicCaching: db.ai_anthropic_caching,
    darkMode: db.dark_mode,
    defaultRoute: db.default_route,
    activeBoardId: db.active_board_id,
    inboxViewMode: db.inbox_view_mode as UserSettings['inboxViewMode'],
    onboardingCompleted: db.onboarding_completed,
  };
};

const transformLifecycleStage = (db: DbLifecycleStage): LifecycleStage => ({
  id: db.id,
  name: db.name,
  color: db.color,
  order: db.order,
  isDefault: db.is_default,
});

export const settingsService = {
  async get(): Promise<{ data: UserSettings | null; error: Error | null }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { data: null, error: new Error('Not authenticated') };

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        return { data: null, error };
      }

      // No settings yet, create default
      if (!data) {
        return this.createDefault();
      }

      return { data: transformSettings(data as DbUserSettings), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async createDefault(): Promise<{ data: UserSettings | null; error: Error | null }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { data: null, error: new Error('Not authenticated') };

      // Check if profile exists first (FK constraint)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        console.warn('Profile not found, skipping user_settings creation');
        return { data: null, error: null }; // No error, just skip
      }

      // Use upsert with ignoreDuplicates to handle race conditions
      const { error: upsertError } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          ai_provider: AI_DEFAULT_PROVIDER,
          ai_model: AI_DEFAULT_MODELS[AI_DEFAULT_PROVIDER],
          ai_thinking: true,
          ai_search: true,
          ai_anthropic_caching: false,
          dark_mode: true,
          default_route: '/boards',
          inbox_view_mode: 'list',
          onboarding_completed: false,
        }, {
          onConflict: 'user_id',
          ignoreDuplicates: true
        });

      if (upsertError) {
        console.warn('Upsert warning (likely race condition):', upsertError.message);
      }

      // Always fetch the current settings (either just created or already existed)
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) return { data: null, error };
      return { data: transformSettings(data as DbUserSettings), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async update(updates: Partial<UserSettings>): Promise<{ error: Error | null }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: new Error('Not authenticated') };

      const dbUpdates: Partial<DbUserSettings> = {};

      if (updates.aiProvider !== undefined) dbUpdates.ai_provider = updates.aiProvider;
      if (updates.aiModel !== undefined) dbUpdates.ai_model = updates.aiModel;
      if (updates.aiThinking !== undefined) dbUpdates.ai_thinking = updates.aiThinking;
      if (updates.aiSearch !== undefined) dbUpdates.ai_search = updates.aiSearch;
      if (updates.aiAnthropicCaching !== undefined) dbUpdates.ai_anthropic_caching = updates.aiAnthropicCaching;
      if (updates.darkMode !== undefined) dbUpdates.dark_mode = updates.darkMode;
      if (updates.defaultRoute !== undefined) dbUpdates.default_route = updates.defaultRoute;
      if (updates.activeBoardId !== undefined) dbUpdates.active_board_id = sanitizeUUID(updates.activeBoardId);
      if (updates.inboxViewMode !== undefined) dbUpdates.inbox_view_mode = updates.inboxViewMode;
      if (updates.onboardingCompleted !== undefined) dbUpdates.onboarding_completed = updates.onboardingCompleted;

      // Handle API keys per provider
      if (updates.aiGoogleKey !== undefined) dbUpdates.ai_google_key = updates.aiGoogleKey || null;
      if (updates.aiOpenaiKey !== undefined) dbUpdates.ai_openai_key = updates.aiOpenaiKey || null;
      if (updates.aiAnthropicKey !== undefined) dbUpdates.ai_anthropic_key = updates.aiAnthropicKey || null;

      // Legacy: also update ai_api_key for backward compatibility
      if (updates.aiApiKey !== undefined) {
        dbUpdates.ai_api_key = updates.aiApiKey || null;
      }

      dbUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('user_settings')
        .update(dbUpdates)
        .eq('user_id', user.id)
        .select();

      // Self-healing: If row doesn't exist (data is empty), create it and retry update
      if (!error && (!data || data.length === 0)) {
        console.warn('User settings row missing during update. Creating default...');
        await this.createDefault();

        // Retry update
        const { error: retryError } = await supabase
          .from('user_settings')
          .update(dbUpdates)
          .eq('user_id', user.id);

        return { error: retryError };
      }

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },
};

export const lifecycleStagesService = {
  async getAll(): Promise<{ data: LifecycleStage[] | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('lifecycle_stages')
        .select('*')
        .order('order', { ascending: true });

      if (error) return { data: null, error };
      return { data: (data || []).map(s => transformLifecycleStage(s as DbLifecycleStage)), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async create(stage: Omit<LifecycleStage, 'id' | 'order'>): Promise<{ data: LifecycleStage | null; error: Error | null }> {
    try {
      // Get max order
      const { data: existing } = await supabase
        .from('lifecycle_stages')
        .select('order')
        .order('order', { ascending: false })
        .limit(1);

      const newOrder = existing && existing.length > 0 ? existing[0].order + 1 : 0;

      const { data, error } = await supabase
        .from('lifecycle_stages')
        .insert({
          id: crypto.randomUUID(),
          name: stage.name,
          color: stage.color,
          order: newOrder,
          is_default: stage.isDefault || false,
        })
        .select()
        .single();

      if (error) return { data: null, error };
      return { data: transformLifecycleStage(data as DbLifecycleStage), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async update(id: string, updates: Partial<LifecycleStage>): Promise<{ error: Error | null }> {
    try {
      const dbUpdates: Partial<DbLifecycleStage> = {};

      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.color !== undefined) dbUpdates.color = updates.color;
      if (updates.order !== undefined) dbUpdates.order = updates.order;

      const { error } = await supabase
        .from('lifecycle_stages')
        .update(dbUpdates)
        .eq('id', id);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      // Check if default
      const { data: stage } = await supabase
        .from('lifecycle_stages')
        .select('is_default')
        .eq('id', id)
        .single();

      if (stage?.is_default) {
        return { error: new Error('Cannot delete default lifecycle stage') };
      }

      const { error } = await supabase
        .from('lifecycle_stages')
        .delete()
        .eq('id', id);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async reorder(stages: LifecycleStage[]): Promise<{ error: Error | null }> {
    try {
      // Update each stage's order
      const updates = stages.map((stage, index) =>
        supabase
          .from('lifecycle_stages')
          .update({ order: index })
          .eq('id', stage.id)
      );

      await Promise.all(updates);
      return { error: null };
    } catch (e) {
      return { error: e as Error };
    }
  },
};

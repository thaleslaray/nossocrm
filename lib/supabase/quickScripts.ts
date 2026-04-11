/**
 * Quick Scripts Service
 * CRUD operations for customizable message templates
 */
import { supabase } from './client';

export type ScriptCategory = 'followup' | 'objection' | 'closing' | 'intro' | 'rescue' | 'other';

export interface QuickScript {
    id: string;
    title: string;
    category: ScriptCategory;
    template: string;
    icon: string;
    is_system: boolean;
    user_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateScriptInput {
    title: string;
    category: ScriptCategory;
    template: string;
    icon?: string;
}

export const quickScriptsService = {
    /**
     * Get all scripts (system + user's own)
     */
    async getScripts() {
        if (!supabase) {
            return { data: null as QuickScript[] | null, error: new Error('Supabase não configurado') };
        }
        const { data, error } = await supabase
            .from('quick_scripts')
            .select('*')
            .order('is_system', { ascending: false })
            .order('category')
            .order('title');

        return { data: data as QuickScript[] | null, error };
    },

    /**
     * Get scripts by category
     */
    async getScriptsByCategory(category: ScriptCategory) {
        if (!supabase) {
            return { data: null as QuickScript[] | null, error: new Error('Supabase não configurado') };
        }
        const { data, error } = await supabase
            .from('quick_scripts')
            .select('*')
            .eq('category', category)
            .order('is_system', { ascending: false })
            .order('title');

        return { data: data as QuickScript[] | null, error };
    },

    /**
     * Create a new user script
     */
    async createScript(input: CreateScriptInput) {
        if (!supabase) {
            return { data: null as QuickScript | null, error: new Error('Supabase não configurado') };
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('quick_scripts')
            .insert({
                ...input,
                icon: input.icon || 'MessageSquare',
                is_system: false,
                user_id: user.id,
            })
            .select()
            .single();

        return { data: data as QuickScript | null, error };
    },

    /**
     * Update a user script (cannot update system scripts)
     */
    async updateScript(scriptId: string, input: Partial<CreateScriptInput>) {
        if (!supabase) {
            return { data: null as QuickScript | null, error: new Error('Supabase não configurado') };
        }
        const { data, error } = await supabase
            .from('quick_scripts')
            .update(input)
            .eq('id', scriptId)
            .eq('is_system', false) // Safety: cannot update system scripts
            .select()
            .maybeSingle();

        return { data: data as QuickScript | null, error };
    },

    /**
     * Delete a user script (cannot delete system scripts)
     */
    async deleteScript(scriptId: string) {
        if (!supabase) {
            return { error: new Error('Supabase não configurado') };
        }
        const { error } = await supabase
            .from('quick_scripts')
            .delete()
            .eq('id', scriptId)
            .eq('is_system', false); // Safety

        return { error };
    },

    /**
     * Get category display info
     */
    getCategoryInfo(category: ScriptCategory): { label: string; color: string } {
        const categories: Record<ScriptCategory, { label: string; color: string }> = {
            followup: { label: 'Follow-up', color: 'blue' },
            objection: { label: 'Objeções', color: 'orange' },
            closing: { label: 'Fechamento', color: 'green' },
            intro: { label: 'Apresentação', color: 'purple' },
            rescue: { label: 'Resgate', color: 'yellow' },
            other: { label: 'Outros', color: 'slate' },
        };
        return categories[category] || categories.other;
    },

    /**
     * Apply variables to a template
     */
    applyVariables(template: string, variables: Record<string, string>): string {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
        return result;
    },
};

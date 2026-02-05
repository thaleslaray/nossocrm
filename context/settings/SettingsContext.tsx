import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useRef,
} from 'react';
import { usePathname } from 'next/navigation';
import { LifecycleStage, Product, CustomFieldDefinition, Lead } from '@/types';
import { settingsService, lifecycleStagesService, productsService } from '@/lib/supabase';
import { useAuth } from '../AuthContext';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from '@/lib/ai/defaults';

const DEFAULT_LIFECYCLE_STAGES: LifecycleStage[] = [
  { id: 'LEAD', name: 'Lead', color: 'bg-blue-500', order: 0, isDefault: true },
  { id: 'MQL', name: 'MQL', color: 'bg-yellow-500', order: 1, isDefault: true },
  { id: 'PROSPECT', name: 'Oportunidade', color: 'bg-purple-500', order: 2, isDefault: true },
  { id: 'CUSTOMER', name: 'Cliente', color: 'bg-green-500', order: 3, isDefault: true },
  { id: 'OTHER', name: 'Outros / Perdidos', color: 'bg-slate-500', order: 4, isDefault: true },
];

interface AIConfig {
  provider: 'google' | 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  thinking: boolean;
  search: boolean;
  anthropicCaching: boolean;
}

interface SettingsContextType {
  // Loading state
  loading: boolean;
  error: string | null;

  // Lifecycle Stages
  lifecycleStages: LifecycleStage[];
  addLifecycleStage: (stage: Omit<LifecycleStage, 'id' | 'order'>) => Promise<LifecycleStage | null>;
  updateLifecycleStage: (id: string, updates: Partial<LifecycleStage>) => Promise<void>;
  deleteLifecycleStage: (id: string, contacts: any[]) => Promise<void>;
  reorderLifecycleStages: (newOrder: LifecycleStage[]) => Promise<void>;

  // Products (Catálogo)
  products: Product[];
  /** Recarrega o catálogo de produtos (usado para manter o dropdown do deal atualizado). */
  refreshProducts: () => Promise<void>;

  // Custom Fields (TODO: migrate to Supabase)
  customFieldDefinitions: CustomFieldDefinition[];
  addCustomField: (field: Omit<CustomFieldDefinition, 'id'>) => void;
  updateCustomField: (id: string, updates: Partial<CustomFieldDefinition>) => void;
  removeCustomField: (id: string) => void;

  // Tags (TODO: migrate to Supabase)
  availableTags: string[];
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;

  // AI Config
  aiProvider: AIConfig['provider'];
  setAiProvider: (provider: AIConfig['provider']) => Promise<void>;
  aiApiKey: string; // Current key (based on provider)
  setAiApiKey: (key: string) => Promise<void>;
  aiGoogleKey: string;
  aiOpenaiKey: string;
  aiAnthropicKey: string;
  aiModel: string;
  setAiModel: (model: string) => Promise<void>;
  /** Toggle org-wide: admin controla se IA está ativa para a organização */
  aiOrgEnabled: boolean;
  setAiOrgEnabled: (enabled: boolean) => Promise<void>;
  /** True quando a organização tem uma key configurada para o provider atual (sem expor o segredo ao membro). */
  aiKeyConfigured: boolean;
  /** Feature flags (org-wide) para habilitar/desabilitar funções específicas de IA. */
  aiFeatureFlags: Record<string, boolean>;
  setAIFeatureFlag: (key: string, enabled: boolean) => Promise<void>;
  aiThinking: boolean;
  setAiThinking: (enabled: boolean) => Promise<void>;
  aiSearch: boolean;
  setAiSearch: (enabled: boolean) => Promise<void>;
  aiAnthropicCaching: boolean;
  setAiAnthropicCaching: (enabled: boolean) => Promise<void>;

  // UI State
  isGlobalAIOpen: boolean;
  setIsGlobalAIOpen: (isOpen: boolean) => void;

  // Legacy Leads (deprecated - kept for compatibility)
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  discardLead: (id: string) => void;

  // Refresh
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

/**
 * Componente React `SettingsProvider`.
 *
 * @param {{ children: ReactNode; }} { children } - Parâmetro `{ children }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const pathname = usePathname();

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lifecycleStages, setLifecycleStages] = useState<LifecycleStage[]>(DEFAULT_LIFECYCLE_STAGES);
  const [products, setProducts] = useState<Product[]>([]);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  const refreshProducts = useCallback(async () => {
    try {
      const res = await productsService.getActive();
      if (res.error) {
        console.warn('[Settings] Falha ao carregar produtos:', res.error.message);
        return;
      }
      setProducts(res.data);
    } catch (e) {
      console.warn('[Settings] Falha ao carregar produtos:', e);
    }
  }, []);

  // AI Config state - separate keys per provider
  const [aiProvider, setAiProviderState] = useState<AIConfig['provider']>(AI_DEFAULT_PROVIDER);
  const [aiGoogleKey, setAiGoogleKeyState] = useState<string>('');
  const [aiOpenaiKey, setAiOpenaiKeyState] = useState<string>('');
  const [aiAnthropicKey, setAiAnthropicKeyState] = useState<string>('');
  const [aiModel, setAiModelState] = useState<string>(AI_DEFAULT_MODELS[AI_DEFAULT_PROVIDER]);
  const [aiOrgEnabled, setAiOrgEnabledState] = useState<boolean>(true);
  const [aiHasGoogleKey, setAiHasGoogleKey] = useState<boolean>(false);
  const [aiHasOpenaiKey, setAiHasOpenaiKey] = useState<boolean>(false);
  const [aiHasAnthropicKey, setAiHasAnthropicKey] = useState<boolean>(false);
  const [aiFeatureFlags, setAiFeatureFlags] = useState<Record<string, boolean>>({});
  const [aiThinking, setAiThinkingState] = useState<boolean>(true);
  const [aiSearch, setAiSearchState] = useState<boolean>(true);
  const [aiAnthropicCaching, setAiAnthropicCachingState] = useState<boolean>(false);

  // Computed: current API key based on provider
  const aiApiKey = useMemo(() => {
    switch (aiProvider) {
      case 'google': return aiGoogleKey;
      case 'openai': return aiOpenaiKey;
      case 'anthropic': return aiAnthropicKey;
      default: return '';
    }
  }, [aiProvider, aiGoogleKey, aiOpenaiKey, aiAnthropicKey]);

  const aiKeyConfigured = useMemo(() => {
    switch (aiProvider) {
      case 'google': return aiHasGoogleKey || Boolean(aiGoogleKey && aiGoogleKey.trim());
      case 'openai': return aiHasOpenaiKey || Boolean(aiOpenaiKey && aiOpenaiKey.trim());
      case 'anthropic': return aiHasAnthropicKey || Boolean(aiAnthropicKey && aiAnthropicKey.trim());
      default: return false;
    }
  }, [aiProvider, aiHasGoogleKey, aiHasOpenaiKey, aiHasAnthropicKey, aiGoogleKey, aiOpenaiKey, aiAnthropicKey]);

  // UI State
  const [isGlobalAIOpen, setIsGlobalAIOpen] = useState(false);

  // Avoid duplicate network calls (dev StrictMode / profile hydration)
  const aiConfigLoadedForUserRef = useRef<string | null>(null);
  const aiFeaturesLoadedForUserRef = useRef<string | null>(null);

  const shouldLoadAiFeatures = useMemo(() => {
    // Load feature flags only when needed (settings UI / global AI UI).
    const inAiSettings = (pathname || '').startsWith('/settings/ai');
    return Boolean(inAiSettings || isGlobalAIOpen);
  }, [pathname, isGlobalAIOpen]);

  // Fetch settings on mount
  const fetchSettings = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Preferências por usuário (mantidas em user_settings)
      const { data: settings } = await settingsService.get();
      if (settings) {
        setAiThinkingState(settings.aiThinking);
        setAiSearchState(settings.aiSearch);
        setAiAnthropicCachingState(settings.aiAnthropicCaching);
      }

      // Config org-wide (fonte de verdade): provider/model/keys em organization_settings
      // Keep this eager: other parts of the UI need to know if AI is enabled / key configured.
      if (aiConfigLoadedForUserRef.current !== profile.id) {
        // Mark as "in-flight" immediately to avoid duplicate requests in dev StrictMode
        // where effects can run twice before the first request completes.
        aiConfigLoadedForUserRef.current = profile.id;
        try {
          const aiRes = await fetch('/api/settings/ai', {
            method: 'GET',
            headers: { accept: 'application/json' },
            credentials: 'include',
          });

          if (aiRes.ok) {
            const aiData = (await aiRes.json()) as {
              aiEnabled: boolean;
              aiProvider: AIConfig['provider'];
              aiModel: string;
              aiGoogleKey: string;
              aiOpenaiKey: string;
              aiAnthropicKey: string;
              aiHasGoogleKey?: boolean;
              aiHasOpenaiKey?: boolean;
              aiHasAnthropicKey?: boolean;
            };

            setAiOrgEnabledState(typeof aiData.aiEnabled === 'boolean' ? aiData.aiEnabled : true);
            setAiProviderState(aiData.aiProvider);
            setAiModelState(aiData.aiModel);
            setAiGoogleKeyState(aiData.aiGoogleKey);
            setAiOpenaiKeyState(aiData.aiOpenaiKey);
            setAiAnthropicKeyState(aiData.aiAnthropicKey);
            setAiHasGoogleKey(Boolean(aiData.aiHasGoogleKey));
            setAiHasOpenaiKey(Boolean(aiData.aiHasOpenaiKey));
            setAiHasAnthropicKey(Boolean(aiData.aiHasAnthropicKey));
          } else {
            const body = await aiRes.json().catch(() => null);
            const message = body?.error || `Falha ao carregar config de IA (HTTP ${aiRes.status})`;
            console.warn('[Settings] Falha ao carregar config org-wide de IA:', message);
            // Allow retry on next mount if request failed.
            aiConfigLoadedForUserRef.current = null;
          }
        } catch (e) {
          // Allow retry on transient errors.
          aiConfigLoadedForUserRef.current = null;
          throw e;
        }
      } else {
      }

      // Fetch lifecycle stages
      const { data: stages } = await lifecycleStagesService.getAll();
      if (stages && stages.length > 0) {
        setLifecycleStages(stages);
      }

      // Fetch products catalog (active only)
      await refreshProducts();
    } catch (e) {
      console.error('Error fetching settings:', e);
      setError(e instanceof Error ? e.message : 'Failed to fetch settings');
    }

    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Lazy-load AI feature flags only when needed (settings/ai or global AI UI).
  useEffect(() => {
    if (!profile) return;
    if (!shouldLoadAiFeatures) return;
    if (aiFeaturesLoadedForUserRef.current === profile.id) return;

    // Mark as in-flight immediately to prevent duplicate requests in dev StrictMode.
    aiFeaturesLoadedForUserRef.current = profile.id;

    (async () => {
      try {
        const ffRes = await fetch('/api/settings/ai-features', {
          method: 'GET',
          headers: { accept: 'application/json' },
          credentials: 'include',
        });
        if (ffRes.ok) {
          const ffData = (await ffRes.json().catch(() => null)) as any;
          setAiFeatureFlags((ffData?.flags as Record<string, boolean>) || {});
        } else {
          console.warn('[Settings] Falha ao carregar flags de IA (features).', { status: ffRes.status });
          // Allow retry on failure
          aiFeaturesLoadedForUserRef.current = null;
        }
      } catch {
        // Allow retry on transient errors
        aiFeaturesLoadedForUserRef.current = null;
      } finally {
      }
    })();
  }, [profile, pathname, isGlobalAIOpen, shouldLoadAiFeatures]);

  // Allow UIs (ex.: Settings → Produtos) to notify the app to reload the catalog.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      refreshProducts();
    };
    window.addEventListener('crm:products-updated', handler as any);
    return () => window.removeEventListener('crm:products-updated', handler as any);
  }, [refreshProducts]);

  // Lifecycle Stages CRUD
  const addLifecycleStage = useCallback(
    async (stage: Omit<LifecycleStage, 'id' | 'order'>): Promise<LifecycleStage | null> => {
      const newStage: Omit<LifecycleStage, 'id'> = {
        ...stage,
        order: lifecycleStages.length,
        isDefault: false,
      };

      const { data, error: addError } = await lifecycleStagesService.create(newStage);

      if (addError) {
        setError(addError.message);
        return null;
      }

      if (data) {
        setLifecycleStages(prev => [...prev, data]);
      }

      return data;
    },
    [lifecycleStages.length]
  );

  const updateLifecycleStage = useCallback(
    async (id: string, updates: Partial<LifecycleStage>) => {
      const { error: updateError } = await lifecycleStagesService.update(id, updates);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setLifecycleStages(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)));
    },
    []
  );

  const deleteLifecycleStage = useCallback(async (id: string, contacts: any[] = []) => {
    const stageToDelete = lifecycleStages.find(s => s.id === id);
    if (stageToDelete?.isDefault) return;

    // Validate if there are linked contacts
    const hasLinkedContacts = contacts.some(c => c.stage === id);
    if (hasLinkedContacts) {
      setError('Não é possível excluir estágio com contatos vinculados');
      return;
    }

    const { error: deleteError } = await lifecycleStagesService.delete(id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setLifecycleStages(prev => prev.filter(s => s.id !== id));
  }, [lifecycleStages]);

  const reorderLifecycleStages = useCallback(async (newOrder: LifecycleStage[]) => {
    // Update local state immediately
    const reordered = newOrder.map((s, index) => ({ ...s, order: index }));
    setLifecycleStages(reordered);

    // Update each stage in DB
    for (const stage of reordered) {
      await lifecycleStagesService.update(stage.id, { order: stage.order });
    }
  }, []);

  // AI Config setters (persist to Supabase)
  const updateSettings = useCallback(async (updates: Record<string, unknown>) => {
    const { error: updateError } = await settingsService.update(updates);
    if (updateError) {
      setError(updateError.message);
    }
  }, []);

  const updateOrgAISettings = useCallback(async (updates: Record<string, unknown>) => {
    const res = await fetch('/api/settings/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = body?.error || `Falha ao salvar config de IA (HTTP ${res.status})`;
      setError(message);
      throw new Error(message);
    }
  }, []);

  const setAiProvider = useCallback(
    async (provider: AIConfig['provider']) => {
      await updateOrgAISettings({ aiProvider: provider });
      setAiProviderState(provider);
    },
    [updateOrgAISettings]
  );

  const setAiApiKey = useCallback(
    async (key: string) => {
      // Update the correct provider's key (org-wide)
      switch (aiProvider) {
        case 'google':
          await updateOrgAISettings({ aiGoogleKey: key });
          setAiGoogleKeyState(key);
          break;
        case 'openai':
          await updateOrgAISettings({ aiOpenaiKey: key });
          setAiOpenaiKeyState(key);
          break;
        case 'anthropic':
          await updateOrgAISettings({ aiAnthropicKey: key });
          setAiAnthropicKeyState(key);
          break;
      }
    },
    [updateOrgAISettings, aiProvider]
  );

  const setAiModel = useCallback(
    async (model: string) => {
      await updateOrgAISettings({ aiModel: model });
      setAiModelState(model);
    },
    [updateOrgAISettings]
  );

  const setAiOrgEnabled = useCallback(
    async (enabled: boolean) => {
      await updateOrgAISettings({ aiEnabled: enabled });
      setAiOrgEnabledState(enabled);
    },
    [updateOrgAISettings]
  );

  const setAIFeatureFlag = useCallback(
    async (key: string, enabled: boolean) => {
      const res = await fetch('/api/settings/ai-features', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, enabled }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.error || `Falha ao salvar flag de IA (HTTP ${res.status})`;
        setError(message);
        throw new Error(message);
      }

      setAiFeatureFlags((prev) => ({ ...prev, [key]: enabled }));
    },
    []
  );

  const setAiThinking = useCallback(
    async (enabled: boolean) => {
      setAiThinkingState(enabled);
      await updateSettings({ aiThinking: enabled });
    },
    [updateSettings]
  );

  const setAiSearch = useCallback(
    async (enabled: boolean) => {
      setAiSearchState(enabled);
      await updateSettings({ aiSearch: enabled });
    },
    [updateSettings]
  );

  const setAiAnthropicCaching = useCallback(
    async (enabled: boolean) => {
      setAiAnthropicCachingState(enabled);
      await updateSettings({ aiAnthropicCaching: enabled });
    },
    [updateSettings]
  );

  // Custom Fields (local state for now)
  const addCustomField = useCallback((field: Omit<CustomFieldDefinition, 'id'>) => {
    const newField = { ...field, id: crypto.randomUUID() };
    setCustomFieldDefinitions(prev => [...prev, newField]);
  }, []);

  const updateCustomField = useCallback((id: string, updates: Partial<CustomFieldDefinition>) => {
    setCustomFieldDefinitions(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const removeCustomField = useCallback((id: string) => {
    setCustomFieldDefinitions(prev => prev.filter(f => f.id !== id));
  }, []);

  // Tags (local state for now)
  const addTag = useCallback((tag: string) => {
    if (!availableTags.includes(tag)) {
      setAvailableTags(prev => [...prev, tag]);
    }
  }, [availableTags]);

  const removeTag = useCallback((tag: string) => {
    setAvailableTags(prev => prev.filter(t => t !== tag));
  }, []);

  // Legacy Leads
  const addLead = useCallback((lead: Lead) => {
    setLeads(prev => [...prev, lead]);
  }, []);

  const updateLead = useCallback((id: string, updates: Partial<Lead>) => {
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...updates } : l)));
  }, []);

  const discardLead = useCallback((id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      loading,
      error,
      lifecycleStages,
      addLifecycleStage,
      updateLifecycleStage,
      deleteLifecycleStage,
      reorderLifecycleStages,
      products,
      refreshProducts,
      customFieldDefinitions,
      addCustomField,
      updateCustomField,
      removeCustomField,
      availableTags,
      addTag,
      removeTag,
      aiProvider,
      setAiProvider,
      aiApiKey,
      setAiApiKey,
      aiGoogleKey,
      aiOpenaiKey,
      aiAnthropicKey,
      aiModel,
      setAiModel,
      aiOrgEnabled,
      setAiOrgEnabled,
      aiKeyConfigured,
      aiFeatureFlags,
      setAIFeatureFlag,
      aiThinking,
      setAiThinking,
      aiSearch,
      setAiSearch,
      aiAnthropicCaching,
      setAiAnthropicCaching,
      isGlobalAIOpen,
      setIsGlobalAIOpen,
      leads,
      setLeads,
      addLead,
      updateLead,
      discardLead,
      refresh: fetchSettings,
    }),
    [
      loading,
      error,
      lifecycleStages,
      addLifecycleStage,
      updateLifecycleStage,
      deleteLifecycleStage,
      reorderLifecycleStages,
      products,
      refreshProducts,
      customFieldDefinitions,
      addCustomField,
      updateCustomField,
      removeCustomField,
      availableTags,
      addTag,
      removeTag,
      aiProvider,
      setAiProvider,
      aiApiKey,
      setAiApiKey,
      aiGoogleKey,
      aiOpenaiKey,
      aiAnthropicKey,
      aiModel,
      setAiModel,
      aiOrgEnabled,
      setAiOrgEnabled,
      aiKeyConfigured,
      aiFeatureFlags,
      setAIFeatureFlag,
      aiThinking,
      setAiThinking,
      aiSearch,
      setAiSearch,
      aiAnthropicCaching,
      setAiAnthropicCaching,
      isGlobalAIOpen,
      leads,
      setLeads,
      addLead,
      updateLead,
      discardLead,
      fetchSettings,
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

/**
 * Hook React `useSettings` que encapsula uma lógica reutilizável.
 * @returns {SettingsContextType} Retorna um valor do tipo `SettingsContextType`.
 */
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

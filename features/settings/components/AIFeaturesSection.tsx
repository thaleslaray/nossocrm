'use client';

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCRM } from '@/context/CRMContext';
import { Copy, Loader2, Pencil, RotateCcw, SlidersHorizontal, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { getPromptCatalogMap } from '@/lib/ai/prompts/catalog';

type FeatureItem = {
  key: string;
  title: string;
  description: string;
  /** Prompt key (catalog/override) to edit inside this function */
  promptKey?: string;
};

const FEATURES: FeatureItem[] = [
  { key: 'ai_chat_agent', title: 'Chat do agente (Pilot)', description: 'Chat principal com ferramentas do CRM.', promptKey: 'agent_crm_base_instructions' },
  { key: 'ai_sales_script', title: 'Script de vendas', description: 'Geração de script (Inbox / ações).', promptKey: 'task_inbox_sales_script' },
  { key: 'ai_daily_briefing', title: 'Briefing diário', description: 'Resumo diário de prioridades.', promptKey: 'task_inbox_daily_briefing' },
  { key: 'ai_deal_analyze', title: 'Análise de deal (coach)', description: 'Sugere próxima ação e urgência.', promptKey: 'task_deals_analyze' },
  { key: 'ai_email_draft', title: 'Rascunho de e-mail', description: 'Gera email profissional para o deal.', promptKey: 'task_deals_email_draft' },
  { key: 'ai_objection_responses', title: 'Objeções (3 respostas)', description: 'Gera alternativas para contornar objeções.', promptKey: 'task_deals_objection_responses' },
  { key: 'ai_board_generate_structure', title: 'Boards: gerar estrutura', description: 'Cria estágios e automações sugeridas.', promptKey: 'task_boards_generate_structure' },
  { key: 'ai_board_generate_strategy', title: 'Boards: gerar estratégia', description: 'Define meta/KPI/persona do board.', promptKey: 'task_boards_generate_strategy' },
  { key: 'ai_board_refine', title: 'Boards: refinar com IA', description: 'Refina o board via chat/instruções.', promptKey: 'task_boards_refine' },
];

/**
 * Componente React `AIFeaturesSection`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const AIFeaturesSection: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const { aiFeatureFlags, setAIFeatureFlag } = useCRM();
  const { showToast } = useToast();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const items = useMemo(() => FEATURES, []);
  const catalogMap = useMemo(() => getPromptCatalogMap(), []);

  const getEnabled = (key: string) => {
    const v = aiFeatureFlags?.[key];
    return v !== false; // default: enabled
  };

  const toggle = async (key: string, enabled: boolean) => {
    if (!isAdmin) return;
    setSavingKey(key);
    try {
      await setAIFeatureFlag(key, enabled);
      showToast(enabled ? 'Função ativada' : 'Função desativada', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Falha ao salvar', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  // Prompt editor state (inside functions)
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<FeatureItem | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptResetting, setPromptResetting] = useState(false);

  const openPromptEditor = async (feature: FeatureItem) => {
    if (!isAdmin) return;
    if (!feature.promptKey) return;
    setEditingFeature(feature);
    setPromptEditorOpen(true);
    setPromptLoading(true);
    try {
      const res = await fetch(`/api/settings/ai-prompts/${encodeURIComponent(feature.promptKey)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Falha ao carregar prompt (HTTP ${res.status})`);
      // API returns { key, active, versions }. If no override is active, we should fall back to the catalog default.
      const activeContent = (data?.active?.content as string | undefined) || '';
      const fallbackDefault = catalogMap?.[feature.promptKey]?.defaultTemplate || '';
      const next = activeContent.trim().length > 0 ? activeContent : fallbackDefault;
      setPromptDraft(next || '');
    } catch (e: any) {
      showToast(e?.message || 'Falha ao carregar prompt', 'error');
      setPromptDraft('');
    } finally {
      setPromptLoading(false);
    }
  };

  const closePromptEditor = () => {
    if (promptSaving) return;
    setPromptEditorOpen(false);
    setEditingFeature(null);
    setPromptDraft('');
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copiado!', 'success');
    } catch {
      showToast('Falha ao copiar', 'error');
    }
  };

  const savePromptOverride = async () => {
    if (!editingFeature?.promptKey) return;
    setPromptSaving(true);
    try {
      const res = await fetch('/api/settings/ai-prompts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: editingFeature.promptKey, content: promptDraft }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Falha ao salvar prompt (HTTP ${res.status})`);
      showToast('Prompt salvo!', 'success');
      closePromptEditor();
    } catch (e: any) {
      showToast(e?.message || 'Falha ao salvar prompt', 'error');
    } finally {
      setPromptSaving(false);
    }
  };

  const resetPromptOverride = async () => {
    if (!editingFeature?.promptKey) return;
    setPromptResetting(true);
    try {
      const res = await fetch(`/api/settings/ai-prompts/${encodeURIComponent(editingFeature.promptKey)}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Falha ao resetar prompt (HTTP ${res.status})`);
      showToast('Prompt resetado (voltou ao padrão)', 'success');
      closePromptEditor();
    } catch (e: any) {
      showToast(e?.message || 'Falha ao resetar prompt', 'error');
    } finally {
      setPromptResetting(false);
    }
  };

  return (
    <div id="ai-features" className="mb-12 scroll-mt-8">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" /> Funções de IA
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Toggle + prompt no mesmo lugar (mais simples de entender e de gravar).
            </p>
          </div>
        </div>

        {!isAdmin && (
          <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
            Apenas administradores podem configurar as funções de IA.
          </div>
        )}

        <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-4">
          <div className="space-y-2">
            {items.map((f) => {
              const enabled = getEnabled(f.key);
              const saving = savingKey === f.key;
              return (
                <div
                  key={f.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">{f.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{f.description}</div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}

                    {f.promptKey ? (
                      <button
                        type="button"
                        onClick={() => openPromptEditor(f)}
                        disabled={!isAdmin || saving}
                        className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Editar prompt"
                        aria-label="Editar prompt"
                      >
                        <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => toggle(f.key, !enabled)}
                      className="px-2 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={enabled ? 'Desativar' : 'Ativar'}
                      aria-label={enabled ? `Desativar ${f.title}` : `Ativar ${f.title}`}
                      disabled={!isAdmin || saving}
                    >
                      {enabled ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-red-500" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Modal
        isOpen={promptEditorOpen}
        onClose={closePromptEditor}
        title={editingFeature ? `Prompt: ${editingFeature.title}` : 'Prompt'}
        size="xl"
        bodyClassName="space-y-4"
      >
        {editingFeature?.promptKey ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="font-mono truncate">key: {editingFeature.promptKey}</div>
              <button
                type="button"
                onClick={() => copyToClipboard(editingFeature.promptKey!)}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center justify-center"
                title="Copiar key"
                aria-label="Copiar key"
              >
                <Copy size={16} />
              </button>
            </div>

            {promptLoading ? (
              <div className="min-h-[280px] flex items-center justify-center text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando prompt...
                </div>
              </div>
            ) : (
              <textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                placeholder="Cole/edite o prompt aqui…"
                className="w-full min-h-[280px] resize-y bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-sm text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              />
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={resetPromptOverride}
                disabled={!isAdmin || promptResetting || promptSaving}
                className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 border ${
                  !isAdmin || promptResetting || promptSaving
                    ? 'border-slate-200 dark:border-white/10 text-slate-400 cursor-not-allowed'
                    : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                {promptResetting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                Reset
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closePromptEditor}
                  disabled={promptSaving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-60"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={savePromptOverride}
                  disabled={!isAdmin || promptSaving || promptLoading || !promptDraft.trim()}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white inline-flex items-center gap-2 ${
                    !isAdmin || promptSaving || promptLoading || !promptDraft.trim()
                      ? 'bg-slate-300 dark:bg-white/10 cursor-not-allowed'
                      : 'bg-primary-600 hover:bg-primary-700'
                  }`}
                >
                  {promptSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                  Salvar
                </button>
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
};


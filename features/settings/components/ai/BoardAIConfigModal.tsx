'use client';

/**
 * BoardAIConfigModal — Wizard de configuração do Goal-Oriented Agent por board.
 *
 * 3 telas:
 * 1. Contexto do negócio → descrição + site + público + tom
 * 2. Objetivo do agente → o que deve/não deve fazer, por categoria
 * 3. Base de conhecimento → upload de arquivos + URLs + modo de operação
 */

import { useRef, useState } from 'react';
import {
  Bot, FileText, Target, ChevronRight, ChevronLeft, Check,
  Upload, Eye, Send, Globe, X, File as FileIcon, Link,
  CheckCircle2, AlertCircle, ChevronDown, Loader2,
  LayoutList, Zap, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Modal } from '@/components/ui/Modal';
import { MODAL_FOOTER_CLASS } from '@/components/ui/modalStyles';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/client';
import type { BoardAIConfig } from '@/lib/ai/messaging/types';

// =============================================================================
// Types
// =============================================================================

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface GeneratedStagePrompt {
  systemPrompt: string;
  stageGoal: string;
  advancementCriteria: string[];
}

interface BoardAIConfigModalProps {
  boardId: string;
  boardName: string;
  stages: Stage[];
  existingConfig?: BoardAIConfig | null;
  onSave: (config: Partial<BoardAIConfig>) => Promise<void>;
  onClose: () => void;
}

type Step = 'context' | 'goal' | 'stages' | 'activate';

type Tone = 'formal' | 'amigavel' | 'tecnico' | 'descontraido';

type GoalCategory = 'qualificacao' | 'agendamento' | 'vendas' | 'suporte' | 'filtragem';

const STEPS: { id: Step; label: string; icon: typeof Bot }[] = [
  { id: 'context',  label: 'Contexto',  icon: Bot },
  { id: 'goal',     label: 'Objetivo',  icon: Target },
  { id: 'stages',   label: 'Estágios',  icon: LayoutList },
  { id: 'activate', label: 'Ativar',    icon: Zap },
];

const TONE_OPTIONS: { id: Tone; label: string; desc: string }[] = [
  { id: 'formal',        label: 'Formal',        desc: 'Corporativo e profissional' },
  { id: 'amigavel',      label: 'Amigável',       desc: 'Próximo e acolhedor' },
  { id: 'tecnico',       label: 'Técnico',        desc: 'Preciso e detalhado' },
  { id: 'descontraido',  label: 'Descontraído',   desc: 'Leve e casual' },
];

const GOAL_CATEGORIES: { id: GoalCategory; label: string; emoji: string; what: string; limits: string }[] = [
  {
    id: 'qualificacao',
    label: 'Qualificação',
    emoji: '🎯',
    what: 'Identificar o perfil do lead: orçamento, prazo, necessidade e autoridade de decisão. Perguntar sobre o momento de compra.',
    limits: 'Não fazer propostas comerciais. Não citar preços. Passar para humano quando lead estiver qualificado.',
  },
  {
    id: 'agendamento',
    label: 'Agendamento',
    emoji: '📅',
    what: 'Confirmar interesse, apresentar opções de horário e agendar reunião ou consulta com o responsável.',
    limits: 'Não prometer confirmações sem aprovação humana. Não negociar condições. Não oferecer descontos.',
  },
  {
    id: 'vendas',
    label: 'Vendas',
    emoji: '💰',
    what: 'Apresentar o produto/serviço, tirar dúvidas, identificar objeções e guiar o lead até a compra ou proposta.',
    limits: 'Não prometer prazos sem confirmar estoque. Não oferecer desconto além do permitido. Passar para humano se lead pedir condições especiais.',
  },
  {
    id: 'suporte',
    label: 'Suporte',
    emoji: '🛠️',
    what: 'Responder dúvidas frequentes, ajudar com problemas comuns e direcionar para os recursos certos.',
    limits: 'Não acessar dados de conta do cliente. Não prometer reembolsos ou créditos. Escalar para humano se cliente estiver frustrado.',
  },
  {
    id: 'filtragem',
    label: 'Filtragem',
    emoji: '🔍',
    what: 'Entender a necessidade do contato e classificar se é um lead qualificado antes de envolver a equipe.',
    limits: 'Não fazer promoção do produto. Ser neutro e objetivo. Não criar expectativas de resposta imediata da equipe.',
  },
];

// =============================================================================
// Step Indicator
// =============================================================================

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] shrink-0">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isDone = i < currentIndex;

        return (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-colors ${
                isDone
                  ? 'bg-emerald-500 dark:bg-emerald-600 text-white'
                  : isActive
                  ? 'bg-violet-600 dark:bg-violet-500 text-white'
                  : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'
              }`}
            >
              {isDone ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
            </div>
            <span
              className={`text-xs font-medium hidden sm:block transition-colors ${
                isActive
                  ? 'text-violet-600 dark:text-violet-400'
                  : isDone
                  ? 'text-slate-600 dark:text-slate-300'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight className="w-3 h-3 text-slate-300 dark:text-white/20 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Step 1 — Context
// =============================================================================

interface ContextStepProps {
  description: string;
  onDescriptionChange: (v: string) => void;
  websiteUrl: string;
  onWebsiteUrlChange: (v: string) => void;
  targetAudience: string;
  onTargetAudienceChange: (v: string) => void;
  tone: Tone;
  onToneChange: (t: Tone) => void;
}

function ContextStep({
  description, onDescriptionChange,
  websiteUrl, onWebsiteUrlChange,
  targetAudience, onTargetAudienceChange,
  tone, onToneChange,
}: ContextStepProps) {
  return (
    <div className="space-y-5">
      {/* Descrição */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Descrição do negócio
        </Label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          O que sua empresa faz? O agente usará isso para se apresentar naturalmente.
        </p>
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Ex: Escola de automação industrial que forma operadores e técnicos para indústrias de grande porte"
          rows={3}
          className="resize-none"
        />
      </div>

      {/* Site da empresa */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          Site da empresa
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Opcional</Badge>
        </Label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          O conteúdo do site é extraído automaticamente via browser headless e usado para gerar a persona do agente.
          Funciona com qualquer tipo de site — estático, WordPress, React, Next.js, etc.
        </p>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => onWebsiteUrlChange(e.target.value)}
            placeholder="https://www.suaempresa.com.br"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Público-alvo */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Público-alvo
          <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">Opcional</Badge>
        </Label>
        <input
          type="text"
          value={targetAudience}
          onChange={(e) => onTargetAudienceChange(e.target.value)}
          placeholder="Ex: Gestores industriais, diretores de operações, técnicos seniores"
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
      </div>

      {/* Tom */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Tom de comunicação
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {TONE_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onToneChange(t.id)}
              className={`px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                tone === t.id
                  ? 'border-violet-500 dark:border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                  : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <p className={`text-sm font-semibold ${tone === t.id ? 'text-violet-700 dark:text-violet-300' : 'text-slate-800 dark:text-slate-100'}`}>
                {t.label}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Step 2 — Goal
// =============================================================================

type PersonaStatus = 'idle' | 'loading' | 'success' | 'error';

interface GoalStepProps {
  category: GoalCategory | null;
  onCategoryChange: (c: GoalCategory) => void;
  agentGoal: string;
  onAgentGoalChange: (v: string) => void;
  restrictions: string;
  onRestrictionsChange: (v: string) => void;
  personaStatus: PersonaStatus;
  generatedPersona: string;
  websiteUrl?: string;
  businessContext: string;
}

function GoalStep({
  category, onCategoryChange,
  agentGoal, onAgentGoalChange,
  restrictions, onRestrictionsChange,
  personaStatus, generatedPersona,
  websiteUrl, businessContext,
}: GoalStepProps) {
  const [isGeneratingGoal, setIsGeneratingGoal] = useState(false);
  const [personaExpanded, setPersonaExpanded] = useState(false);

  async function handleCategorySelect(cat: typeof GOAL_CATEGORIES[0]) {
    onCategoryChange(cat.id);
    // Preenche imediatamente com o template estático
    onAgentGoalChange(cat.what);
    onRestrictionsChange(cat.limits);

    // Em paralelo, gera versão contextual com AI
    if (!businessContext.trim()) return;
    setIsGeneratingGoal(true);
    try {
      const res = await fetch('/api/ai/board-config/generate-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessContext, category: cat.id }),
      });
      if (res.ok) {
        const { whatToDo, whatNotToDo } = await res.json() as { whatToDo: string; whatNotToDo: string };
        if (whatToDo) onAgentGoalChange(whatToDo);
        if (whatNotToDo) onRestrictionsChange(whatNotToDo);
      }
    } catch {
      // Mantém o template estático se falhar
    } finally {
      setIsGeneratingGoal(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Status da geração de persona */}
      {personaStatus === 'loading' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/50 text-sm text-violet-700 dark:text-violet-300">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>
            {websiteUrl
              ? <>Lendo <span className="font-medium">{new URL(websiteUrl).hostname}</span> e gerando persona...</>
              : 'Gerando persona do agente...'}
          </span>
        </div>
      )}

      {personaStatus === 'success' && generatedPersona && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-700/50 overflow-hidden">
          <button
            type="button"
            onClick={() => setPersonaExpanded((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors text-left"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="flex-1 font-medium">
              {websiteUrl
                ? <>Site <span className="underline">{new URL(websiteUrl).hostname}</span> lido — persona gerada</>
                : 'Persona gerada com sucesso'}
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${personaExpanded ? 'rotate-180' : ''}`} />
          </button>
          {personaExpanded && (
            <div className="px-4 py-3 bg-white dark:bg-white/[0.02] border-t border-emerald-100 dark:border-emerald-700/30">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">System prompt gerado (editável no modo Avançado):</p>
              <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                {generatedPersona}
              </pre>
            </div>
          )}
        </div>
      )}

      {personaStatus === 'error' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Não foi possível gerar a persona automaticamente. Configure manualmente no modo Avançado.</span>
        </div>
      )}

      {/* Categorias */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Qual é o foco principal desse agente?
        </Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {GOAL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategorySelect(cat)}
              className={`px-2 py-2 rounded-lg border-2 text-center transition-all ${
                category === cat.id
                  ? 'border-violet-500 dark:border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                  : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <div className="text-lg mb-0.5">{cat.emoji}</div>
              <p className={`text-xs font-semibold leading-tight ${category === cat.id ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>
                {cat.label}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* O que deve fazer */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            O que o agente deve fazer
          </Label>
          {isGeneratingGoal && (
            <span className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
              <span className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />
              Adaptando para seu negócio...
            </span>
          )}
        </div>
        <Textarea
          value={agentGoal}
          onChange={(e) => onAgentGoalChange(e.target.value)}
          placeholder="Selecione uma categoria acima ou descreva o objetivo do agente..."
          rows={3}
          className="resize-none"
        />
      </div>

      {/* O que NÃO deve fazer */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          O que o agente <span className="text-red-500 dark:text-red-400">NÃO</span> deve fazer
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Opcional</Badge>
        </Label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Limites claros evitam respostas inapropriadas e definem quando passar para um humano.
        </p>
        <Textarea
          value={restrictions}
          onChange={(e) => onRestrictionsChange(e.target.value)}
          placeholder="Ex: Não citar preços. Não prometer prazos sem confirmar. Passar para humano se cliente estiver irritado."
          rows={2}
          className="resize-none"
        />
      </div>

      {generatedPersona && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 px-4 py-3 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Persona gerada automaticamente
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 line-clamp-3">
            {generatedPersona}
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Step 3 — Stages
// =============================================================================

type StageGenStatus = 'idle' | 'loading' | 'success' | 'error';

interface StagesStepProps {
  stages: Stage[];
  enabledStages: Set<string>;
  onToggleStage: (id: string) => void;
  generatedPrompts: Record<string, GeneratedStagePrompt>;
  genStatus: StageGenStatus;
  onRegenerate: () => void;
}

function StagesStep({
  stages, enabledStages, onToggleStage,
  generatedPrompts, genStatus, onRegenerate,
}: StagesStepProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {genStatus === 'loading' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/50 text-sm text-violet-700 dark:text-violet-300">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Gerando instruções para cada estágio com IA...</span>
        </div>
      )}

      {genStatus === 'success' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/50 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="flex-1">Instruções geradas para {Object.keys(generatedPrompts).length} estágios</span>
          <button type="button" onClick={onRegenerate} className="text-xs underline opacity-70 hover:opacity-100">
            Regenerar
          </button>
        </div>
      )}

      {genStatus === 'error' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">Falha ao gerar instruções automáticas.</span>
          <button type="button" onClick={onRegenerate} className="text-xs underline opacity-70 hover:opacity-100 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Tentar novamente
          </button>
        </div>
      )}

      {/* Stage list */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ative o AI em cada estágio do funil. Estágios desativados continuam com atendimento humano.
        </p>

        {sortedStages.map((stage) => {
          const isEnabled = enabledStages.has(stage.id);
          const prompt = generatedPrompts[stage.id];
          const isExpanded = expanded === stage.id;

          return (
            <div
              key={stage.id}
              className={`rounded-xl border-2 transition-all ${
                isEnabled
                  ? 'border-violet-200 dark:border-violet-700/50 bg-violet-50/30 dark:bg-violet-900/10'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-transparent'
              }`}
            >
              <div className="flex items-center gap-3 px-3.5 py-3">
                <Switch
                  checked={isEnabled}
                  onCheckedChange={() => onToggleStage(stage.id)}
                  className="shrink-0"
                />
                <span className={`text-sm font-semibold flex-1 ${isEnabled ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                  {stage.name}
                </span>
                {isEnabled && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 border-0">
                    AI Ativo
                  </Badge>
                )}
                {isEnabled && prompt && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : stage.id)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>

              {isExpanded && prompt && (
                <div className="px-3.5 pb-3 border-t border-violet-100 dark:border-violet-800/30 pt-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-400 mb-1.5">
                    Instrução gerada
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">
                    {prompt.systemPrompt}
                  </p>
                  {prompt.stageGoal && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                      <strong>Objetivo:</strong> {prompt.stageGoal}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Step 4 — Activate
// =============================================================================

interface ActivateStepProps {
  agentMode: 'observe' | 'respond';
  onAgentModeChange: (m: 'observe' | 'respond') => void;
  stages: Stage[];
  goalStageId: string | null;
  onGoalStageChange: (id: string | null) => void;
}

function ActivateStep({ agentMode, onAgentModeChange, stages, goalStageId, onGoalStageChange }: ActivateStepProps) {
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-5">
      {/* Modo de operação */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Modo de operação
        </Label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Recomendamos começar em <strong>Observar</strong> para validar o comportamento antes de ativar respostas automáticas.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onAgentModeChange('observe')}
            className={`p-3 rounded-xl border-2 text-left transition-all ${
              agentMode === 'observe'
                ? 'border-violet-500 dark:border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Eye className={`w-4 h-4 ${agentMode === 'observe' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Observar</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Recomendado</Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Processa e registra o que faria, mas não envia mensagens.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onAgentModeChange('respond')}
            className={`p-3 rounded-xl border-2 text-left transition-all ${
              agentMode === 'respond'
                ? 'border-emerald-500 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Send className={`w-4 h-4 ${agentMode === 'respond' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Responder</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Envia mensagens automaticamente para os leads.
            </p>
          </button>
        </div>
      </div>

      {/* Circuit breaker — até qual estágio o AI atua */}
      {sortedStages.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            O agente para de responder quando o lead chegar em...
          </Label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A partir desse estágio, o atendimento passa para a equipe humana.
          </p>
          <select
            value={goalStageId ?? ''}
            onChange={(e) => onGoalStageChange(e.target.value || null)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">Nunca (age em todos os estágios)</option>
            {sortedStages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function BoardAIConfigModal({
  boardId,
  boardName,
  stages,
  existingConfig,
  onSave,
  onClose,
}: BoardAIConfigModalProps) {
  const { addToast } = useToast();
  const { profile } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>('context');
  const [isSaving, setIsSaving] = useState(false);
  const [personaStatus, setPersonaStatus] = useState<PersonaStatus>('idle');
  const [isNavigating, setIsNavigating] = useState(false);

  // Step 1 — Context
  const [description, setDescription] = useState(existingConfig?.business_context ?? '');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [tone, setTone] = useState<Tone>('amigavel');

  // Step 2 — Goal
  const [goalCategory, setGoalCategory] = useState<GoalCategory | null>(null);
  const [agentGoal, setAgentGoal] = useState(existingConfig?.agent_goal ?? '');
  const [restrictions, setRestrictions] = useState('');
  const [generatedPersona, setGeneratedPersona] = useState(existingConfig?.persona_prompt ?? '');

  // Step 3 — Stages
  const [enabledStages, setEnabledStages] = useState<Set<string>>(
    () => new Set(stages.map((s) => s.id)) // all enabled by default
  );
  const [generatedStagePrompts, setGeneratedStagePrompts] = useState<Record<string, GeneratedStagePrompt>>({});
  const [stageGenStatus, setStageGenStatus] = useState<StageGenStatus>('idle');

  // Step 4 — Activate
  const [agentMode, setAgentMode] = useState<'observe' | 'respond'>(
    existingConfig?.agent_mode ?? 'observe'
  );
  const [goalStageId, setGoalStageId] = useState<string | null>(null);

  // Build the structured business context
  function buildBusinessContext(): string {
    const parts: string[] = [];
    if (description.trim()) parts.push(description.trim());
    if (targetAudience.trim()) parts.push(`Público-alvo: ${targetAudience.trim()}`);
    if (websiteUrl.trim()) parts.push(`Site da empresa: ${websiteUrl.trim()}`);
    const toneLabel = TONE_OPTIONS.find((t) => t.id === tone)?.label;
    if (toneLabel) parts.push(`Tom de comunicação: ${toneLabel}`);
    return parts.join('\n');
  }

  // Build the full agent goal (what + restrictions)
  function buildAgentGoal(): string {
    const parts: string[] = [];
    if (agentGoal.trim()) parts.push(agentGoal.trim());
    if (restrictions.trim()) parts.push(`RESTRIÇÕES:\n${restrictions.trim()}`);
    return parts.join('\n\n');
  }

  async function handleContextNext() {
    if (!description.trim()) {
      addToast('Descreva o negócio antes de continuar.', 'error');
      return;
    }

    // Feedback imediato no botão, depois navega
    setIsNavigating(true);
    await new Promise((r) => setTimeout(r, 150));
    setCurrentStep('goal');
    setIsNavigating(false);

    // Geração de persona em background
    const businessContext = buildBusinessContext();
    setPersonaStatus('loading');
    try {
      const res = await fetch('/api/ai/board-config/generate-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessContext, agentGoal, websiteUrl: websiteUrl.trim() || undefined }),
      });
      if (res.ok) {
        const { personaPrompt } = await res.json() as { personaPrompt: string };
        setGeneratedPersona(personaPrompt);
        setPersonaStatus('success');
      } else {
        setPersonaStatus('error');
      }
    } catch {
      setPersonaStatus('error');
    }
  }

  async function generateStagePrompts() {
    if (!description.trim()) return;
    setStageGenStatus('loading');
    try {
      const res = await fetch('/api/ai/generate-stage-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, businessDescription: buildBusinessContext() }),
      });
      const data = await res.json() as {
        success: boolean;
        stages?: Array<{ stageId?: string; stageName: string; systemPrompt: string; stageGoal: string; advancementCriteria: string[] }>;
      };
      if (res.ok && data.success && data.stages?.length) {
        const prompts: Record<string, GeneratedStagePrompt> = {};
        for (const gen of data.stages) {
          const stageId = gen.stageId || stages.find((s) => s.name === gen.stageName)?.id;
          if (stageId) {
            prompts[stageId] = {
              systemPrompt: gen.systemPrompt,
              stageGoal: gen.stageGoal,
              advancementCriteria: gen.advancementCriteria,
            };
          }
        }
        setGeneratedStagePrompts(prompts);
        setStageGenStatus('success');
      } else {
        setStageGenStatus('error');
      }
    } catch {
      setStageGenStatus('error');
    }
  }

  function handleGoalNext() {
    if (!agentGoal.trim()) {
      addToast('Defina o objetivo do agente antes de continuar.', 'error');
      return;
    }
    setCurrentStep('stages');
    // Auto-gera prompts por estágio em background
    void generateStagePrompts();
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      // 1. Salva board-level config
      await onSave({
        board_id: boardId,
        business_context: buildBusinessContext() || null,
        agent_goal: buildAgentGoal() || null,
        persona_prompt: generatedPersona || null,
        agent_mode: agentMode,
      });

      // 2. Salva stage configs para estágios com prompt gerado
      const stageEntries = Object.entries(generatedStagePrompts);
      if (stageEntries.length > 0 && profile?.organization_id) {
        const upserts = stageEntries.map(([stageId, prompt]) => ({
          organization_id: profile.organization_id!,
          board_id: boardId,
          stage_id: stageId,
          enabled: enabledStages.has(stageId),
          system_prompt: prompt.systemPrompt,
          stage_goal: prompt.stageGoal,
          advancement_criteria: prompt.advancementCriteria,
        }));
        await supabase.from('stage_ai_config').upsert(upserts, { onConflict: 'stage_id' });
      }

      addToast('Agente configurado com sucesso!', 'success');
      onClose();
    } catch {
      addToast('Erro ao salvar configuração.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Configurar Agente — ${boardName}`}
      size="xl"
      bodyClassName="p-0 flex flex-col overflow-hidden"
    >
      <StepIndicator currentStep={currentStep} />

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {currentStep === 'context' && (
          <ContextStep
            description={description}
            onDescriptionChange={setDescription}
            websiteUrl={websiteUrl}
            onWebsiteUrlChange={setWebsiteUrl}
            targetAudience={targetAudience}
            onTargetAudienceChange={setTargetAudience}
            tone={tone}
            onToneChange={setTone}
          />
        )}

        {currentStep === 'goal' && (
          <GoalStep
            category={goalCategory}
            onCategoryChange={setGoalCategory}
            agentGoal={agentGoal}
            onAgentGoalChange={setAgentGoal}
            restrictions={restrictions}
            onRestrictionsChange={setRestrictions}
            personaStatus={personaStatus}
            generatedPersona={generatedPersona}
            websiteUrl={websiteUrl.trim() || undefined}
            businessContext={buildBusinessContext()}
          />
        )}

        {currentStep === 'stages' && (
          <StagesStep
            stages={stages}
            enabledStages={enabledStages}
            onToggleStage={(id) => setEnabledStages((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })}
            generatedPrompts={generatedStagePrompts}
            genStatus={stageGenStatus}
            onRegenerate={() => void generateStagePrompts()}
          />
        )}

        {currentStep === 'activate' && (
          <ActivateStep
            agentMode={agentMode}
            onAgentModeChange={setAgentMode}
            stages={stages}
            goalStageId={goalStageId}
            onGoalStageChange={setGoalStageId}
          />
        )}
      </div>

      <div className={`${MODAL_FOOTER_CLASS} flex items-center justify-between`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (currentStep === 'context') onClose();
            else if (currentStep === 'goal') setCurrentStep('context');
            else if (currentStep === 'stages') setCurrentStep('goal');
            else setCurrentStep('stages');
          }}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {currentStep === 'context' ? 'Cancelar' : 'Voltar'}
        </Button>

        {currentStep === 'context' && (
          <Button size="sm" onClick={handleContextNext} disabled={!description.trim() || isNavigating}>
            {isNavigating
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Carregando...</>
              : <>Próximo <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        )}
        {currentStep === 'goal' && (
          <Button size="sm" onClick={handleGoalNext} disabled={!agentGoal.trim()}>
            Próximo <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
        {currentStep === 'stages' && (
          <Button size="sm" onClick={() => setCurrentStep('activate')}>
            Próximo <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
        {currentStep === 'activate' && (
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Salvando...</>
              : <><Zap className="w-4 h-4 mr-1" /> Ativar Agente</>}
          </Button>
        )}
      </div>
    </Modal>
  );
}

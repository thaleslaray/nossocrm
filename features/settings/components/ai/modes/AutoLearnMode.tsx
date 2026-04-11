'use client';

/**
 * @fileoverview Auto Learn Mode Component
 *
 * Wizard para Few-Shot Learning.
 * Permite selecionar conversas e treinar a AI com padrões aprendidos.
 *
 * @module features/settings/components/ai/modes/AutoLearnMode
 */

import { useState } from 'react';
import { Brain, ArrowRight, ArrowLeft, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { ConversationPicker } from '../ConversationPicker';
import { LearnedPatternsPreview } from '../LearnedPatternsPreview';
import { useLearnedPatternsQuery, useLearnMutation, useClearPatternsMutation } from '@/lib/query/hooks/useLearnedPatternsQuery';
import type { OrgAIConfig } from '@/lib/query/hooks/useAIConfigQuery';

// =============================================================================
// Types
// =============================================================================

interface AutoLearnModeProps {
  config: OrgAIConfig | null | undefined;
}

type WizardStep = 'intro' | 'select' | 'learning' | 'review';

// =============================================================================
// Component
// =============================================================================

export function AutoLearnMode({ config }: AutoLearnModeProps) {
  const [step, setStep] = useState<WizardStep>('intro');
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);

  const { data: patterns, isLoading: isLoadingPatterns } = useLearnedPatternsQuery();
  const learnMutation = useLearnMutation();
  const clearMutation = useClearPatternsMutation();

  // Se já tem padrões, mostrar review
  const hasPatterns = patterns && patterns.learnedCriteria && patterns.learnedCriteria.length > 0;

  const handleStartLearning = async () => {
    if (selectedConversations.length < 2) return;

    setStep('learning');

    try {
      await learnMutation.mutateAsync(selectedConversations);
      setStep('review');
    } catch (error) {
      console.error('[AutoLearnMode] Learning failed:', error);
      setStep('select');
    }
  };

  const handleClear = async () => {
    await clearMutation.mutateAsync();
    setStep('intro');
    setSelectedConversations([]);
  };

  const handleRetrain = () => {
    setStep('select');
    setSelectedConversations([]);
  };

  // Loading state
  if (isLoadingPatterns) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Se já tem padrões e está no intro, mostrar review
  if (hasPatterns && step === 'intro') {
    return (
      <div className="space-y-6">
        <LearnedPatternsPreview
          patterns={patterns ?? null}
          onClear={handleClear}
          onRetrain={handleRetrain}
          isClearing={clearMutation.isPending}
        />
      </div>
    );
  }

  // Render based on step
  switch (step) {
    case 'intro':
      return <IntroStep onStart={() => setStep('select')} />;

    case 'select':
      return (
        <SelectStep
          selectedConversations={selectedConversations}
          onSelectionChange={setSelectedConversations}
          onBack={() => setStep('intro')}
          onNext={handleStartLearning}
          isLoading={learnMutation.isPending}
          error={learnMutation.error?.message}
        />
      );

    case 'learning':
      return <LearningStep />;

    case 'review':
      return (
        <div className="space-y-6">
          <SuccessMessage />
          <LearnedPatternsPreview
            patterns={patterns ?? null}
            onClear={handleClear}
            onRetrain={handleRetrain}
            isClearing={clearMutation.isPending}
          />
        </div>
      );

    default:
      return null;
  }
}

// =============================================================================
// Intro Step
// =============================================================================

interface IntroStepProps {
  onStart: () => void;
}

function IntroStep({ onStart }: IntroStepProps) {
  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 mb-4">
          <Brain className="h-8 w-8 text-primary-600 dark:text-primary-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Ensine a IA com suas conversas
        </h3>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Selecione 2-10 conversas bem-sucedidas e a IA vai aprender seu estilo de vendas,
          perguntas de qualificação e técnicas de fechamento.
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FeatureCard
          icon={<Sparkles className="h-5 w-5" />}
          title="Estilo Personalizado"
          description="Aprende seu tom e forma de comunicação"
        />
        <FeatureCard
          icon={<Brain className="h-5 w-5" />}
          title="Critérios Automáticos"
          description="Extrai critérios de qualificação das conversas"
        />
        <FeatureCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Melhora Contínua"
          description="Retreine a qualquer momento com novas conversas"
        />
      </div>

      {/* CTA */}
      <div className="flex justify-center">
        <Button onClick={onStart} size="lg">
          Começar Aprendizado
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {/* Tip */}
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertDescription>
          <strong>Dica:</strong> Escolha conversas de deals ganhos com boa troca de mensagens.
          Quanto mais representativas as conversas, melhor será o aprendizado.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// =============================================================================
// Select Step
// =============================================================================

interface SelectStepProps {
  selectedConversations: string[];
  onSelectionChange: (ids: string[]) => void;
  onBack: () => void;
  onNext: () => void;
  isLoading: boolean;
  error?: string;
}

function SelectStep({
  selectedConversations,
  onSelectionChange,
  onBack,
  onNext,
  isLoading,
  error,
}: SelectStepProps) {
  const canProceed = selectedConversations.length >= 2;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ConversationPicker
        selectedIds={selectedConversations}
        onSelectionChange={onSelectionChange}
        minRequired={2}
        maxAllowed={10}
      />

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <Button onClick={onNext} disabled={!canProceed || isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Aprendendo...
            </>
          ) : (
            <>
              Iniciar Aprendizado
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Learning Step
// =============================================================================

function LearningStep() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="absolute inset-0 animate-ping">
          <Brain className="h-16 w-16 text-primary-200" />
        </div>
        <Brain className="h-16 w-16 text-primary-500 relative" />
      </div>

      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mt-6 mb-2">
        Aprendendo com suas conversas...
      </h3>
      <p className="text-slate-500 dark:text-slate-400 text-center max-w-sm">
        A IA está analisando as conversas selecionadas para extrair padrões de vendas,
        critérios de qualificação e técnicas de comunicação.
      </p>

      <div className="flex items-center gap-2 mt-6 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Isso pode levar alguns segundos
      </div>
    </div>
  );
}

// =============================================================================
// Success Message
// =============================================================================

function SuccessMessage() {
  return (
    <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-500/30">
      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      <AlertDescription className="text-green-800 dark:text-green-200">
        Padrões aprendidos com sucesso! A IA agora usará esses padrões para responder leads.
      </AlertDescription>
    </Alert>
  );
}

// =============================================================================
// Feature Card
// =============================================================================

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-3">
        {icon}
      </div>
      <h4 className="font-medium text-slate-900 dark:text-white mb-1">{title}</h4>
      <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

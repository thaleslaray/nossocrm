import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AIConfigModeSelector, type AIConfigMode } from '@/features/settings/components/ai/AIConfigModeSelector';
import { AIOnboarding } from '@/features/settings/components/ai/AIOnboarding';
import { runStorySteps } from './storyRunner';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', role: 'admin', organization_id: 'org-1' },
  }),
}));

vi.mock('@/context/CRMContext', () => ({
  useCRM: () => ({
    aiKeyConfigured: true,
  }),
}));

const mockUpdateConfig = vi.fn().mockResolvedValue({});
const mockProvisionStages = vi.fn().mockResolvedValue({});

vi.mock('@/lib/query/hooks/useAIConfigQuery', () => ({
  useAIConfigQuery: () => ({
    data: { ai_config_mode: 'zero_config' },
    isLoading: false,
    error: null,
  }),
  useUpdateAIConfigMutation: () => ({
    mutateAsync: mockUpdateConfig,
    isPending: false,
  }),
  useProvisionStagesMutation: () => ({
    mutateAsync: mockProvisionStages,
    isPending: false,
  }),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// =============================================================================
// Story: US-AI-001 — Seleção de Modo de Configuração de IA
// =============================================================================

describe('Story — US-AI-001: AI Configuration Mode Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AIConfigModeSelector', () => {
    it('renders all 4 configuration modes', () => {
      const onModeChange = vi.fn();

      render(
        <AIConfigModeSelector
          currentMode="zero_config"
          onModeChange={onModeChange}
        />
      );

      // Verify all modes are visible
      expect(screen.getByText('Automático')).toBeTruthy();
      expect(screen.getByText('Templates')).toBeTruthy();
      expect(screen.getByText('Aprender')).toBeTruthy();
      expect(screen.getByText('Avançado')).toBeTruthy();
    });

    it('highlights the currently active mode', () => {
      const onModeChange = vi.fn();

      const { container } = render(
        <AIConfigModeSelector
          currentMode="template"
          onModeChange={onModeChange}
        />
      );

      // Check for active indicator (CheckCircle icon) in template mode
      const templateButton = screen.getByText('Templates').closest('button');
      expect(templateButton?.className).toContain('border-primary');
    });

    it('calls onModeChange when clicking a different mode', async () => {
      const user = userEvent.setup();
      const onModeChange = vi.fn();

      render(
        <AIConfigModeSelector
          currentMode="zero_config"
          onModeChange={onModeChange}
        />
      );

      // Click on Templates mode
      const templatesButton = screen.getByText('Templates').closest('button');
      await user.click(templatesButton!);

      expect(onModeChange).toHaveBeenCalledWith('template');
    });

    it('shows "Recomendado" badge on Zero Config mode', () => {
      render(
        <AIConfigModeSelector
          currentMode="template"
          onModeChange={vi.fn()}
        />
      );

      expect(screen.getByText('Recomendado')).toBeTruthy();
    });

    it('allows navigating through modes with keyboard', async () => {
      const user = userEvent.setup();
      const onModeChange = vi.fn();

      render(
        <AIConfigModeSelector
          currentMode="zero_config"
          onModeChange={onModeChange}
        />
      );

      // Focus first button and navigate
      const autoButton = screen.getByText('Automático').closest('button');
      autoButton?.focus();

      // Tab to next mode
      await user.tab();

      // Should be able to navigate between modes
      expect(document.activeElement?.tagName).toBe('BUTTON');
    });
  });

  describe('AIOnboarding', () => {
    it('renders the onboarding wizard with all mode options', () => {
      const onComplete = vi.fn();

      render(
        <TestWrapper>
          <AIOnboarding onComplete={onComplete} />
        </TestWrapper>
      );

      // Header
      expect(screen.getByText('Configure seu AI Agent')).toBeTruthy();

      // All 4 modes
      expect(screen.getByText('Começar Automático')).toBeTruthy();
      expect(screen.getByText('Escolher Metodologia')).toBeTruthy();
      expect(screen.getByText('Ensinar com Exemplos')).toBeTruthy();
      expect(screen.getByText('Configurar Manualmente')).toBeTruthy();

      // Continue button (disabled by default)
      const continueButton = screen.getByText('Continuar');
      expect(continueButton.closest('button')).toBeDisabled();
    });

    it('enables continue button after selecting a mode', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();

      render(
        <TestWrapper>
          <AIOnboarding onComplete={onComplete} />
        </TestWrapper>
      );

      // Select first mode
      const autoMode = screen.getByText('Começar Automático').closest('button');
      await user.click(autoMode!);

      // Continue should be enabled now
      const continueButton = screen.getByText('Continuar').closest('button');
      expect(continueButton).not.toBeDisabled();
    });

    it('calls onComplete with selected mode after clicking continue', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();

      render(
        <TestWrapper>
          <AIOnboarding onComplete={onComplete} />
        </TestWrapper>
      );

      // Select template mode
      const templateMode = screen.getByText('Escolher Metodologia').closest('button');
      await user.click(templateMode!);

      // Click continue
      const continueButton = screen.getByText('Continuar').closest('button');
      await user.click(continueButton!);

      // Wait for mutation
      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith({ ai_config_mode: 'template' });
      });

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith('template');
      });
    });

    it('shows "Recomendado" badge on auto mode and "Avançado" badge on manual mode', () => {
      render(
        <TestWrapper>
          <AIOnboarding onComplete={vi.fn()} />
        </TestWrapper>
      );

      expect(screen.getByText('Recomendado')).toBeTruthy();
      expect(screen.getByText('Avançado')).toBeTruthy();
    });

    it('displays feature list for each mode', () => {
      render(
        <TestWrapper>
          <AIOnboarding onComplete={vi.fn()} />
        </TestWrapper>
      );

      // Zero Config features
      expect(screen.getByText('Qualificação BANT automática')).toBeTruthy();
      expect(screen.getByText('Avanço de estágio inteligente')).toBeTruthy();

      // Template features
      expect(screen.getByText('5 metodologias pré-definidas')).toBeTruthy();

      // Auto-learn features
      expect(screen.getByText('Aprende com 2-10 conversas')).toBeTruthy();

      // Advanced features
      expect(screen.getByText('Prompt customizado por estágio')).toBeTruthy();
    });

    it('shows visual selection indicator when mode is selected', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <AIOnboarding onComplete={vi.fn()} />
        </TestWrapper>
      );

      // Select auto-learn mode
      const learnMode = screen.getByText('Ensinar com Exemplos').closest('button');
      await user.click(learnMode!);

      // Mode card should have selected styling
      expect(learnMode?.className).toContain('border-primary');
    });
  });
});

// =============================================================================
// Story: US-AI-002 — Mode Switching Workflow
// =============================================================================

describe('Story — US-AI-002: Mode Switching Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('simulates complete mode selection flow without errors', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <AIConfigModeSelector
        currentMode="zero_config"
        onModeChange={onModeChange}
      />
    );

    // Verify no errors
    await runStorySteps(user, [
      { kind: 'expectNotText', text: /Application error/i },
      { kind: 'expectNotText', text: /Error/i },
    ]);

    // User selects Templates mode
    await user.click(screen.getByText('Templates').closest('button')!);
    expect(onModeChange).toHaveBeenCalledWith('template');

    // User selects Learn mode
    await user.click(screen.getByText('Aprender').closest('button')!);
    expect(onModeChange).toHaveBeenCalledWith('auto_learn');

    // User selects Advanced mode
    await user.click(screen.getByText('Avançado').closest('button')!);
    expect(onModeChange).toHaveBeenCalledWith('advanced');

    // User returns to Automático
    await user.click(screen.getByText('Automático').closest('button')!);
    expect(onModeChange).toHaveBeenCalledWith('zero_config');

    // Verify no errors after all interactions
    await runStorySteps(user, [
      { kind: 'expectNotText', text: /Application error/i },
    ]);
  });

  it('simulates complete onboarding flow without errors', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(
      <TestWrapper>
        <AIOnboarding onComplete={onComplete} />
      </TestWrapper>
    );

    // Verify initial state
    await runStorySteps(user, [
      { kind: 'expectText', text: 'Configure seu AI Agent' },
      { kind: 'expectNotText', text: /Application error/i },
    ]);

    // Select auto-learn mode (most complex)
    await user.click(screen.getByText('Ensinar com Exemplos').closest('button')!);

    // Verify selection
    const continueButton = screen.getByText('Continuar').closest('button');
    expect(continueButton).not.toBeDisabled();

    // Complete onboarding
    await user.click(continueButton!);

    // Wait for completion
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('auto_learn');
    });

    // Verify no errors
    await runStorySteps(user, [
      { kind: 'expectNotText', text: /Application error/i },
    ]);
  });
});

// =============================================================================
// Story: US-AI-003 — Accessibility
// =============================================================================

describe('Story — US-AI-003: Accessibility', () => {
  it('mode selector has proper button roles', () => {
    render(
      <AIConfigModeSelector
        currentMode="zero_config"
        onModeChange={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(4); // 4 mode buttons
  });

  it('onboarding has proper button roles and can be keyboard navigated', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <AIOnboarding onComplete={vi.fn()} />
      </TestWrapper>
    );

    // All mode cards should be buttons
    const modeButtons = screen.getAllByRole('button');
    expect(modeButtons.length).toBeGreaterThanOrEqual(4); // 4 modes + continue

    // Tab through buttons
    await user.tab();
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });

  it('disabled continue button has proper aria state', () => {
    render(
      <TestWrapper>
        <AIOnboarding onComplete={vi.fn()} />
      </TestWrapper>
    );

    const continueButton = screen.getByText('Continuar').closest('button');
    expect(continueButton).toBeDisabled();
  });
});

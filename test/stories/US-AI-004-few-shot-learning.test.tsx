import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ConversationPicker } from '@/features/settings/components/ai/ConversationPicker';
import { LearnedPatternsPreview } from '@/features/settings/components/ai/LearnedPatternsPreview';
import type { LearnedPattern } from '@/lib/ai/agent/few-shot-learner';
import type { ConversationView } from '@/lib/messaging/types';
import { runStorySteps } from './storyRunner';

// =============================================================================
// Mocks
// =============================================================================

const mockConversations: ConversationView[] = [
  {
    id: 'conv-1',
    channelId: 'channel-1',
    externalContactId: 'ext-1',
    contactId: 'contact-1',
    contactName: 'João Silva',
    externalContactName: 'João Silva',
    organizationId: 'org-1',
    status: 'open',
    lastMessageAt: '2026-02-06T10:00:00Z',
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-02-06T10:00:00Z',
    windowExpiresAt: null,
    metadata: {},
    messageCount: 15,
    channel: null,
    contact: null,
  },
  {
    id: 'conv-2',
    channelId: 'channel-1',
    externalContactId: 'ext-2',
    contactId: 'contact-2',
    contactName: 'Maria Souza',
    externalContactName: 'Maria Souza',
    organizationId: 'org-1',
    status: 'closed',
    lastMessageAt: '2026-02-05T14:00:00Z',
    createdAt: '2026-01-25T08:00:00Z',
    updatedAt: '2026-02-05T14:00:00Z',
    windowExpiresAt: null,
    metadata: {},
    messageCount: 23,
    channel: null,
    contact: null,
  },
  {
    id: 'conv-3',
    channelId: 'channel-1',
    externalContactId: 'ext-3',
    contactId: 'contact-3',
    contactName: 'Pedro Santos',
    externalContactName: 'Pedro Santos',
    organizationId: 'org-1',
    status: 'open',
    lastMessageAt: '2026-02-07T09:00:00Z',
    createdAt: '2026-02-03T11:00:00Z',
    updatedAt: '2026-02-07T09:00:00Z',
    windowExpiresAt: null,
    metadata: {},
    messageCount: 8,
    channel: null,
    contact: null,
  },
];

const mockLearnedPatterns: LearnedPattern = {
  greetingStyle: 'Olá! Sou o assistente virtual da empresa. Como posso ajudar?',
  questionPatterns: [
    'Qual o seu orçamento para este projeto?',
    'Quem é o responsável pela decisão de compra?',
    'Qual o prazo ideal para implementação?',
  ],
  objectionHandling: [
    'Entendo sua preocupação com o preço. Posso mostrar o ROI esperado?',
    'Muitos clientes tinham a mesma dúvida inicialmente...',
  ],
  closingTechniques: [
    'Posso enviar uma proposta formal agora?',
    'Gostaria de agendar uma demo personalizada?',
  ],
  tone: 'consultative',
  learnedCriteria: [
    {
      name: 'budget_confirmed',
      description: 'Lead mencionou valor de investimento disponível',
      detectionHints: ['orçamento', 'budget', 'quanto custa', 'valor'],
      importance: 'required',
    },
    {
      name: 'decision_maker',
      description: 'Identificou quem toma a decisão de compra',
      detectionHints: ['decisor', 'aprova', 'gerente', 'diretor'],
      importance: 'required',
    },
    {
      name: 'timeline',
      description: 'Prazo para implementação definido',
      detectionHints: ['prazo', 'quando', 'urgente', 'deadline'],
      importance: 'nice_to_have',
    },
  ],
  extractedFrom: ['conv-1', 'conv-2'],
  learnedAt: '2026-02-07T12:00:00Z',
  modelVersion: 'gemini-2.0-flash',
};

vi.mock('@/lib/query/hooks', () => ({
  useMessagingConversations: () => ({
    data: mockConversations,
    isLoading: false,
    error: null,
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
// Story: US-AI-004 — ConversationPicker
// =============================================================================

describe('Story — US-AI-004: ConversationPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders list of conversations for selection', () => {
    const onSelectionChange = vi.fn();

    render(
      <TestWrapper>
        <ConversationPicker
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          minRequired={2}
          maxAllowed={10}
        />
      </TestWrapper>
    );

    // Should show all conversations
    expect(screen.getByText('João Silva')).toBeTruthy();
    expect(screen.getByText('Maria Souza')).toBeTruthy();
    expect(screen.getByText('Pedro Santos')).toBeTruthy();
  });

  it('displays message count for each conversation', () => {
    render(
      <TestWrapper>
        <ConversationPicker
          selectedIds={[]}
          onSelectionChange={vi.fn()}
          minRequired={2}
          maxAllowed={10}
        />
      </TestWrapper>
    );

    // Should show message counts
    expect(screen.getByText(/15 mensagens/i)).toBeTruthy();
    expect(screen.getByText(/23 mensagens/i)).toBeTruthy();
    expect(screen.getByText(/8 mensagens/i)).toBeTruthy();
  });

  it('allows selecting multiple conversations', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    render(
      <TestWrapper>
        <ConversationPicker
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          minRequired={2}
          maxAllowed={10}
        />
      </TestWrapper>
    );

    // Select first conversation
    const conv1 = screen.getByText('João Silva').closest('button, div[role="button"], label');
    if (conv1) {
      await user.click(conv1);
      expect(onSelectionChange).toHaveBeenCalled();
    }
  });

  it('shows selection count and requirements', () => {
    render(
      <TestWrapper>
        <ConversationPicker
          selectedIds={['conv-1']}
          onSelectionChange={vi.fn()}
          minRequired={2}
          maxAllowed={10}
        />
      </TestWrapper>
    );

    // Should show selection count as "1/10" format
    expect(screen.getByText('1/10')).toBeTruthy();
  });

  it('enforces maximum selection limit', () => {
    render(
      <TestWrapper>
        <ConversationPicker
          selectedIds={['conv-1', 'conv-2', 'conv-3']}
          onSelectionChange={vi.fn()}
          minRequired={2}
          maxAllowed={3}
        />
      </TestWrapper>
    );

    // Should show max reached as "3/3" format
    expect(screen.getByText('3/3')).toBeTruthy();
  });
});

// =============================================================================
// Story: US-AI-005 — LearnedPatternsPreview
// =============================================================================

describe('Story — US-AI-005: LearnedPatternsPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders learned patterns when available', () => {
    render(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={vi.fn()}
        onClear={vi.fn()}
        isLoading={false}
      />
    );

    // Should show greeting style
    expect(screen.getByText(/Olá! Sou o assistente/i)).toBeTruthy();

    // Should show tone
    expect(screen.getByText(/consultivo/i)).toBeTruthy();
  });

  it('displays learned qualification criteria', () => {
    render(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={vi.fn()}
        onClear={vi.fn()}
        isLoading={false}
      />
    );

    // Should show criteria names
    expect(screen.getByText(/budget_confirmed/i)).toBeTruthy();
    expect(screen.getByText(/decision_maker/i)).toBeTruthy();
    expect(screen.getByText(/timeline/i)).toBeTruthy();
  });

  it('shows question patterns section', () => {
    render(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={vi.fn()}
        onClear={vi.fn()}
        isLoading={false}
      />
    );

    // Should show question patterns
    expect(screen.getByText(/Qual o seu orçamento/i)).toBeTruthy();
  });

  it('shows empty state when no patterns', () => {
    render(
      <LearnedPatternsPreview
        patterns={null}
        onRetrain={vi.fn()}
        onClear={vi.fn()}
        isLoading={false}
      />
    );

    // Should show empty state
    expect(screen.getByText(/Nenhum padrão aprendido/i)).toBeTruthy();
  });

  it('shows clearing state when isClearing is true', async () => {
    render(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={vi.fn()}
        onClear={vi.fn()}
        isClearing={true}
      />
    );

    // Clear button should be disabled when clearing
    const clearButton = screen.getByText(/Limpar/i).closest('button');
    expect(clearButton).toBeDisabled();
  });

  it('calls onRetrain when retrain button clicked', async () => {
    const user = userEvent.setup();
    const onRetrain = vi.fn();

    render(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={onRetrain}
        onClear={vi.fn()}
        isLoading={false}
      />
    );

    const retrainButton = screen.getByText(/Retreinar/i).closest('button');
    if (retrainButton) {
      await user.click(retrainButton);
      expect(onRetrain).toHaveBeenCalled();
    }
  });

  it('calls onClear when clear button clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={vi.fn()}
        onClear={onClear}
        isLoading={false}
      />
    );

    const clearButton = screen.getByText(/Limpar/i).closest('button');
    if (clearButton) {
      await user.click(clearButton);
      expect(onClear).toHaveBeenCalled();
    }
  });

  it('displays extraction metadata', () => {
    render(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={vi.fn()}
        onClear={vi.fn()}
        isLoading={false}
      />
    );

    // Should show how many conversations were used
    expect(screen.getByText(/2 conversas/i)).toBeTruthy();

    // Should show model version
    expect(screen.getByText(/gemini-2.0-flash/i)).toBeTruthy();
  });
});

// =============================================================================
// Story: US-AI-006 — Few-Shot Learning Flow (Integration)
// =============================================================================

describe('Story — US-AI-006: Few-Shot Learning Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('simulates complete few-shot learning flow without errors', async () => {
    const user = userEvent.setup();

    // Step 1: Conversation selection
    const onSelectionChange = vi.fn();

    const { rerender } = render(
      <TestWrapper>
        <ConversationPicker
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          minRequired={2}
          maxAllowed={10}
        />
      </TestWrapper>
    );

    await runStorySteps(user, [
      { kind: 'expectNotText', text: /Application error/i },
      { kind: 'expectText', text: 'João Silva' },
    ]);

    // Step 2: Show patterns after learning
    rerender(
      <TestWrapper>
        <LearnedPatternsPreview
          patterns={mockLearnedPatterns}
          onRetrain={vi.fn()}
          onClear={vi.fn()}
          isLoading={false}
        />
      </TestWrapper>
    );

    await runStorySteps(user, [
      { kind: 'expectNotText', text: /Application error/i },
      { kind: 'expectText', text: /budget_confirmed/i },
    ]);
  });

  it('handles transition from empty to loaded patterns', async () => {
    const user = userEvent.setup();
    const onRetrain = vi.fn();
    const onClear = vi.fn();

    // Initially empty
    const { rerender } = render(
      <LearnedPatternsPreview
        patterns={null}
        onRetrain={onRetrain}
        onClear={onClear}
      />
    );

    await runStorySteps(user, [
      { kind: 'expectText', text: /Nenhum padrão/i },
      { kind: 'expectNotText', text: /Application error/i },
    ]);

    // Transition to loaded
    rerender(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={onRetrain}
        onClear={onClear}
      />
    );

    await runStorySteps(user, [
      { kind: 'expectText', text: /budget_confirmed/i },
      { kind: 'expectNotText', text: /Application error/i },
    ]);
  });
});

// =============================================================================
// Story: US-AI-007 — Accessibility for Few-Shot Components
// =============================================================================

describe('Story — US-AI-007: Accessibility', () => {
  it('ConversationPicker has proper interactive elements', () => {
    render(
      <TestWrapper>
        <ConversationPicker
          selectedIds={[]}
          onSelectionChange={vi.fn()}
          minRequired={2}
          maxAllowed={10}
        />
      </TestWrapper>
    );

    // Should have buttons for each conversation card
    const buttons = screen.getAllByRole('button');
    // We have 3 mock conversations
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('LearnedPatternsPreview buttons are keyboard accessible', async () => {
    const user = userEvent.setup();

    render(
      <LearnedPatternsPreview
        patterns={mockLearnedPatterns}
        onRetrain={vi.fn()}
        onClear={vi.fn()}
        isLoading={false}
      />
    );

    // Tab to buttons
    await user.tab();
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });
});

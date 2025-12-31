import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DealDetailModal } from '@/features/boards/components/Modals/DealDetailModal';
import { runStorySteps } from './storyRunner';

// Story: US-001 — Abrir um deal no Boards
// User Story: Abrir deal no Boards sem crash

vi.mock('@/hooks/useResponsiveMode', () => ({
  useResponsiveMode: () => ({ mode: 'desktop' }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', role: 'admin', email: 'test@example.com', organization_id: 'org-1' },
  }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/lib/query/hooks', () => ({
  useMoveDealSimple: () => ({ moveDeal: vi.fn() }),
}));

vi.mock('@/lib/a11y', () => ({
  FocusTrap: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFocusReturn: () => undefined,
}));

vi.mock('@/components/ConfirmModal', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/LossReasonModal', () => ({
  LossReasonModal: () => null,
}));

vi.mock('@/features/boards/components/DealSheet', () => ({
  DealSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/boards/components/StageProgressBar', () => ({
  StageProgressBar: () => null,
}));

vi.mock('@/features/activities/components/ActivityRow', () => ({
  ActivityRow: () => null,
}));

vi.mock('@/lib/ai/tasksClient', () => ({
  analyzeLead: vi.fn(),
  generateEmailDraft: vi.fn(),
  generateObjectionResponse: vi.fn(),
}));

vi.mock('@/context/CRMContext', () => ({
  useCRM: () => {
    const board = {
      id: 'board-1',
      name: 'Pipeline de Vendas',
      stages: [{ id: 'stage-1', label: 'Novo', order: 0, linkedLifecycleStage: 'MQL' }],
      wonStageId: null,
      lostStageId: null,
      wonStayInStage: false,
      lostStayInStage: false,
      defaultProductId: null,
      agentPersona: null,
      goal: null,
    };

    const deal = {
      id: 'deal-1',
      title: 'Pequeno Chapéu',
      value: 1000,
      status: 'stage-1',
      boardId: 'board-1',
      contactId: 'contact-1',
      companyName: 'Moreira Comércio',
      contactName: 'Fulano',
      contactEmail: 'fulano@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      probability: 50,
      tags: [],
      items: [],
      customFields: {},
      isWon: false,
      isLost: false,
      closedAt: undefined,
      lossReason: undefined,
    };

    return {
      deals: [deal],
      contacts: [{ id: 'contact-1', stage: null }],
      updateDeal: vi.fn(),
      deleteDeal: vi.fn(),
      activities: [],
      addActivity: vi.fn(),
      updateActivity: vi.fn(),
      deleteActivity: vi.fn(),
      products: [],
      addItemToDeal: vi.fn(),
      removeItemFromDeal: vi.fn(),
      customFieldDefinitions: [],
      activeBoard: board,
      boards: [board],
      lifecycleStages: [],
    };
  },
}));

describe('Story — US-001: Abrir deal no Boards', () => {
  it('simula a história e garante que não quebra', async () => {
    const user = userEvent.setup();

    const Harness = ({ open }: { open: boolean }) => (
      <div>
        <DealDetailModal dealId="deal-1" isOpen={open} onClose={() => {}} />
      </div>
    );

    const { rerender } = render(<Harness open={false} />);

    // Step runner: we "open" by rerendering to simulate the user story action that triggers the modal.
    await runStorySteps(user, [
      { kind: 'expectNotText', text: /Application error/i },
    ]);

    rerender(<Harness open={true} />);

    await runStorySteps(user, [
      { kind: 'expectText', text: 'Pequeno Chapéu' },
      { kind: 'expectNotText', text: /Application error/i },
    ]);

    rerender(<Harness open={false} />);
    expect(document.body.textContent).not.toMatch(/Application error/i);
  });
});



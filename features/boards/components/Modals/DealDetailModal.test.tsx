import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { DealDetailModal } from './DealDetailModal';

// Keep this test focused: we only want to ensure opening/closing the modal
// never crashes due to hook-order issues (React error #310).

vi.mock('@/hooks/useResponsiveMode', () => ({
  useResponsiveMode: () => ({ mode: 'desktop' }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', role: 'admin', email: 'test@example.com', organization_id: 'org-1' },
  }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
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

vi.mock('../DealSheet', () => ({
  DealSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../StageProgressBar', () => ({
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
      stages: [
        { id: 'stage-1', label: 'Novo', order: 0, linkedLifecycleStage: 'MQL' },
      ],
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

describe('DealDetailModal', () => {
  it('does not crash when toggling open/close (hook order regression)', () => {
    const { rerender } = render(
      <DealDetailModal dealId="deal-1" isOpen={false} onClose={() => {}} />
    );

    expect(document.body.textContent).not.toContain('Application error');

    rerender(<DealDetailModal dealId="deal-1" isOpen={true} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Pequeno Chapéu');

    rerender(<DealDetailModal dealId="deal-1" isOpen={false} onClose={() => {}} />);
    expect(document.body.textContent).not.toContain('Application error');
  });
});



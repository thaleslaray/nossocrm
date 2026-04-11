/**
 * @fileoverview US-AI-008 — Dashboard AI Metrics Tests
 *
 * Testa AIMetricsSection.tsx (component) e useAIMetricsQuery.ts (hook).
 *
 * @module test/stories/US-AI-008-dashboard-metrics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Mocks
// =============================================================================

let mockProfile: {
  id: string;
  role: string;
  organization_id: string | null;
} = {
  id: 'user-1',
  role: 'admin',
  organization_id: 'org-1',
};

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: mockProfile.id },
    profile: mockProfile,
  }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock supabase for hook tests
const mockLogsData: Array<{
  action_taken: string;
  tokens_used: number | null;
  model_used: string | null;
  created_at: string;
}> = [];

const mockHitlData: Array<{
  status: string;
  confidence: number;
}> = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'ai_conversation_log') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockLogsData,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'ai_pending_stage_advances') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: mockHitlData,
              error: null,
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  },
}));

// =============================================================================
// Helpers
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// =============================================================================
// Mock data factory for AIMetrics
// =============================================================================

interface MockAIMetrics {
  conversations: {
    today: { total: number; responded: number; advancedStage: number; handoff: number; skipped: number };
    thisWeek: { total: number; responded: number; advancedStage: number; handoff: number; skipped: number };
    thisMonth: { total: number; responded: number; advancedStage: number; handoff: number; skipped: number };
    total: { total: number; responded: number; advancedStage: number; handoff: number; skipped: number };
  };
  hitl: {
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    autoApproved: number;
    approvalRate: number;
    avgConfidence: number;
  };
  tokensUsed: { today: number; thisWeek: number; thisMonth: number };
  modelBreakdown: Record<string, number>;
}

function createMockMetrics(
  overrides: Partial<MockAIMetrics> = {}
): MockAIMetrics {
  return {
    conversations: overrides.conversations ?? {
      today: { total: 5, responded: 3, advancedStage: 1, handoff: 1, skipped: 0 },
      thisWeek: { total: 25, responded: 15, advancedStage: 5, handoff: 3, skipped: 2 },
      thisMonth: { total: 42, responded: 25, advancedStage: 8, handoff: 5, skipped: 4 },
      total: { total: 42, responded: 25, advancedStage: 8, handoff: 5, skipped: 4 },
    },
    hitl: overrides.hitl ?? {
      pending: 3,
      approved: 15,
      rejected: 5,
      expired: 2,
      autoApproved: 10,
      approvalRate: 75,
      avgConfidence: 0.82,
    },
    tokensUsed: overrides.tokensUsed ?? {
      today: 1200,
      thisWeek: 8500,
      thisMonth: 32000,
    },
    modelBreakdown: overrides.modelBreakdown ?? {
      'gemini-2.0-flash': 30,
      'gpt-4o-mini': 12,
    },
  };
}

// =============================================================================
// AIMetricsSection Component — mock state (module-level for vi.mock hoisting)
// =============================================================================

const metricsState = {
  data: null as MockAIMetrics | null,
  isLoading: false,
  error: null as Error | null,
};

vi.mock('@/lib/query/hooks', () => ({
  useAIMetricsQuery: () => ({
    data: metricsState.data,
    isLoading: metricsState.isLoading,
    error: metricsState.error,
  }),
}));

// =============================================================================
// AIMetricsSection Component Tests
// =============================================================================

describe('US-AI-008: AIMetricsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile = { id: 'user-1', role: 'admin', organization_id: 'org-1' };
    metricsState.data = createMockMetrics();
    metricsState.isLoading = false;
    metricsState.error = null;
  });

  async function renderSection() {
    const { AIMetricsSection } = await import(
      '@/features/dashboard/components/AIMetricsSection'
    );
    return render(
      <TestWrapper>
        <AIMetricsSection />
      </TestWrapper>
    );
  }

  it('renderiza 4 cards de metricas', async () => {
    await renderSection();

    expect(screen.getByText('Conversas Hoje')).toBeTruthy();
    expect(screen.getByText('HITL Pendentes')).toBeTruthy();
    expect(screen.getByText('Taxa Aprovação HITL')).toBeTruthy();
    expect(screen.getByText('Auto-Avanços')).toBeTruthy();
  });

  it('mostra zeros quando sem dados', async () => {
    metricsState.data = createMockMetrics({
      conversations: {
        today: { total: 0, responded: 0, advancedStage: 0, handoff: 0, skipped: 0 },
        thisWeek: { total: 0, responded: 0, advancedStage: 0, handoff: 0, skipped: 0 },
        thisMonth: { total: 0, responded: 0, advancedStage: 0, handoff: 0, skipped: 0 },
        total: { total: 0, responded: 0, advancedStage: 0, handoff: 0, skipped: 0 },
      },
      hitl: {
        pending: 0,
        approved: 0,
        rejected: 0,
        expired: 0,
        autoApproved: 0,
        approvalRate: 0,
        avgConfidence: 0,
      },
    });

    await renderSection();

    // When thisMonth.total === 0, component shows empty state instead
    expect(
      screen.getByText('Nenhuma conversa AI registrada ainda')
    ).toBeTruthy();
  });

  it('mostra valores corretos quando tem dados', async () => {
    metricsState.data = createMockMetrics();

    await renderSection();

    // Conversas Hoje = 5
    expect(screen.getByText('5')).toBeTruthy();

    // HITL Pendentes = 3
    expect(screen.getByText('3')).toBeTruthy();

    // Taxa Aprovação = 75%
    expect(screen.getByText('75%')).toBeTruthy();

    // Auto-Avanços = 8 (thisMonth.advancedStage)
    expect(screen.getByText('8')).toBeTruthy();
  });

  it('barra de distribuicao mostra percentuais', async () => {
    metricsState.data = createMockMetrics();

    await renderSection();

    // Check distribution bar labels
    expect(screen.getByText(/Respondidas \(25\)/)).toBeTruthy();
    expect(screen.getByText(/Avançou \(8\)/)).toBeTruthy();
    expect(screen.getByText(/Handoff \(5\)/)).toBeTruthy();

    // Total text
    expect(screen.getByText(/Total: 42 interações/)).toBeTruthy();
  });

  it('nao renderiza sem orgId', async () => {
    metricsState.data = null;
    metricsState.error = new Error('No organization');

    const { container } = await renderSection();

    // Component returns null on error
    expect(container.innerHTML).toBe('');
  });
});

// =============================================================================
// useAIMetricsQuery Hook Tests
// =============================================================================

describe('US-AI-008: useAIMetricsQuery Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfile = { id: 'user-1', role: 'admin', organization_id: 'org-1' };
    mockLogsData.length = 0;
    mockHitlData.length = 0;
  });

  async function renderMetricsHook() {
    const { useAIMetricsQuery } = await import(
      '@/lib/query/hooks/useAIMetricsQuery'
    );
    return renderHook(() => useAIMetricsQuery(), {
      wrapper: TestWrapper,
    });
  }

  it('calcula conversas por periodo corretamente', async () => {
    const now = new Date();
    const todayISO = now.toISOString();

    // Populate mock data — all today
    mockLogsData.push(
      { action_taken: 'responded', tokens_used: 100, model_used: 'gemini', created_at: todayISO },
      { action_taken: 'responded', tokens_used: 150, model_used: 'gemini', created_at: todayISO },
      { action_taken: 'advanced_stage', tokens_used: 200, model_used: 'gpt', created_at: todayISO }
    );

    const { result } = await renderMetricsHook();

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });

    const data = result.current.data!;
    // All 3 logs are today, this week, and this month
    expect(data.conversations.today.total).toBe(3);
    expect(data.conversations.thisWeek.total).toBe(3);
    expect(data.conversations.thisMonth.total).toBe(3);
  });

  it('calcula distribuicao de acoes', async () => {
    const now = new Date().toISOString();

    mockLogsData.push(
      { action_taken: 'responded', tokens_used: 100, model_used: 'gemini', created_at: now },
      { action_taken: 'responded', tokens_used: 100, model_used: 'gemini', created_at: now },
      { action_taken: 'advanced_stage', tokens_used: 200, model_used: 'gpt', created_at: now },
      { action_taken: 'handoff', tokens_used: 50, model_used: 'gemini', created_at: now },
      { action_taken: 'skipped', tokens_used: 0, model_used: null, created_at: now }
    );

    const { result } = await renderMetricsHook();

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });

    const stats = result.current.data!.conversations.thisMonth;
    expect(stats.responded).toBe(2);
    expect(stats.advancedStage).toBe(1);
    expect(stats.handoff).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.total).toBe(5);
  });

  it('calcula HITL stats', async () => {
    mockHitlData.push(
      { status: 'pending', confidence: 0.78 },
      { status: 'pending', confidence: 0.80 },
      { status: 'approved', confidence: 0.90 },
      { status: 'approved', confidence: 0.85 },
      { status: 'approved', confidence: 0.92 },
      { status: 'rejected', confidence: 0.75 },
      { status: 'auto_approved', confidence: 0.95 }
    );

    const { result } = await renderMetricsHook();

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });

    const hitl = result.current.data!.hitl;
    expect(hitl.pending).toBe(2);
    expect(hitl.approved).toBe(3);
    expect(hitl.rejected).toBe(1);
    expect(hitl.autoApproved).toBe(1);

    // approvalRate = 3 / (3 + 1) * 100 = 75
    expect(hitl.approvalRate).toBe(75);

    // avgConfidence = average of all 7 values
    const expectedAvg = (0.78 + 0.80 + 0.90 + 0.85 + 0.92 + 0.75 + 0.95) / 7;
    expect(hitl.avgConfidence).toBeCloseTo(expectedAvg, 2);
  });

  it('retorna dados vazios quando tabelas sem registros', async () => {
    // mockLogsData and mockHitlData are empty by default

    const { result } = await renderMetricsHook();

    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });

    const data = result.current.data!;
    expect(data.conversations.today.total).toBe(0);
    expect(data.conversations.thisMonth.total).toBe(0);
    expect(data.hitl.pending).toBe(0);
    expect(data.hitl.approvalRate).toBe(0);
    expect(data.tokensUsed.today).toBe(0);
    expect(Object.keys(data.modelBreakdown).length).toBe(0);
  });

  it('useAIQuickStats retorna subset simplificado', async () => {
    const now = new Date().toISOString();

    mockLogsData.push(
      { action_taken: 'responded', tokens_used: 100, model_used: 'gemini', created_at: now },
      { action_taken: 'responded', tokens_used: 100, model_used: 'gemini', created_at: now }
    );

    mockHitlData.push({ status: 'pending', confidence: 0.8 });

    const { useAIQuickStats } = await import(
      '@/lib/query/hooks/useAIMetricsQuery'
    );

    const { result } = renderHook(() => useAIQuickStats(), {
      wrapper: TestWrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.todayConversations).toBe(2);
    expect(result.current.pendingHITL).toBe(1);
  });
});

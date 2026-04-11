/**
 * Decision Queue Service
 * Gerencia a fila de decisões pendentes
 */

import { 
  Decision, 
  DecisionQueueState, 
  DecisionStats, 
  DecisionStatus,
  DecisionPriority,
  ActionPayload,
  PRIORITY_ORDER 
} from '../types';

const STORAGE_KEY = 'crm_decision_queue';
const PROCESSED_KEY = 'crm_processed_decisions';

// ============================================
// STORAGE
// ============================================

const isBrowser = typeof window !== 'undefined';

function loadState(): DecisionQueueState {
  if (!isBrowser) return { decisions: [], analyzerResults: [] };
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading decision queue:', e);
  }
  return { decisions: [], analyzerResults: [] };
}

function saveState(state: DecisionQueueState): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Error saving decision queue:', e);
  }
}

// Track processed decisions to avoid duplicates
function getProcessedDecisions(): Set<string> {
  if (!isBrowser) return new Set();
  try {
    const data = localStorage.getItem(PROCESSED_KEY);
    if (data) {
      return new Set(JSON.parse(data));
    }
  } catch (e) {
    console.error('Error loading processed decisions:', e);
  }
  return new Set();
}

function addProcessedDecision(key: string): void {
  if (!isBrowser) return;
  const processed = getProcessedDecisions();
  processed.add(key);
  // Keep only last 500 entries
  const arr = Array.from(processed).slice(-500);
  localStorage.setItem(PROCESSED_KEY, JSON.stringify(arr));
}

// ============================================
// DECISION QUEUE SERVICE
// ============================================

export const decisionQueueService = {
  // ============================================
  // READ OPERATIONS
  // ============================================
  
  getState(): DecisionQueueState {
    return loadState();
  },

  getQueue(): Decision[] {
    return loadState().decisions;
  },

  getPendingDecisions(): Decision[] {
    const state = loadState();
    // Performance: use timestamps to avoid repeated Date allocations.
    const nowTs = Date.now();
    
    return state.decisions
      .filter(d => {
        if (d.status !== 'pending') return false;
        if (d.expiresAt && Date.parse(d.expiresAt) < nowTs) return false;
        if (d.snoozeUntil && Date.parse(d.snoozeUntil) > nowTs) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by priority first
        const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Then by creation date (newer first)
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      });
  },

  getDecisionById(id: string): Decision | undefined {
    return loadState().decisions.find(d => d.id === id);
  },

  getStats(): DecisionStats {
    const pending = this.getPendingDecisions();
    
    const stats: DecisionStats = {
      total: pending.length,
      pending: pending.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      byCategory: {
        follow_up: 0,
        deadline: 0,
        opportunity: 0,
        risk: 0,
        routine: 0,
      },
      byType: {} as Record<string, number>,
    };

    for (const decision of pending) {
      // Count by priority
      stats[decision.priority]++;
      
      // Count by category
      stats.byCategory[decision.category]++;
      
      // Count by type
      stats.byType[decision.type] = (stats.byType[decision.type] || 0) + 1;
    }

    return stats;
  },

  // ============================================
  // WRITE OPERATIONS
  // ============================================

  addDecision(decision: Decision): void {
    const state = loadState();
    
    // Check if already processed (avoid duplicates)
    const dedupeKey = `${decision.type}:${decision.dealId || decision.contactId || decision.activityId}`;
    const processed = getProcessedDecisions();
    if (processed.has(dedupeKey)) {
      return; // Skip duplicate
    }
    
    // Check if similar pending decision exists
    const existingSimilar = state.decisions.find(d => 
      d.status === 'pending' &&
      d.type === decision.type &&
      d.dealId === decision.dealId &&
      d.contactId === decision.contactId
    );
    
    if (existingSimilar) {
      return; // Skip duplicate
    }

    state.decisions.push(decision);
    saveState(state);
  },

  addDecisions(decisions: Decision[]): number {
    /**
     * Performance: batch-add with a single load/save.
     * Previous implementation called `loadState()` multiple times per item.
     */
    const state = loadState();
    const processed = getProcessedDecisions();

    let added = 0;

    for (const decision of decisions) {
      // Check if already processed (avoid duplicates)
      const dedupeKey = `${decision.type}:${decision.dealId || decision.contactId || decision.activityId}`;
      if (processed.has(dedupeKey)) continue;

      // Check if similar pending decision exists
      const existingSimilar = state.decisions.find(d =>
        d.status === 'pending' &&
        d.type === decision.type &&
        d.dealId === decision.dealId &&
        d.contactId === decision.contactId
      );
      if (existingSimilar) continue;

      state.decisions.push(decision);
      added += 1;
    }

    if (added > 0) {
      saveState(state);
    }

    return added;
  },

  updateDecisionStatus(id: string, status: DecisionStatus): void {
    const state = loadState();
    const decision = state.decisions.find(d => d.id === id);
    
    if (decision) {
      decision.status = status;
      decision.decidedAt = new Date().toISOString();
      
      // Mark as processed to avoid regenerating
      if (status === 'approved' || status === 'rejected') {
        const dedupeKey = `${decision.type}:${decision.dealId || decision.contactId || decision.activityId}`;
        addProcessedDecision(dedupeKey);
      }
      
      saveState(state);
    }
  },

  // ============================================
  // USER ACTIONS
  // ============================================

  async approveDecision(
    id: string, 
    modifiedPayload?: Partial<ActionPayload>
  ): Promise<{ success: boolean; error?: string }> {
    const decision = this.getDecisionById(id);
    
    if (!decision) {
      return { success: false, error: 'Decisão não encontrada' };
    }

    if (decision.status !== 'pending') {
      return { success: false, error: 'Decisão já foi processada' };
    }

    // Merge modifications into payload
    const finalPayload = modifiedPayload 
      ? { ...decision.suggestedAction.payload, ...modifiedPayload }
      : decision.suggestedAction.payload;

    // Execute the action (this will be expanded with actual execution)
    const result = await this.executeAction(decision.suggestedAction.type, finalPayload);
    
    if (result.success) {
      this.updateDecisionStatus(id, 'approved');
    }

    return result;
  },

  rejectDecision(id: string, _reason?: string): void {
    this.updateDecisionStatus(id, 'rejected');
  },

  snoozeDecision(id: string, until: Date): void {
    const state = loadState();
    const decision = state.decisions.find(d => d.id === id);
    
    if (decision) {
      decision.status = 'snoozed';
      decision.snoozeUntil = until.toISOString();
      saveState(state);
    }
  },

  // ============================================
  // ACTION EXECUTION
  // ============================================

  async executeAction(
    actionType: string, 
    payload: ActionPayload
  ): Promise<{ success: boolean; error?: string; result?: unknown }> {
    // This will be called from the context where we have access to CRM functions
    // For now, return a placeholder that indicates we need external execution
    return {
      success: true,
      result: { actionType, payload, needsExternalExecution: true }
    };
  },

  // ============================================
  // MAINTENANCE
  // ============================================

  clearExpired(): number {
    const state = loadState();
    const now = new Date();
    const before = state.decisions.length;
    
    state.decisions = state.decisions.filter(d => {
      if (d.status !== 'pending') return true; // Keep non-pending for history
      if (d.expiresAt && new Date(d.expiresAt) < now) {
        return false; // Remove expired
      }
      return true;
    });

    saveState(state);
    return before - state.decisions.length;
  },

  clearCompleted(olderThanDays: number = 7): number {
    const state = loadState();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const before = state.decisions.length;
    
    state.decisions = state.decisions.filter(d => {
      if (d.status === 'pending') return true;
      if (d.decidedAt && new Date(d.decidedAt) < cutoff) {
        return false; // Remove old completed
      }
      return true;
    });

    saveState(state);
    return before - state.decisions.length;
  },

  clearAll(): void {
    saveState({ decisions: [], analyzerResults: [] });
  },

  // ============================================
  // ANALYZER RESULTS
  // ============================================

  saveAnalyzerResult(result: import('../types').AnalyzerResult): void {
    const state = loadState();
    state.analyzerResults = state.analyzerResults || [];
    state.analyzerResults.push(result);
    state.lastAnalyzedAt = new Date().toISOString();
    
    // Keep only last 10 results
    if (state.analyzerResults.length > 10) {
      state.analyzerResults = state.analyzerResults.slice(-10);
    }
    
    saveState(state);
  },

  getLastAnalyzedAt(): string | undefined {
    return loadState().lastAnalyzedAt;
  },
};

export default decisionQueueService;

/**
 * AI Deal Analysis Hook
 * Fetches real AI analysis for a deal using the AI Proxy
 */
import { useQuery } from '@tanstack/react-query';
import { analyzeLead } from '@/lib/ai/tasksClient';
import { Deal, DealView } from '@/types';

export interface AIAnalysis {
    action: string;       // Ação curta (max 50 chars)
    reason: string;       // Razão breve (max 80 chars)
    actionType: 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'WHATSAPP';
    urgency: 'low' | 'medium' | 'high';
    probabilityScore: number;
    error?: string;
    // Legacy field for backward compatibility
    suggestion?: string;
}

/**
 * Hook to get AI-powered analysis for a deal
 * Returns actionable NBA with structured data
 */
export function useAIDealAnalysis(
    deal: Deal | DealView | null | undefined,
    stageLabel?: string,
    options?: { enabled?: boolean }
) {
    return useQuery<AIAnalysis>({
        queryKey: ['ai-deal-analysis', deal?.id, stageLabel],
        queryFn: async () => {
            if (!deal) {
                return {
                    action: '',
                    reason: '',
                    actionType: 'TASK' as const,
                    urgency: 'low' as const,
                    probabilityScore: 0
                };
            }

            try {
                const result = await analyzeLead(deal, stageLabel);

                return result as AIAnalysis;
            } catch (error) {
                console.error('[AI Analysis] Error:', error);
                return {
                    action: 'Analisar deal manualmente',
                    reason: 'Não foi possível obter análise da IA',
                    actionType: 'TASK' as const,
                    urgency: 'low' as const,
                    probabilityScore: deal.probability || 50,
                    error: String(error),
                };
            }
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
        enabled: options?.enabled !== false && !!deal?.id,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}

/**
 * Derive health score from AI probability
 * Maps 0-100 probability to a health status
 */
export function deriveHealthFromProbability(probability: number): {
    score: number;
    status: 'critical' | 'warning' | 'good' | 'excellent';
    color: string;
} {
    if (probability >= 80) {
        return { score: probability, status: 'excellent', color: 'text-emerald-400' };
    } else if (probability >= 60) {
        return { score: probability, status: 'good', color: 'text-green-400' };
    } else if (probability >= 40) {
        return { score: probability, status: 'warning', color: 'text-orange-400' };
    } else {
        return { score: probability, status: 'critical', color: 'text-red-400' };
    }
}

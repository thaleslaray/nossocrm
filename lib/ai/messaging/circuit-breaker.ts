/**
 * Circuit breaker por conversa.
 *
 * Estado persistido em messaging_conversations.consecutive_ai_errors.
 * - threshold atingido → pausa IA (ai_paused no contato) e notifica
 * - sucesso → reset para 0
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CircuitBreakerState } from './types';

export async function getCircuitBreakerState(
  supabase: SupabaseClient,
  conversationId: string,
  threshold: number,
): Promise<CircuitBreakerState> {
  const { data } = await supabase
    .from('messaging_conversations')
    .select('consecutive_ai_errors')
    .eq('id', conversationId)
    .maybeSingle();

  const consecutiveErrors = data?.consecutive_ai_errors ?? 0;
  return {
    isOpen: consecutiveErrors >= threshold,
    consecutiveErrors,
    threshold,
  };
}

export async function incrementCircuitBreakerError(
  supabase: SupabaseClient,
  conversationId: string,
  contactId: string | null,
  threshold: number,
): Promise<void> {
  const { data } = await supabase
    .from('messaging_conversations')
    .select('consecutive_ai_errors')
    .eq('id', conversationId)
    .maybeSingle();

  const newCount = (data?.consecutive_ai_errors ?? 0) + 1;

  await supabase
    .from('messaging_conversations')
    .update({ consecutive_ai_errors: newCount })
    .eq('id', conversationId);

  if (newCount >= threshold && contactId) {
    // Pausa IA no nível do contato (cross-channel)
    await supabase
      .from('contacts')
      .update({ ai_paused: true })
      .eq('id', contactId);

    console.warn(
      '[CircuitBreaker] OPEN — conversation %s hit %d consecutive errors, contact %s paused',
      conversationId,
      newCount,
      contactId,
    );
  }
}

export async function resetCircuitBreaker(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  await supabase
    .from('messaging_conversations')
    .update({ consecutive_ai_errors: 0 })
    .eq('id', conversationId);
}

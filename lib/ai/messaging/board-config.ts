/**
 * Fetches the goal-oriented AI config for a board.
 * Returns null if no config exists (agent not set up for this board).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BoardAIConfig } from './types';

export async function getBoardAIConfig(
  supabase: SupabaseClient,
  boardId: string,
): Promise<BoardAIConfig | null> {
  const { data, error } = await supabase
    .from('board_ai_config')
    .select('*')
    .eq('board_id', boardId)
    .maybeSingle();

  if (error) {
    console.error('[BoardAIConfig] Failed to fetch:', error);
    return null;
  }

  return data as BoardAIConfig | null;
}

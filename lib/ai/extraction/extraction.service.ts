/**
 * @fileoverview AI Field Extraction Service
 *
 * Automatically extracts BANT fields from conversations.
 * Zero config - works out of the box for any deal.
 *
 * @module lib/ai/extraction/extraction.service
 */

import { generateText, Output } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getModel } from '../config';
import { getOrgAIConfig } from '../agent/agent.service';
import { BANTExtractionSchema, type BANTExtraction, type AIExtractedData, type AIExtractedField } from './schemas';

// =============================================================================
// Constants
// =============================================================================

const MAX_MESSAGES_FOR_EXTRACTION = 30;
const MIN_CONFIDENCE_TO_STORE = 0.5; // Só salva se confiança >= 50%

// =============================================================================
// System Prompt
// =============================================================================

const EXTRACTION_SYSTEM_PROMPT = `Você é um especialista em extrair informações de qualificação de leads (BANT) de conversas de vendas.

Analise o histórico de conversa e extraia:

1. **Budget (Orçamento)**: Valor disponível, faixa de investimento, menções a preço
2. **Authority (Autoridade)**: Quem decide, quem influencia, estrutura de decisão
3. **Need (Necessidade)**: Dores, problemas, objetivos, o que querem resolver
4. **Timeline (Prazo)**: Urgência, deadline, quando precisam, fase do projeto

REGRAS:
- Extraia APENAS informações explicitamente mencionadas na conversa
- NÃO invente ou assuma informações
- Se não encontrar, retorne null para o value
- Confidence deve refletir clareza da informação (0.9+ = muito claro, 0.7-0.9 = mencionado, 0.5-0.7 = implícito)
- Reasoning deve citar brevemente de onde veio a informação
- Responda SEMPRE em português brasileiro`;

// =============================================================================
// Extraction Service
// =============================================================================

export interface ExtractBANTParams {
  supabase: SupabaseClient;
  dealId: string;
  conversationId: string;
  organizationId: string;
  triggerMessageId?: string;
}

/**
 * Extract BANT fields from a conversation and update the deal.
 *
 * Called after AI Agent processes a message.
 * Only updates fields that have higher confidence than existing.
 */
export async function extractAndUpdateBANT(params: ExtractBANTParams): Promise<{
  success: boolean;
  extracted?: BANTExtraction;
  updated?: string[];
  error?: string;
}> {
  const { supabase, dealId, conversationId, organizationId, triggerMessageId } = params;

  try {
    // 1. Get AI config
    const aiConfig = await getOrgAIConfig(supabase, organizationId);
    if (!aiConfig || !aiConfig.enabled) {
      return { success: true, updated: [] }; // Silently skip if AI not configured
    }

    // 2. Fetch conversation history
    const { data: messages } = await supabase
      .from('messaging_messages')
      .select('id, direction, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(MAX_MESSAGES_FOR_EXTRACTION);

    if (!messages || messages.length < 2) {
      return { success: true, updated: [] }; // Not enough context
    }

    // 3. Format messages for prompt
    const messagesText = messages
      .map((m) => {
        const role = m.direction === 'inbound' ? 'LEAD' : 'VENDEDOR';
        const content = extractTextContent(m.content as Record<string, unknown>);
        return `[${role}]: ${content}`;
      })
      .join('\n');

    // 4. Get current extracted data
    const { data: deal } = await supabase
      .from('deals')
      .select('ai_extracted')
      .eq('id', dealId)
      .single();

    const currentExtracted = (deal?.ai_extracted as AIExtractedData) || {};

    // 5. Generate extraction
    const model = getModel(aiConfig.provider, aiConfig.apiKey, aiConfig.model);

    const result = await generateText({
      model,
      output: Output.object({
        schema: BANTExtractionSchema,
        name: 'BANTExtraction',
        description: 'Extração de campos BANT da conversa em português',
      }),
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: `Analise esta conversa e extraia as informações BANT em português:

${messagesText}

Extraia Budget, Authority, Need e Timeline. Se não encontrar alguma informação, retorne null para o value.`,
      maxRetries: 2,
    });

    if (!result.output) {
      return { success: false, error: 'Failed to generate extraction' };
    }

    // Log tokens to ai_conversation_log fire-and-forget so budget enforcement counts them
    const tokensUsed = result.usage?.totalTokens ?? 0;
    if (tokensUsed > 0) {
      supabase.from('ai_conversation_log').insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        tokens_used: tokensUsed,
        model_used: aiConfig.model,
        action_taken: 'bant_extraction',
        action_reason: `BANT extraction for deal ${dealId}`,
        ai_response: '',
      }).then(({ error }) => {
        if (error) console.error('[Extraction] Failed to log tokens (non-fatal):', error.message);
      });
    }

    const extraction = result.output;

    // 6. Merge with existing data (only update if higher confidence)
    const now = new Date().toISOString();
    const updated: string[] = [];
    const newExtracted: AIExtractedData = { ...currentExtracted };

    type BANTField = 'budget' | 'authority' | 'need' | 'timeline';
    const bantFields: BANTField[] = ['budget', 'authority', 'need', 'timeline'];

    for (const field of bantFields) {
      const newValue = extraction[field];

      // Skip if no value or low confidence
      if (!newValue.value || newValue.confidence < MIN_CONFIDENCE_TO_STORE) {
        continue;
      }

      const currentField = currentExtracted[field];

      // Update if: no current value OR new confidence is higher
      if (!currentField?.value || newValue.confidence > currentField.confidence) {
        newExtracted[field] = {
          value: newValue.value,
          confidence: newValue.confidence,
          reasoning: newValue.reasoning,
          extractedAt: now,
          sourceMessageId: triggerMessageId,
        };
        updated.push(field);
      }
    }

    // 7. Save to database if anything changed
    if (updated.length > 0) {
      newExtracted.lastExtractedAt = now;

      const { error: updateError } = await supabase
        .from('deals')
        .update({ ai_extracted: newExtracted })
        .eq('id', dealId);

      if (updateError) {
        console.error('[Extraction] Failed to update deal:', updateError);
        return { success: false, error: updateError.message };
      }

      console.log('[Extraction] Updated fields:', updated, 'for deal:', dealId);
    }

    return {
      success: true,
      extracted: extraction,
      updated,
    };
  } catch (error) {
    console.error('[Extraction] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function extractTextContent(content: Record<string, unknown>): string {
  if (typeof content === 'string') return content;
  if (content.text && typeof content.text === 'string') return content.text;
  if (content.type === 'image') return '[Imagem]';
  if (content.type === 'audio') return '[Áudio]';
  if (content.type === 'video') return '[Vídeo]';
  if (content.type === 'document') return `[Documento]`;
  return '[Mensagem]';
}

/**
 * WhatsApp Intelligence Engine
 *
 * The brain behind the autonomous AI agent. A single AI call analyzes each
 * incoming message and extracts:
 *
 * 1. INTENTS     - What the customer wants/means (e.g. "check_with_spouse")
 * 2. MEMORIES    - Key facts to remember (e.g. spouse name, budget, preferences)
 * 3. SENTIMENT   - How the customer feels (positive/negative/neutral)
 * 4. LEAD SCORE  - Score delta based on buying signals
 * 5. LABELS      - Suggested conversation labels
 * 6. FOLLOW-UPS  - Should we schedule a follow-up? When? With what context?
 * 7. SMART PAUSE - Should the AI pause? (customer wants human, negative sentiment)
 *
 * All of this happens in ONE structured AI call, making it efficient and coherent.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConversationIntelligence,
  DetectedIntent,
  ExtractedMemory,
  CustomerSentiment,
  BuyingStage,
  ChatMemory,
  LeadScore,
  WhatsAppFollowUp,
  WhatsAppAIConfig,
  WhatsAppConversation,
  WhatsAppMessage,
} from '@/types/whatsapp';

// =============================================================================
// INTENT PATTERNS (pre-defined for fast local matching before AI call)
// =============================================================================

interface IntentPattern {
  intent: string;
  patterns: RegExp[];
  follow_up_delay_minutes: number;
  label: string;
  score_delta: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'check_with_spouse',
    patterns: [
      /vou (?:ver|falar|conversar|consultar) com (?:meu |minha |o |a )?(esposo|esposa|marido|mulher|namorad[oa]|companheiro|noiv[oa])/i,
      /preciso (?:ver|falar|conversar|consultar) com (?:meu |minha |o |a )?(esposo|esposa|marido|mulher)/i,
      /(?:meu|minha) (?:esposo|esposa|marido|mulher) (?:precisa|tem que|quer) ver/i,
    ],
    follow_up_delay_minutes: 30,
    label: 'Aguardando',
    score_delta: 5,
  },
  {
    intent: 'think_about_it',
    patterns: [
      /(?:vou|preciso|deixa eu|deixa) (?:pensar|analisar|avaliar|refletir|ver com calma)/i,
      /(?:me )?(?:d\u00e1|da) um tempo/i,
      /(?:depois eu |eu )?(?:te )?(?:aviso|falo|respondo|digo)/i,
      /vou (?:dar uma |)(?:pensada|analisada|olhada)/i,
    ],
    follow_up_delay_minutes: 60,
    label: 'Aguardando',
    score_delta: 0,
  },
  {
    intent: 'budget_hold',
    patterns: [
      /(?:t\u00f4|estou|to) sem (?:grana|dinheiro|verba|condi\u00e7\u00e3o)/i,
      /(?:n\u00e3o|nao) (?:tenho|t\u00f4 com) (?:grana|dinheiro|condi\u00e7\u00e3o)/i,
      /(?:t\u00e1|est\u00e1|ta) (?:caro|puxado|salgado|acima)/i,
      /(?:quando eu |no m\u00eas que vem |m\u00eas que vem eu |quando )(?:receber|tiver|pagar)/i,
      /(?:s\u00f3|so) (?:no|dia|depois do) (?:pagamento|quinto|5|sal\u00e1rio|pr\u00f3ximo m\u00eas)/i,
    ],
    follow_up_delay_minutes: 1440, // 24 hours
    label: 'Obje\u00e7\u00e3o',
    score_delta: -10,
  },
  {
    intent: 'callback_request',
    patterns: [
      /(?:me )?(?:liga|ligar|chama|chamar) (?:amanh\u00e3|depois|segunda|ter\u00e7a|quarta|quinta|sexta|s\u00e1bado|domingo|na semana que vem|mais tarde)/i,
      /(?:pode|podemos) (?:conversar|falar|tratar) (?:amanh\u00e3|depois|segunda|ter\u00e7a|quarta|quinta|sexta)/i,
      /(?:s\u00f3|so) (?:consigo|posso) (?:amanh\u00e3|depois|segunda|ter\u00e7a|quarta|quinta|sexta)/i,
    ],
    follow_up_delay_minutes: 120,
    label: 'Aguardando',
    score_delta: 5,
  },
  {
    intent: 'price_inquiry',
    patterns: [
      /(?:quanto|qual (?:o |é o )?(?:pre\u00e7o|valor|custo|investimento))/i,
      /(?:pre\u00e7o|valor|custo)(?:\?|$)/i,
      /(?:tabela|condi\u00e7\u00e3o|condi\u00e7\u00f5es) (?:de pagamento|especial|especiais)/i,
      /(?:tem |faz |fazem )(?:desconto|promo\u00e7\u00e3o|oferta)/i,
    ],
    follow_up_delay_minutes: 0, // no follow-up needed, it's answered inline
    label: 'Interessado',
    score_delta: 15,
  },
  {
    intent: 'availability_check',
    patterns: [
      /(?:tem |h\u00e1 |existe |ainda tem )(?:disponibilidade|vaga|dispon\u00edvel)/i,
      /(?:quando|qual) (?:(?:\u00e9 |seria )?a )?(?:data|hor\u00e1rio|pr\u00f3xim)/i,
      /(?:posso|consigo) (?:agendar|marcar|reservar)/i,
    ],
    follow_up_delay_minutes: 0,
    label: 'Interessado',
    score_delta: 20,
  },
  {
    intent: 'ready_to_buy',
    patterns: [
      /(?:quero|vou|vamos) (?:fechar|comprar|contratar|assinar|reservar)/i,
      /(?:como|onde) (?:fa\u00e7o|faz) (?:para|pra) (?:comprar|fechar|contratar|pagar)/i,
      /(?:pode|podemos) (?:fechar|finalizar)/i,
      /(?:me )?(?:manda|envia) (?:o |a )?(?:contrato|proposta|boleto|pix|link)/i,
      /(?:fechado|fechou|bora|vamos l\u00e1|t\u00f4 dentro|to dentro|partiu)/i,
    ],
    follow_up_delay_minutes: 0,
    label: 'Quente',
    score_delta: 30,
  },
  {
    intent: 'not_interested',
    patterns: [
      /(?:n\u00e3o|nao) (?:tenho|t\u00f4 com|estou com) (?:interesse|interesse mais)/i,
      /(?:n\u00e3o|nao) (?:quero|preciso) (?:mais|n\u00e3o|nada)/i,
      /(?:obrigad[oa]|vlw|valeu),? (?:mas )?(?:n\u00e3o|nao)/i,
      /(?:j\u00e1 |)(?:comprei|fechei|contratei) (?:com )?(?:outro|outra|outr[oa]s|em outro lugar)/i,
    ],
    follow_up_delay_minutes: 0,
    label: 'Perdido',
    score_delta: -30,
  },
  {
    intent: 'wants_human',
    patterns: [
      /(?:quero|preciso|pode) (?:falar|conversar) com (?:um |uma )?(?:pessoa|humano|atendente|gerente|supervisor|respons\u00e1vel)/i,
      /(?:isso|voc\u00ea) \u00e9 (?:um )?(?:rob\u00f4|bot|m\u00e1quina|intelig\u00eancia artificial|ia|robo)/i,
      /(?:me )?(?:transfere|passa|encaminha) (?:para|pra) (?:um |uma )?(?:pessoa|atendente|humano)/i,
    ],
    follow_up_delay_minutes: 0,
    label: '',
    score_delta: 0,
  },
];

// =============================================================================
// FAST LOCAL INTENT DETECTION
// =============================================================================

export function detectIntentsLocal(message: string): DetectedIntent[] {
  const intents: DetectedIntent[] = [];

  for (const pattern of INTENT_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(message)) {
        intents.push({
          intent: pattern.intent,
          confidence: 0.85,
          follow_up_delay_minutes: pattern.follow_up_delay_minutes,
          customer_message: message,
          context: { matched_pattern: pattern.intent },
        });
        break; // Only match first pattern per intent
      }
    }
  }

  return intents;
}

// =============================================================================
// AI-POWERED INTELLIGENCE EXTRACTION
// =============================================================================

const INTELLIGENCE_PROMPT = `Voc\u00ea \u00e9 um analisador de conversas de vendas por WhatsApp. Analise a \u00daLTIMA MENSAGEM DO CLIENTE no contexto da conversa e extraia informa\u00e7\u00f5es estruturadas.

MEM\u00d3RIAS DO CONTATO (informa\u00e7\u00f5es j\u00e1 conhecidas):
{memories}

CONVERSA RECENTE:
{conversation}

\u00daLTIMA MENSAGEM DO CLIENTE:
"{message}"

Responda APENAS com JSON v\u00e1lido (sem markdown, sem \`\`\`):
{
  "intents": [
    {
      "intent": "string - nome do intent (check_with_spouse, think_about_it, budget_hold, callback_request, price_inquiry, availability_check, ready_to_buy, not_interested, wants_human, general_question, greeting, gratitude, complaint, negotiation, info_request, scheduling)",
      "confidence": 0.0-1.0,
      "follow_up_delay_minutes": numero ou null,
      "context": {}
    }
  ],
  "memories": [
    {
      "memory_type": "fact|preference|objection|family|timeline|budget|interest|personal|interaction",
      "key": "chave descritiva curta (ex: spouse_name, budget_range, preferred_date)",
      "value": "valor extra\u00eddo",
      "context": "contexto adicional opcional",
      "confidence": 0.0-1.0
    }
  ],
  "sentiment": "very_positive|positive|neutral|negative|very_negative",
  "lead_score_delta": -30 a +30 (quanto o score deve mudar),
  "buying_stage": "awareness|interest|consideration|decision|negotiation|closed_won|closed_lost" ou null,
  "suggested_labels": ["nome da label"],
  "should_pause": false,
  "pause_reason": null ou "raz\u00e3o para pausar",
  "follow_up": {
    "should_schedule": true/false,
    "delay_minutes": numero,
    "context_for_message": "contexto chave que o follow-up deve usar",
    "urgency_hook": "gancho de urg\u00eancia natural (ex: 'poucas vagas', 'pre\u00e7o especial at\u00e9 sexta')"
  }
}

REGRAS:
- Extraia TODAS as informa\u00e7\u00f5es relevantes mencionadas (nomes, datas, valores, prefer\u00eancias)
- Se o cliente mencionar nome de algu\u00e9m (esposo, filha, etc), extraia como mem\u00f3ria tipo "family"
- Se mencionar valores/budget, extraia como "budget"
- Se mencionar prefer\u00eancias, extraia como "preference"
- Para follow-ups: considere a hora do dia e o contexto. Se algu\u00e9m diz "vou ver com meu esposo", 30-60 min \u00e9 bom. Se diz "vou pensar", 1-2h \u00e9 bom. Se diz "m\u00eas que vem", agende para semana que vem.
- should_pause = true APENAS se o cliente pedir humano ou estiver muito insatisfeito
- urgency_hook deve ser sutil e natural, nunca agressivo
- Retorne arrays vazios se n\u00e3o houver nada a extrair`;

export async function analyzeWithAI(
  supabase: SupabaseClient,
  organizationId: string,
  conversationHistory: string,
  incomingMessage: string,
  existingMemories: ChatMemory[],
): Promise<ConversationIntelligence | null> {
  // Get AI provider settings
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key')
    .eq('organization_id', organizationId)
    .single();

  const provider = orgSettings?.ai_provider ?? 'google';
  const model = orgSettings?.ai_model ?? 'gemini-2.5-flash';

  let apiKey: string | undefined;
  if (provider === 'google') apiKey = orgSettings?.ai_google_key;
  else if (provider === 'openai') apiKey = orgSettings?.ai_openai_key;
  else if (provider === 'anthropic') apiKey = orgSettings?.ai_anthropic_key;

  if (!apiKey) return null;

  // Format existing memories
  const memoriesText = existingMemories.length > 0
    ? existingMemories.map((m) => `- [${m.memory_type}] ${m.key}: ${m.value}`).join('\n')
    : 'Nenhuma mem\u00f3ria registrada ainda.';

  const prompt = INTELLIGENCE_PROMPT
    .replace('{memories}', memoriesText)
    .replace('{conversation}', conversationHistory)
    .replace('{message}', incomingMessage);

  try {
    const { generateText } = await import('ai');

    let modelInstance;
    if (provider === 'google') {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey });
      modelInstance = google(model);
    } else if (provider === 'openai') {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const openai = createOpenAI({ apiKey });
      modelInstance = openai(model);
    } else {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const anthropic = createAnthropic({ apiKey });
      modelInstance = anthropic(model);
    }

    const result = await generateText({
      model: modelInstance,
      messages: [
        { role: 'user', content: prompt },
      ],
      maxOutputTokens: 1500,
    });

    // Parse JSON response
    const text = result.text.trim();
    // Try to extract JSON from the response (handle cases where the AI adds extra text)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      intents: (parsed.intents || []).map((i: Record<string, unknown>) => ({
        intent: i.intent as string,
        confidence: (i.confidence as number) || 0.7,
        follow_up_delay_minutes: i.follow_up_delay_minutes as number | undefined,
        customer_message: incomingMessage,
        context: (i.context as Record<string, unknown>) || {},
      })),
      memories: (parsed.memories || []).map((m: Record<string, unknown>) => ({
        memory_type: m.memory_type as ExtractedMemory['memory_type'],
        key: m.key as string,
        value: m.value as string,
        context: m.context as string | undefined,
        confidence: (m.confidence as number) || 0.7,
      })),
      sentiment: parsed.sentiment || 'neutral',
      lead_score_delta: parsed.lead_score_delta || 0,
      buying_stage: parsed.buying_stage || undefined,
      suggested_labels: parsed.suggested_labels || [],
      should_pause: parsed.should_pause || false,
      pause_reason: parsed.pause_reason || undefined,
      summary: parsed.follow_up?.context_for_message,
    } satisfies ConversationIntelligence;
  } catch (err) {
    console.error('[intelligence] Failed to analyze:', err);
    return null;
  }
}

// =============================================================================
// COMBINED ANALYSIS (local patterns + AI)
// =============================================================================

export async function analyzeMessage(
  supabase: SupabaseClient,
  organizationId: string,
  conversationHistory: string,
  incomingMessage: string,
  existingMemories: ChatMemory[],
  config: WhatsAppAIConfig,
): Promise<ConversationIntelligence> {
  // Always do fast local detection first
  const localIntents = detectIntentsLocal(incomingMessage);

  // Default result using local patterns
  const defaultResult: ConversationIntelligence = {
    intents: localIntents,
    memories: [],
    sentiment: 'neutral',
    lead_score_delta: localIntents.reduce((sum, i) => {
      const pattern = INTENT_PATTERNS.find((p) => p.intent === i.intent);
      return sum + (pattern?.score_delta || 0);
    }, 0),
    buying_stage: undefined,
    suggested_labels: localIntents
      .map((i) => INTENT_PATTERNS.find((p) => p.intent === i.intent)?.label)
      .filter((l): l is string => !!l && l.length > 0),
    should_pause: localIntents.some((i) => i.intent === 'wants_human'),
    pause_reason: localIntents.some((i) => i.intent === 'wants_human') ? 'customer_requested_human' : undefined,
  };

  // If intelligence features are enabled, enhance with AI analysis
  if (config.memory_enabled || config.follow_up_enabled || config.auto_label_enabled) {
    const aiResult = await analyzeWithAI(
      supabase,
      organizationId,
      conversationHistory,
      incomingMessage,
      existingMemories,
    );

    if (aiResult) {
      // Merge AI results with local patterns (AI takes priority on conflicts)
      return {
        intents: mergeIntents(localIntents, aiResult.intents),
        memories: aiResult.memories,
        sentiment: aiResult.sentiment,
        lead_score_delta: aiResult.lead_score_delta || defaultResult.lead_score_delta,
        buying_stage: aiResult.buying_stage || defaultResult.buying_stage,
        suggested_labels: [...new Set([...defaultResult.suggested_labels, ...aiResult.suggested_labels])],
        should_pause: aiResult.should_pause || defaultResult.should_pause,
        pause_reason: aiResult.pause_reason || defaultResult.pause_reason,
        summary: aiResult.summary,
      };
    }
  }

  return defaultResult;
}

function mergeIntents(local: DetectedIntent[], ai: DetectedIntent[]): DetectedIntent[] {
  const merged = new Map<string, DetectedIntent>();

  // Add local intents first
  for (const intent of local) {
    merged.set(intent.intent, intent);
  }

  // AI intents override or add new ones
  for (const intent of ai) {
    const existing = merged.get(intent.intent);
    if (!existing || intent.confidence > existing.confidence) {
      merged.set(intent.intent, intent);
    }
  }

  return Array.from(merged.values());
}

// =============================================================================
// FOLLOW-UP MESSAGE GENERATOR
// =============================================================================

const FOLLOW_UP_PROMPT = `Voc\u00ea \u00e9 um assistente de vendas enviando uma mensagem de follow-up no WhatsApp.

CONTEXTO:
- Nome do cliente: {customer_name}
- O que ele disse antes: "{original_message}"
- Intent detectado: {intent}
- Contexto adicional: {context}
- Gancho de urg\u00eancia: {urgency_hook}
- Tom: {tone}

MEM\u00d3RIAS DO CONTATO:
{memories}

Gere UMA mensagem de follow-up curta (m\u00e1ximo 2 par\u00e1grafos) que:
1. Retoma a conversa naturalmente referenciando o que foi discutido
2. Usa o nome do cliente se dispon\u00edvel
3. Inclui um gancho sutil de urg\u00eancia se dispon\u00edvel
4. N\u00c3O usa markdown, N\u00c3O usa emojis excessivos (m\u00e1ximo 1)
5. Soa como uma pessoa real, n\u00e3o um bot
6. \u00c9 em portugu\u00eas do Brasil

Responda APENAS com o texto da mensagem, sem aspas.`;

export async function generateFollowUpMessage(
  supabase: SupabaseClient,
  organizationId: string,
  followUp: WhatsAppFollowUp,
  customerName: string,
  memories: ChatMemory[],
  config: WhatsAppAIConfig,
): Promise<string> {
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key')
    .eq('organization_id', organizationId)
    .single();

  const provider = orgSettings?.ai_provider ?? 'google';
  const model = orgSettings?.ai_model ?? 'gemini-2.5-flash';

  let apiKey: string | undefined;
  if (provider === 'google') apiKey = orgSettings?.ai_google_key;
  else if (provider === 'openai') apiKey = orgSettings?.ai_openai_key;
  else if (provider === 'anthropic') apiKey = orgSettings?.ai_anthropic_key;

  if (!apiKey) {
    return `Ol\u00e1${customerName ? ` ${customerName}` : ''}! Tudo bem? Gostaria de retomar nossa conversa. Posso ajudar com algo?`;
  }

  const memoriesText = memories.length > 0
    ? memories.map((m) => `- [${m.memory_type}] ${m.key}: ${m.value}`).join('\n')
    : 'Nenhuma mem\u00f3ria registrada.';

  const context = followUp.context as Record<string, string>;
  const prompt = FOLLOW_UP_PROMPT
    .replace('{customer_name}', customerName || 'Cliente')
    .replace('{original_message}', followUp.original_customer_message || '')
    .replace('{intent}', followUp.detected_intent || 'follow_up')
    .replace('{context}', context.context_for_message || JSON.stringify(followUp.context))
    .replace('{urgency_hook}', context.urgency_hook || '')
    .replace('{tone}', config.agent_tone)
    .replace('{memories}', memoriesText);

  try {
    const { generateText } = await import('ai');

    let modelInstance;
    if (provider === 'google') {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const google = createGoogleGenerativeAI({ apiKey });
      modelInstance = google(model);
    } else if (provider === 'openai') {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const openai = createOpenAI({ apiKey });
      modelInstance = openai(model);
    } else {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const anthropic = createAnthropic({ apiKey });
      modelInstance = anthropic(model);
    }

    const result = await generateText({
      model: modelInstance,
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 300,
    });

    return result.text.trim() || `Ol\u00e1${customerName ? ` ${customerName}` : ''}! Gostaria de retomar nossa conversa. Posso ajudar?`;
  } catch {
    return `Ol\u00e1${customerName ? ` ${customerName}` : ''}! Tudo bem? Gostaria de saber se ainda posso ajudar com algo.`;
  }
}

#!/usr/bin/env bash
# =============================================================================
# S4 — Outbound do Celular (Thales responde via WhatsApp real)
# Valida: fromMe=true salva como outbound, sem acionar AI
# Pré-condição: S1_CONV_ID exportado
# =============================================================================

if [ -z "${S1_CONV_ID:-}" ]; then
  echo "  [SKIP] S1_CONV_ID não definido — execute S1 primeiro"
  return 0
fi

S4_AI_LOG_BEFORE=$(supabase_count "ai_conversation_log" \
  "conversation_id=eq.${S1_CONV_ID}")

S4_MSG_ID="FROMME_${TEST_RUN_ID}"

echo "  Simulando Thales respondendo do celular (fromMe=true)..."
evolution_fromme_send "Olá! Aqui é o Thales, vou te atender agora. [S4-${TEST_RUN_ID}]"
sleep "$WEBHOOK_WAIT"

# --- Mensagem salva como outbound ---
S4_MSG=$(supabase_first "messaging_messages" \
  "external_id=eq.${S4_MSG_ID}&conversation_id=eq.${S1_CONV_ID}")
assert_not_empty "S4.1 Mensagem outbound (fromMe) salva no banco" \
  "$(echo "$S4_MSG" | jq -r '.id // empty')"

assert_equals "S4.2 direction = outbound" \
  "outbound" "$(echo "$S4_MSG" | jq -r '.direction')"

assert_equals "S4.3 status = sent" \
  "sent" "$(echo "$S4_MSG" | jq -r '.status')"

assert_empty "S4.4 sender_name = null (fromMe não tem nome)" \
  "$(echo "$S4_MSG" | jq -r '.sender_name // empty')"

# --- Conversa atualizada ---
S4_LAST_DIR=$(supabase_field "messaging_conversations" \
  "id=eq.${S1_CONV_ID}" "last_message_direction")
assert_equals "S4.5 last_message_direction = outbound" "outbound" "$S4_LAST_DIR"

# --- AI não acionada ---
S4_AI_LOG_AFTER=$(supabase_count "ai_conversation_log" \
  "conversation_id=eq.${S1_CONV_ID}")
assert_equals "S4.6 AI não processou mensagem outbound" \
  "$S4_AI_LOG_BEFORE" "$S4_AI_LOG_AFTER"

export S4_MSG_ID

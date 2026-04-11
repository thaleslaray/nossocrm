#!/usr/bin/env bash
# =============================================================================
# S6 — Outbound Ativo (prospecção)
# Fluxo: Thales envia via Evolution → Dany recebe e responde via Z-API →
#        Evolution dispara webhook inbound → AI processa e responde
#
# Este cenário inicia com conversa outbound-first (CRM aborda o lead),
# diferente de S1-S5 que começam com inbound.
# =============================================================================

S6_MSG_TEXT="Olá! Somos da equipe NossoCRM. Vi que você se interessou pelo nosso produto. Posso tirar algumas dúvidas? [SIM-S6-${TEST_RUN_ID}]"
S6_REPLY_TEXT="Oi! Claro, pode falar. Estou interessada sim. [SIM-S6-REPLY-${TEST_RUN_ID}]"

echo ""
echo "  Thales envia mensagem ativa para Dany via Evolution API..."
S6_SEND_RESULT=$(evolution_send "${DANY_PHONE:1}" "$S6_MSG_TEXT")  # remove leading +
S6_OUT_MSG_ID=$(echo "$S6_SEND_RESULT" | jq -r '.key.id // empty')
echo "  Evolution messageId: $S6_OUT_MSG_ID"

echo "  Aguardando webhook fromMe (${WEBHOOK_WAIT}s)..."
sleep "$WEBHOOK_WAIT"

# Fallback idempotente: garante que o outbound seja salvo no CRM
# (após a migration que tornou o índice unique por conversation_id,
#  o mesmo external_id pode existir em canais diferentes sem conflito)
if [ -n "$S6_OUT_MSG_ID" ]; then
  evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$S6_OUT_MSG_ID",
      "fromMe": true
    },
    "pushName": "Thales",
    "messageType": "conversation",
    "message": { "conversation": $(echo "$S6_MSG_TEXT" | jq -Rs .) },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)" > /dev/null
fi

sleep 8

# --- Verificar conversa criada pelo outbound ---
S6_CONV=$(supabase_first "messaging_conversations" \
  "channel_id=eq.${EVOLUTION_CHANNEL_ID}&external_contact_id=eq.${DANY_PHONE_ENCODED}")
S6_CONV_ID=$(echo "$S6_CONV" | jq -r '.id // empty')
assert_not_empty "S6.1 Conversa criada (outbound-initiated)" "$S6_CONV_ID"
export S6_CONV_ID

S6_OUTBOUND_COUNT=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S6_CONV_ID}&direction=eq.outbound")
assert_gt "S6.2 Mensagem outbound salva" "0" "$S6_OUTBOUND_COUNT"

assert_equals "S6.3 last_message_direction = outbound" \
  "outbound" "$(echo "$S6_CONV" | jq -r '.last_message_direction // empty')"

# --- Dany responde via Z-API ---
echo ""
echo "  Dany responde via Z-API..."
S6_ZAPI_RESULT=$(zapi_send "55${THALES_PHONE:3}" "$S6_REPLY_TEXT")
S6_REPLY_MSG_ID=$(echo "$S6_ZAPI_RESULT" | jq -r '.messageId // empty')
echo "  Z-API messageId: $S6_REPLY_MSG_ID"

echo "  Aguardando webhook inbound (${WEBHOOK_WAIT}s)..."
sleep "$WEBHOOK_WAIT"

# Fallback idempotente para o inbound
S6_REPLY_ID="${S6_REPLY_MSG_ID:-S6_INBOUND_${TEST_RUN_ID}}"
evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$S6_REPLY_ID",
      "fromMe": false
    },
    "pushName": "Dany Couto",
    "messageType": "conversation",
    "message": { "conversation": $(echo "$S6_REPLY_TEXT" | jq -Rs .) },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)" > /dev/null

echo "  Aguardando AI processar resposta da Dany (${AI_WAIT}s)..."
sleep "$AI_WAIT"

# --- Verificar reply da Dany ---
S6_INBOUND_COUNT=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S6_CONV_ID}&direction=eq.inbound")
assert_gt "S6.4 Dany respondeu (inbound salvo)" "0" "$S6_INBOUND_COUNT"

# --- Verificar AI respondeu à Dany ---
S6_AI_OUTBOUND=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S6_CONV_ID}&direction=eq.outbound")
# Outbound agora deve ter: mensagem original do Thales + resposta da AI
assert_gt "S6.5 AI respondeu à Dany (outbound > 1)" "1" "$S6_AI_OUTBOUND"

S6_AI_ACTION=$(supabase_field "ai_conversation_log" \
  "conversation_id=eq.${S6_CONV_ID}&order=created_at.desc" "action_taken")
assert_equals "S6.6 AI action = responded" "responded" "$S6_AI_ACTION"

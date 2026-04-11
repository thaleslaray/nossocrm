#!/usr/bin/env bash
# =============================================================================
# S3 — Handoff para Humano
# Valida: AI para de responder após keyword de handoff
# Pré-condição: S1_CONV_ID e S1_DEAL_ID exportados
# =============================================================================

if [ -z "${S1_CONV_ID:-}" ]; then
  echo "  [SKIP] S1_CONV_ID não definido — execute S1 primeiro"
  return 0
fi

# Check if stage_ai_config exists and has handoff_keywords
S3_STAGE_ID=$(supabase_field "deals" "id=eq.${S1_DEAL_ID}" "stage_id")
S3_HANDOFF_KEYWORDS=$(supabase_query "stage_ai_config" \
  "stage_id=eq.${S3_STAGE_ID}&enabled=eq.true&select=settings" \
  | jq -r '.[0].settings.handoff_keywords // empty')

if [ -z "$S3_HANDOFF_KEYWORDS" ] || [ "$S3_HANDOFF_KEYWORDS" = "null" ] || [ "$S3_HANDOFF_KEYWORDS" = "[]" ]; then
  echo "  [SKIP] stage_ai_config sem handoff_keywords — cenário não aplicável"
  return 0
fi

S3_OUTBOUND_BEFORE=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S1_CONV_ID}&direction=eq.outbound")

echo "  Dany pede atendente humano..."
S3_ZAPI1=$(zapi_send "55${THALES_PHONE:3}" "Quero falar com um atendente humano por favor.")
S3_MSG_ID1=$(echo "$S3_ZAPI1" | jq -r '.messageId // empty')
S3_MSG_ID1="${S3_MSG_ID1:-S3_INBOUND1_${TEST_RUN_ID}}"

sleep "$WEBHOOK_WAIT"

evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$S3_MSG_ID1",
      "fromMe": false
    },
    "pushName": "Dany Couto",
    "messageType": "conversation",
    "message": { "conversation": "Quero falar com um atendente humano por favor." },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)" > /dev/null

sleep "$AI_WAIT"

echo "  Dany envia segunda mensagem (deve ficar sem resposta da AI)..."
S3_ZAPI2=$(zapi_send "55${THALES_PHONE:3}" "Alguém pode me atender? Estou aguardando.")
S3_MSG_ID2=$(echo "$S3_ZAPI2" | jq -r '.messageId // empty')
S3_MSG_ID2="${S3_MSG_ID2:-S3_INBOUND2_${TEST_RUN_ID}}"

sleep "$WEBHOOK_WAIT"

evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$S3_MSG_ID2",
      "fromMe": false
    },
    "pushName": "Dany Couto",
    "messageType": "conversation",
    "message": { "conversation": "Alguém pode me atender? Estou aguardando." },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)" > /dev/null

sleep "$AI_WAIT"

# --- Handoff metadata ---
S3_CONV=$(supabase_first "messaging_conversations" "id=eq.${S1_CONV_ID}")
S3_HANDOFF=$(echo "$S3_CONV" | jq -r '.metadata.ai_handoff_pending // false')
assert_equals "S3.1 ai_handoff_pending = true na conversa" "true" "$S3_HANDOFF"

# --- AI log ---
S3_HANDOFF_LOG=$(supabase_count "ai_conversation_log" \
  "conversation_id=eq.${S1_CONV_ID}&action_taken=eq.handoff")
assert_gt "S3.2 AI registrou handoff no log" "0" "$S3_HANDOFF_LOG"

# --- AI parou de responder ---
S3_OUTBOUND_AFTER=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S1_CONV_ID}&direction=eq.outbound")

# Após handoff, segunda mensagem da Dany NÃO deve gerar nova resposta
# outbound_after deve ser igual a outbound_before + 1 (apenas a mensagem do handoff)
S3_NEW_OUTBOUND=$((S3_OUTBOUND_AFTER - S3_OUTBOUND_BEFORE))
if [ "$S3_NEW_OUTBOUND" -le 1 ]; then
  pass "S3.3 AI silenciou após handoff (sem nova resposta pós-keyword)"
else
  fail "S3.3 AI silenciou após handoff" "<= 1 nova msg" "$S3_NEW_OUTBOUND novas msgs"
fi

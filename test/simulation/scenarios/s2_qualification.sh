#!/usr/bin/env bash
# =============================================================================
# S2 — Qualificação BANT
# Valida: AI responde múltiplas mensagens e registra no log
# Pré-condição: S1_CONV_ID e S1_DEAL_ID exportados
# =============================================================================

if [ -z "${S1_CONV_ID:-}" ]; then
  echo "  [SKIP] S1_CONV_ID não definido — execute S1 primeiro"
  return 0
fi

S2_STAGE_BEFORE=$(supabase_field "deals" "id=eq.${S1_DEAL_ID}" "stage_id")

echo "  Dany responde com contexto de qualificação (3 mensagens)..."

# Mensagem 1
S2_ZAPI1=$(zapi_send "55${THALES_PHONE:3}" \
  "Temos 8 vendedores e precisamos muito de organização. Estamos perdendo leads no processo.")
S2_MSG_ID1=$(echo "$S2_ZAPI1" | jq -r '.messageId // empty')
S2_MSG_ID1="${S2_MSG_ID1:-S2_INBOUND1_${TEST_RUN_ID}}"

sleep "$WEBHOOK_WAIT"

evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$S2_MSG_ID1",
      "fromMe": false
    },
    "pushName": "Dany Couto",
    "messageType": "conversation",
    "message": { "conversation": "Temos 8 vendedores e precisamos muito de organização. Estamos perdendo leads no processo." },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)" > /dev/null

sleep "$AI_WAIT"

# Mensagem 2
S2_ZAPI2=$(zapi_send "55${THALES_PHONE:3}" \
  "Tenho orçamento aprovado de até R\$ 2.000 por mês para essa solução.")
S2_MSG_ID2=$(echo "$S2_ZAPI2" | jq -r '.messageId // empty')
S2_MSG_ID2="${S2_MSG_ID2:-S2_INBOUND2_${TEST_RUN_ID}}"

sleep "$WEBHOOK_WAIT"

evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$S2_MSG_ID2",
      "fromMe": false
    },
    "pushName": "Dany Couto",
    "messageType": "conversation",
    "message": { "conversation": "Tenho orçamento aprovado de até R$ 2.000 por mês para essa solução." },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)" > /dev/null

sleep "$AI_WAIT"

# Mensagem 3
S2_ZAPI3=$(zapi_send "55${THALES_PHONE:3}" \
  "Sou o diretor comercial, a decisão é minha. Quero começar o quanto antes.")
S2_MSG_ID3=$(echo "$S2_ZAPI3" | jq -r '.messageId // empty')
S2_MSG_ID3="${S2_MSG_ID3:-S2_INBOUND3_${TEST_RUN_ID}}"

sleep "$WEBHOOK_WAIT"

evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$S2_MSG_ID3",
      "fromMe": false
    },
    "pushName": "Dany Couto",
    "messageType": "conversation",
    "message": { "conversation": "Sou o diretor comercial, a decisão é minha. Quero começar o quanto antes." },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)" > /dev/null

sleep "$AI_WAIT"

# --- Mensagens ---
S2_INBOUND=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S1_CONV_ID}&direction=eq.inbound")
assert_gt "S2.1 Pelo menos 4 mensagens inbound (1 do S1 + 3 do S2)" "3" "$S2_INBOUND"

S2_OUTBOUND=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S1_CONV_ID}&direction=eq.outbound")
assert_gt "S2.2 Pelo menos 4 respostas da AI" "3" "$S2_OUTBOUND"

# --- AI log ---
S2_AI_RESPONDED=$(supabase_count "ai_conversation_log" \
  "conversation_id=eq.${S1_CONV_ID}&action_taken=eq.responded")
assert_gt "S2.3 AI respondeu pelo menos 4x no log" "3" "$S2_AI_RESPONDED"

# --- Avanço de estágio (pode ou não ter acontecido dependendo do threshold) ---
S2_STAGE_AFTER=$(supabase_field "deals" "id=eq.${S1_DEAL_ID}" "stage_id")
if [ "$S2_STAGE_AFTER" != "$S2_STAGE_BEFORE" ]; then
  pass "S2.4 Deal avançou de estágio (auto-advance)"
  export S1_DEAL_STAGE="$S2_STAGE_AFTER"
else
  # Check for pending HITL advance
  S2_HITL=$(supabase_count "ai_pending_stage_advances" \
    "deal_id=eq.${S1_DEAL_ID}&status=eq.pending" 2>/dev/null || echo "0")
  if [ "$S2_HITL" -gt 0 ]; then
    pass "S2.4 HITL pendente criado (requer confirmação humana)"
  else
    pass "S2.4 Estágio não avançou ainda (threshold não atingido — OK)"
  fi
fi

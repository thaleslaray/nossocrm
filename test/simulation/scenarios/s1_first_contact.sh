#!/usr/bin/env bash
# =============================================================================
# S1 — Primeiro Contato
# Valida: auto-criação de contato, conversa, deal e resposta da AI
# =============================================================================

S1_MSG_TEXT="Oi! Vi o anúncio de vocês e gostaria de saber mais sobre o CRM. [SIM-S1-${TEST_RUN_ID}]"

echo ""
echo "  Dany envia primeira mensagem para o Evolution..."
# Capture Z-API response to reuse its messageId in the manual fallback (idempotency)
S1_ZAPI_RESULT=$(zapi_send "55${THALES_PHONE:3}" "$S1_MSG_TEXT")
S1_MSG_ID=$(echo "$S1_ZAPI_RESULT" | jq -r '.messageId // empty')
# If Z-API didn't return a messageId, fall back to a unique synthetic ID
S1_MSG_ID="${S1_MSG_ID:-S1_INBOUND_${TEST_RUN_ID}}"
echo "  Z-API messageId: $S1_MSG_ID"

echo "  Aguardando webhook natural (${WEBHOOK_WAIT}s)..."
sleep "$WEBHOOK_WAIT"

# Fallback: trigger webhook manually using the same messageId from Z-API.
# If Evolution already fired the webhook, this is a no-op (duplicate check in edge fn).
# If not, this guarantees the CRM processes it.
echo "  Acionando webhook manualmente (fallback idempotente)..."
evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$S1_MSG_ID",
      "fromMe": false
    },
    "pushName": "Dany Couto",
    "messageType": "conversation",
    "message": { "conversation": $(echo "$S1_MSG_TEXT" | jq -Rs .) },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)" > /dev/null

echo "  Aguardando AI processar (${AI_WAIT}s)..."
sleep "$AI_WAIT"

# --- Contato ---
S1_CONTACT_ID=$(supabase_field "contacts" \
  "phone=eq.${DANY_PHONE_ENCODED}&organization_id=eq.${ORG_ID}" "id")
assert_not_empty "S1.1 Contato auto-criado" "$S1_CONTACT_ID"
export S1_CONTACT_ID

S1_CONTACT_NAME=$(supabase_field "contacts" "id=eq.${S1_CONTACT_ID}" "name")
assert_not_empty "S1.2 Contato tem nome" "$S1_CONTACT_NAME"

# --- Conversa ---
S1_CONV=$(supabase_first "messaging_conversations" \
  "channel_id=eq.${EVOLUTION_CHANNEL_ID}&external_contact_id=eq.${DANY_PHONE_ENCODED}")
S1_CONV_ID=$(echo "$S1_CONV" | jq -r '.id // empty')
assert_not_empty "S1.3 Conversa criada" "$S1_CONV_ID"
export S1_CONV_ID

assert_equals "S1.4 Conversa aberta (status=open)" \
  "open" "$(echo "$S1_CONV" | jq -r '.status')"

assert_not_empty "S1.5 Conversa vinculada ao contato" \
  "$(echo "$S1_CONV" | jq -r '.contact_id // empty')"

# --- Deal ---
S1_DEAL_ID=$(echo "$S1_CONV" | jq -r '.metadata.deal_id // empty')
assert_not_empty "S1.6 Deal auto-criado (metadata.deal_id)" "$S1_DEAL_ID"
export S1_DEAL_ID

S1_DEAL_STAGE=$(supabase_field "deals" "id=eq.${S1_DEAL_ID}" "stage_id")
assert_not_empty "S1.7 Deal tem estágio" "$S1_DEAL_STAGE"
export S1_DEAL_STAGE

# --- Mensagens ---
S1_INBOUND=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S1_CONV_ID}&direction=eq.inbound")
assert_equals "S1.8 Mensagem inbound salva" "1" "$S1_INBOUND"

S1_OUTBOUND=$(supabase_count "messaging_messages" \
  "conversation_id=eq.${S1_CONV_ID}&direction=eq.outbound")
assert_gt "S1.9 AI respondeu (outbound > 0)" "0" "$S1_OUTBOUND"

# --- AI log ---
S1_AI_ACTION=$(supabase_field "ai_conversation_log" \
  "conversation_id=eq.${S1_CONV_ID}&order=created_at.desc" "action_taken")
assert_equals "S1.10 AI action = responded" "responded" "$S1_AI_ACTION"

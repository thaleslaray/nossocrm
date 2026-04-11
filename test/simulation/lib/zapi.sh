#!/usr/bin/env bash
# =============================================================================
# Z-API helpers — envia mensagens do número da Dany (+351)
# =============================================================================

ZAPI_BASE="https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}"

zapi_send() {
  local phone=$1 message=$2
  local result
  result=$(curl -sf -X POST "${ZAPI_BASE}/send-text" \
    -H "Content-Type: application/json" \
    -H "Client-Token: $ZAPI_CLIENT_TOKEN" \
    -d "{\"phone\": \"$phone\", \"message\": $(echo "$message" | jq -Rs .)}")
  echo "$result"
}

# Send webhook directly to edge function (simulates Evolution firing)
# Usage: evolution_webhook_send '{"event":"MESSAGES_UPSERT","data":{...}}'
evolution_webhook_send() {
  local payload=$1
  local secret
  secret=$(resolve_evolution_secret)

  curl -sf -X POST \
    "${SUPABASE_URL}/functions/v1/messaging-webhook-evolution/${EVOLUTION_CHANNEL_ID}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${secret}" \
    -d "$payload"
}

# Simulate a status update event from Evolution
# Usage: evolution_status_update "$external_msg_id" 4   (4=delivered, 5=read, 3=sent)
evolution_status_update() {
  local external_id=$1 status_code=$2
  evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPDATE",
  "instance": "nossocrm-dev",
  "data": [
    {
      "key": {
        "remoteJid": "$DANY_PHONE_JID",
        "id": "$external_id",
        "fromMe": true
      },
      "update": { "status": $status_code }
    }
  ]
}
EOF
)"
}

# Send a real message FROM Thales (Evolution) TO a phone number.
# Returns the WhatsApp message ID from the API response.
# Usage: evolution_send "351911910326" "Hello"
evolution_send() {
  local phone=$1 message=$2
  local creds secret serverUrl instanceName
  creds=$(supabase_query "messaging_channels" "id=eq.${EVOLUTION_CHANNEL_ID}&select=credentials")
  secret=$(echo "$creds" | jq -r ".[0].credentials.apiKey")
  serverUrl=$(echo "$creds" | jq -r ".[0].credentials.serverUrl")
  instanceName=$(echo "$creds" | jq -r ".[0].credentials.instanceName")

  local result
  result=$(curl -sf -X POST \
    "${serverUrl}/message/sendText/${instanceName}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${secret}" \
    -d "{\"number\": \"${phone}\", \"text\": $(echo "$message" | jq -Rs .)}")
  echo "$result"
}

# Simulate outbound message from Thales' phone (fromMe: true)
evolution_fromme_send() {
  local msg_id="FROMME_${TEST_RUN_ID}" text=$1
  evolution_webhook_send "$(cat <<EOF
{
  "event": "MESSAGES_UPSERT",
  "instance": "nossocrm-dev",
  "data": {
    "key": {
      "remoteJid": "$DANY_PHONE_JID",
      "id": "$msg_id",
      "fromMe": true
    },
    "pushName": "Thales",
    "messageType": "conversation",
    "message": { "conversation": $(echo "$text" | jq -Rs .) },
    "messageTimestamp": $(date +%s)
  }
}
EOF
)"
  echo "$msg_id"
}

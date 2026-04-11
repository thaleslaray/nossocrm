#!/usr/bin/env bash
# =============================================================================
# Cleanup — deleta dados de teste da Dany antes/depois da simulação
# Ordem importa: mensagens → conversas → deals → contato
# =============================================================================

cleanup_dany() {
  echo "  [cleanup] Buscando dados da Dany..."

  # Find Dany's conversation in Evolution channel
  local conv_ids
  conv_ids=$(supabase_query "messaging_conversations" \
    "channel_id=eq.${EVOLUTION_CHANNEL_ID}&external_contact_id=eq.${DANY_PHONE_ENCODED}&select=id,metadata" \
    | jq -r '.[].id')

  for conv_id in $conv_ids; do
    # Delete messages
    supabase_delete "messaging_messages" "conversation_id=eq.${conv_id}"

    # Delete deal linked in metadata
    local deal_id
    deal_id=$(supabase_query "messaging_conversations" \
      "id=eq.${conv_id}&select=metadata" | jq -r '.[0].metadata.deal_id // empty')
    if [ -n "$deal_id" ] && [ "$deal_id" != "null" ]; then
      supabase_delete "deals" "id=eq.${deal_id}"
    fi

    # Delete conversation
    supabase_delete "messaging_conversations" "id=eq.${conv_id}"
    echo "  [cleanup] Conversa $conv_id deletada"
  done

  # Delete Dany's contact
  supabase_delete "contacts" \
    "phone=eq.${DANY_PHONE_ENCODED}&organization_id=eq.${ORG_ID}"
  echo "  [cleanup] Contato da Dany deletado"

  # Delete ai_conversation_log entries for any deleted conversations
  for conv_id in $conv_ids; do
    supabase_delete "ai_conversation_log" "conversation_id=eq.${conv_id}" 2>/dev/null || true
  done

  # Ensure Evolution channel is in connected status (may have been set to
  # 'connecting' by a reconnection webhook before the fix was deployed)
  supabase_patch "messaging_channels" \
    "id=eq.${EVOLUTION_CHANNEL_ID}" '{"status":"connected"}' 2>/dev/null || true
  echo "  [cleanup] Canal Evolution verificado (status=connected)"
}

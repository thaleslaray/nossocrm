#!/usr/bin/env bash
# =============================================================================
# S5 — Status Update (delivered / read)
# Valida: eventos messages.update atualizam status e timestamps
# Pré-condição: S1_CONV_ID exportado, ao menos uma mensagem outbound existe
# =============================================================================

if [ -z "${S1_CONV_ID:-}" ]; then
  echo "  [SKIP] S1_CONV_ID não definido — execute S1 primeiro"
  return 0
fi

# Get external_id of an existing outbound message
S5_EXT_ID=$(supabase_query "messaging_messages" \
  "conversation_id=eq.${S1_CONV_ID}&direction=eq.outbound&external_id=not.is.null&select=external_id&order=created_at.desc&limit=1" \
  | jq -r '.[0].external_id // empty')

if [ -z "$S5_EXT_ID" ] || [ "$S5_EXT_ID" = "null" ]; then
  echo "  [SKIP] Nenhuma mensagem outbound com external_id encontrada"
  return 0
fi

echo "  Simulando status update: delivered (4)..."
evolution_status_update "$S5_EXT_ID" 4
sleep "$STATUS_WAIT"

S5_STATUS=$(supabase_field "messaging_messages" \
  "external_id=eq.${S5_EXT_ID}" "status")
assert_equals "S5.1 Status atualizado para delivered" "delivered" "$S5_STATUS"

S5_DELIVERED_AT=$(supabase_field "messaging_messages" \
  "external_id=eq.${S5_EXT_ID}" "delivered_at")
assert_not_empty "S5.2 delivered_at preenchido" "$S5_DELIVERED_AT"

echo "  Simulando status update: read (5)..."
evolution_status_update "$S5_EXT_ID" 5
sleep "$STATUS_WAIT"

S5_STATUS=$(supabase_field "messaging_messages" \
  "external_id=eq.${S5_EXT_ID}" "status")
assert_equals "S5.3 Status atualizado para read" "read" "$S5_STATUS"

S5_READ_AT=$(supabase_field "messaging_messages" \
  "external_id=eq.${S5_EXT_ID}" "read_at")
assert_not_empty "S5.4 read_at preenchido" "$S5_READ_AT"

#!/usr/bin/env bash
# =============================================================================
# Simulation test config — loaded from .env.local when available
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load .env.local if available
if [ -f "$SCRIPT_DIR/../../.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/../../.env.local"
  set +a
fi

# Supabase
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://qokthqpkuhkhntirmmfu.supabase.co}"
SUPABASE_SERVICE_KEY="${SUPABASE_SECRET_KEY:-}"

# Evolution channel
EVOLUTION_CHANNEL_ID="71686185-922b-41a5-9be9-6ad3b23ef3c6"
THALES_PHONE="+5521982219966"   # Evolution — número do negócio no CRM

# Z-API (Dany — lead/cliente)
ZAPI_INSTANCE_ID="3A3B471470ED80D52354128DD59F0782"
ZAPI_TOKEN="0E79B549EE9B1417638984DB"
ZAPI_CLIENT_TOKEN="Ff8272f3d6eb44501adaf32f0c885911cS"
DANY_PHONE="+351911910326"
DANY_PHONE_JID="351911910326@s.whatsapp.net"
DANY_PHONE_ENCODED="${DANY_PHONE/+/%2B}"   # URL-encoded for Supabase REST queries

# Organization
ORG_ID="01518da8-9d63-4224-b146-163ead73d8cc"

# Timings (seconds)
WEBHOOK_WAIT=${WEBHOOK_WAIT:-5}
AI_WAIT=${AI_WAIT:-20}
STATUS_WAIT=${STATUS_WAIT:-8}

# Unique run ID to isolate test data
TEST_RUN_ID="${TEST_RUN_ID:-$(date +%s)}"

# Resolve Evolution webhook secret from channel credentials at runtime
resolve_evolution_secret() {
  local secret
  secret=$(supabase_query "messaging_channels" \
    "id=eq.${EVOLUTION_CHANNEL_ID}&select=credentials" | jq -r '.[0].credentials.apiKey // empty')
  echo "$secret"
}

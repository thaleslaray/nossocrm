#!/usr/bin/env bash
# =============================================================================
# NossoCRM — Simulation Test Suite
#
# Uso:
#   bash test/simulation/run.sh           # todos os cenários
#   bash test/simulation/run.sh s1        # cenário específico
#   bash test/simulation/run.sh s1 s3     # múltiplos cenários
#   AI_WAIT=30 bash test/simulation/run.sh  # override de timeout
#
# Pré-requisitos:
#   - .env.local na raiz do projeto (com SUPABASE_SECRET_KEY)
#   - jq instalado
#   - curl instalado
#   - Dev server rodando em localhost:3001 (ou APP_URL apontando para Vercel)
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load libs
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/assert.sh"
source "$SCRIPT_DIR/lib/supabase.sh"
source "$SCRIPT_DIR/lib/zapi.sh"
source "$SCRIPT_DIR/lib/cleanup.sh"

# Validate deps
command -v jq   >/dev/null 2>&1 || { echo "❌ jq não encontrado. Instale com: brew install jq"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "❌ curl não encontrado."; exit 1; }
[ -n "$SUPABASE_SERVICE_KEY" ]  || { echo "❌ SUPABASE_SERVICE_KEY não definido"; exit 1; }

SCENARIOS=("${@:-all}")

run_scenario() {
  local label=$1 file=$2
  echo ""
  echo "┌─────────────────────────────────────────"
  echo "│ $label"
  echo "└─────────────────────────────────────────"
  # shellcheck disable=SC1090
  source "$SCRIPT_DIR/scenarios/$file"
}

should_run() {
  local s=$1
  [[ "${SCENARIOS[*]}" == "all" ]] || [[ " ${SCENARIOS[*]} " == *" $s "* ]]
}

echo ""
echo "╔══════════════════════════════════════════"
echo "║  NossoCRM Simulation Tests"
echo "║  Run ID: $TEST_RUN_ID"
echo "╚══════════════════════════════════════════"

# Cleanup antes de S1
if should_run s1 || [[ "${SCENARIOS[*]}" == "all" ]]; then
  echo ""
  echo "  [setup] Limpando dados de teste anteriores da Dany..."
  cleanup_dany
fi

should_run s1 && run_scenario "S1 — Primeiro Contato" "s1_first_contact.sh"
should_run s2 && run_scenario "S2 — Qualificação BANT" "s2_qualification.sh"
should_run s3 && run_scenario "S3 — Handoff para Humano" "s3_handoff.sh"
should_run s4 && run_scenario "S4 — Outbound do Celular" "s4_outbound_phone.sh"
should_run s5 && run_scenario "S5 — Status Update" "s5_status_update.sh"

# S6 roda isolado com cleanup próprio (conversa outbound-initiated)
if should_run s6; then
  echo ""
  echo "  [setup S6] Limpando dados de teste anteriores da Dany..."
  cleanup_dany
  run_scenario "S6 — Outbound Ativo (prospecção)" "s6_outbound_active.sh"
fi

report_summary

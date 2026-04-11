#!/usr/bin/env bash
# =============================================================================
# Assertion helpers — PASS/FAIL tracking
# =============================================================================

SIM_PASS=0
SIM_FAIL=0

pass() {
  echo "  ✓ $1"
  ((SIM_PASS++)) || true
}

fail() {
  local label=$1 expected=$2 got=$3
  echo "  ✗ $label"
  echo "      esperado : $expected"
  echo "      obtido   : $got"
  ((SIM_FAIL++)) || true
}

assert_equals() {
  local label=$1 expected=$2 got=$3
  if [ "$got" = "$expected" ]; then
    pass "$label"
  else
    fail "$label" "$expected" "$got"
  fi
}

assert_not_empty() {
  local label=$1 got=$2
  if [ -n "$got" ] && [ "$got" != "null" ]; then
    pass "$label"
  else
    fail "$label" "<não vazio>" "$got"
  fi
}

assert_empty() {
  local label=$1 got=$2
  if [ -z "$got" ] || [ "$got" = "null" ] || [ "$got" = "[]" ] || [ "$got" = "0" ]; then
    pass "$label"
  else
    fail "$label" "<vazio>" "$got"
  fi
}

assert_gt() {
  local label=$1 threshold=$2 got=$3
  if [ -n "$got" ] && [ "$got" -gt "$threshold" ] 2>/dev/null; then
    pass "$label"
  else
    fail "$label" "> $threshold" "$got"
  fi
}

assert_contains() {
  local label=$1 needle=$2 haystack=$3
  if echo "$haystack" | grep -q "$needle"; then
    pass "$label"
  else
    fail "$label" "contém '$needle'" "$haystack"
  fi
}

# Retry an assertion up to N times with sleep between attempts
# Usage: retry_assert 3 5 assert_not_empty "label" "$value"
retry_assert() {
  local retries=$1 wait_sec=$2
  shift 2
  local attempt=1
  while [ $attempt -le $retries ]; do
    # Capture output without incrementing counters
    if "$@" 2>/dev/null; then
      return 0
    fi
    if [ $attempt -lt $retries ]; then
      echo "    (retry $attempt/$retries em ${wait_sec}s...)"
      sleep "$wait_sec"
    fi
    ((attempt++)) || true
  done
  "$@"  # Final attempt (counts toward FAIL)
}

report_summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PASS: $SIM_PASS  |  FAIL: $SIM_FAIL"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ "$SIM_FAIL" -eq 0 ]; then
    echo "  ✅ Todos os cenários passaram"
    exit 0
  else
    echo "  ❌ $SIM_FAIL asserção(ões) falharam"
    exit 1
  fi
}

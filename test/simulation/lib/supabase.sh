#!/usr/bin/env bash
# =============================================================================
# Supabase REST API helpers (service role — bypassa RLS)
# =============================================================================

supabase_query() {
  local table=$1 query=$2
  curl -sf \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    "${SUPABASE_URL}/rest/v1/${table}?${query}"
}

supabase_delete() {
  local table=$1 query=$2
  curl -sf -X DELETE \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    "${SUPABASE_URL}/rest/v1/${table}?${query}" \
    -o /dev/null
}

supabase_patch() {
  local table=$1 query=$2 body=$3
  curl -sf -X PATCH \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}/rest/v1/${table}?${query}" \
    -d "$body" \
    -o /dev/null
}

# Convenience: count rows matching query
supabase_count() {
  local table=$1 query=$2
  supabase_query "$table" "${query}&select=id" | jq 'length'
}

# Convenience: get a single field value
supabase_field() {
  local table=$1 query=$2 field=$3
  supabase_query "$table" "${query}&select=${field}&limit=1" | jq -r ".[0].${field} // empty"
}

# Convenience: get raw JSON of first row
supabase_first() {
  local table=$1 query=$2
  supabase_query "$table" "${query}&limit=1" | jq '.[0] // empty'
}

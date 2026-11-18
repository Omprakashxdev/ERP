#!/usr/bin/env bash
# =============================================================================
# SAEC ERP — runtime environment preflight (read-only).
#
# Validates the .env the app will boot with — not just that required keys
# exist, but that their values have safe properties. NEVER prints secret
# values; reports PASS/FAIL per property only.
#
#   usage: scripts/check-runtime-env.sh [path-to-env-file]
#   default env file: ./.env
#
# Exit 0 only when every check passes — safe to wire into a deploy gate.
# =============================================================================
set -euo pipefail

ENV_FILE="${1:-.env}"
PASS=0; FAILED=0
ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1"; FAILED=$((FAILED+1)); }

[[ -f "$ENV_FILE" ]] || { echo "FAIL  $ENV_FILE not found"; exit 1; }

get() { # value of KEY=... without echoing; strips surrounding quotes
  local v
  v=$(grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-) || true
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

echo "checking $ENV_FILE (values are never shown)"

# --- MOBILE_TOKEN_SECRET: dedicated mobile JWT key ---------------------------
S=$(get MOBILE_TOKEN_SECRET)
if [[ -z "$S" ]]; then
  bad "MOBILE_TOKEN_SECRET missing — mobile login cannot sign tokens"
elif [[ ${#S} -lt 32 ]]; then
  bad "MOBILE_TOKEN_SECRET too short (${#S} chars — needs ≥32)"
elif [[ "$S" =~ ^(change|test|dev|secret|xxx|todo) ]]; then
  bad "MOBILE_TOKEN_SECRET looks like a placeholder"
else
  ok "MOBILE_TOKEN_SECRET present, ${#S} chars"
fi

# --- PROGRESS_PHOTO_DIR: absolute, persistent, writable ----------------------
P=$(get PROGRESS_PHOTO_DIR)
if [[ -z "$P" ]]; then
  bad "PROGRESS_PHOTO_DIR missing — uploads would fall back under the app cwd"
elif [[ "$P" != /* ]]; then
  bad "PROGRESS_PHOTO_DIR not absolute: must start with /"
elif [[ "$P" == *"/.next/"* || "$P" == *"/standalone"* ]]; then
  bad "PROGRESS_PHOTO_DIR inside a replaceable build dir"
else
  ok "PROGRESS_PHOTO_DIR is an absolute persistent path"
  if [[ -d "$P" ]]; then
    [[ -w "$P" ]] && ok "$P exists and is writable" || bad "$P exists but is NOT writable"
  else
    parent="$P"; while [[ ! -d "$parent" ]]; do parent=$(dirname "$parent"); [[ "$parent" == "/" ]] && break; done
    [[ -w "$parent" ]] \
      && ok "$P does not exist yet; parent $parent writable (app will create it)" \
      || bad "cannot create $P — nearest existing parent $parent not writable"
  fi
fi

# --- Rate limiter: Upstash pair OR explicit memory opt-in --------------------
U=$(get UPSTASH_REDIS_REST_URL); T=$(get UPSTASH_REDIS_REST_TOKEN); F=$(get RATE_LIMIT_FALLBACK)
if [[ "$F" == "memory" ]]; then
  ok "rate limiting: RATE_LIMIT_FALLBACK=memory (single-process — correct for 1 PM2 fork instance)"
elif [[ -n "$U" && -n "$T" ]]; then
  if [[ "$U" == https://* ]]; then
    ok "rate limiting: Upstash Redis configured"
  else
    bad "UPSTASH_REDIS_REST_URL is not an https:// URL"
  fi
elif [[ -n "$U" || -n "$T" ]]; then
  bad "Upstash half-configured — both UPSTASH_REDIS_REST_URL and _TOKEN are required"
else
  bad "no rate-limit backend — app REFUSES TO BOOT (instrumentation is fail-closed). Set Upstash pair or RATE_LIMIT_FALLBACK=memory"
fi

# --- Existing required keys (presence only) ----------------------------------
for v in DATABASE_URL AUTH_SECRET; do
  [[ -n "$(get "$v")" ]] && ok "$v present" || bad "$v missing"
done

echo
echo "preflight: $PASS passed, $FAILED failed"
[[ $FAILED -eq 0 ]]

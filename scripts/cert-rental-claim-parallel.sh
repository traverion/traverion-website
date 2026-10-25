#!/usr/bin/env bash
# True multi-connection last-unit race for rental holds.
set -euo pipefail
cd "$(dirname "$0")/.."

SETUP_FILE=$(mktemp)
npx supabase db query --linked -f scripts/cert-rental-race-setup.sql >"$SETUP_FILE" 2>&1

LISTING_ID=$(python3 - <<'PY' "$SETUP_FILE"
import re,sys
text=open(sys.argv[1]).read()
ids=re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", text, re.I)
print(ids[0] if ids else "")
PY
)

if [[ -z "$LISTING_ID" ]]; then
  echo "FAIL: could not create race listing"
  cat "$SETUP_FILE"
  exit 1
fi

echo "listing=$LISTING_ID"
KEYA="race-a-$LISTING_ID"
KEYB="race-b-$LISTING_ID"
START="2031-08-01 09:00:00+00"
END="2031-08-02 18:00:00+00"

claim() {
  local key=$1
  local outfile=$2
  # Cap wait: concurrent CLI auth can stall; advisory lock itself should finish quickly.
  ( npx supabase db query --linked \
    "select public.claim_rental_inventory_hold('${LISTING_ID}'::uuid, 'race-m', 1, timestamptz '${START}', timestamptz '${END}', '${key}', 30) as result;" \
    >"$outfile" 2>&1 ) &
  local cpid=$!
  local waited=0
  while kill -0 "$cpid" 2>/dev/null; do
    if [[ "$waited" -ge 45 ]]; then
      kill "$cpid" 2>/dev/null || true
      echo "TIMEOUT" >>"$outfile"
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$cpid" 2>/dev/null || true
}

TMPA=$(mktemp)
TMPB=$(mktemp)
claim "$KEYA" "$TMPA" &
PA=$!
claim "$KEYB" "$TMPB" &
PB=$!
wait "$PA" || true
wait "$PB" || true

ok_count() {
  python3 - <<'PY' "$1"
import json,re,sys
text=open(sys.argv[1]).read()
# Prefer structured JSON parse
ok=0
for m in re.finditer(r'\{[^{}]*"ok"\s*:\s*true[^{}]*\}', text):
    ok=1
# nested result object
if re.search(r'"ok"\s*:\s*true', text):
    # count distinct claim success markers carefully: one result object with ok true
    ok = 1 if re.search(r'"ok"\s*:\s*true', text) else 0
print(ok)
PY
}

OKA=$(ok_count "$TMPA")
OKB=$(ok_count "$TMPB")
echo "--- A ---"; cat "$TMPA"
echo "--- B ---"; cat "$TMPB"
echo "ok_a=$OKA ok_b=$OKB"

npx supabase db query --linked "
select public.release_rental_inventory_hold(id, 'race_cleanup')
from public.rental_inventory_holds where listing_id = '${LISTING_ID}'::uuid;
delete from public.rental_inventory_holds where listing_id = '${LISTING_ID}'::uuid;
delete from public.listings where id = '${LISTING_ID}'::uuid;
" >/dev/null 2>&1 || true

TOTAL=$((OKA + OKB))
if [[ "$TOTAL" -eq 1 ]]; then
  echo "PASS: exactly one concurrent claim succeeded"
  exit 0
fi
echo "FAIL: expected exactly one success, got $TOTAL"
exit 1

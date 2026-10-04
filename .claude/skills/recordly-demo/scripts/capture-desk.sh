#!/usr/bin/env bash
# capture-desk.sh [--dry-run]          part B's captures and off-camera steps on ONE fresh desk (runbook B4; long: bg.sh)
#
# Needs: source demo.env (S, PDB, SCRATCH, P, I, DESK_DIR, PWPATH, CHROME_PATH, THEME_*), the desk running fresh
# (desk-server.sh start / restart, after the B3 preflight), part A captured (6 starts from 4-menu's cursor), and
# $P/storyboard.json with the desk shots merged (fill-client.cjs desk-storyboard). The order (lessons B1-B13):
#   1. 6-desk-signin, 7-desk-onboard, [7b-desk-fees on the owner-fees path], 8-desk-sale-start, 9-desk-buyer
#   2. the scenarios filled from client-inputs.json (fill-client.cjs scenario) and validated (validate-scenario.cjs)
#   3. the B4 set-up deal: desk-walk sale.cjs james-carter-to-registration (STOP_AT plan:registration) → 11-desk-guide
#   4. 10-desk-readback (it makes its own deal)
#   5. the off-camera complete sale: sale.cjs james-carter, ceremony-hand.cjs (the buyer's hand), → 12-desk-signed
#   6. the deal's PDFs (desk-walk pdfs.cjs) → partB.docFileName in client-inputs.json, and the 130-U's signature page
#      rasterised to public/docs/130u-p1.png (raster-docs.sh --find CERTIFICATION)
# On a failure it restarts the desk (a fresh mock: the member un-onboarded, no deals) and runs the whole order once
# more from 6 (lesson N6); a second failure stops with the log. Prints "DESK CAPTURES OK" at the end.
set -uo pipefail
for v in S PDB SCRATCH P I DESK_DIR PWPATH CHROME_PATH; do [ -n "${!v:-}" ] || { echo "source demo.env first ($v is empty)" >&2; exit 2; }; done
DRY=0; [ "${1:-}" = --dry-run ] && DRY=1
SB="$P/storyboard.json"
ONB="$(node -e 'console.log((require(process.argv[1]).partB||{}).onboarding||"")' "$I")"
case "$ONB" in owner-fees) export DESK_COOKIE='owner@example.dev' ;; sales) export DESK_COOKIE='sales:sales@example.dev' ;; *) echo "client-inputs.json partB.onboarding is not set: runbook B0 (ask the user)" >&2; exit 2 ;; esac
export PREVIEW_ADMIN="$DESK_COOKIE" DESK_BASE="${DESK_BASE:-http://localhost:5190}"
: "${THEME_ACCENT:?run scripts/desk/theme.cjs --into $SCRATCH/demo.env (runbook B3), then source demo.env}"
FIRST=(6-desk-signin 7-desk-onboard); [ "$ONB" = owner-fees ] && FIRST+=(7b-desk-fees); FIRST+=(8-desk-sale-start 9-desk-buyer)
run() { echo "+ $*"; [ "$DRY" = 1 ] && return 0; "$@"; }
cap() { local id="$1"; shift; run nice -n 15 node "$S/scripts/capture.cjs" --storyboard "$SB" --shot "$id" --out "$SCRATCH/captures/$id" --publish "$P/public/shots" --clean "$@"; }
dealvar() { echo "deal=$(basename "$(tr -d '\n' < "$1")")"; }

attempt() {
  rm -rf "$SCRATCH/b4" "$SCRATCH/sale" "$SCRATCH/ceremony" "$SCRATCH/pdfs"
  for id in "${FIRST[@]}"; do cap "$id" || return 1; done
  mkdir -p "$SCRATCH/scenarios"
  for n in james-carter-to-registration james-carter; do
    run node "$S/scripts/fill-client.cjs" scenario "$I" "$S/assets/desk-scenarios/$n.json" --out "$SCRATCH/scenarios/$n.json" || return 1
  done
  run node "$S/scripts/desk/validate-scenario.cjs" "$SCRATCH/scenarios/james-carter-to-registration.json" "$SCRATCH/scenarios/james-carter.json" --desk "$DESK_DIR" --strict || return 1
  run env STOP_AT='plan:registration' node "$PDB/scripts/desk-walk/sale.cjs" "$SCRATCH/b4" "$SCRATCH/scenarios/james-carter-to-registration.json" 1440 900 || return 1
  [ "$DRY" = 1 ] || [ -s "$SCRATCH/b4/deal.txt" ] || { echo "the set-up walk wrote no deal.txt"; return 1; }
  cap 11-desk-guide --var "$( [ "$DRY" = 1 ] && echo deal=DEAL || dealvar "$SCRATCH/b4/deal.txt")" || return 1
  cap 10-desk-readback || return 1
  run node "$PDB/scripts/desk-walk/sale.cjs" "$SCRATCH/sale" "$SCRATCH/scenarios/james-carter.json" 1440 900 || return 1
  local deal="DEAL"; [ "$DRY" = 1 ] || deal="$(tr -d '\n' < "$SCRATCH/sale/deal.txt")"
  run node "$S/scripts/desk/ceremony-hand.cjs" "$deal" --out "$SCRATCH/ceremony" || return 1
  cap 12-desk-signed --var "deal=$(basename "$deal")" || return 1
  run node "$PDB/scripts/desk-walk/pdfs.cjs" "$SCRATCH/pdfs" "$deal" || return 1
  [ "$DRY" = 1 ] && return 0
  local u130; u130="$(ls "$SCRATCH/pdfs"/130-U_*.pdf 2>/dev/null | grep -v VOIDED | head -1)"
  [ -n "$u130" ] || { echo "no 130-U PDF in $SCRATCH/pdfs"; return 1; }
  node -e 'const fs=require("fs");const [f,n]=process.argv.slice(1);const j=JSON.parse(fs.readFileSync(f,"utf8"));j.partB=Object.assign({},j.partB,{docFileName:n});fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n");console.log("partB.docFileName =",n)' "$I" "$(basename "$u130")"
  bash "$S/scripts/raster-docs.sh" "$u130" "$P/public/docs/130u-p1.png" --find "CERTIFICATION" || return 1
}

if attempt; then echo "DESK CAPTURES OK: ${FIRST[*]} 11-desk-guide 10-desk-readback 12-desk-signed; docs/130u-p1.png"; exit 0; fi
[ "$DRY" = 1 ] && exit 1
echo "== a step failed: restarting the desk (fresh mock) and running the whole order once more from 6 (lesson N6)"
bash "$S/scripts/desk/desk-server.sh" restart || exit 1
if attempt; then echo "DESK CAPTURES OK (second attempt): ${FIRST[*]} 11-desk-guide 10-desk-readback 12-desk-signed; docs/130u-p1.png"; exit 0; fi
echo "DESK CAPTURES FAILED twice: stop here and send the user this log (the desk may have changed: runbook B3)"; exit 1

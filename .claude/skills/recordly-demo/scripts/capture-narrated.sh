#!/usr/bin/env bash
# capture-narrated.sh [--dry-run]      the narrated cut's desk captures (20-27) and off-camera steps on ONE fresh desk
#                                      (runbook N9; long: bg.sh)
# Needs: source demo.env (S, PDB, SCRATCH, P, I, DESK_DIR, PWPATH, CHROME_PATH, THEME_*), the desk freshly
# (re)started, $P/narration/storyboard-long.json (fill-client.cjs long-storyboard, with the demo card made by
# make-demo-card.mjs) and part A/B's captures 1-8 already in $P/public/shots (the plan reuses them). The order
# (examples/discount-used-cars/storyboard-long.json notes; lessons N1-N12):
#   1. onboard the member off camera (scripts/desk/onboard.cjs: the same strokes as 7; FEES from partB.demoFee)
#   2. 20-car, 21-buyer (its Start Sale makes the deal) → latest-deal.cjs → $SCRATCH/n-deal.txt
#   3. the licence review confirmed off camera (review-confirm.cjs), then 22-money and 23-plan (--var deal)
#   4. the rest of the guide off camera: RESUME_DEAL sale.cjs with the filled carter-balance scenario
#   5. the documents before signing: pdfs.cjs → $SCRATCH/n-pdf-pre
#   6. 24-desk-qr, then the packet's signing link (signing-link.cjs) → 26-phone-sign --var sign=…, a second session's
#      link → 26b-phone-sign --var sign2=… (its drawing is the alternate hand, lesson N5)
#   7. Mark Sold And Close (close-sale.cjs) → 27-desk-stored; the documents after signing → $SCRATCH/n-pdf-post
#   8. the pages the overlays show, chosen by text (raster-docs.sh --find): public/docs/narr-bos-p2.png ("Total Amount
#      Due"), narr-130u-p1.png ("CERTIFICATION"), narr-bos-p4-signed.png ("Buyer Signature", after signing)
# A failure restarts the desk and runs the whole order once more; a second failure stops. Prints NARRATED CAPTURES OK.
set -uo pipefail
for v in S PDB SCRATCH P I DESK_DIR PWPATH CHROME_PATH; do [ -n "${!v:-}" ] || { echo "source demo.env first ($v is empty)" >&2; exit 2; }; done
DRY=0; [ "${1:-}" = --dry-run ] && DRY=1
SB="$P/narration/storyboard-long.json"
[ -f "$SB" ] || { echo "no $SB: fill-client.cjs long-storyboard first (runbook N8)" >&2; exit 2; }
read -r ONB FEE <<<"$(node -e 'const B=(require(process.argv[1]).partB||{});console.log((B.onboarding||"-")+" "+(B.demoFee&&B.demoFee.cents?(B.demoFee.cents/100).toFixed(2):"-"))' "$I")"
case "$ONB" in owner-fees) export DESK_COOKIE='owner@example.dev' FEES="$FEE" ;; sales) export DESK_COOKIE='sales:sales@example.dev'; unset FEES ;; *) echo "partB.onboarding is not set (runbook B0)" >&2; exit 2 ;; esac
export PREVIEW_ADMIN="$DESK_COOKIE" DESK_BASE="${DESK_BASE:-http://localhost:5190}"
: "${THEME_ACCENT:?run scripts/desk/theme.cjs --into $SCRATCH/demo.env, then source demo.env}"
run() { echo "+ $*"; [ "$DRY" = 1 ] && return 0; "$@"; }
cap() { local id="$1"; shift; run nice -n 15 node "$S/scripts/capture.cjs" --storyboard "$SB" --shot "$id" --out "$SCRATCH/captures/$id" --publish "$P/public/shots" --clean "$@"; }

attempt() {
  rm -rf "$SCRATCH/n-sale" "$SCRATCH/n-pdf-pre" "$SCRATCH/n-pdf-post"; rm -f "$SCRATCH/n-deal.txt" "$SCRATCH/n-sign.txt" "$SCRATCH/n-sign2.txt"
  run node "$S/scripts/desk/onboard.cjs" || return 1
  cap 20-car || return 1
  cap 21-buyer || return 1
  run node "$S/scripts/desk/latest-deal.cjs" --buyer Carter --out "$SCRATCH/n-deal.txt" || return 1
  local deal=/admin/sales/DEAL; [ "$DRY" = 1 ] || deal="$(tr -d '\n' < "$SCRATCH/n-deal.txt")"
  local dv="deal=$(basename "$deal")"
  run node "$S/scripts/desk/review-confirm.cjs" "$deal" || return 1
  cap 22-money --var "$dv" || return 1
  cap 23-plan --var "$dv" || return 1
  mkdir -p "$SCRATCH/scenarios"
  run node "$S/scripts/fill-client.cjs" scenario "$I" "$S/assets/desk-scenarios/carter-balance.json" --out "$SCRATCH/scenarios/carter-balance.json" || return 1
  run node "$S/scripts/desk/validate-scenario.cjs" "$SCRATCH/scenarios/carter-balance.json" --desk "$DESK_DIR" --strict || return 1
  run env RESUME_DEAL="$deal" node "$PDB/scripts/desk-walk/sale.cjs" "$SCRATCH/n-sale" "$SCRATCH/scenarios/carter-balance.json" 1440 900 || return 1
  run node "$PDB/scripts/desk-walk/pdfs.cjs" "$SCRATCH/n-pdf-pre" "$deal" || return 1
  cap 24-desk-qr --var "$dv" || return 1
  run node "$S/scripts/desk/signing-link.cjs" "$deal" --out "$SCRATCH/n-sign.txt" || return 1
  cap 26-phone-sign --var "sign=$( [ "$DRY" = 1 ] && echo SIGN || tr -d '\n' < "$SCRATCH/n-sign.txt")" || return 1
  run node "$S/scripts/desk/signing-link.cjs" "$deal" --out "$SCRATCH/n-sign2.txt" || return 1
  cap 26b-phone-sign --var "sign2=$( [ "$DRY" = 1 ] && echo SIGN2 || tr -d '\n' < "$SCRATCH/n-sign2.txt")" || return 1
  run node "$S/scripts/desk/close-sale.cjs" "$deal" || return 1
  cap 27-desk-stored --var "$dv" || return 1
  run node "$PDB/scripts/desk-walk/pdfs.cjs" "$SCRATCH/n-pdf-post" "$deal" || return 1
  [ "$DRY" = 1 ] && return 0
  local bos u130 bos2
  bos="$(ls "$SCRATCH/n-pdf-pre"/*BillOfSale*.pdf 2>/dev/null | grep -v VOIDED | head -1)"
  u130="$(ls "$SCRATCH/n-pdf-pre"/130-U_*.pdf 2>/dev/null | grep -v VOIDED | head -1)"
  bos2="$(ls "$SCRATCH/n-pdf-post"/*BillOfSale*.pdf 2>/dev/null | grep -v VOIDED | head -1)"
  [ -n "$bos" ] && [ -n "$u130" ] && [ -n "$bos2" ] || { echo "the deal's bill of sale / 130-U PDFs are missing"; return 1; }
  bash "$S/scripts/raster-docs.sh" "$bos" "$P/public/docs/narr-bos-p2.png" --find "Total Amount Due" || return 1
  bash "$S/scripts/raster-docs.sh" "$u130" "$P/public/docs/narr-130u-p1.png" --find "CERTIFICATION" || return 1
  bash "$S/scripts/raster-docs.sh" "$bos2" "$P/public/docs/narr-bos-p4-signed.png" --find "Buyer Signature" || return 1
}

if attempt; then echo "NARRATED CAPTURES OK: 20-car 21-buyer 22-money 23-plan 24-desk-qr 26-phone-sign 26b-phone-sign 27-desk-stored; docs narr-*.png; deal $(cat "$SCRATCH/n-deal.txt" 2>/dev/null)"; exit 0; fi
[ "$DRY" = 1 ] && exit 1
echo "== a step failed: restarting the desk (fresh mock) and running the whole order once more (lesson N6)"
bash "$S/scripts/desk/desk-server.sh" restart || exit 1
if attempt; then echo "NARRATED CAPTURES OK (second attempt)"; exit 0; fi
echo "NARRATED CAPTURES FAILED twice: stop and send the user this log (the desk may have changed: runbook N8)"; exit 1

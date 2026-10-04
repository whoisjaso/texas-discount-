#!/usr/bin/env bash
# verify.sh <project-dir> [film.mp4] [out-dir] [extra verify-film.cjs flags…]          (runbook A/B verify step)
#
# The gates a film must pass before anyone sees it (references/verification.md): container and frame count, a
# per-frame luma scan for one-frame glitches, black last frame, every in-window cut (PSNR >= 45 dB, same cursor and
# scroll), white page = 255 at the window edges, true peak < -1 dBTP, an onset map where every sound sits on an
# on-screen event, no isolated blips, and ~46 labelled stills + a contact sheet to look at.
#
#   bash $S/scripts/verify.sh $P out/$SLUG-demo.mp4 $SCRATCH/verify
#   bash $S/scripts/verify.sh $P out/$SLUG-demo-narrated.mp4 $SCRATCH/verify-n --composition Narrated
#        (the narrated cut: runs narrated-verify.cjs, the voice-led gates)
#
# Exit 0 = every scripted gate passed. The by-eye gates (every still, the zooms at 100%, one full watch with sound) are
# NOT passed by this script: they are recorded with `runbook.cjs mark` (a model that cannot see images or hear audio
# sends the contact sheet / the film to the user and records the user's words; it never self-certifies).
# Allowances (--allow-spikes 812, --allow-onsets 1450, --allow-cut <film frame>) are refused unless
# $P/verify-decisions.md has an allow-<kind> row naming that frame (runbook.cjs mark <step> --allow spike:812 --why …
# --by-agent "<what you looked at>"). Every allowance used is written into <out>/report.json → allowances, which the
# send note lists. Takes 2.5-4 minutes (8-10 for the narrated cut): run it through bg.sh.
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$(cd "${1:?usage: verify.sh <project-dir> [film.mp4] [out-dir] [--composition Narrated] [verify flags]}" && pwd)"
MP4="${2:-out/demo-v1.mp4}"
case "$MP4" in /*) ;; *) MP4="$PROJECT/$MP4" ;; esac
OUT="${3:-${SCRATCH:-/tmp}/verify-$(basename "$PROJECT")-$(basename "$MP4" .mp4)}"
shift $(( $# < 3 ? $# : 3 ))
COMP=Demo; EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --composition) COMP="$2"; shift 2 ;;
    --allow-spikes|--allow-onsets|--allow-cut)
      kind="${1#--allow-}"; kind="${kind%s}"
      node "$SKILL/scripts/decisions.cjs" check "$PROJECT" "$kind" "$2" || exit 2
      EXTRA+=("$1" "$2"); shift 2 ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done
[ -f "$MP4" ] || { echo "no film at $MP4" >&2; exit 2; }
[ -d "$PROJECT/node_modules/esbuild" ] || { echo "run npm ci in $PROJECT first (the verifier bundles the project's own timeline with its esbuild)" >&2; exit 2; }
set +e
if [ "$COMP" = Narrated ]; then
  nice -n 15 node "$SKILL/scripts/narrated-verify.cjs" --project "$PROJECT" --mp4 "$MP4" --out "$OUT" "${EXTRA[@]}"
else
  nice -n 15 node "$SKILL/scripts/verify-film.cjs" --project "$PROJECT" --mp4 "$MP4" --out "$OUT" "${EXTRA[@]}"
fi
rc=$?
set -e
if [ -f "$OUT/report.json" ]; then
  node -e '
    const fs = require("fs"); const [f, project] = process.argv.slice(1);
    const { rows } = require(process.argv[3]);
    const r = JSON.parse(fs.readFileSync(f, "utf8"));
    r.allowances = rows(project).filter((x) => /^allow-/.test(x.kind));
    fs.writeFileSync(f, JSON.stringify(r, null, 1));
    console.log(`allowances recorded in the report: ${r.allowances.length ? r.allowances.map((a) => `${a.kind} ${a.what} (${a.why})`).join("; ") : "none"}`);
  ' "$OUT/report.json" "$PROJECT" "$SKILL/scripts/decisions.cjs"
fi
exit $rc

#!/usr/bin/env bash
# verify.sh <project-dir> [film.mp4] [out-dir] [extra verify-film.cjs flags…]
#
# The gates a film must pass before anyone sees it (references/verification.md): container and frame count, a
# per-frame luma scan for one-frame glitches, black last frame, every in-window cut (PSNR >= 45 dB, same cursor and
# scroll), white page = 255 at the window edges, true peak < -1 dBTP, an onset map where every sound sits on an
# on-screen event, no isolated blips, and ~46 labelled stills + a contact sheet to look at.
#
#   .claude/skills/recordly-demo/scripts/verify.sh clients/vegas-auto-sales-demo out/demo-v1.mp4 $SCRATCH/verify-v1
#
# Exit 0 = every gate passed (then still look at the contact sheet and the zoom stills at 100%).
# A spike or onset you have looked at and explained can be allowed: --allow-spikes 812 --allow-onsets 1450.
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$(cd "${1:?usage: verify.sh <project-dir> [film.mp4] [out-dir]}" && pwd)"
MP4="${2:-out/demo-v1.mp4}"
case "$MP4" in /*) ;; *) MP4="$PROJECT/$MP4" ;; esac
OUT="${3:-${SCRATCH:-/tmp}/verify-$(basename "$PROJECT")-$(basename "$MP4" .mp4)}"
shift $(( $# < 3 ? $# : 3 ))
[ -f "$MP4" ] || { echo "no film at $MP4" >&2; exit 2; }
[ -d "$PROJECT/node_modules/esbuild" ] || { echo "run npm install in $PROJECT first (the verifier bundles the project's own timeline with its esbuild)" >&2; exit 2; }
exec nice -n 15 node "$SKILL/scripts/verify-film.cjs" --project "$PROJECT" --mp4 "$MP4" --out "$OUT" "$@"

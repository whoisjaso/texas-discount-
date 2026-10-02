#!/usr/bin/env bash
# render.sh <project-dir> [name] [--check]     e.g.  render.sh clients/vegas-auto-sales-demo demo-v1
#   --check  stop after the preflight and the typecheck (no render)
#
# Renders the master exactly as the approved Discount film was rendered, then a share copy for chat:
#   out/<name>.mp4        h264 CRF 16 (JPEG frames q95, concurrency 3; remotion.config.ts) + AAC, 1920x1080 30 fps
#   out/<name>-share.mp4  libx264 slow CRF 23 (raised until <= 24 MB), yuv420p, AAC 160k, +faststart
#
# Before rendering it checks that every file the film needs is in public/ (sfx, fonts, logos, captures) and runs the
# typecheck in the foreground (a typecheck chained in front of a backgrounded render hides its result).
# The render runs under nice -n 15 (~11-12 min for ~1500 frames). Only the webpack bundles this run creates in /tmp
# are deleted afterwards (another render may be using its own).
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK=0; POS=()
for a in "$@"; do [ "$a" = --check ] && CHECK=1 || POS+=("$a"); done
PROJECT="$(cd "${POS[0]:?usage: render.sh <project-dir> [name] [--check]}" && pwd)"
NAME="${POS[1]:-demo-v1}"
MAX_SHARE_MB="${MAX_SHARE_MB:-24}"
cd "$PROJECT"

echo "== preflight: files the film reads"
missing=0
for f in $(grep -o '"\(sfx\|fonts\)/[^"]*"' src/theme.ts | tr -d '"' | sort -u) \
         $(grep -oE '(mark|logoReverse): "[^"]+"' src/project.ts | sed -E 's/.*"(.+)"/\1/'); do
  [ -f "public/$f" ] || { echo "MISSING public/$f"; missing=1; }
done
PLAN="$(node "$SKILL/scripts/verify-film.cjs" --project . --plan 2>/dev/null)" || {
  echo "MISSING captures: public/shots/<id>/cursor.json for a timeline segment (capture first), or npm ci not run"; missing=1; PLAN=""; }
if [ -n "$PLAN" ]; then
  for id in $(printf '%s' "$PLAN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);console.log([...new Set(p.segments.map(x=>x.shot))].join(" "))})'); do
    [ -f "public/shots/$id/shot.mp4" ] || { echo "MISSING public/shots/$id/shot.mp4"; missing=1; }
  done
fi
grep -q 'stage: \[0, 0, 0, 0\]' src/project.ts && { echo "project.loader is still the template placeholder: run measure-site.cjs and fill-client.cjs"; missing=1; }
[ "$missing" = 0 ] || exit 1

echo "== typecheck"
npx tsc --noEmit
if [ "$CHECK" = 1 ]; then echo "check OK: ready to render"; exit 0; fi

HS="$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux 2>/dev/null | head -1)/headless_shell"
[ -x "$HS" ] || { echo "no headless shell under /opt/pw-browsers (never run playwright install; see SKILL.md Requirements)"; exit 1; }
before="$(ls -d /tmp/remotion-webpack-bundle-* 2>/dev/null | sort || true)"
mkdir -p out
echo "== render out/$NAME.mp4 (nice -n 15)"
nice -n 15 npx remotion render src/index.ts Demo "out/$NAME.mp4" --codec h264 --crf 16 --browser-executable="$HS"
after="$(ls -d /tmp/remotion-webpack-bundle-* 2>/dev/null | sort || true)"
comm -13 <(echo "$before") <(echo "$after") | while read -r d; do [ -n "$d" ] && rm -rf "$d"; done

echo "== share copy (<= ${MAX_SHARE_MB} MB)"
crf=23
while :; do
  nice -n 15 ffmpeg -nostdin -v error -y -i "out/$NAME.mp4" -c:v libx264 -preset slow -crf "$crf" -pix_fmt yuv420p \
    -c:a aac -b:a 160k -movflags +faststart "out/$NAME-share.mp4"
  size=$(stat -c %s "out/$NAME-share.mp4")
  if [ "$size" -le $((MAX_SHARE_MB * 1024 * 1024)) ] || [ "$crf" -ge 31 ]; then break; fi
  crf=$((crf + 2))
done
ls -l "out/$NAME.mp4" "out/$NAME-share.mp4"
echo "share copy: CRF $crf, $(awk "BEGIN{printf \"%.1f\", $size/1048576}") MB"
echo "next: $SKILL/scripts/verify.sh $PROJECT out/$NAME.mp4"

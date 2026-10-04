#!/usr/bin/env bash
# render.sh <project-dir> <name> [--check] [--composition Demo|Narrated] [--frames A-B] [--concat] [--no-share]
#   e.g.  render.sh $P $SLUG-demo            (the house film, parts A + B)       render.sh $P demo-v1 (site only)
#         render.sh $P $SLUG-demo-narrated --composition Narrated
#   --check        stop after the preflight and the typecheck (no render)
#   --frames A-B   render only film frames A..B into out/<name>.part-A-B.mp4 (recovery after a kill or an OOM: render
#                  the missing ranges, each starting on a keyframe of the part before, then --concat)
#   --concat       join out/<name>.part-*.mp4 in frame order by stream copy (concat demuxer) into out/<name>.mp4
#   --no-share     skip the chat copy
#
# Renders the master as the approved films were rendered, then the chat copy:
#   out/<name>.mp4       h264 CRF ${CRF:-16} (the desk and narrated films: CRF=17 AUDIO_BITRATE=192k), JPEG frames q95,
#                        concurrency 3, AAC; remuxed +faststart
#   out/<name>-chat.mp4  scripts/share.sh: two-pass x264 to <= 28 MB (the chat's upload limit is 30 MB), same frames
# Before rendering it checks every file the film reads (sfx, fonts, logos, every capture, every docs/*.png and vo/*.wav
# the project's src references), that no double-brace placeholder is left, and runs the typecheck in the foreground.
# Long: the house film ~12-30 min, the narrated cut ~80 min. Run it through bg.sh (references/harness.md); never in a
# foreground call that a harness may time out. The browser is $HEADLESS_SHELL, else the first
# $PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-*/chrome-linux/headless_shell (default /opt/pw-browsers).
# Only the webpack bundles this run creates in /tmp are deleted afterwards (another render may be using its own).
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK=0; COMP=Demo; FRAMES=""; CONCAT=0; SHARE=1; POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1; shift ;; --composition) COMP="$2"; shift 2 ;; --frames) FRAMES="$2"; shift 2 ;;
    --concat) CONCAT=1; shift ;; --no-share) SHARE=0; shift ;; *) POS+=("$1"); shift ;;
  esac
done
PROJECT="$(cd "${POS[0]:?usage: render.sh <project-dir> <name> [--check] [--composition Demo|Narrated] [--frames A-B] [--concat]}" && pwd)"
NAME="${POS[1]:?give the output name: <slug>-demo (or demo-v1 for a site-only film, <slug>-demo-narrated)}"
case "$COMP" in Demo|Narrated) ;; *) echo "--composition is Demo or Narrated" >&2; exit 2 ;; esac
cd "$PROJECT"
mkdir -p out

if [ "$CONCAT" = 1 ]; then
  parts=( $(ls out/"$NAME".part-*.mp4 2>/dev/null | sed -E 's/.*\.part-([0-9]+)-([0-9]+)\.mp4$/\1 &/' | sort -n | cut -d' ' -f2) )
  [ "${#parts[@]}" -gt 0 ] || { echo "no out/$NAME.part-*.mp4 to join" >&2; exit 1; }
  lst="$(mktemp)"; for p in "${parts[@]}"; do echo "file '$PROJECT/$p'" >> "$lst"; done
  ffmpeg -nostdin -v error -y -f concat -safe 0 -i "$lst" -c copy -movflags +faststart "out/$NAME.mp4"; rm -f "$lst"
  echo "joined ${#parts[@]} parts (stream copy) -> out/$NAME.mp4 ($(ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of default=nw=1:nk=1 "out/$NAME.mp4") frames)"
  [ "$SHARE" = 1 ] && bash "$SKILL/scripts/share.sh" "out/$NAME.mp4" 28
  echo "RENDERED out/$NAME.mp4"; exit 0
fi

echo "== preflight: files the film reads"
missing=0
for f in $(grep -o '"\(sfx\|fonts\)/[^"]*"' src/theme.ts | tr -d '"' | sort -u) \
         $(grep -oE '(mark|logoReverse): "[^"]+"' src/project.ts | sed -E 's/.*"(.+)"/\1/') \
         $(grep -rhoE '"docs/[^"]+\.png"' src/project.ts src/narrated 2>/dev/null | tr -d '"' | sort -u); do
  [ -f "public/$f" ] || { echo "MISSING public/$f (docs: scripts/raster-docs.sh … --find <text>)"; missing=1; }
done
if [ "$COMP" = Narrated ]; then
  for id in $(grep -oE '"id": "[^"]+"' src/narrated/vo-lines.ts 2>/dev/null | sed -E 's/.*"([^"]+)"$/\1/'); do
    [ -f "public/vo/$id.wav" ] || { echo "MISSING public/vo/$id.wav (scripts/voice/prepare-vo.py)"; missing=1; }
  done
  node "$SKILL/scripts/narrated-check.cjs" --project . > /dev/null || { echo "narrated-check.cjs does not print PLAN OK: fix the plan first"; missing=1; }
else
  ERR="$(mktemp)"
  PLAN="$(node "$SKILL/scripts/verify-film.cjs" --project . --plan 2>"$ERR")" || {
    echo "MISSING: verify-film.cjs could not build the plan (a capture's cursor.json, or npm ci not run):"
    { grep -m1 -E "ENOENT|Error|Cannot" "$ERR" || head -1 "$ERR"; } | sed 's/^/  /' || true; missing=1; PLAN=""; }
  rm -f "$ERR"
  if [ -n "$PLAN" ]; then
    for id in $(printf '%s' "$PLAN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);console.log([...new Set([...p.segments.map(x=>x.shot),...(p.phone?[p.phone.shot]:[])])].join(" "))})'); do
      for f in shot.mp4 cursor.json; do [ -f "public/shots/$id/$f" ] || { echo "MISSING public/shots/$id/$f"; missing=1; }; done
    done
  fi
fi
if [ "$COMP" = Demo ] && grep -q '"7b-desk-fees"' storyboard.json 2>/dev/null && ! grep -q '7b-desk-fees' src/demo/timeline.ts; then
  echo "the storyboard films Your Fees (7b-desk-fees, the owner-fees path) but src/demo/timeline.ts has no segment for it yet:"
  echo "  a house template change made and verified on the first owner-fees capture (references/desk-capture.md §3); not rendered"
  missing=1
fi
grep -q 'stage: \[0, 0, 0, 0\]' src/project.ts && { echo "project.loader is still the template placeholder: run measure-site.cjs and fill-client.cjs"; missing=1; }
if grep -n '{{[^{}]*}}' src/project.ts storyboard.json 2>/dev/null; then
  echo "placeholders left (above): fill client-inputs.json and refill (fill-client.cjs), never render a film that could show them"; missing=1
fi
[ "$missing" = 0 ] || exit 1

echo "== typecheck"
npx tsc --noEmit
if [ "$CHECK" = 1 ]; then echo "check OK: ready to render $COMP"; exit 0; fi

PWB="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
HS="${HEADLESS_SHELL:-$(ls -d "$PWB"/chromium_headless_shell-*/chrome-linux 2>/dev/null | head -1)/headless_shell}"
[ -x "$HS" ] || { echo "no headless shell (HEADLESS_SHELL / $PWB): see scripts/setup.sh --check; never run playwright install without the user's OK"; exit 1; }
before="$(ls -d /tmp/remotion-webpack-bundle-* 2>/dev/null | sort || true)"
OUTF="out/$NAME.raw.mp4"; RANGE=()
if [ -n "$FRAMES" ]; then OUTF="out/$NAME.part-$FRAMES.mp4"; RANGE=(--frames "$FRAMES"); fi
echo "== render $COMP -> $OUTF (nice -n 15)"
# The offthread video cache is capped: uncapped, the 2474-frame desk film was OOM-killed on a 16 GB box (lessons B11).
nice -n 15 npx remotion render src/index.ts "$COMP" "$OUTF" --codec h264 --crf "${CRF:-16}" "${RANGE[@]}" \
  ${AUDIO_BITRATE:+--audio-bitrate "$AUDIO_BITRATE"} --concurrency 3 --offthreadvideo-cache-size-in-bytes 1500000000 --browser-executable="$HS"
after="$(ls -d /tmp/remotion-webpack-bundle-* 2>/dev/null | sort || true)"
comm -13 <(echo "$before") <(echo "$after") | while read -r d; do [ -n "$d" ] && rm -rf "$d"; done
if [ -n "$FRAMES" ]; then echo "PART RENDERED $OUTF (join with --concat once every range is there)"; exit 0; fi
ffmpeg -nostdin -v error -y -i "$OUTF" -c copy -movflags +faststart "out/$NAME.mp4" && rm -f "$OUTF"
ls -l "out/$NAME.mp4"
[ "$SHARE" = 1 ] && bash "$SKILL/scripts/share.sh" "out/$NAME.mp4" 28
echo "RENDERED out/$NAME.mp4"
echo "next: bash $SKILL/scripts/verify.sh $PROJECT out/$NAME.mp4 \$SCRATCH/verify$( [ "$COMP" = Narrated ] && echo ' --composition Narrated')"

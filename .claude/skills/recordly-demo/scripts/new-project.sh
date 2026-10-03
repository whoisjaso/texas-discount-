#!/usr/bin/env bash
# new-project.sh <client-inputs.json> [dest-dir] [--no-install] [--force] [--narrated]        (runbook A4; long: bg.sh)
#
# Instantiates the house demo for one dealer (run from the repo root):
#   template/  → <dest>  (the approved film's code, unchanged)
#   assets/sfx/*.wav, assets/fonts/*.woff2 + OFL.txt  → <dest>/public/{sfx,fonts}
#   brand.mark, brand.logoReverse (from the site's public/brand)  → <dest>/public/brand
#   client-inputs.json → <dest>/client-inputs.json (the one copy you edit from then on; skipped when it already is)
#                      → <dest>/src/project.ts, <dest>/storyboard.json, <dest>/README.md (scripts/fill-client.cjs)
#   theme.outro.logoWidth = inputs.logoWidth, or when that is null min(760, round(300 × logo width / height)),
#                           written back into <dest>/client-inputs.json so the README and a refill see it
#   npm ci (the template's lockfile pins the exact Remotion 4.0.532 tree), under nice. A failed npm ci stops here with
#     its error: there is no `npm install` fallback (it would drift the pinned tree). Remotion renders with Playwright's
#     headless shell ($PLAYWRIGHT_BROWSERS_PATH, default /opt/pw-browsers); on a machine without one, run
#     `npx remotion browser ensure` in the project once (it downloads Remotion's own Chrome; only with the user's OK).
#   --narrated also makes narration/, public/vo and public/narrated for the narrated cut (src/narrated/ is always
#     there: the template's empty plan.ts keeps the Narrated composition unregistered until it is written).
#
# The default dest is clients/<slug>-demo. The runbook keeps the inputs there from the start
# (clients/<slug>-demo/client-inputs.json): a dest holding only that file counts as empty.
# Fill client-inputs.json first (assets/client-inputs.template.json; scripts/measure-site.cjs --into fills loader,
# word, introKey and brand.mark). Nothing in src/ except project.ts (and logoWidth in theme.ts) differs between clients.
#
# --force overwrites everything this script writes in an existing project: src/ (from the template), project.ts,
# storyboard.json, README.md (hand edits to the README are lost: keep decisions in client-inputs.json, whose
# `overrides` and `zoomCopy` the README is filled from), public/sfx, fonts and brand. It never deletes public/shots.
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL=1; FORCE=0; NARRATED=0; POS=()
for a in "$@"; do
  case "$a" in
    --no-install) INSTALL=0 ;;
    --force) FORCE=1 ;;
    --narrated) NARRATED=1 ;;
    *) POS+=("$a") ;;
  esac
done
INPUTS="$(realpath "${POS[0]:?usage: new-project.sh <client-inputs.json> [dest-dir] [--no-install] [--force]}")"
INPUTS_DIR="$(dirname "$INPUTS")"
j() { node -e 'const v=process.argv[2].split(".").reduce((o,k)=>o==null?o:o[k],require(process.argv[1]));console.log(v==null?"":typeof v==="object"?JSON.stringify(v):v)' "$1" "$2"; }
SLUG="$(j "$INPUTS" slug)"
DEST="${POS[1]:-clients/$SLUG-demo}"

node "$SKILL/scripts/fill-client.cjs" check "$INPUTS"
if [ -d "$DEST" ] && [ "$FORCE" != 1 ]; then
  others="$(ls -A "$DEST" 2>/dev/null | grep -vx 'client-inputs.json' || true)"
  if [ -n "$others" ]; then
    echo "refusing: $DEST already holds a project (use --force to overwrite the files new-project writes)" >&2; exit 1
  fi
fi

resolve() { # a path from the inputs: absolute, relative to the cwd (repo root), or relative to the inputs file
  case "$1" in /*) echo "$1" ;; *) if [ -e "$1" ]; then echo "$PWD/$1"; else echo "$INPUTS_DIR/$1"; fi ;; esac
}
MARK="$(resolve "$(j "$INPUTS" brand.mark)")"; LOGO="$(resolve "$(j "$INPUTS" brand.logoReverse)")"
for f in "$MARK" "$LOGO"; do [ -f "$f" ] || { echo "missing brand file: $f" >&2; exit 1; }; done

# outro logo width: the house 760 px for a ~2.6:1 logo, narrower for a squarer one (house-recipe §9)
LW="$(j "$INPUTS" logoWidth)"
LW_NEW=0
if [ -z "$LW" ]; then
  DIMS="$(node -e 'const b=require("fs").readFileSync(process.argv[1]); if (b.toString("ascii",1,4)!=="PNG") process.exit(1); console.log(b.readUInt32BE(16)+"x"+b.readUInt32BE(20))' "$LOGO" 2>/dev/null \
    || ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$LOGO" 2>/dev/null || true)"
  [ -n "$DIMS" ] || { echo "cannot read the size of $LOGO: set logoWidth in client-inputs.json (min(760, round(300 × width / height)))" >&2; exit 1; }
  LW="$(echo "$DIMS" | awk -Fx '{ v = int(300 * $1 / $2 + 0.5); if (v > 760) v = 760; print v }')"
  LW_NEW=1
  echo "logoWidth $LW = min(760, round(300 × ${DIMS/x/ \/ })) from $(basename "$LOGO")"
fi
case "$LW" in ''|*[!0-9]*) echo "logoWidth must be a whole number of px, not '$LW'" >&2; exit 1 ;; esac

mkdir -p "$DEST"
DEST_INPUTS="$(realpath -m "$DEST/client-inputs.json")"
cp -r "$SKILL/template/." "$DEST/"
rm -f "$DEST"/public/brand/.gitkeep "$DEST"/public/fonts/.gitkeep "$DEST"/public/sfx/.gitkeep
cp "$SKILL"/assets/sfx/*.wav "$DEST/public/sfx/"
cp "$SKILL"/assets/fonts/*.woff2 "$SKILL/assets/fonts/OFL.txt" "$DEST/public/fonts/"
cp "$MARK" "$LOGO" "$DEST/public/brand/"
[ "$INPUTS" = "$DEST_INPUTS" ] || cp "$INPUTS" "$DEST_INPUTS"
if [ "$LW_NEW" = 1 ]; then
  node -e 'const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));j.logoWidth=Number(process.argv[2]);fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")' "$DEST_INPUTS" "$LW"
fi

node "$SKILL/scripts/fill-client.cjs" project "$DEST_INPUTS" --out "$DEST/src/project.ts"
set +e
node "$SKILL/scripts/fill-client.cjs" storyboard "$DEST_INPUTS" "$SKILL/assets/storyboard-dealer-site.json" --out "$DEST/storyboard.json"
SB=$?
RD_ERR="$(node "$SKILL/scripts/fill-client.cjs" readme "$DEST_INPUTS" "$SKILL/assets/project-README.md" --out "$DEST/README.md" 2>&1)"
RD=$?
set -e
[ "$SB" = 0 ] || [ "$SB" = 3 ] || exit "$SB"
if [ "$RD" = 3 ]; then
  echo "NOTE README.md still has placeholders: $(echo "$RD_ERR" | grep -v '^wrote ')"
elif [ "$RD" != 0 ]; then
  echo "WARN the README was not written (exit $RD): $RD_ERR" >&2
fi

node -e '
const fs=require("fs");const [dir,name]=process.argv.slice(1);
for (const f of ["package.json","package-lock.json"]) { const p=dir+"/"+f; if(!fs.existsSync(p)) continue;
  const j=JSON.parse(fs.readFileSync(p,"utf8")); j.name=name; if(j.packages&&j.packages[""]) j.packages[""].name=name;
  fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n"); }' "$DEST" "$SLUG-demo"

if [ "$LW" != 760 ]; then
  sed -i "s/^    logoWidth: 760,/    logoWidth: $LW,/" "$DEST/src/theme.ts"
  grep -q "^    logoWidth: $LW," "$DEST/src/theme.ts" || { echo "could not set theme.outro.logoWidth in $DEST/src/theme.ts" >&2; exit 1; }
  echo "NOTE theme.outro.logoWidth = $LW (the logo is squarer than 2.53:1); the README lists it"
fi

if [ "$NARRATED" = 1 ]; then mkdir -p "$DEST/narration" "$DEST/public/vo" "$DEST/public/narrated"; fi

if [ "$INSTALL" = 1 ]; then
  if ! (cd "$DEST" && nice -n 15 npm ci --no-audit --no-fund); then
    echo "npm ci FAILED in $DEST (see above). Do not run npm install (it drifts the pinned Remotion tree): fix the cause (registry, proxy, disk) and re-run with --force." >&2
    exit 1
  fi
fi

cat <<EOF

Created $DEST
  client-inputs.json the one copy of the inputs: edit it, then refill with fill-client.cjs (SKILL.md step 6)
  src/project.ts     loader geometry, logos, facts, outro lines
  storyboard.json    the house storyboard for this site$( [ "$SB" = 3 ] && echo ": STILL HAS PLACEHOLDERS, measure them in step 6 (measure-site.cjs --storyboard … --rects --into …)" )
  README.md          running order, re-capture commands, owner decisions
  public/sfx, fonts  the bundled kit and Barlow Semi Condensed (OFL)
Next (runbook A5): adapt and preflight the storyboard on the served site; then capture in order.
PROJECT READY
EOF

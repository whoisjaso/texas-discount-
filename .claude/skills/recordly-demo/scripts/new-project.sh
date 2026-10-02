#!/usr/bin/env bash
# new-project.sh <client-inputs.json> [dest-dir] [--no-install] [--force]
#
# Instantiates the house demo for one dealer (run from the repo root):
#   template/  → <dest>  (the approved film's code, unchanged)
#   assets/sfx/*.wav, assets/fonts/*.woff2 + OFL.txt  → <dest>/public/{sfx,fonts}
#   brand.mark, brand.logoReverse (from the site's public/brand)  → <dest>/public/brand
#   client-inputs.json → <dest>/src/project.ts, <dest>/storyboard.json, <dest>/README.md (scripts/fill-client.cjs)
#   npm ci (the template's lockfile pins the exact Remotion 4.0.532 tree), under nice
#
# The default dest is clients/<slug>-demo. Fill client-inputs.json first (assets/client-inputs.template.json;
# scripts/measure-site.cjs --into fills loader, word and introKey). Nothing in src/ except project.ts differs between
# clients; theme.ts changes only when inputs.logoWidth differs from 760 (a near-square logo).
set -euo pipefail
SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL=1; FORCE=0; POS=()
for a in "$@"; do
  case "$a" in
    --no-install) INSTALL=0 ;;
    --force) FORCE=1 ;;
    *) POS+=("$a") ;;
  esac
done
INPUTS="$(realpath "${POS[0]:?usage: new-project.sh <client-inputs.json> [dest-dir] [--no-install] [--force]}")"
INPUTS_DIR="$(dirname "$INPUTS")"
j() { node -e 'const v=process.argv[2].split(".").reduce((o,k)=>o==null?o:o[k],require(process.argv[1]));console.log(v==null?"":typeof v==="object"?JSON.stringify(v):v)' "$INPUTS" "$1"; }
SLUG="$(j slug)"
DEST="${POS[1]:-clients/$SLUG-demo}"

node "$SKILL/scripts/fill-client.cjs" check "$INPUTS"
if [ -d "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ] && [ "$FORCE" != 1 ]; then
  echo "refusing: $DEST exists and is not empty (use --force to overwrite the files new-project writes)" >&2; exit 1
fi

resolve() { # a path from the inputs: absolute, relative to the cwd (repo root), or relative to the inputs file
  case "$1" in /*) echo "$1" ;; *) if [ -e "$1" ]; then echo "$PWD/$1"; else echo "$INPUTS_DIR/$1"; fi ;; esac
}
MARK="$(resolve "$(j brand.mark)")"; LOGO="$(resolve "$(j brand.logoReverse)")"
for f in "$MARK" "$LOGO"; do [ -f "$f" ] || { echo "missing brand file: $f" >&2; exit 1; }; done

mkdir -p "$DEST"
cp -r "$SKILL/template/." "$DEST/"
rm -f "$DEST"/public/brand/.gitkeep "$DEST"/public/fonts/.gitkeep "$DEST"/public/sfx/.gitkeep
cp "$SKILL"/assets/sfx/*.wav "$DEST/public/sfx/"
cp "$SKILL"/assets/fonts/*.woff2 "$SKILL/assets/fonts/OFL.txt" "$DEST/public/fonts/"
cp "$MARK" "$LOGO" "$DEST/public/brand/"
cp "$INPUTS" "$DEST/client-inputs.json"

node "$SKILL/scripts/fill-client.cjs" project "$INPUTS" --out "$DEST/src/project.ts"
set +e
node "$SKILL/scripts/fill-client.cjs" storyboard "$INPUTS" "$SKILL/assets/storyboard-dealer-site.json" --out "$DEST/storyboard.json"
SB=$?
node "$SKILL/scripts/fill-client.cjs" readme "$INPUTS" "$SKILL/assets/project-README.md" --out "$DEST/README.md" 2>/dev/null
set -e
[ "$SB" = 0 ] || [ "$SB" = 3 ] || exit "$SB"

node -e '
const fs=require("fs");const [dir,name]=process.argv.slice(1);
for (const f of ["package.json","package-lock.json"]) { const p=dir+"/"+f; if(!fs.existsSync(p)) continue;
  const j=JSON.parse(fs.readFileSync(p,"utf8")); j.name=name; if(j.packages&&j.packages[""]) j.packages[""].name=name;
  fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n"); }' "$DEST" "$SLUG-demo"

LW="$(j logoWidth)"
if [ -n "$LW" ] && [ "$LW" != 760 ]; then
  sed -i "s/    logoWidth: 760,/    logoWidth: $LW,/" "$DEST/src/theme.ts"
  echo "NOTE theme.outro.logoWidth set to $LW (the logo is not ~2.6:1). Say so in the README's decisions."
fi
command -v ffprobe >/dev/null && ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$LOGO" \
  | awk -F, -v lw="${LW:-760}" '{ r=$1/$2; if (r < 1.8) printf "CHECK logoReverse is %dx%d (%.2f:1): a near-square logo needs logoWidth ~360-420 (now %s)\n", $1, $2, r, lw }'

if [ "$INSTALL" = 1 ]; then
  (cd "$DEST" && { nice -n 15 npm ci --no-audit --no-fund || nice -n 15 npm install --no-audit --no-fund; })
fi

cat <<EOF

Created $DEST
  src/project.ts     from $INPUTS (loader geometry, logos, facts, outro lines)
  storyboard.json    the house storyboard for this site$( [ "$SB" = 3 ] && echo ": STILL HAS PLACEHOLDERS, fill them (see the message above)" )
  public/sfx, fonts  the bundled kit and Barlow Semi Condensed (OFL)
Next (SKILL.md runbook): build + serve the site with VITE_DESK_URL, run measure-site.cjs --storyboard, capture in order,
then scripts/render.sh $DEST and scripts/verify.sh $DEST.
EOF

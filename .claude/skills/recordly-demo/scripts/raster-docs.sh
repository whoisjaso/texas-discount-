#!/usr/bin/env bash
# raster-docs.sh <deal.pdf> <out.png> (--find "<text>" | --page N) [--dpi 300]
#
# One page of a deal's own PDF as the PNG a DocScene / NarratedDoc overlay shows (300 dpi = 2550 × 3300 for Letter).
#   --find "<text>"  the FIRST page whose text (pdftotext, case-sensitive) contains it, e.g. --find "CERTIFICATION"
#                    for the 130-U's signature page, --find "Total Amount Due" for the bill of sale's money page. Pages
#                    move when the desk's paperwork templates change; a text anchor does not.
#   --page N         that page (only when no text is distinctive; say why in the README)
# Always writes exactly <out.png> (pdftoppm -singlefile: without it pdftoppm appends "-1", "-01" … to the name and the
# film's docs/<name>.png is missing at render time). Prints "RASTER <out> page N of M (<w>x<h>)".
#   raster-docs.sh $SCRATCH/pdfs/130-U_Carter_812345.pdf $P/public/docs/130u-p1.png --find "CERTIFICATION"
set -euo pipefail
PDF="${1:?usage: raster-docs.sh <deal.pdf> <out.png> (--find TEXT | --page N) [--dpi 300]}"; OUT="${2:?give the output .png}"; shift 2
FIND=""; PAGE=""; DPI=300
while [ $# -gt 0 ]; do case "$1" in --find) FIND="$2"; shift 2 ;; --page) PAGE="$2"; shift 2 ;; --dpi) DPI="$2"; shift 2 ;; *) echo "unknown $1" >&2; exit 2 ;; esac; done
[ -f "$PDF" ] || { echo "no PDF at $PDF" >&2; exit 2; }
case "$OUT" in *.png) ;; *) echo "the output must end in .png: $OUT" >&2; exit 2 ;; esac
N="$(pdfinfo "$PDF" | awk '/^Pages:/{print $2}')"
if [ -n "$FIND" ]; then
  for p in $(seq 1 "$N"); do
    if pdftotext -f "$p" -l "$p" -layout "$PDF" - 2>/dev/null | grep -qF -- "$FIND"; then PAGE="$p"; break; fi
  done
  [ -n "$PAGE" ] || { echo "no page of $(basename "$PDF") contains \"$FIND\" (pages: $N)" >&2; exit 1; }
fi
[ -n "$PAGE" ] || { echo "give --find \"<text>\" or --page N" >&2; exit 2; }
[ "$PAGE" -ge 1 ] && [ "$PAGE" -le "$N" ] || { echo "page $PAGE is outside 1..$N" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
pdftoppm -r "$DPI" -f "$PAGE" -l "$PAGE" -png -singlefile "$PDF" "${OUT%.png}"
[ -f "$OUT" ] || { echo "pdftoppm wrote no $OUT" >&2; exit 1; }
size="$(python3 -c 'import sys;from PIL import Image;print("%dx%d"%Image.open(sys.argv[1]).size)' "$OUT" 2>/dev/null || file -b "$OUT" | grep -o '[0-9]* x [0-9]*' | tr -d ' ')"
echo "RASTER $OUT page $PAGE of $N ($size)${FIND:+ (first page with \"$FIND\")}"

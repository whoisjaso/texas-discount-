#!/usr/bin/env bash
# setup.sh [--check | --voice | --all] [--with-medium]       runbook step S0 (and S1 for the narrated cut)
#
#   --check (the default)  checks the machine; prints one row per tool: OK, WARN or MISSING with its remedy.
#                          Exit 0 when every REQUIRED row is OK (WARN rows never fail it), 1 otherwise.
#   --voice                builds the narrated cut's voice venv (Kokoro-82M + faster-whisper) at $VOICE_VENV from
#                          assets/voice/requirements.lock, fetches the models into $HF_HOME, voices one sentence and
#                          transcribes it back. Idempotent: a venv whose voice.ok records this lock's hash is left as
#                          it is ("VOICE OK (already set up …)").
#   --all                  --check, then --voice.
#   --with-medium          with --voice: also fetch faster-whisper medium.en (1.5 GB; transcribe.py fetches it on
#                          first use otherwise; it is the second opinion for a line small.en mishears).
#
# What it never does: install Playwright browsers, apt packages or anything system-wide, disable TLS checks, or unset a
# proxy. A missing system tool prints the command to run, and the rule: run it only with the user's OK.
#
# Paths (all from the environment, all optional; scripts/env.sh writes them into $SCRATCH/demo.env):
#   SCRATCH                    the run's scratch dir (its filesystem is the one checked for space; default: $PWD)
#   PWPATH                     Playwright's package dir (default: $(npm root -g)/playwright)
#   PLAYWRIGHT_BROWSERS_PATH   where chromium-* and chromium_headless_shell-* live (default: /opt/pw-browsers)
#   RECORDLY_HOME              durable per-machine cache (default: $HOME/.cache/recordly-demo), outside any session
#   VOICE_VENV                 the voice venv (default: $RECORDLY_HOME/voice-venv)
#   HF_HOME                    the Hugging Face model cache (default: $HOME/.cache/huggingface, shared with other tools)
set -uo pipefail
S="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE=check; MEDIUM=0
for a in "$@"; do
  case "$a" in
    --check) MODE=check ;; --voice) MODE=voice ;; --all) MODE=all ;; --with-medium) MEDIUM=1 ;;
    -h|--help) sed -n '2,28p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $a (see --help)" >&2; exit 2 ;;
  esac
done
RECORDLY_HOME="${RECORDLY_HOME:-$HOME/.cache/recordly-demo}"
VOICE_VENV="${VOICE_VENV:-$RECORDLY_HOME/voice-venv}"
export HF_HOME="${HF_HOME:-$HOME/.cache/huggingface}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
LOCK="$S/assets/voice/requirements.lock"
TORCH="torch==2.14.1+cpu"
TORCH_INDEX="https://download.pytorch.org/whl/cpu"

FAIL=0
row() { # row <OK|WARN|MISSING|INFO> <name> <detail> [remedy]
  printf '%-8s %-22s %s\n' "$1" "$2" "$3"
  [ -n "${4:-}" ] && printf '%-8s %-22s   -> %s\n' "" "" "$4"
  [ "$1" = MISSING ] && FAIL=1
  return 0
}
have() { command -v "$1" >/dev/null 2>&1; }

check() {
  echo "== recordly-demo setup check ($(date -u +%Y-%m-%dT%H:%MZ))"
  # Node 22 and the npm registry
  if have node && node -v | grep -q '^v22\.'; then row OK node "$(node -v)"
  else row MISSING node "$(node -v 2>/dev/null || echo 'not found') (need v22.x)" "install Node 22 (nvm install 22, or the image's /opt/node22); only with the user's OK"; fi
  if have npm && timeout 20 npm ping >/dev/null 2>&1; then row OK npm-registry "npm ping answered"
  else row MISSING npm-registry "npm ping failed (npm ci in new-project.sh and make-demo-card.mjs need it)" "check HTTPS_PROXY / the npm cafile; never disable TLS"; fi
  # Playwright (global) and its browsers
  local pw="${PWPATH:-$(npm root -g 2>/dev/null)/playwright}"
  local pv; pv="$(node -e 'try{console.log(require(process.argv[1]+"/package.json").version)}catch{}' "$pw" 2>/dev/null)"
  case "$pv" in
    1.56.*) row OK playwright "$pv at $pw" ;;
    '') row MISSING playwright "no package at $pw" "npm i -g playwright@1.56.1 (only with the user's OK), or set PWPATH to an existing playwright 1.56.x" ;;
    *) row MISSING playwright "$pv at $pw (the captures were tuned on 1.56.x)" "npm i -g playwright@1.56.1 (only with the user's OK), or set PWPATH" ;;
  esac
  local hs ch
  hs="$(ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | head -1)"
  ch="$(ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)"
  local brem="PLAYWRIGHT_BROWSERS_PATH=<dir> npx playwright@1.56.1 install chromium chromium-headless-shell (only with the user's OK), then export PLAYWRIGHT_BROWSERS_PATH=<dir>"
  if [ -x "$hs" ]; then row OK headless-shell "$hs (capture: BeginFrameControl; Remotion renders)"; else row MISSING headless-shell "none under $PLAYWRIGHT_BROWSERS_PATH" "$brem"; fi
  if [ -x "$ch" ]; then row OK chromium "$ch (CHROME_PATH: desk walks and the desk's PDF renderer)"; else row MISSING chromium "none under $PLAYWRIGHT_BROWSERS_PATH" "$brem"; fi
  # ffmpeg with the encoders and filters the scripts call
  if have ffmpeg && have ffprobe; then
    local enc fil miss=""
    enc="$(ffmpeg -hide_banner -encoders 2>/dev/null)"; fil="$(ffmpeg -hide_banner -filters 2>/dev/null)"
    for e in libx264 aac; do grep -qE "^ [A-Z.]{6} $e " <<<"$enc" || miss="$miss encoder:$e"; done
    for f in ebur128 silencedetect alimiter psnr signalstats astats; do grep -qE "^ [A-Z.|]{2,3} +$f " <<<"$fil" || miss="$miss filter:$f"; done
    if [ -z "$miss" ]; then row OK ffmpeg "$(ffmpeg -version | head -1 | cut -c1-60)"
    else row MISSING ffmpeg "lacks$miss" "a full ffmpeg build (apt install ffmpeg; only with the user's OK)"; fi
  else row MISSING ffmpeg "ffmpeg/ffprobe not found" "apt install ffmpeg (only with the user's OK)"; fi
  # python3 with PIL + numpy (contact sheets, density, the demo card), and a venv-capable 3.10-3.12 for the voice
  if have python3 && python3 -c 'import sys; assert sys.version_info >= (3, 10)' 2>/dev/null; then
    if python3 -c 'import PIL, numpy' 2>/dev/null; then row OK python3 "$(python3 --version 2>&1) with PIL $(python3 -c 'import PIL;print(PIL.__version__)') and numpy $(python3 -c 'import numpy;print(numpy.__version__)')"
    else row MISSING python3-libs "python3 lacks PIL or numpy" "python3 -m pip install --user pillow numpy (only with the user's OK)"; fi
  else row MISSING python3 "python3 >= 3.10 not found" "install python3 (only with the user's OK)"; fi
  local vpy; vpy="$(voice_python)"
  if [ -n "$vpy" ]; then row OK venv-python "$vpy ($($vpy --version 2>&1)) for the voice venv"
  else row WARN venv-python "no python3.11 / 3.12 / 3.10 with venv (only the narrated cut needs it)" "install python3.11 + python3.11-venv (only with the user's OK)"; fi
  # documents and the small tools the scripts call
  for t in pdftoppm pdftotext; do
    if have "$t"; then row OK "$t" "$(command -v $t)"; else row MISSING "$t" "not found (the deal's PDFs → page PNGs)" "apt install poppler-utils (only with the user's OK)"; fi
  done
  for t in curl openssl setsid; do
    if have "$t"; then row OK "$t" "$(command -v $t)"; else row MISSING "$t" "not found" "install it (only with the user's OK)"; fi
  done
  # disk on the scratch filesystem
  local where="${SCRATCH:-$PWD}"; while [ ! -d "$where" ]; do where="$(dirname "$where")"; done
  local kb gb; kb="$(df -Pk "$where" | awk 'NR==2{print $4}')"; gb=$((kb / 1024 / 1024))
  if [ "$gb" -lt 8 ]; then row MISSING disk "${gb} GB free on $where (need >= 8 GB)" "free space first: a DSF 2 shot is ~2.5 GB of PNG before --clean, a render's frames ~1 GB, the voice venv 1.8 GB"
  elif [ "$gb" -lt 20 ]; then row WARN disk "${gb} GB free on $where (20 GB recommended)" "capture with --clean, render one film at a time, delete old captures/ and stills"
  else row OK disk "${gb} GB free on $where"; fi
  # ports (warnings: another run may own them; never pick another port)
  for port in 5183 5190; do
    if port_taken "$port"; then row WARN "port $port" "taken (another run's server?)" "stop your own server with site-server.sh / desk-server.sh stop; never start on another port; never kill a server you did not start"
    else row OK "port $port" "free"; fi
  done
  local load cores; load="$(cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo 0)"; cores="$(nproc 2>/dev/null || echo 1)"
  if awk -v l="$load" -v c="$cores" 'BEGIN{exit !(l >= c)}'; then row WARN load "loadavg $load on $cores cores" "wait before the capture self-test (it is load-sensitive, lesson B12); heavy work runs under nice -n 15"
  else row OK load "loadavg $load on $cores cores"; fi
  # the voice venv (informational)
  if voice_ok_current; then row OK voice-venv "$VOICE_VENV ($(grep -o 'built=[^ ]*' "$VOICE_VENV/voice.ok"))"
  else row INFO voice-venv "not set up at $VOICE_VENV" "only the narrated cut needs it: bash $S/scripts/setup.sh --voice"; fi
  echo
  if [ "$FAIL" = 0 ]; then echo "SETUP OK (exports for demo.env: PWPATH=$pw PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH CHROME_PATH=$ch)"
  else echo "SETUP INCOMPLETE: apply each remedy above (system installs only with the user's OK), then re-run"; fi
  return "$FAIL"
}

port_taken() {
  if have ss; then ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
  else local hex; hex="$(printf '%04X' "$1")"; grep -qiE "^ *[0-9]+: [0-9A-F]+:$hex [0-9A-F]+:[0-9A-F]+ 0A" /proc/net/tcp /proc/net/tcp6 2>/dev/null; fi
}

voice_python() {
  for p in python3.11 python3.12 python3.10; do
    if have "$p" && "$p" -c 'import venv, ensurepip' >/dev/null 2>&1; then command -v "$p"; return; fi
  done
}

lock_sha() { sha256sum "$LOCK" | cut -c1-16; }
voice_ok_current() { [ -f "$VOICE_VENV/voice.ok" ] && grep -q "lock=$(lock_sha)" "$VOICE_VENV/voice.ok" && [ -x "$VOICE_VENV/bin/python" ]; }

voice() {
  echo "== voice venv: $VOICE_VENV (HF_HOME=$HF_HOME)"
  if voice_ok_current && [ "$MEDIUM" = 0 ]; then
    echo "VOICE OK (already set up: $(cat "$VOICE_VENV/voice.ok"))"; return 0
  fi
  local py; py="$(voice_python)"
  [ -n "$py" ] || { echo "VOICE FAILED: no python3.11 / 3.12 / 3.10 with venv; install one (only with the user's OK)"; return 1; }
  mkdir -p "$(dirname "$VOICE_VENV")" "$HF_HOME"
  if [ ! -x "$VOICE_VENV/bin/python" ]; then
    echo "-- $py -m venv $VOICE_VENV"
    "$py" -m venv "$VOICE_VENV" || { echo "VOICE FAILED: venv"; return 1; }
  fi
  local pip="$VOICE_VENV/bin/pip"
  if ! "$VOICE_VENV/bin/python" -c 'import torch, sys; sys.exit(0 if torch.__version__ == "2.14.1+cpu" else 1)' 2>/dev/null; then
    echo "-- $TORCH from the PyTorch CPU index (never from PyPI: that is the CUDA build)"
    nice -n 15 "$pip" install --disable-pip-version-check --no-input --index-url "$TORCH_INDEX" "$TORCH" || { echo "VOICE FAILED: torch"; return 1; }
  fi
  echo "-- pip install -r $(basename "$LOCK")"
  nice -n 15 "$pip" install --disable-pip-version-check --no-input -r "$LOCK" || { echo "VOICE FAILED: pip install -r requirements.lock"; return 1; }
  echo "-- models into $HF_HOME (through the proxy and CA from the environment)"
  local models="hexgrad/Kokoro-82M Systran/faster-whisper-small.en"
  [ "$MEDIUM" = 1 ] && models="$models Systran/faster-whisper-medium.en"
  "$VOICE_VENV/bin/python" - $models <<'PY' || { echo "VOICE FAILED: model download"; return 1; }
import sys
from huggingface_hub import snapshot_download
for repo in sys.argv[1:]:
    kw = {"allow_patterns": ["config.json", "kokoro-v1_0.pth", "voices/af_heart.pt"]} if repo == "hexgrad/Kokoro-82M" else {}
    print("  ", repo, "->", snapshot_download(repo, **kw))
PY
  echo "-- smoke: voice one sentence and transcribe it back"
  local tmp; tmp="$(mktemp -d)"
  if ! "$VOICE_VENV/bin/python" "$S/scripts/voice/smoke.py" --out "$tmp"; then echo "VOICE FAILED: smoke test (see above)"; rm -rf "$tmp"; return 1; fi
  rm -rf "$tmp"
  printf 'lock=%s built=%s python=%s torch=%s kokoro=%s faster-whisper=%s\n' "$(lock_sha)" "$(date -u +%Y-%m-%dT%H:%MZ)" \
    "$("$VOICE_VENV/bin/python" -c 'import platform;print(platform.python_version())')" \
    "$("$VOICE_VENV/bin/python" -c 'import torch;print(torch.__version__)')" \
    "$("$VOICE_VENV/bin/pip" show kokoro 2>/dev/null | awk '/^Version/{print $2}')" \
    "$("$VOICE_VENV/bin/pip" show faster-whisper 2>/dev/null | awk '/^Version/{print $2}')" > "$VOICE_VENV/voice.ok"
  echo "VOICE OK ($(cat "$VOICE_VENV/voice.ok")). A system espeak-ng is not needed: misaki uses the bundled espeakng-loader."
}

case "$MODE" in
  check) check; exit $? ;;
  voice) voice; exit $? ;;
  all) check; c=$?; voice; v=$?; [ "$c" = 0 ] && [ "$v" = 0 ]; exit $? ;;
esac

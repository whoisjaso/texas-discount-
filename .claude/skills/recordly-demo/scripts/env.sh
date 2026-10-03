#!/usr/bin/env bash
# env.sh --slug <client-slug> --scratch <absolute dir> (--desk <desk dir> | --no-desk) [--repo <repo root>] [--site <site dir>]
#
# Writes $SCRATCH/demo.env: every variable the runbook's commands use, as `export` lines. Shell variables do not
# survive between an agent's tool calls, so EVERY command block starts with `source <scratch>/demo.env` (runbook S2).
# Re-running it rewrites the file (theme.cjs --into appends THEME_* lines to it later; re-run theme.cjs after this).
# The desk is said, never guessed: --desk <dir> (the house film, parts A + B) or --no-desk (the rare site-only film,
# only on the user's word). A --desk folder that does not exist, or a repo with no clients/ folder, is refused: a
# missing desk used to fall silently onto the site-only path, whose film SKILL.md says is never sent.
#   S, PDB          this skill and premium-dealer-build (the desk-walk scripts)
#   REPO, SLUG      the repo root and the client slug
#   P, I            the film project (clients/<slug>-demo) and its client-inputs.json
#   SITE_DIR        clients/<slug>-site           DESK_DIR  clients/<slug>-desk (or --desk; empty when there is none)
#   SCRATCH         this run's scratch dir (absolute; captures, logs, jobs, PIDs; never inside the repo)
#   PWPATH, PLAYWRIGHT_BROWSERS_PATH, CHROME_PATH, HEADLESS_SHELL     Playwright and its browsers
#   RECORDLY_HOME, VOICE_VENV, HF_HOME                                  the durable voice venv and model cache
#   SITE_BASE=http://localhost:5183   DESK_BASE=http://localhost:5190  (the only two ports this skill uses)
set -euo pipefail
S="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLUG=""; SCRATCH_IN=""; REPO=""; DESK=""; SITE=""; NODESK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;; --scratch) SCRATCH_IN="$2"; shift 2 ;; --repo) REPO="$2"; shift 2 ;;
    --desk) DESK="$2"; shift 2 ;; --no-desk) NODESK=1; shift ;; --site) SITE="$2"; shift 2 ;;
    *) sed -n '2,19p' "${BASH_SOURCE[0]}"; exit 2 ;;
  esac
done
if [ -z "$DESK" ] && [ "$NODESK" != 1 ]; then
  echo "say whether there is a desk: --desk clients/<slug>-desk (the house film) or --no-desk (site only; ask the user first)" >&2; exit 2
fi
if [ -n "$DESK" ] && [ "$NODESK" = 1 ]; then echo "--desk and --no-desk together: choose one" >&2; exit 2; fi
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "--slug <kebab-case client slug> is required" >&2; exit 2; }
case "$SCRATCH_IN" in /*) ;; *) echo "--scratch must be an absolute path (commands change directory)" >&2; exit 2 ;; esac
# the repo root: given, or the folder that holds .claude/skills/recordly-demo
if [ -z "$REPO" ]; then
  case "$S" in */.claude/skills/recordly-demo) REPO="${S%/.claude/skills/recordly-demo}" ;;
    *) echo "this skill is not inside <repo>/.claude/skills/recordly-demo: pass --repo <the repo root that holds clients/>" >&2; exit 2 ;; esac
fi
REPO="$(cd "$REPO" && pwd)"
[ -d "$REPO/clients" ] || { echo "$REPO has no clients/ folder: --repo must be the agency repo root (clients/<slug>-site, -desk, -demo)" >&2; exit 2; }
case "$SCRATCH_IN" in "$REPO"/*) echo "--scratch must be outside the repo ($REPO): captures are gigabytes" >&2; exit 2 ;; esac
mkdir -p "$SCRATCH_IN"; SCRATCH="$(cd "$SCRATCH_IN" && pwd)"
PDB="$(cd "$S/.." && pwd)/premium-dealer-build"
SITE_DIR="${SITE:-$REPO/clients/$SLUG-site}"
DESK_DIR=""
if [ -n "$DESK" ]; then
  case "$DESK" in /*) DESK_DIR="$DESK" ;; *) DESK_DIR="$REPO/$DESK" ;; esac
  [ -d "$DESK_DIR/src" ] || { echo "--desk $DESK: no desk at $DESK_DIR (no src/): fix the folder name; a missing desk is never a site-only run" >&2; exit 2; }
  DESK_DIR="$(cd "$DESK_DIR" && pwd)"
fi
case "$SITE_DIR" in /*) ;; *) SITE_DIR="$REPO/$SITE_DIR" ;; esac
PWB="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
PWP="${PWPATH:-$(npm root -g 2>/dev/null)/playwright}"
CHROME="${CHROME_PATH:-$(ls -d "$PWB"/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
HS="$(ls -d "$PWB"/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | head -1)"
RH="${RECORDLY_HOME:-$HOME/.cache/recordly-demo}"
q() { printf '%q' "$1"; }
{
  echo "# recordly-demo run variables for $SLUG, written $(date -u +%Y-%m-%dT%H:%MZ) by scripts/env.sh. Source this first in every call."
  for kv in "S=$S" "PDB=$PDB" "REPO=$REPO" "SLUG=$SLUG" "SCRATCH=$SCRATCH" "P=$REPO/clients/$SLUG-demo" \
            "I=$REPO/clients/$SLUG-demo/client-inputs.json" "SITE_DIR=$SITE_DIR" "DESK_DIR=$DESK_DIR" \
            "PWPATH=$PWP" "PLAYWRIGHT_BROWSERS_PATH=$PWB" "CHROME_PATH=$CHROME" "HEADLESS_SHELL=$HS" \
            "RECORDLY_HOME=$RH" "VOICE_VENV=${VOICE_VENV:-$RH/voice-venv}" "HF_HOME=${HF_HOME:-$HOME/.cache/huggingface}" \
            "SITE_BASE=http://localhost:5183" "DESK_BASE=http://localhost:5190"; do
    echo "export ${kv%%=*}=$(q "${kv#*=}")"
  done
} > "$SCRATCH/demo.env"
missing=""
for v in "$PWP" "$CHROME" "$HS"; do [ -e "$v" ] || missing="$missing $v"; done
cat "$SCRATCH/demo.env"
[ -z "$missing" ] || echo "WARN missing on this machine:$missing (run scripts/setup.sh --check)"
[ -n "$DESK_DIR" ] || echo "NOTE --no-desk: the site-only path (R1-R4). The house film is parts A + B; this is only on the user's word."
echo "ENV OK: source $SCRATCH/demo.env"

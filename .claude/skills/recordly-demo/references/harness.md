# Running the skill under any agent or model

The film is made by scripts; the agent's job is to run them in order, read their gates, and stop where a person
decides. Nothing here depends on one harness. The rules below are what keeps a run reproducible when the model, the
tools or the time limits change. The Claude Code specifics are in the appendix.

## Contents

1. Variables live in a file
2. Long jobs are detached, polled and stopped by process group
3. Servers: two ports, own process groups
4. What a model must never decide alone
5. Sending files
6. Machines other than the Claude Code image
7. Appendix: Claude Code

## 1. Variables live in a file

Shell variables do not survive between an agent's tool calls. `scripts/env.sh` writes every variable the runbook uses
into `$SCRATCH/demo.env` as `export` lines; every command starts with `source <absolute scratch>/demo.env`. SCRATCH is
absolute and outside the repo (captures are gigabytes). `theme.cjs --into` appends the desk's THEME_* lines to it.
Before demo.env exists, `S` is the absolute folder holding the skill's SKILL.md: `export S=<that folder>` for S0-S2.

- **The film is said, never guessed.** `env.sh` needs `--desk clients/<slug>-desk` (the house film) or `--no-desk`
  (site only, on the user's word); a desk folder that does not exist, or a `--repo` with no `clients/`, is refused.
- **Every step runs from the repo root.** `runbook.cjs run` spawns each command with `cwd=$REPO` and prints it, so a
  repo-relative path in `client-inputs.json` (a logo, `siteDir`) resolves the same from any shell.
- **State follows its inputs.** A step that runs again makes every step built on it STALE (`status` and `next` show
  it), and an approval names the files it approved: when one changes, the approval reads STALE and is asked again.
- **A forced step is on the record.** `run <id> --force` needs `--why` and the user's own words (`--by-user`);
  without both it is refused. It is written to `verify-decisions.md`, shows as PASS* and goes into the send note.

## 2. Long jobs are detached, polled and stopped by process group

Anything that can run over two minutes runs through `scripts/bg.sh`: npm ci, the capture loops, the stills, the
renders, `verify.sh`, the voice venv, `share.sh` on a long film.

```bash
source $SCRATCH/demo.env
bash $S/scripts/bg.sh start render -- bash $S/scripts/render.sh $P $SLUG-demo   # detached: setsid nohup, own group
bash $S/scripts/bg.sh wait render 540     # polls every 15 s for up to 9 min: DONE (0) | FAILED/DIED (1) | RUNNING (3)
bash $S/scripts/bg.sh status render       # state and the last 5 log lines
bash $S/scripts/bg.sh stop render         # TERM the group, KILL it 5 s later
```

- `runbook.cjs run <id>` does this itself for every step marked long, and `runbook.cjs check <id>` judges it after.
- Never start the next step until the job says DONE; never start a second copy of a running job (bg.sh refuses).
- A foreground call that a harness may cut off (most harnesses stop a call at 2-10 minutes) must never hold a render
  or a capture: a capture killed mid-shot leaves later shots reading a stale cursor (capture-all.sh guards it).
- Renders that die (OOM, a killed session): `render.sh … --frames A-B` renders only the missing film frames into
  `out/<name>.part-A-B.mp4`; start each part on a keyframe of the part before; `render.sh … --concat` joins the parts
  in frame order by stream copy and remuxes +faststart. If a seam is heard, render the sound track whole
  (`npx remotion render … --codec aac`) and mux it over the joined picture (the Discount ending was remade that way).
- Typical lengths on 4 shared cores: npm ci 1-3 min; the capture self-test 70 s; five site shots 5 min; the part-B
  order 15-25 min; stills 3-5 min; the house render 12-30 min; verify 3-4 min; the narrated render ~80 min; the share
  copy of a 3:50 film ~8 min.

## 3. Servers: two ports, own process groups

- The site preview on :5183 (`site-server.sh`), the desk on :5190 (`desk/desk-server.sh`). No other port, ever: when
  one is taken by a server you did not start, wait or ask; never kill it, never pick another port. The wait has a
  bound: `desk-server.sh start --wait 1800` polls every 30 s for up to 30 minutes, naming the holder (its pid, its
  directory, when it started; S0 prints the same), then exits so you can ask the user.
- Both start detached in their own process group, record the group id in `$SCRATCH`, poll until they answer, and stop
  by group (`kill -TERM -- -PGID`, then KILL). Killing `npx` by PID leaves `next-server` holding :5190.
- The desk's `next dev` rewrites `next-env.d.ts`; `desk-server.sh` saves it before starting and restores it by copy on
  stop (never with git). Never `npm install` in the desk.
- The desk's preview mock keeps its state in the server process: a restart is a fresh desk (lesson N6).

## 4. What a model must never decide alone

- **By-eye and by-ear gates** (every still, the contact sheet, the zooms at 100%, one full watch with sound): a model
  that can view images may look and record what it looked at (`runbook.cjs mark <id> --by-agent "<what>"`). A model
  that cannot view images or hear audio sends the files to the user (contact-sheet.png, the named stills, the chat
  copy, preview.mp3) and records the user's words (`--by-user "<their words>"`). It never marks such a gate itself.
- **Approvals:** the narrated script (N2), the voiced set (N5) and part B's onboarding choice (B0) are the user's.
  `mark` refuses an approval without `--by-user`.
- **Allowances:** a gate is never forced. An `--allow-spikes / --allow-onsets / --allow-cut` needs its row in
  `$P/verify-decisions.md` first (`runbook.cjs mark <step> --allow spike:812 --why … --by-…`); verify.sh refuses
  otherwise and copies every allowance into the report and the send note.
- **Facts and figures:** on-screen facts come only from owner- or TxDMV-sourced fields; a demo fee only from the owner
  or the user; nothing is guessed.
- **Listening:** a model that cannot hear uses the second transcription (`transcribe.py --model medium.en --only …`)
  as its ear; if both models agree with the script it records the decision, otherwise the user listens.

## 5. Sending files

- Every file sent in chat is **≤ 28 MB** (the chat's upload limit is 30 MB): `scripts/share.sh` makes it; the master
  is never sent (its path goes in the note).
- Attach with whatever file-sending tool the harness has (SendUserFile in Claude Code), with the filled send note
  (`fill-client.cjs send-note`).

## 6. Machines other than the Claude Code image

`setup.sh --check` names every missing piece with its remedy. The image this skill was built on has Node 22 at
/opt/node22, Playwright 1.56.1 in the global npm root, browsers in /opt/pw-browsers (chromium-1194 and
chromium_headless_shell-1194), ffmpeg 6 with libx264, python3.11 with PIL and numpy, poppler-utils. Elsewhere, with the
user's OK only:

```bash
npm i -g playwright@1.56.1
PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers npx playwright@1.56.1 install chromium chromium-headless-shell
export PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers          # env.sh, remotion.config.ts, stills.cjs and render.sh read it
(cd $P && npx remotion browser ensure)                     # only if no headless shell is available at all
```

The voice venv is durable (`$HOME/.cache/recordly-demo/voice-venv`, models in `$HOME/.cache/huggingface`), so it
survives the session; `setup.sh --voice` rebuilds it from `assets/voice/requirements.lock` (torch from the PyTorch CPU
index first). A system espeak-ng is not needed.

## 7. Appendix: Claude Code

- Bash calls default to a 2-minute timeout (max 600000 ms in the foreground). `run_in_background: true` with a
  timeout up to 7200000 ms works for a long job too, but `bg.sh` is the house way: it survives the call, and a later
  turn can poll it. Do not poll with foreground `sleep`; use `bg.sh wait <name> 540` or the Monitor tool.
- `SendUserFile` attaches files (`display: "render"` shows the MP4 inline).
- The scratchpad directory from the system prompt is the place for `--scratch`.
- Heavy work runs under `nice -n 15` (the scripts do it); the container is shared with other work.

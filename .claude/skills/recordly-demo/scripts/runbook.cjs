#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * runbook.cjs — the recordly-demo runbook, step by step, for any agent (assets/runbook.json; references/runbook.md).
 *
 *   node runbook.cjs status              every step on this run's path, its state, and the next step
 *   node runbook.cjs next                the next step's full card: why, command (variables resolved), outputs, PASS
 *                                        gate, on-FAIL rule
 *   node runbook.cjs show <id>           one step's card
 *   node runbook.cjs run <id>            run it: refuses until its `needs` PASS and are not STALE (and, for the desk
 *                                        captures, until the desk has not moved since its clean preflight). Short steps
 *                                        run here and are judged at once; long steps start through bg.sh (then
 *                                        `check <id>`). Every step runs from $REPO, whatever the caller's directory.
 *   node runbook.cjs run <id> --force --why "<reason>" --by-user "<the user's words>"
 *                                        run past unmet needs. Only with the user's own words; recorded as a forced
 *                                        row in verify-decisions.md, shown as PASS* and carried into the send note.
 *   node runbook.cjs run A4 --pass-force re-create an existing project (new-project.sh --force; backs up the plan,
 *                                        the voice lines and the storyboard first)
 *   node runbook.cjs skip <id> --by-user "<their words>"
 *                                        an optional step the user declined (N0: no narrated cut)
 *   node runbook.cjs check <id>          judge a long step once bg.sh says DONE / FAILED (or re-judge any step's log)
 *   node runbook.cjs mark <id> --by-user "<their words>" | --by-agent "<what you looked at>" [--why "…"]
 *                                        close a by-eye / by-ear / approval / send step. An approval needs the
 *                                        user's own words. A model that cannot see images or hear audio never marks
 *                                        a by-eye or by-ear step --by-agent: it sends the files and records the user.
 *   node runbook.cjs mark <id> --allow spike:812 --why "<what it is>" --by-agent "<what you looked at>"
 *                                        record an allowance before verify.sh --allow-spikes 812 (also onset:, cut:)
 *   node runbook.cjs selftest            validate runbook.json (ids, needs, scripts, gates) and that references/runbook.md
 *                                        is its current rendering — no run needed
 *   node runbook.cjs doc                 print references/runbook.md from runbook.json
 *
 * STALE: a PASS is only as good as what it was built from. When a step runs (or passes) again, every step that needs
 * it, directly or through others, reads STALE until it is run again; an approval or a look is bound to the hash of what
 * was approved (its `approves` files) and reads STALE when that file changes. STALE is not done: `next` returns it.
 *
 * Needs SCRATCH (source $SCRATCH/demo.env; runbook S2 writes it) except for S0-S2 and selftest. State:
 * $SCRATCH/runbook-state.json; logs: $SCRATCH/runbook/<id>.log (long steps: $SCRATCH/jobs/<id>.log); decisions:
 * $P/verify-decisions.md (scripts/decisions.cjs). The path is chosen from the run: a desk (DESK_DIR set) adds part B;
 * client-inputs.json → narration adds the narrated cut; no desk takes the site-only render steps.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL = path.resolve(__dirname, '..');
const RB = JSON.parse(fs.readFileSync(path.join(SKILL, 'assets', 'runbook.json'), 'utf8'));
const argv = process.argv.slice(2);
const cmd = argv[0] || 'status';
const id = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const die = (m, code = 1) => { console.error(m); process.exit(code); };
const byId = Object.fromEntries(RB.steps.map((s) => [s.id, s]));

// ---------------------------------------------------------------- selftest (no environment needed)
function selftest() {
  const bad = [];
  const ok = (c, m) => { if (!c) bad.push(m); };
  const seen = new Set();
  const KINDS = new Set(['auto', 'manual', 'by-eye', 'by-ear', 'approval', 'send']);
  const PATHS = new Set(['all', 'nodesk', 'desk', 'narrated']);
  RB.steps.forEach((s, i) => {
    ok(/^[A-Z][A-Za-z0-9]*$/.test(s.id), `${s.id}: id`);
    ok(!seen.has(s.id), `${s.id}: duplicate id`); seen.add(s.id);
    ok(KINDS.has(s.kind), `${s.id}: kind ${s.kind}`);
    ok(PATHS.has(s.path), `${s.id}: path ${s.path}`);
    ok(typeof s.title === 'string' && s.title.length > 5, `${s.id}: title`);
    ok(typeof s.command === 'string' && s.command.trim(), `${s.id}: command`);
    ok(typeof s.onFail === 'string' && s.onFail.length > 10, `${s.id}: onFail rule`);
    ok(s.pass && (s.pass.exit !== undefined || s.pass.match || s.pass.files || s.pass.mark), `${s.id}: a PASS gate`);
    if (s.pass && s.pass.match) { try { new RegExp(s.pass.match); } catch (e) { bad.push(`${s.id}: pass.match is not a regex: ${e.message}`); } }
    if (['by-eye', 'by-ear', 'approval', 'send'].includes(s.kind)) ok(s.pass && s.pass.mark, `${s.id}: a ${s.kind} step closes only by mark`);
    if (s.pass && s.pass.files) ok(Array.isArray(s.outputs) && s.outputs.length, `${s.id}: pass.files without outputs`);
    for (const n of s.needs || []) {
      ok(byId[n], `${s.id}: needs unknown ${n}`);
      ok(byId[n] && RB.steps.indexOf(byId[n]) < i, `${s.id}: needs ${n}, which comes later`);
    }
    for (const m of s.command.matchAll(/\$S\/((?:scripts|assets|template)\/[\w./-]+)/g)) ok(fs.existsSync(path.join(SKILL, m[1])), `${s.id}: ${m[1]} does not exist in the skill`);
    if (s.long) ok(!s.preEnv || s.id === 'S1', `${s.id}: a long step runs through bg.sh, which needs SCRATCH (only S1 may be long before demo.env)`);
    if (s.kind === 'approval') ok(Array.isArray(s.approves) && s.approves.length, `${s.id}: an approval names the files it approves (approves), so a change asks again`);
    if (s.optional) ok(/<their words>|user/.test(s.onFail) || s.kind === 'manual', `${s.id}: an optional step says the user decides`);
  });
  ok(RB.steps.some((s) => s.deskGuard), 'no desk capture step carries deskGuard');
  for (const p of ['all', 'nodesk', 'desk', 'narrated']) ok(RB.steps.some((s) => s.path === p), `no step on path ${p}`);
  if (bad.length) { for (const b of bad) console.log('FAIL ', b); console.log(`RUNBOOK SELFTEST FAIL (${bad.length})`); process.exit(1); }
  console.log(`RUNBOOK SELFTEST PASS: ${RB.steps.length} steps (${['all', 'nodesk', 'desk', 'narrated'].map((p) => `${p} ${RB.steps.filter((s) => s.path === p).length}`).join(', ')}), every script present, every gate valid`);
}
// ---------------------------------------------------------------- doc: references/runbook.md from runbook.json
function doc() {
  const PATHS = { all: 'every film', nodesk: 'a site with no desk', desk: 'with the sale desk (the house film: parts A + B)', narrated: 'the narrated long cut (on request)' };
  const kinds = { auto: 'scripted: the gate decides', manual: 'you do the work; the gate checks it', 'by-eye': 'looked at: closed by mark', 'by-ear': 'watched and listened to: closed by mark', approval: "the user's approval: closed by mark --by-user", send: 'sent: closed by mark' };
  const md = ['# The runbook, step by step', '',
    '<!-- generated from assets/runbook.json by `node scripts/runbook.cjs doc > references/runbook.md`; edit the JSON, not this file (selftest checks they agree) -->', '',
    'Every step has one command, its outputs, a PASS gate and a written rule for a FAIL. `node $S/scripts/runbook.cjs next` prints',
    'the next step with the variables resolved; `run <id>` runs and judges it; long steps start through `bg.sh` and are',
    'judged with `check <id>`; looked-at, listened-to, approval and send steps close only with `mark <id>` (references/harness.md).',
    'Every command assumes `source $SCRATCH/demo.env` first (S0-S2 come before it exists), and every step runs from $REPO.', '',
    'A PASS holds only while what it was built from holds: a step that runs again makes every step after it STALE, and an',
    'approval is bound to the files it approved (a changed script.md asks again). STALE is not done; `next` returns it.',
    '`run <id> --force` needs `--why` and the user\'s own words (`--by-user`); it is recorded, shows as PASS* and goes into',
    'the send note. An optional step is declined only with the user\'s words (`skip <id> --by-user … --source …`).', ''];
  for (const p of ['all', 'nodesk', 'desk', 'narrated']) {
    const list = RB.steps.filter((x) => x.path === p);
    md.push(`## ${p === 'all' ? 'Every film' : p === 'nodesk' ? 'A site with no desk (rare: the house cut ends on the desk\'s Admin row; ask the user first)' : p === 'desk' ? 'With the sale desk: part B, render, verify, send' : 'The narrated long cut (on request, after the short film is sent)'}`, '');
    for (const x of list) {
      md.push(`### ${x.id} · ${x.title}`, '');
      md.push(`- **Kind:** ${x.kind} (${kinds[x.kind]})${x.long ? '; long: runs through bg.sh' : ''}${x.deskGuard ? '; refused while the desk has moved since its clean preflight' : ''}${x.optional ? '; optional: the user may decline it (skip)' : ''}`);
      if (x.approves) md.push(`- **Approves:** ${x.approves.map((a) => `\`${a}\``).join(', ')} (a change makes it STALE)`);
      if (x.needs && x.needs.length) md.push(`- **Needs:** ${x.needs.join(', ')}`);
      md.push('- **Command:**', '', '  ```bash', `  ${x.command}`, '  ```', '');
      if (x.outputs) md.push(`- **Outputs:** ${x.outputs.map((o) => `\`${o}\``).join(', ')}`);
      md.push(`- **PASS:** ${[x.pass.exit !== undefined ? `exit ${x.pass.exit}` : null, x.pass.match ? `prints \`${x.pass.match.replace(/\\/g, '')}\`` : null, x.pass.files ? 'every output exists' : null, x.pass.mark ? '`runbook.cjs mark`' : null].filter(Boolean).join('; ')}`);
      md.push(`- **On FAIL:** ${x.onFail}`, '');
    }
  }
  void PATHS;
  return md.join('\n') + '\n';
}
if (cmd === 'doc') { process.stdout.write(doc()); process.exit(0); }
if (cmd === 'selftest') {
  const f = path.join(SKILL, 'references', 'runbook.md');
  if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== doc()) { console.log('FAIL  references/runbook.md is not runbook.json: node scripts/runbook.cjs doc > references/runbook.md'); process.exitCode = 1; }
  selftest(); process.exit(process.exitCode || 0);
}

// ---------------------------------------------------------------- the run's environment and state
const SCRATCH = process.env.SCRATCH;
const envFile = SCRATCH && path.join(SCRATCH, 'demo.env');
function loadEnv() {
  if (!envFile || !fs.existsSync(envFile)) return Object.assign({ S: SKILL }, process.env);
  const r = spawnSync('bash', ['-c', `source "${envFile}" && env -0`], { encoding: 'utf8' });
  const env = {};
  for (const kv of r.stdout.split('\0')) { const i = kv.indexOf('='); if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1); }
  return env;
}
const ENV = loadEnv();
ENV.S = ENV.S || SKILL;
const stateFile = SCRATCH && path.join(SCRATCH, 'runbook-state.json');
const readState = () => (stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { steps: {} });
const writeState = (st) => { if (!stateFile) die('SCRATCH is not set: source your demo.env (runbook S2)'); fs.writeFileSync(stateFile, JSON.stringify(st, null, 2) + '\n'); };
const STATE = readState();
const inputs = (() => { try { return JSON.parse(fs.readFileSync(ENV.I, 'utf8')); } catch { return null; } })();
const HAS_DESK = !!(ENV.DESK_DIR && ENV.DESK_DIR.trim());
const NARRATED = !!(inputs && inputs.narration);
const onPath = (s) => s.path === 'all' || (s.path === 'nodesk' && !HAS_DESK) || (s.path === 'desk' && HAS_DESK) || (s.path === 'narrated' && NARRATED);
const resolve = (t) => t.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (m, k) => (ENV[k] !== undefined && ENV[k] !== '' ? ENV[k] : m));
const rawStatus = (s) => (STATE.steps[s.id] && STATE.steps[s.id].status) || '-';
const crypto = require('crypto');
/** The hash of the files an approval or a look approved, as they stand now (missing files hash as absent). */
function approvedHash(s) {
  if (!Array.isArray(s.approves) || !s.approves.length) return null;
  const h = crypto.createHash('sha256');
  for (const pattern of s.approves) {
    const f = resolve(pattern);
    const files = /\*/.test(f) ? globFiles(f) : [f];
    for (const one of files) {
      h.update(one + '\0');
      h.update(fs.existsSync(one) && fs.statSync(one).isFile() ? fs.readFileSync(one) : Buffer.from('absent'));
    }
  }
  return h.digest('hex').slice(0, 16);
}
function globFiles(pattern) {
  const dir = path.dirname(pattern);
  const re = new RegExp('^' + path.basename(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  try { return fs.readdirSync(dir).filter((n) => re.test(n)).sort().map((n) => path.join(dir, n)); } catch { return []; }
}
const staleMemo = new Map();
/** Why a PASS no longer holds, or null: an upstream step ran again after it, or what it approved changed. */
function staleWhy(s) {
  if (staleMemo.has(s.id)) return staleMemo.get(s.id);
  staleMemo.set(s.id, null);
  const st = STATE.steps[s.id];
  let why = null;
  if (st && (st.status === 'PASS' || st.status === 'SKIPPED')) {
    for (const n of s.needs || []) {
      const up = byId[n];
      if (!up || !onPath(up)) continue;
      const ust = STATE.steps[n];
      if (staleWhy(up)) { why = `${n} is stale`; break; }
      if (ust && ust.at && st.at && ust.at > st.at) { why = `${n} ran again after it (${ust.at} > ${st.at})`; break; }
      if (ust && ust.status !== 'PASS' && ust.status !== 'SKIPPED') { why = `${n} is ${ust.status}`; break; }
    }
    if (!why && st.approvedHash && approvedHash(s) !== st.approvedHash) why = `what was approved changed since (${(s.approves || []).join(', ')})`;
  }
  staleMemo.set(s.id, why);
  return why;
}
const status = (s) => {
  const raw = rawStatus(s);
  if (raw === 'PASS' && staleWhy(s)) return 'STALE';
  if (raw === 'PASS' && STATE.steps[s.id] && STATE.steps[s.id].forced) return 'PASS*';
  return raw;
};
const isDone = (s) => !onPath(s) || ((rawStatus(s) === 'PASS' || rawStatus(s) === 'SKIPPED') && !staleWhy(s));

function card(s) {
  const st = STATE.steps[s.id] || {};
  return [
    `== ${s.id}  ${s.title}   [${s.kind}${s.long ? ', long: runs through bg.sh' : ''}${s.optional ? ', optional: skip it only with the user\'s words' : ''}; state ${status(s)}]`,
    staleWhy(s) ? `STALE:    ${staleWhy(s)}: run it again` : null,
    s.needs && s.needs.length ? `needs:    ${s.needs.map((n) => `${n} (${status(byId[n])})`).join(', ')}` : null,
    `command:  ${resolve(s.command)}`,
    s.outputs ? `outputs:  ${s.outputs.map(resolve).join(', ')}` : null,
    `PASS:     ${[s.pass.exit !== undefined ? `exit ${s.pass.exit}` : null, s.pass.match ? `output matches /${s.pass.match}/` : null, s.pass.files ? 'every output exists' : null, s.pass.mark ? `closed by: runbook.cjs mark ${s.id} ${s.kind === 'approval' ? '--by-user "<their words>"' : '--by-user "<their words>" | --by-agent "<what you looked at>"'}` : null].filter(Boolean).join('; ')}`,
    `on FAIL:  ${s.onFail}`,
    st.log ? `last log: ${st.log}` : null,
    s.kind === 'manual' ? 'run:      do the work the step names, then `runbook.cjs run ' + s.id + '` to check it' : `run:      node ${path.join(SKILL, 'scripts', 'runbook.cjs')} run ${s.id}`,
  ].filter(Boolean).join('\n');
}

function judge(s, rc, out) {
  const why = [];
  if (s.pass.exit !== undefined && rc !== s.pass.exit) why.push(`exit ${rc} (wanted ${s.pass.exit})`);
  if (s.pass.match && !new RegExp(s.pass.match).test(out)) why.push(`the output does not match /${s.pass.match}/`);
  if (s.pass.files) for (const f of s.outputs || []) if (!fs.existsSync(resolve(f))) why.push(`missing ${resolve(f)}`);
  return why;
}
function record(s, fields) {
  // Milliseconds, so a step run straight after another still sorts after it (STALE compares these).
  STATE.steps[s.id] = Object.assign({}, STATE.steps[s.id], fields, { at: new Date().toISOString() });
  if (fields.status === 'PASS' && Array.isArray(s.approves)) STATE.steps[s.id].approvedHash = approvedHash(s);
  if (fields.status && fields.status !== 'PASS' && !fields.forced) delete STATE.steps[s.id].forced;
  writeState(STATE);
  staleMemo.clear();
}
function settle(s, rc, out, log) {
  const why = judge(s, rc, out);
  const status = why.length ? 'FAIL' : s.pass.mark ? 'CHECKED' : 'PASS';
  const forced = STATE.steps[s.id] && STATE.steps[s.id].forced;
  record(s, { status, rc, log, why, ...(forced && !why.length ? { forced: true } : {}) });
  if (why.length) { console.log(`\n${s.id} FAIL: ${why.join('; ')}\non FAIL: ${s.onFail}`); process.exit(1); }
  console.log(status === 'PASS' ? `\n${s.id} PASS` : `\n${s.id} CHECKED: now the ${s.kind} part — ${s.onFail}\nthen: runbook.cjs mark ${s.id} ${s.kind === 'approval' ? '--by-user "<their words>"' : '--by-user "<their words>" | --by-agent "<what you looked at>"'}`);
}

function deskGuard(s) {
  if (!s.deskGuard) return;
  const sb = resolve(s.id.startsWith('N') ? '$P/narration/storyboard-long.json' : '$P/storyboard.json');
  const pf = fs.existsSync(sb) ? JSON.parse(fs.readFileSync(sb, 'utf8')).deskPreflight : null;
  if (!pf) die(`${s.id}: ${sb} has no deskPreflight stamp: run the desk preflight first (${s.id.startsWith('N') ? 'N8' : 'B3'})`);
  const g = (a) => spawnSync('git', ['-C', ENV.DESK_DIR, ...a], { encoding: 'utf8' }).stdout.trim();
  const now = g(['log', '-1', '--format=%h', '--', 'src/lib/sales', 'src/components/admin']);
  const dirty = g(['status', '--porcelain', '--', 'src/lib/sales', 'src/components/admin']).split('\n').filter(Boolean).length;
  if (!now) die(`${s.id}: cannot read the desk's commit (DESK_DIR ${ENV.DESK_DIR} is not a git checkout?): the guard cannot tell whether the desk moved since its preflight`);
  if (now !== pf.commit || dirty !== pf.dirty) die(`${s.id}: the desk moved since its clean preflight (${pf.commit}${pf.dirty ? ` +${pf.dirty}` : ''} → ${now}${dirty ? ` +${dirty}` : ''}): run ${s.id.startsWith('N') ? 'N8' : 'B3'} again first`);
}

function needsOk(s) {
  const open = (s.needs || []).map((n) => byId[n]).filter((n) => !isDone(n));
  return open;
}

function run(s) {
  if (!onPath(s)) die(`${s.id} is not on this run's path (${s.path}; desk ${HAS_DESK ? 'yes' : 'no'}, narrated ${NARRATED ? 'yes' : 'no'})`);
  const open = needsOk(s);
  const forcing = argv.includes('--force');
  if (open.length && !forcing) die(`${s.id} needs ${open.map((n) => `${n.id} (${status(n)}${staleWhy(n) ? `: ${staleWhy(n)}` : ''})`).join(', ')} to PASS first`);
  if (forcing) {
    const words = opt('--by-user'), why = opt('--why');
    if (!words || !why) die(`--force skips ${open.map((n) => n.id).join(', ') || 'nothing'}: it needs --why "<the reason>" and --by-user "<the user's own words allowing it>". A model never forces a gate on its own (SKILL.md rule 5).`);
    if (!ENV.P) die('P is not set: source your demo.env');
    const { add } = require('./decisions.cjs');
    add(ENV.P, { step: s.id, kind: 'forced', what: `ran past ${open.map((n) => `${n.id} (${status(n)})`).join(', ') || 'no open need'}`, why, who: `user: "${words}"` });
    STATE.steps[s.id] = Object.assign({}, STATE.steps[s.id], { forced: true });
  }
  if (!s.preEnv && !fs.existsSync(envFile || '')) die('source your demo.env first (runbook S2 writes it; SCRATCH must be set)');
  deskGuard(s);
  if (s.kind === 'manual' && /<[a-z][^>]*>/.test(s.command)) {
    // a template command (placeholders in angle brackets): you ran it with your values; this only checks its outputs
    const why = judge(s, 0, '');
    if (!SCRATCH) { console.log(why.length ? `${s.id} FAIL: ${why.join('; ')}` : `${s.id} PASS (not recorded: SCRATCH is not set yet; source demo.env)`); process.exit(why.length ? 1 : 0); }
    return settle(s, 0, '', null);
  }
  const command = s.id === 'A4' && argv.includes('--pass-force') ? `${s.command} --force` : s.command;
  /*
    Every step runs from the repo root ($REPO), whatever directory the agent's shell is in: inputs hold repo-relative
    paths (siteDir, brand files), and a step run from elsewhere failed with a doubled path that blamed npm ci.
  */
  const cwd = ENV.REPO && fs.existsSync(ENV.REPO) ? ENV.REPO : process.cwd();
  const script = `set -o pipefail; ${s.preEnv && !fs.existsSync(envFile || '') ? `export S=${JSON.stringify(SKILL)}; ` : `source ${JSON.stringify(envFile)}; `}cd ${JSON.stringify(cwd)}; ${command}`;
  console.log(`(running from ${cwd})`);
  if (s.long) {
    if (!SCRATCH) die('long steps run through bg.sh, which needs SCRATCH: source demo.env');
    const r = spawnSync('bash', [path.join(SKILL, 'scripts', 'bg.sh'), 'start', s.id, '--', 'bash', '-c', script], { encoding: 'utf8', cwd, env: Object.assign({}, process.env, { SCRATCH }) });
    process.stdout.write(r.stdout); process.stderr.write(r.stderr);
    if (r.status !== 0) process.exit(r.status);
    record(s, { status: 'RUNNING', log: path.join(SCRATCH, 'jobs', `${s.id}.log`), ...(forcing ? { forced: true } : {}) });
    console.log(`\n${s.id} RUNNING in the background. Poll: bash ${path.join(SKILL, 'scripts', 'bg.sh')} wait ${s.id} 540   then: node ${__filename} check ${s.id}`);
    return;
  }
  const logDir = path.join(SCRATCH || '/tmp', 'runbook');
  fs.mkdirSync(logDir, { recursive: true });
  const log = path.join(logDir, `${s.id}.log`);
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', maxBuffer: 1 << 28, cwd, env: Object.assign({}, process.env, ENV) });
  const out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(log, out);
  process.stdout.write(out.length > 6000 ? `… (${out.length} chars; full log ${log})\n` + out.slice(-6000) : out);
  if (!SCRATCH) { const why = judge(s, r.status, out); console.log(why.length ? `\n${s.id} FAIL: ${why.join('; ')}\non FAIL: ${s.onFail}` : `\n${s.id} PASS (not recorded: SCRATCH is not set yet)`); process.exit(why.length ? 1 : 0); }
  settle(s, r.status, out, log);
}

function check(s) {
  if (s.long) {
    const J = path.join(SCRATCH, 'jobs');
    const rcF = path.join(J, `${s.id}.rc`);
    if (!fs.existsSync(rcF)) {
      const g = fs.existsSync(path.join(J, `${s.id}.pgid`)) ? fs.readFileSync(path.join(J, `${s.id}.pgid`), 'utf8').trim() : '';
      let alive = false; try { if (g) { process.kill(-Number(g), 0); alive = true; } } catch { alive = false; }
      if (alive) { console.log(`${s.id} still RUNNING: bash ${path.join(SKILL, 'scripts', 'bg.sh')} wait ${s.id} 540`); process.exit(3); }
      record(s, { status: 'FAIL', why: ['the job died without an exit code (killed?)'] });
      die(`${s.id} FAIL: the job died without an exit code (killed? out of memory?). on FAIL: ${s.onFail}`);
    }
    const out = fs.readFileSync(path.join(J, `${s.id}.log`), 'utf8');
    console.log(out.split('\n').slice(-12).join('\n'));
    return settle(s, Number(fs.readFileSync(rcF, 'utf8').trim()), out, path.join(J, `${s.id}.log`));
  }
  return run(s);
}

function mark(s) {
  const { add } = require('./decisions.cjs');
  if (!ENV.P) die('P is not set: source your demo.env');
  const user = opt('--by-user'), agent = opt('--by-agent');
  if (!user && !agent) die('mark needs --by-user "<the user\'s own words>" or --by-agent "<what you looked at>"');
  const allow = opt('--allow');
  if (allow) {
    const m = String(allow).match(/^(spike|onset|cut):(\d+(?:,\d+)*)$/);
    if (!m) die('--allow spike:<frame> | onset:<frame> | cut:<frame>');
    if (!opt('--why')) die('--allow needs --why "<what the frame is and why it is not a defect>"');
    add(ENV.P, { step: s.id, kind: `allow-${m[1]}`, what: `frame ${m[2]}`, why: opt('--why'), who: user ? `user: "${user}"` : `agent: ${agent}` });
    console.log(`recorded allow-${m[1]} at frame ${m[2]} for ${s.id} in ${path.join(ENV.P, 'verify-decisions.md')}`);
    return;
  }
  if (!s.pass.mark) die(`${s.id} is a scripted step: its gate decides (runbook.cjs run ${s.id})`);
  if (s.kind === 'approval' && !user) die(`${s.id} is the user's approval: --by-user "<their words>"`);
  if (user) {
    // The user's own words, and where they said them: never a stand-in typed by the agent.
    const source = opt('--source');
    if (!source || source.trim().length < 4) die('--by-user needs --source "<where the user said it: the chat message (date and time, or its id), or the pasted text>"');
    if (/dry.?run|stand.?in|placeholder|test only/i.test(`${user} ${source}`)) die('--by-user records the user\'s own decision; a dry-run stand-in is not one. Ask the user.');
    if (user.trim().length < 4) console.log(`WARN "${user}" is a very short approval: make sure it answers this step (${s.title}), not another question.`);
  }
  if (agent && agent.trim().length < 12) die('--by-agent must say what you looked at (which stills, which file, what you checked)');
  const auto = s.pass.exit !== undefined || s.pass.match || s.pass.files || s.long;
  if (auto && status(s) !== 'CHECKED' && status(s) !== 'PASS') die(`${s.id}: run its command first (runbook.cjs run ${s.id}${s.long ? `, then check ${s.id}` : ''}); state is ${status(s)}`);
  const hash = approvedHash(s);
  add(ENV.P, { step: s.id, kind: s.kind, what: `${opt('--what') || s.title}${hash ? ` (files ${hash})` : ''}`, why: opt('--why') || (user ? 'the user decided' : 'looked at by the agent'), who: user ? `user: "${user}" (${opt('--source')})` : `agent: ${agent}` });
  record(s, { status: 'PASS', by: user ? 'user' : 'agent' });
  console.log(`${s.id} PASS (recorded in ${path.join(ENV.P, 'verify-decisions.md')})`);
}

function skip(s) {
  if (!s.optional) die(`${s.id} is not optional: run it (runbook.cjs run ${s.id})`);
  const user = opt('--by-user');
  if (!user || !opt('--source')) die(`skip ${s.id} --by-user "<the user's own words declining it>" --source "<where they said it>"`);
  if (!ENV.P) die('P is not set: source your demo.env');
  const { add } = require('./decisions.cjs');
  add(ENV.P, { step: s.id, kind: 'declined', what: s.title, why: 'the user declined it', who: `user: "${user}" (${opt('--source')})` });
  record(s, { status: 'SKIPPED', by: 'user' });
  console.log(`${s.id} SKIPPED (recorded in ${path.join(ENV.P, 'verify-decisions.md')})`);
}

const steps = RB.steps.filter(onPath);
if (cmd === 'status') {
  console.log(`path: site${HAS_DESK ? ' + desk' : ' only'}${NARRATED ? ' + narrated' : ''}  (state ${stateFile || 'not recorded: SCRATCH unset'})`);
  for (const s of steps) console.log(`  ${status(s).padEnd(8)} ${s.id.padEnd(4)} ${s.kind.padEnd(8)} ${s.title}${staleWhy(s) ? `   (stale: ${staleWhy(s)})` : ''}`);
  if (steps.some((s) => status(s) === 'PASS*')) console.log('\nPASS* = forced past an open need with the user\'s words (verify-decisions.md); the send note lists it.');
  const nx = steps.find((s) => !isDone(s));
  console.log(nx ? `\nnext: ${nx.id} (node ${__filename} next)` : '\nevery step on this path is PASS');
} else if (cmd === 'next') {
  const nx = steps.find((s) => !isDone(s));
  if (!nx) console.log('every step on this path is PASS');
  else console.log(card(nx));
} else if (['show', 'run', 'check', 'mark', 'skip'].includes(cmd)) {
  const s = byId[id];
  if (!s) die(`usage: runbook.cjs ${cmd} <step id> (ids: ${RB.steps.map((x) => x.id).join(' ')})`, 2);
  if (cmd === 'show') console.log(card(s));
  else if (cmd === 'run') run(s);
  else if (cmd === 'check') check(s);
  else if (cmd === 'skip') skip(s);
  else mark(s);
} else die('usage: runbook.cjs status | next | show <id> | run <id> | check <id> | mark <id> … | skip <id> … | selftest', 2);

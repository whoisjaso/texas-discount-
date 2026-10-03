#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * validate-scenario.cjs <filled scenario.json>… [--desk DESK_DIR] [--strict]
 *
 * Before any off-camera walk (runbook B4, N9): is this scenario still about THIS desk? The paperwork corridor changes
 * (page-by-page templates, questions turned into taps, facts asked once), and a stale scenario fails mid-walk after the
 * preview mock's state is spent ("NO ANSWER FOR …", "STUCK AT …"), which costs a server restart and every capture since.
 *
 * Static checks, read-only on the desk source:
 *   1. no {{placeholder}} left (fill it with fill-client.cjs scenario);
 *   2. the Start A Sale fields sale.cjs types are present (car, first, last, phone, idNumber, street, city, zip, county);
 *   3. every answer key is a step or question the desk still has: the guide's step keys (guide.ts GuideStepKey, the
 *      "plan:…" step keys) or a paperwork question / deal fact key (`key: "…"` in src/lib/sales/*.ts). A key that is
 *      none of these is STALE: the walk would never meet it, or the screen it answered now asks something else;
 *   4. the desk's last commit touching src/lib/sales or src/components/admin is the scenario's `deskCommit` (else WARN:
 *      re-walk it once and restamp; --strict makes it a failure). Read with `git log` (read-only).
 * The desk's own list of what changed is docs/verification/paperwork-pages/corridor-changes.md (step / key / old → new).
 * Exit 0 OK (warnings allowed), 1 on a failure.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const files = argv.filter((a, i) => !a.startsWith('--') && !['--desk'].includes(argv[i - 1]));
const DESK = opt('--desk') || process.env.DESK_DIR;
const STRICT = argv.includes('--strict');
if (!files.length || !DESK) { console.error('usage: validate-scenario.cjs <scenario.json>… --desk <desk dir> (or DESK_DIR)'); process.exit(2); }
const SALES = path.join(DESK, 'src', 'lib', 'sales');
if (!fs.existsSync(SALES)) { console.error(`no src/lib/sales under ${DESK}`); process.exit(2); }

// ---- what the desk asks
const src = fs.readdirSync(SALES).filter((f) => /\.tsx?$/.test(f)).map((f) => fs.readFileSync(path.join(SALES, f), 'utf8')).join('\n');
const known = new Set();
const guide = fs.readFileSync(path.join(SALES, 'guide.ts'), 'utf8');
const union = guide.match(/export type GuideStepKey\s*=([\s\S]*?);/);
if (union) for (const m of union[1].matchAll(/"([^"]+)"/g)) known.add(m[1]);
for (const m of src.matchAll(/["'`](plan:[a-z][a-zA-Z-]*)["'`]/g)) known.add(m[1]);
for (const m of src.matchAll(/\bkey:\s*"([A-Za-z][A-Za-z0-9]*)"/g)) known.add(m[1]);
for (const m of src.matchAll(/\b(?:id|step):\s*"([a-z][A-Za-z0-9]*)"/g)) known.add(m[1]);
const deskCommit = (() => {
  try { return execFileSync('git', ['-C', DESK, 'log', '-1', '--format=%h', '--', 'src/lib/sales', 'src/components/admin'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return ''; }
})();
const dirty = (() => {
  try { return execFileSync('git', ['-C', DESK, 'status', '--porcelain', '--', 'src/lib/sales', 'src/components/admin'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').filter(Boolean).length; }
  catch { return 0; }
})();
const ancestor = (a, b) => { // is commit a an ancestor of (or equal to) b?
  try { execFileSync('git', ['-C', DESK, 'merge-base', '--is-ancestor', a, b], { stdio: 'ignore' }); return true; } catch { return false; }
};

let fail = 0, warn = 0;
for (const f of files) {
  const sc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const out = [];
  const bad = (m) => { out.push(`FAIL ${m}`); fail++; };
  const wrn = (m) => { out.push(`WARN ${m}`); warn++; };
  const holes = JSON.stringify(Object.fromEntries(Object.entries(sc).filter(([k]) => !k.startsWith('_')))).match(/\{\{[A-Z0-9_]+\}\}/g);
  if (holes) bad(`placeholders left: ${[...new Set(holes)].join(', ')} (fill-client.cjs scenario <inputs> <template> --out <file>)`);
  for (const k of ['car', 'first', 'last', 'phone', 'idNumber', 'street', 'city', 'zip', 'county']) if (!sc[k]) bad(`missing ${k} (sale.cjs types it on Start A Sale)`);
  const stale = Object.keys(sc.answers || {}).filter((k) => !known.has(k) && !known.has(k.split('/').pop()));
  if (stale.length) bad(`answer keys this desk no longer asks: ${stale.join(', ')} (compare with the desk's docs/verification/paperwork-pages/corridor-changes.md, update the scenario, re-walk once)`);
  if (!sc.deskCommit) wrn('no deskCommit stamp: walk it once on this desk and stamp the commit');
  else if (deskCommit && sc.deskCommit !== deskCommit) {
    const m = `walked on desk ${sc.deskCommit}; the desk's corridor is now at ${deskCommit}${ancestor(sc.deskCommit, deskCommit) ? ' (newer)' : ''}: re-walk it, then restamp deskCommit`;
    if (STRICT) bad(m); else wrn(m);
  }
  if (dirty) wrn(`the desk has ${dirty} uncommitted change(s) in src/lib/sales or src/components/admin: the walk meets the working tree, not ${deskCommit}`);
  console.log(`${path.basename(f)}: ${Object.keys(sc.answers || {}).length} answers checked against ${known.size} desk keys`);
  for (const l of out) console.log('  ' + l);
}
console.log(fail ? `\nSCENARIO FAIL (${fail})` : `\nSCENARIO OK${warn ? ` (${warn} warning(s))` : ''}`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * validate-scenario.cjs <filled scenario.json>… [--desk DESK_DIR] [--strict] [--stamp]
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
 *   4. each answer's SHAPE fits its question: a tap question (choice, list, several-at-once, a worked-out date) is
 *      answered with a tap (button / text, or a list search then a tap), a typed one (text, money, number, VIN, date)
 *      with a fill. A typed answer to a question that became a tap is how a stale scenario fails mid-walk;
 *   5. every sworn question the walk will meet is answered (the mileage statement on every bill of sale, the first
 *      payment date when it walks the contract): they have no default, so an unanswered one stops the walk. A set-up
 *      walk that stops on a guide step says so ("stopAt": "plan:registration", the STOP_AT it runs with) and meets none;
 *   6. the scenario was walked on this corridor: `deskCorridor` (scripts/desk/corridor.cjs, a content hash of the
 *      corridor's source, so committing a walked change does not make it stale) equals today's, else the desk's last
 *      commit touching it equals `deskCommit`. Not walked on this corridor is a WARN, and a FAIL with --strict (the
 *      capture scripts run it strict). --stamp records today's deskCorridor and deskCommit into the file: only right
 *      after a clean walk of it on this desk (desk-walk sale.cjs reached the packet).
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
const { corridorHash } = require('./corridor.cjs');
const corridor = corridorHash(DESK);
// The kind of every document-owned question, read off the registry (deal-facts.ts): "key" then its "kind".
const kinds = {};
const sworn = {};
const factsSrc = fs.existsSync(path.join(SALES, 'deal-facts.ts')) ? fs.readFileSync(path.join(SALES, 'deal-facts.ts'), 'utf8') : '';
for (const block of factsSrc.split(/\n\s*\{\s*\n/).slice(1)) {
  const key = (block.match(/\bkey:\s*"([A-Za-z0-9]+)"/) || [])[1];
  const kind = (block.match(/\bkind:\s*"([A-Za-z]+)"/) || [])[1];
  const owner = (block.match(/\bowner:\s*"([A-Za-z0-9:]+)"/) || [])[1];
  if (key && kind && owner && !owner.startsWith('guide:')) {
    kinds[key] = kinds[key] || kind;
    if (/\bmustAnswer:\s*true/.test(block)) sworn[key] = [...(sworn[key] || []), owner];
  }
}
const TAPS = new Set(['choice', 'list', 'multi', 'dateChoice']);
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
  // 4. the shape of each answer against its question's kind
  for (const [k, a] of Object.entries(sc.answers || {})) {
    const kind = kinds[k.split('/').pop()];
    if (!kind) continue;
    const acts = [].concat(a);
    const taps = acts.some((x) => x && (x.button || x.text || x.link));
    const fills = acts.some((x) => x && x.fill);
    if (TAPS.has(kind) && !taps) bad(`${k} is a ${kind} question now (a tap), but the scenario types it (${JSON.stringify(a).slice(0, 80)}): answer it with { "button": "<the card's label>" }`);
    if (!TAPS.has(kind) && kind !== 'choice' && !fills && !taps) bad(`${k} is a typed ${kind} question, and the scenario neither types nor taps it`);
    // Box 11: a typed weight files only with the document it was read from (the empty-weight screen asks which).
    if (k === 'emptyWeight' && fills && !acts.some((x) => x && x.button && x.button !== 'Next')) bad('emptyWeight is typed without its document: the desk asks "Which document is it from?" (add { "button": "Texas Title" } or the one it is from), or tap { "button": "Confirm This Weight" } for the estimate the desk offers');
  }
  // 5. the sworn questions the walk will meet
  const walksContract = ['paymentFrequency', 'termsBy', 'numberOfPayments'].some((k) => k in (sc.answers || {}));
  // A set-up walk that stops on a guide step (stopAt, the STOP_AT it is run with) never reaches the paper.
  const stopsBeforePaper = typeof sc.stopAt === 'string' && !sc.stopAt.startsWith('document:');
  for (const [k, owners] of Object.entries(stopsBeforePaper ? {} : sworn)) {
    const met = owners.filter((owner) => (owner === 'billOfSale' ? !sc.towAway : owner === 'financing' ? walksContract : owner === 'salvageBillOfSale' ? !!sc.towAway : false));
    if (met.length && !(k in (sc.answers || {}))) bad(`${k} (${met.join(', ')}) is a sworn question with no default, and the scenario does not answer it: the walk would stop there`);
  }
  // 6. walked on this corridor
  if (sc.deskCorridor) {
    if (sc.deskCorridor !== corridor) {
      const m = `walked on a corridor that hashed ${sc.deskCorridor}; this desk's hashes ${corridor}: re-walk it, then --stamp`;
      if (STRICT) bad(m); else wrn(m);
    }
  } else if (!sc.deskCommit) wrn('no deskCorridor or deskCommit stamp: walk it once on this desk and --stamp it');
  else if (deskCommit && sc.deskCommit !== deskCommit) {
    const m = `walked on desk ${sc.deskCommit}; the desk's corridor is now at ${deskCommit}${ancestor(sc.deskCommit, deskCommit) ? ' (newer)' : ''}: re-walk it, then --stamp`;
    if (STRICT) bad(m); else wrn(m);
  }
  if (argv.includes('--stamp') && !out.some((l) => l.startsWith('FAIL'))) {
    sc.deskCorridor = corridor;
    sc.deskCommit = deskCommit || sc.deskCommit;
    fs.writeFileSync(f, JSON.stringify(sc, null, 1) + '\n');
    out.push(`stamped deskCorridor ${corridor} (deskCommit ${deskCommit}${dirty ? ` +${dirty} uncommitted` : ''})`);
  }
  if (dirty && !sc.deskCorridor) wrn(`the desk has ${dirty} uncommitted change(s) in src/lib/sales or src/components/admin: the walk meets the working tree, not ${deskCommit}`);
  console.log(`${path.basename(f)}: ${Object.keys(sc.answers || {}).length} answers checked against ${known.size} desk keys`);
  for (const l of out) console.log('  ' + l);
}
console.log(fail ? `\nSCENARIO FAIL (${fail})` : `\nSCENARIO OK${warn ? ` (${warn} warning(s))` : ''}`);
process.exit(fail ? 1 : 0);

// decisions.cjs — the project's record of everything decided by a person (or a model that looked) rather than a script:
// by-eye and by-ear gates, approvals, and every allowance a gate was given. $P/verify-decisions.md, one table row each:
//   | Step | Kind | What | Why | Who | When |
// Kind: by-eye | by-ear | approval | allow-spike | allow-onset | allow-cut | exception. Who: `user: "<their words>"` when
// the user decided (always, for a model that cannot see images or hear audio), or `agent: <what was looked at>`.
// runbook.cjs mark writes rows; verify.sh and narrated-verify.cjs refuse an --allow-* without its row; the send note
// lists every allow-* row.
'use strict';
const fs = require('fs');
const path = require('path');

const HEAD = ['# Verify decisions', '', 'Every gate a person (or a model that looked) decided, and every allowance a scripted gate was given.', '',
  '| Step | Kind | What | Why | Who | When |', '|---|---|---|---|---|---|'];
const file = (project) => path.join(project, 'verify-decisions.md');
const cell = (s) => String(s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

function rows(project) {
  const f = file(project);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*(Step|---)/.test(l))
    .map((l) => l.replace(/^\|\s*|\s*\|$/g, '').split(/\s*\|\s*/)).map(([step, kind, what, why, who, when]) => ({ step, kind, what, why, who, when }));
}
function add(project, { step, kind, what, why, who }) {
  if (![step, kind, what, why, who].every((x) => x && String(x).trim())) throw new Error('a decision needs step, kind, what, why and who');
  const f = file(project);
  if (!fs.existsSync(f)) fs.writeFileSync(f, HEAD.join('\n') + '\n');
  fs.appendFileSync(f, `| ${[step, kind, what, why, who, new Date().toISOString().slice(0, 16) + 'Z'].map(cell).join(' | ')} |\n`);
}
/** the row allowing `kind` (spike | onset | cut) at film frame `frame`, or null */
function allowed(project, kind, frame) {
  return rows(project).find((r) => r.kind === `allow-${kind}` && new RegExp(`\\b${frame}\\b`).test(r.what)) || null;
}

if (require.main === module) {
  // node decisions.cjs check <project> <kind> <frame>…   → exit 1 naming each frame without its row
  const [cmd, project, kind, ...frames] = process.argv.slice(2);
  if (cmd !== 'check' || !project || !kind) { console.error('usage: decisions.cjs check <project> spike|onset|cut <frame>…'); process.exit(2); }
  const missing = frames.flatMap((s) => s.split(',')).filter(Boolean).filter((f) => !allowed(project, kind, f));
  if (missing.length) { console.error(`--allow-${kind}s ${missing.join(',')}: no "allow-${kind}" row naming that frame in ${file(project)}. Record it first: node <skill>/scripts/runbook.cjs mark <step> --allow ${kind}:<frame> --why "<what it is>" --by-agent "<what you looked at>" (or --by-user)`); process.exit(1); }
  console.log(`allowances recorded: ${frames.join(',') || 'none'}`);
}
module.exports = { rows, add, allowed, file };

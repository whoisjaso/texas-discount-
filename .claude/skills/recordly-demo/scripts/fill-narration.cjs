#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * fill-narration.cjs — the narrated long cut's house script, filled for one client.
 *
 *   node fill-narration.cjs init     <client-inputs.json>          add an empty `narration` block to fill (once; a block
 *                                                                  already there is kept: "narration block present")
 *   node fill-narration.cjs check    <client-inputs.json>          every refusal below, nothing written
 *   node fill-narration.cjs lines    <client-inputs.json> [--out narration/lines.json]   what Kokoro voices
 *   node fill-narration.cjs script   <client-inputs.json> [--out narration/script.md]    for the owner to read
 *   node fill-narration.cjs selftest                                 Discount's 24 lines, exactly, plus the refusals
 *   --template <file> uses another lines template (default assets/narration/lines-template.json)
 *
 * The script is the same for every client (assets/narration/script-template.md is the human copy, with the
 * variables table and the fact-check). Only client-inputs.json -> narration changes:
 *   - said variables (spoken, so spelled for the voice), shown variables (on screen, in script.md only),
 *     flags (true/false: a line with `when` is left out when its flag is false), and from the rest of the inputs
 *     a few derived values (client, storyboard BODY / FINDER_QUERY / SERVICE_TILE, outroLines);
 *   - checked: { on, how, features }: the site and desk features walked on THIS client's desk; a line whose
 *     `needs` are not all listed is refused (never narrate a feature the client's desk does not have);
 *   - cut: [{ id, why }]: a line the desk cannot back, cut with its reason; a line whose `requires` (its setup or
 *     payoff) is cut or left out is refused;
 *   - speak: { id: text }: a voice-only spelling for one line (kept here so a refill keeps it).
 * Refused: a placeholder left anywhere ({{…}}), a missing or unknown variable, a flag that is not true/false, an
 * abbreviation or "&" in a said value, LEGAL_NAME_SAID that is not LEGAL_NAME as said, STOCK_SAID not starting with
 * the storyboard's BODY, a claim in CLOSE_TAGLINE, and another client's facts copied from Discount's example.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..');
const DEFAULT_TEMPLATE = path.join(SKILL, 'assets', 'narration', 'lines-template.json');
const SCRIPT_MD = path.join(SKILL, 'assets', 'narration', 'script-template.md');
const EXAMPLE_INPUTS = path.join(SKILL, 'examples', 'discount-used-cars', 'client-inputs.json');
const EXAMPLE_LINES = path.join(SKILL, 'examples', 'discount-used-cars', 'narration-lines.json');
// The shipped project, when the skill sits in the repo it was made in (.claude/skills/recordly-demo).
const REPO_LINES = path.resolve(SKILL, '..', '..', '..', 'clients', 'discount-used-cars-demo', 'narration', 'lines-timed.json');

const args = process.argv.slice(2);
const cmd = args[0];
const flags = {};
const positional = [];
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--out' || args[i] === '--template' || args[i] === '--desk') flags[args[i].slice(2)] = args[++i];
  else if (args[i].startsWith('--')) flags[args[i].slice(2)] = true;
  else positional.push(args[i]);
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const write = (out, text) => {
  if (out && out !== true) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, text);
    console.error(`wrote ${out}`);
  } else process.stdout.write(text);
};

const HOLE = /\{\{|\}\}/;
const VAR = /\{\{([A-Z0-9_]+)\}\}/g;
const META_KEYS = new Set(['checked', 'cut', 'speak', 'anchors', 'exceptions', 'paidInFull']); // anchors / exceptions: narrated-plan.cjs (the lip-to-picture gate); paidInFull: below
const LINE_FIELDS = ['text', 'speak', 'cue', 'key'];

/** Written forms the voice misreads in a said value, with how to spell them. */
const UNSAID = [
  [/\bLLC\b|\bL\.L\.C\b/, 'LLC -> L L C'],
  [/\bLLP\b|\bL\.L\.P\b/, 'LLP -> L L P'],
  [/\bInc\b\.?/, 'Inc -> Incorporated (or as the owner says it)'],
  [/\bLtd\b\.?/, 'Ltd -> Limited'],
  [/\bCo\b\./, 'Co. -> Company'],
  [/\bFwy\b/, 'Fwy -> Freeway'],
  [/\bHwy\b/, 'Hwy -> Highway'],
  [/\bExpy\b/, 'Expy -> Expressway'],
  [/\bPkwy\b/, 'Pkwy -> Parkway'],
  [/\bBlvd\b/, 'Blvd -> Boulevard'],
  [/\bAve\b/, 'Ave -> Avenue'],
  [/\bRd\b/, 'Rd -> Road'],
  [/\bSt\b/, 'St -> Street (or Saint)'],
  [/\bDr\b/, 'Dr -> Drive'],
  [/\bLn\b/, 'Ln -> Lane'],
  [/&/, '& -> and'],
];
const CLAIM = /\$\s?\d|\d+(\.\d+)?\s?%|\bAPR\b|\bfree\b|\bbest\b|\bcheapest\b|\blowest\b|#\s?1\b|\bnumber one\b|\bguarantee/i;
/** The words a line says, for comparing speak with text: spoken forms canonical, then letters and digits only. */
const SPOKEN = [
  [/\bone[\s-]+thirty[\s-]+u\b/g, '130u'], [/\b130[\s-]*u\b/g, '130u'], [/\bl\s+l\s+c\b/g, 'llc'], [/\bl\s+l\s+p\b/g, 'llp'],
  [/\bv\s+i\s+n\b/g, 'vin'], [/\bfreeway\b/g, 'fwy'], [/\bhighway\b/g, 'hwy'], [/\bboulevard\b/g, 'blvd'], [/\bparkway\b/g, 'pkwy'],
  [/\bexpressway\b/g, 'expy'], [/\bavenue\b/g, 'ave'], [/\broad\b/g, 'rd'], [/\bstreet\b/g, 'st'], [/\bdrive\b/g, 'dr'], [/\blane\b/g, 'ln'], [/&/g, ' and '],
];
const speakKey = (text) => {
  let t = String(text).toLowerCase().replace(/[\u2010-\u2015]/g, '-');
  for (const [re, rep] of SPOKEN) t = t.replace(re, rep);
  return t.replace(/[^a-z0-9]+/g, '');
};
/** "Discount Used Cars And Trucks, LLC" and "…, L L C" compare equal: letters and digits only, "&" as "and". */
const nameKey = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const at = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Problems in the template itself (a typo here would otherwise surface as a client's missing variable). */
function templateProblems(tpl) {
  const p = [];
  const V = tpl.variables || {};
  const ids = new Set();
  const used = (s, where) => { for (const [, k] of String(s).matchAll(VAR)) if (!V[k]) p.push(`template ${where}: {{${k}}} is not in variables`); };
  for (const l of tpl.lines || []) {
    if (ids.has(l.id)) p.push(`template: duplicate line id ${l.id}`);
    ids.add(l.id);
    if (!tpl.scenes || !tpl.scenes[l.seg]) p.push(`template ${l.id}: seg "${l.seg}" has no scene title`);
    for (const f of LINE_FIELDS) if (l[f] != null) used(l[f], `${l.id}.${f}`);
    if (l.when && (!V[l.when] || V[l.when].kind !== 'flag')) p.push(`template ${l.id}: when "${l.when}" is not a flag variable`);
    for (const n of l.needs || []) if (!(tpl.features || {})[n]) p.push(`template ${l.id}: needs "${n}" is not in features`);
  }
  for (const l of tpl.lines || []) for (const r of l.requires || []) if (!ids.has(r)) p.push(`template ${l.id}: requires unknown line ${r}`);
  for (const [k, f] of Object.entries(tpl.features || {})) { used(f.what, `features.${k}.what`); used(f.where, `features.${k}.where`); }
  for (const [k, v] of Object.entries(V)) {
    if (!['said', 'shown', 'flag', 'derived'].includes(v.kind)) p.push(`template variables.${k}: kind must be said, shown, flag or derived`);
    if (v.kind === 'derived' && !v.from) p.push(`template variables.${k}: a derived variable needs "from"`);
  }
  return p;
}

/**
 * Fills the template for one client. Returns { lines, dropped, problems, values, N }: `lines` are the filled template
 * lines that play (with cue and key), in template order; `dropped` the lines left out ({ id, why }).
 */
function build(inp, tpl) {
  const problems = templateProblems(tpl);
  const V = tpl.variables;
  const N = inp && inp.narration;
  if (!N || typeof N !== 'object' || Array.isArray(N)) {
    problems.push('client-inputs.json has no narration block: run fill-narration.cjs init <client-inputs.json>, then fill it (assets/narration/script-template.md, "Variables")');
    return { lines: [], dropped: [], problems, values: {}, N: {} };
  }
  const values = {};
  const bad = new Set(); // variables already reported, so the filled lines do not report them again
  for (const [k, v] of Object.entries(V)) {
    if (v.kind === 'derived') {
      let x = at(inp, v.from);
      if (Array.isArray(x)) x = x.join(' · ');
      if (typeof x !== 'string' || !x.trim() || HOLE.test(x)) { problems.push(`${k} comes from client-inputs.json ${v.from}: fill that first (runbook A1, or B0 for the part-B demo data)`); bad.add(k); continue; }
      values[k] = x;
      continue;
    }
    const x = N[k];
    if (v.kind === 'flag') {
      if (typeof x !== 'boolean') { problems.push(`narration.${k} must be true or false (${v.hint}), not ${JSON.stringify(x)}`); bad.add(k); }
      values[k] = x;
      continue;
    }
    if (typeof x !== 'string' || !x.trim()) { problems.push(`narration.${k} is missing: ${v.hint} (source: ${v.source})`); bad.add(k); continue; }
    if (HOLE.test(x)) { problems.push(`narration.${k} is still a placeholder, fill it: ${JSON.stringify(x)}`); bad.add(k); continue; }
    if (x !== x.trim() || /\s{2,}/.test(x)) problems.push(`narration.${k}: no leading, trailing or double spaces: ${JSON.stringify(x)}`);
    if (v.kind === 'said') {
      for (const [re, how] of UNSAID) if (re.test(x)) problems.push(`narration.${k} is spoken: spell it as the voice should say it (${how}): ${JSON.stringify(x)}`);
      if (/[.!?]$/.test(x) && k !== 'CLOSE_TAGLINE') problems.push(`narration.${k} goes inside a sentence: no closing punctuation: ${JSON.stringify(x)}`);
    }
    values[k] = x;
  }
  for (const k of Object.keys(N)) {
    if (k.startsWith('_') || META_KEYS.has(k)) continue;
    if (k === 'SERVICE_BAND') { problems.push('narration.SERVICE_BAND is now narration.SELL_BAND_NAME: the site\'s SELL band as it names itself (e.g. We Buy Cars). The storyboard\'s service band is a different thing (storyboard.SERVICE_TILE)'); continue; }
    if (!V[k] || V[k].kind === 'derived') problems.push(`narration.${k} is not a variable of the template (a typo?): the variables are in assets/narration/script-template.md`);
  }

  // SELLER_LIEN false: the house long cut films a balance owed (22-money, carter-balance) and has no paid-in-full
  // variant, so fill-client.cjs long-storyboard refuses it at N8. Settle it before the script is approved and voiced:
  // the user agrees that template change and narration.paidInFull records their words.
  if (values.SELLER_LIEN === false) {
    const D = N.paidInFull;
    if (!D || typeof D !== 'object' || typeof D.words !== 'string' || D.words.trim().length < 4 || typeof D.source !== 'string' || D.source.trim().length < 4 || HOLE.test(`${D.words}${D.source}`)) {
      problems.push('narration.SELLER_LIEN is false, but the house long cut films a balance owed and has no paid-in-full variant yet (22-money, carter-balance): that is a template change agreed with the user before N1. Record their words as narration.paidInFull { "words": "<their words>", "source": "<where they said it>" } and make the variant before N8 (script-template.md, Kickoff answers to flags)');
    }
  }

  // Cross-checks between values.
  if (typeof values.LEGAL_NAME === 'string' && typeof values.LEGAL_NAME_SAID === 'string' && nameKey(values.LEGAL_NAME) !== nameKey(values.LEGAL_NAME_SAID)) {
    problems.push(`narration.LEGAL_NAME_SAID must be LEGAL_NAME as said (only spacing and punctuation differ, e.g. LLC -> L L C): ${JSON.stringify(values.LEGAL_NAME)} vs ${JSON.stringify(values.LEGAL_NAME_SAID)}`);
  }
  const body = at(inp, 'storyboard.BODY');
  if (typeof values.STOCK_SAID === 'string' && typeof body === 'string' && body.trim()) {
    const first = values.STOCK_SAID.split(/,|\band\b/)[0].trim().toLowerCase();
    if (first !== body.trim().toLowerCase()) problems.push(`narration.STOCK_SAID must name the storyboard's BODY first ("${body}": the line's first word lands on that lineup card), not ${JSON.stringify(values.STOCK_SAID)}`);
  }
  if (typeof values.CLOSE_TAGLINE === 'string' && CLAIM.test(values.CLOSE_TAGLINE)) {
    problems.push(`narration.CLOSE_TAGLINE makes a claim (${values.CLOSE_TAGLINE.match(CLAIM)[0]}): no prices, rates, "best" or "free"; the house line is ${JSON.stringify(V.CLOSE_TAGLINE.house)}`);
  }
  // Another client's facts copied from the worked example.
  if (fs.existsSync(EXAMPLE_INPUTS)) {
    const ex = readJson(EXAMPLE_INPUTS);
    if (inp.slug !== ex.slug && ex.narration) {
      for (const [k, v] of Object.entries(V)) {
        if (v.perClient && typeof values[k] === 'string' && typeof ex.narration[k] === 'string' && nameKey(values[k]) === nameKey(ex.narration[k])) {
          problems.push(`narration.${k} is ${ex.client}'s value (${JSON.stringify(ex.narration[k])}), copied from the worked example: take this client's from ${v.source}`);
        }
      }
      if (N.checked && ex.narration.checked && N.checked.how === ex.narration.checked.how) {
        problems.push(`narration.checked is ${ex.client}'s desk check, copied from the worked example: walk this client's desk and record that (script-template.md, "How to fill and fact-check")`);
      }
    }
  }

  // What the client's desk was checked for.
  const C = N.checked;
  const confirmed = new Set();
  if (!C || typeof C !== 'object') problems.push('narration.checked is missing: { "on": "YYYY-MM-DD", "how": "what was walked or read", "features": [...] } (script-template.md, "How to fill and fact-check")');
  else {
    if (typeof C.on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(C.on) || Number.isNaN(Date.parse(C.on))) problems.push(`narration.checked.on: the date the desk was walked, YYYY-MM-DD, not ${JSON.stringify(C.on)}`);
    if (typeof C.how !== 'string' || !C.how.trim() || HOLE.test(C.how)) problems.push('narration.checked.how: say what was walked or read on the client\'s desk (and where it is written down)');
    if (!Array.isArray(C.features)) problems.push('narration.checked.features: the list of feature keys seen working on the client\'s desk');
    else for (const f of C.features) {
      if (!tpl.features[f]) problems.push(`narration.checked.features: "${f}" is not a feature of the template (${Object.keys(tpl.features).join(', ')})`);
      else confirmed.add(f);
    }
    if (typeof C.how === 'string' && /dry.?run|not walked|nothing was walked|stand.?in|placeholder|to do\b|tbd/i.test(C.how)) {
      problems.push(`narration.checked.how says the desk was not walked (${JSON.stringify(C.how.slice(0, 80))}): walk it (desk-server.sh + desk-walk sale.cjs) and record that`);
    }
    // The desk changed since the walk: the corridor lines (the money, who files, the inspection) may now be untrue.
    // Compared by commit, not by date: a corridor change on the walk's own day used to pass.
    const desk = flags.desk && flags.desk !== true ? flags.desk : process.env.DESK_DIR || '';
    if (desk) {
      const git = (a) => { try { return require('child_process').execFileSync('git', ['-C', desk, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
      const head = git(['log', '-1', '--format=%h', '--', 'src/lib/sales', 'src/components/admin']);
      const dirty = git(['status', '--porcelain', '--', 'src/lib/sales', 'src/components/admin']).split('\n').filter(Boolean).length;
      const commitAt = git(['log', '-1', '--format=%cI', '--', 'src/lib/sales', 'src/components/admin']);
      if (!head) problems.push(`--desk ${desk}: not a git checkout, so the walk cannot be tied to the desk it checked`);
      else {
        if (typeof C.commit !== 'string' || !C.commit.trim()) problems.push(`narration.checked.commit: the desk's corridor commit when it was walked (now ${head}${dirty ? ` +${dirty} uncommitted` : ''}); the desk walk's walk-report.json records it`);
        else if (!head.startsWith(C.commit.trim().slice(0, 7)) && !C.commit.trim().startsWith(head)) problems.push(`narration.checked.commit is ${C.commit}, but the desk's sale corridor is now at ${head} (git log src/lib/sales src/components/admin): walk the desk again, re-check every line, then record the new commit`);
        if (Number.isInteger(C.dirty) ? C.dirty !== dirty : dirty > 0) problems.push(`narration.checked.dirty is ${JSON.stringify(C.dirty ?? null)}, but the desk's corridor has ${dirty} uncommitted change(s) now: walk it again on what is there`);
        // The evidence: the walk's own report (premium-dealer-build desk-walk sale.cjs writes walk-report.json).
        const ev = typeof C.evidence === 'string' && C.evidence.trim() ? path.resolve(C.evidence.trim()) : '';
        const report = ev && (fs.existsSync(path.join(ev, 'walk-report.json')) ? path.join(ev, 'walk-report.json') : ev.endsWith('.json') && fs.existsSync(ev) ? ev : '');
        if (!report) problems.push('narration.checked.evidence: the folder of the desk walk (it holds walk-report.json, written by desk-walk sale.cjs), or that file');
        else {
          let w = null;
          try { w = readJson(report); } catch { w = null; }
          if (!w || typeof w.deskCommit !== 'string') problems.push(`narration.checked.evidence: ${report} is not a desk walk report`);
          else {
            if (!head.startsWith(w.deskCommit.slice(0, 7)) && !w.deskCommit.startsWith(head)) problems.push(`narration.checked.evidence: the walk in ${report} was on desk ${w.deskCommit}, not today's ${head}: walk again`);
            if (commitAt && w.at && Date.parse(w.at) < Date.parse(commitAt)) problems.push(`narration.checked.evidence: the walk (${w.at}) is older than the desk's last corridor commit (${commitAt}): walk again`);
          }
        }
      }
      if (typeof C.on === 'string') {
        const last = git(['log', '-1', '--format=%cs', '--', 'src/lib/sales', 'src/components/admin']);
        if (last && last > C.on) problems.push(`narration.checked.on is ${C.on}, but the desk's sale corridor changed on ${last} (git log src/lib/sales): walk the desk again (desk-server.sh + desk-walk sale.cjs), re-check every line, then set checked.on`);
      }
    }
  }

  // Which lines play.
  const byId = new Map(tpl.lines.map((l) => [l.id, l]));
  const cuts = new Map();
  if (N.cut !== undefined && !Array.isArray(N.cut)) problems.push('narration.cut: a list of { "id": "<line id>", "why": "<what the desk cannot back>" }');
  for (const c of Array.isArray(N.cut) ? N.cut : []) {
    if (!c || !byId.has(c.id)) { problems.push(`narration.cut: no line ${JSON.stringify(c && c.id)}`); continue; }
    if (typeof c.why !== 'string' || !c.why.trim()) { problems.push(`narration.cut ${c.id}: every cut needs its reason (why)`); continue; }
    if (cuts.has(c.id)) problems.push(`narration.cut: ${c.id} is cut twice`);
    cuts.set(c.id, c.why.trim());
  }
  const dropped = [];
  const playing = [];
  for (const l of tpl.lines) {
    if (l.when && values[l.when] === false) dropped.push({ id: l.id, why: `${l.when} is false` });
    else if (cuts.has(l.id)) dropped.push({ id: l.id, why: `cut: ${cuts.get(l.id)}` });
    else playing.push(l);
  }
  const plays = new Set(playing.map((l) => l.id));
  const fillFeature = (s) => String(s).replace(VAR, (m, k) => (typeof values[k] === 'string' ? values[k] : m));
  const unchecked = new Map(); // feature -> the playing lines that narrate it
  for (const l of playing) {
    for (const n of l.needs || []) if (!confirmed.has(n)) unchecked.set(n, [...(unchecked.get(n) || []), l.id]);
    for (const r of l.requires || []) {
      if (!plays.has(r)) problems.push(`${l.id} needs ${r} too (a setup and its payoff stand or fall together), and ${r} is ${dropped.find((d) => d.id === r).why}: cut ${l.id} as well, or keep both`);
    }
  }

  for (const [n, ids] of unchecked) {
    const f = tpl.features[n];
    problems.push(`"${n}" is narrated by ${ids.join(', ')} and is not in narration.checked.features: check it on the client's desk (${fillFeature(f.what)} Where: ${f.where}), then list it, or cut ${ids.length > 1 ? 'those lines' : 'the line'} with the reason (narration.cut)`);
  }

  // Voice-only spellings.
  const speak = N.speak === undefined ? {} : N.speak;
  if (!speak || typeof speak !== 'object' || Array.isArray(speak)) problems.push('narration.speak: { "<line id>": "<the line as the voice is given it>" }');
  else for (const [id, s] of Object.entries(speak)) {
    if (!byId.has(id)) problems.push(`narration.speak: no line ${id}`);
    else if (!plays.has(id)) problems.push(`narration.speak: ${id} does not play (${dropped.find((d) => d.id === id).why})`);
    if (typeof s !== 'string' || !s.trim() || HOLE.test(s)) problems.push(`narration.speak.${id}: the whole line as the voice should say it, no placeholders`);
  }
  const speakTexts = speak && typeof speak === 'object' && !Array.isArray(speak) ? speak : {};

  // Fill.
  const lines = playing.map((l) => {
    const out = { id: l.id, seg: l.seg };
    for (const f of LINE_FIELDS) {
      if (l[f] == null) continue;
      out[f] = l[f].replace(VAR, (m, k) => (typeof values[k] === 'string' ? values[k] : m));
    }
    if (speak && typeof speak[l.id] === 'string') out.speak = speak[l.id];
    /*
      speak is how a line is SPELLED for the voice, never other words: the approved script is the user's. It must
      equal the text after normalising case, punctuation, hyphens and the spoken forms (one-thirty-U = 130-U,
      L L C = LLC, Freeway = Fwy), so only punctuation and spelling may move ("walking in, knowing").
    */
    if (typeof out.speak === 'string' && typeof out.text === 'string' && speakKey(out.speak) !== speakKey(out.text)) {
      problems.push(`${l.id}: speak says other words than the line (${JSON.stringify(out.speak)} vs ${JSON.stringify(out.text)}): change only punctuation and spelling; a new wording is a new script for the user to approve`);
    }
    void speakTexts;
    for (const f of LINE_FIELDS) {
      if (out[f] == null) continue;
      const left = [...out[f].matchAll(VAR)].map((m) => m[1]).filter((k) => !bad.has(k));
      if (left.length || HOLE.test(out[f].replace(VAR, ''))) problems.push(`${l.id}.${f} still holds a placeholder after filling: ${JSON.stringify(out[f])}`);
    }
    out.needs = l.needs || [];
    return out;
  });
  return { lines, dropped, problems: [...new Set(problems)], values, N };
}

/** narration/lines.json as the project keeps it: one line per object, the voice's fields only. */
function linesJson(lines) {
  const rows = lines.map((l) => {
    const o = { id: l.id, seg: l.seg, text: l.text };
    if (l.speak != null) o.speak = l.speak;
    return ` ${JSON.stringify(o)}`;
  });
  return `[\n${rows.join(',\n')}\n]\n`;
}

function words(lines) { return lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0); }

/** narration/script.md: the filled script with its pictures, for the owner to read before voicing. */
function scriptMd(r, tpl) {
  const w = words(r.lines);
  const secs = Math.round((w / 140) * 60);
  const out = [
    `# ${r.values.CLIENT}: narrated walkthrough, script`,
    '',
    `Filled from the house script (recordly-demo assets/narration, template version ${tpl.version}) by scripts/fill-narration.cjs.`,
    `Lens: every line is money made or time saved. ${r.lines.length} lines, ${w} words: about ${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, '0')} s at 140 words a minute.`,
    `Every line was checked against this client's desk on ${r.N.checked.on}: ${r.N.checked.how}`,
  ];
  if (r.dropped.length) out.push(`Left out: ${r.dropped.map((d) => `${d.id} (${d.why})`).join('; ')}.`);
  out.push('Bracketed lines are what is on screen; "key" is the word the picture lands on; "voice" is how a line is spelled for Kokoro.', '', '---');
  let seg = null;
  for (const l of r.lines) {
    if (l.seg !== seg) { seg = l.seg; out.push('', `**${tpl.scenes[seg]}**`); }
    out.push('', `[${l.cue}]`, `\`${l.id}\` ${l.text}`);
    const extra = [`key: ${l.key}`];
    if (l.speak) extra.push(`voice: "${l.speak}"`);
    out.push(`(${extra.join('; ')})`);
  }
  out.push('');
  return out.join('\n');
}

function report(r) {
  if (r.problems.length) {
    console.error(`narration not ready (${r.problems.length}):\n  - ${r.problems.join('\n  - ')}`);
    process.exit(1);
  }
}

function init(file, tpl) {
  const inp = readJson(file);
  if (inp.narration && !flags.force) {
    // Kept as it is (runbook N0 passes on this): a re-run after S2, or a block added by hand, never blocks the run.
    console.log(`narration block present in ${file}: kept as it is (--force replaces it with an empty one)`);
    return;
  }
  const N = {
    _narration: 'The narrated long cut (recordly-demo assets/narration/script-template.md): fill every double-brace value from the source its "Variables" row names, spelled as the voice says it; set every flag true or false on the owner\'s answer; walk the client\'s desk and list each feature seen working in checked.features. Then fill-narration.cjs check, lines and script.',
  };
  for (const [k, v] of Object.entries(tpl.variables)) {
    if (v.kind === 'derived') continue;
    if (v.kind === 'flag') N[k] = null;
    else N[k] = v.house || `{{${v.hint}}}`;
  }
  N.checked = { on: null, how: '{{what was walked or read on the client\'s desk, and where it is written down}}', features: [] };
  N.cut = [];
  N.speak = {};
  inp.narration = N;
  fs.writeFileSync(file, JSON.stringify(inp, null, 2) + '\n');
  console.log(`wrote an empty narration block into ${file}: fill it, then node fill-narration.cjs check ${file}`);
}

/** Discount's approved 24 lines from the template, exactly, and every refusal. */
function selftest(tplFile) {
  const tpl = readJson(tplFile);
  const results = [];
  const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
  const has = (r, re) => r.problems.some((p) => re.test(p));

  ok('the template is consistent', templateProblems(tpl).length === 0, templateProblems(tpl).join('; '));
  // script-template.md carries the same lines and the same variables.
  const md = fs.readFileSync(SCRIPT_MD, 'utf8');
  const missingText = tpl.lines.filter((l) => !md.includes(`\`${l.id}\``) || !md.includes(l.text) || (l.speak && !md.includes(l.speak))).map((l) => l.id);
  ok('script-template.md holds every line, word for word', missingText.length === 0, missingText.join(', '));
  const mdVars = new Set([...md.matchAll(VAR)].map((m) => m[1]));
  const unknownMd = [...mdVars].filter((k) => !tpl.variables[k]);
  const unlisted = Object.keys(tpl.variables).filter((k) => !new RegExp(`^\\| \`${k}\` \\|`, 'm').test(md));
  ok('script-template.md uses only template variables', unknownMd.length === 0, unknownMd.join(', '));
  ok('script-template.md has a Variables row for every variable', unlisted.length === 0, unlisted.join(', '));
  const unlistedFeatures = Object.keys(tpl.features).filter((k) => !md.includes(`\`${k}\``));
  ok('script-template.md lists every feature', unlistedFeatures.length === 0, unlistedFeatures.join(', '));

  // The reproduction.
  const ex = readJson(EXAMPLE_INPUTS);
  const r = build(ex, tpl);
  ok('Discount\'s inputs fill with no problem', r.problems.length === 0, r.problems.join('; '));
  const out = linesJson(r.lines);
  const ref = fs.readFileSync(EXAMPLE_LINES, 'utf8');
  ok(`Discount: ${r.lines.length} lines, byte for byte examples/discount-used-cars/narration-lines.json`, r.lines.length === 24 && out === ref, out === ref ? '' : 'differs');
  if (fs.existsSync(REPO_LINES)) {
    const shipped = readJson(REPO_LINES).map(({ sec, ...l }) => l); // eslint-disable-line no-unused-vars
    const mine = JSON.parse(out);
    const diffs = [];
    for (let i = 0; i < Math.max(shipped.length, mine.length); i++) if (JSON.stringify(shipped[i]) !== JSON.stringify(mine[i])) diffs.push((shipped[i] || mine[i]).id);
    ok('Discount: equals the shipped clients/discount-used-cars-demo/narration/lines-timed.json (id, seg, text, speak)', diffs.length === 0, diffs.join(', '));
  } else ok('Discount: shipped lines-timed.json not in this checkout (compared with the example copy only)', true);
  const s = scriptMd(r, tpl);
  ok('script.md fills with no placeholder left', !HOLE.test(s), (s.match(/.{0,30}\{\{.{0,30}/) || [''])[0]);

  // Refusals.
  const mut = (fn) => { const x = clone(ex); fn(x); return build(x, tpl); };
  ok('a placeholder left in a value is refused', has(mut((x) => { x.narration.ROAD_SAID = '{{the road}}'; }), /ROAD_SAID is still a placeholder/));
  ok('a missing variable is refused', has(mut((x) => { delete x.narration.DEALER_NAME_SAID; }), /DEALER_NAME_SAID is missing/));
  ok('an unknown variable is refused', has(mut((x) => { x.narration.ROAD = 'Gulf Freeway'; }), /narration\.ROAD is not a variable/));
  ok('a flag that is not true/false is refused', has(mut((x) => { x.narration.SELLER_LIEN = 'yes'; }), /SELLER_LIEN must be true or false/));
  ok('an unspelled abbreviation in a said value is refused', has(mut((x) => { x.narration.LEGAL_NAME_SAID = 'Discount Used Cars And Trucks, LLC'; }), /LEGAL_NAME_SAID is spoken.*L L C/));
  ok('"Fwy" in a said value is refused', has(mut((x) => { x.narration.ROAD_SAID = 'Gulf Fwy'; }), /Freeway/));
  ok('LEGAL_NAME_SAID that is not LEGAL_NAME is refused', has(mut((x) => { x.narration.LEGAL_NAME_SAID = 'Discount Cars, L L C'; }), /must be LEGAL_NAME as said/));
  ok('STOCK_SAID not starting with the storyboard BODY is refused', has(mut((x) => { x.narration.STOCK_SAID = 'car, truck and SUV'; }), /BODY first/));
  ok('a claim in CLOSE_TAGLINE is refused', has(mut((x) => { x.narration.CLOSE_TAGLINE = 'The best prices in Houston.'; }), /makes a claim/));
  ok('another client\'s copy of Discount\'s facts is refused', has(mut((x) => { x.slug = 'example-motors'; }), /copied from the worked example/));
  ok('another client\'s copy of Discount\'s desk check is refused', has(mut((x) => { x.slug = 'example-motors'; }), /narration\.checked is .*desk check, copied/));
  const noEs = mut((x) => { x.narration.SPANISH_DOCS = false; });
  ok('SPANISH_DOCS false leaves out 09-car-c only', noEs.problems.length === 0 && noEs.lines.length === 23 && !noEs.lines.some((l) => l.id === '09-car-c'), noEs.problems.join('; '));
  ok('SELLER_LIEN false without the user\'s recorded decision is refused', has(mut((x) => { x.narration.SELLER_LIEN = false; }), /SELLER_LIEN is false.*paidInFull/));
  const noBand = mut((x) => { x.narration.SELL_BAND = false; x.narration.SELLER_LIEN = false; x.narration.paidInFull = { words: 'Film it paid in full', source: 'selftest fixture' }; });
  ok('SELL_BAND and SELLER_LIEN false (paid in full agreed) leave out 03 and 16', noBand.problems.length === 0 && noBand.lines.length === 22 && !noBand.lines.some((l) => ['03-site-c', '16-money-c'].includes(l.id)), noBand.problems.join('; '));
  ok('a feature not checked on the desk is refused', has(mut((x) => { x.narration.checked.features = x.narration.checked.features.filter((f) => f !== 'id-scan'); }), /^"id-scan" is narrated by 10-buyer-a and/));
  ok('a missing check date is refused', has(mut((x) => { x.narration.checked.on = null; }), /checked\.on/));
  ok('cutting a payoff without its setup is refused', has(mut((x) => { x.narration.cut = [{ id: '19-payoff-a', why: 'test' }]; }), /^12-buyer-c needs 19-payoff-a/));
  ok('cutting the signature payoff without its setup is refused', has(mut((x) => { x.narration.cut = [{ id: '20-payoff-b', why: 'test' }]; }), /^06-signin-c needs 20-payoff-b/));
  const pair = mut((x) => { x.narration.cut = [{ id: '12-buyer-c', why: 'test' }, { id: '19-payoff-a', why: 'test' }]; });
  ok('cutting a setup and its payoff together is allowed', pair.problems.length === 0 && pair.lines.length === 22, pair.problems.join('; '));
  ok('a cut without its reason is refused', has(mut((x) => { x.narration.cut = [{ id: '18-plan-b' }]; }), /needs its reason/));
  const line02 = r.lines.find((l) => l.id === '02-site-b');
  const comma = line02 && line02.text.replace('walking in knowing', 'walking in, knowing');
  const sp = mut((x) => { x.narration.speak = { '02-site-b': comma }; });
  ok('a punctuation-only speak override reaches lines.json', comma && sp.problems.length === 0 && JSON.parse(linesJson(sp.lines)).find((l) => l.id === '02-site-b').speak === comma, sp.problems.join('; '));
  ok('a speak override that says other words is refused', has(mut((x) => { x.narration.speak = { '20-payoff-b': 'The seller line.' }; }), /speak says other words than the line/));
  ok('a desk check that says nothing was walked is refused', has(mut((x) => { x.narration.checked.how = 'DRY RUN ONLY: nothing was walked'; }), /says the desk was not walked/));
  const badTpl = clone(tpl);
  badTpl.lines[0].text += ' {{NOPE}}';
  ok('a template placeholder with no variable is refused', has(build(clone(ex), badTpl), /\{\{NOPE\}\} is not in variables/));
  ok('no narration block is refused', has(build(Object.assign(clone(ex), { narration: undefined }), tpl), /no narration block/));

  for (const t of results) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${!t.pass && t.detail ? `: ${t.detail}` : ''}`);
  const failed = results.filter((t) => !t.pass).length;
  console.log(failed ? `SELFTEST FAIL: ${failed} of ${results.length}` : `SELFTEST PASS: ${results.length} checks`);
  process.exit(failed ? 1 : 0);
}

function main() {
  const tplFile = flags.template && flags.template !== true ? flags.template : DEFAULT_TEMPLATE;
  if (cmd === 'selftest') return selftest(tplFile);
  const file = positional[0];
  if (!['init', 'check', 'lines', 'script'].includes(cmd) || !file) {
    console.error('usage: fill-narration.cjs init|check|lines|script <client-inputs.json> [--out FILE] [--template FILE] [--desk DIR] | selftest');
    process.exit(2);
  }
  const tpl = readJson(tplFile);
  if (cmd === 'init') return init(file, tpl);
  const r = build(readJson(file), tpl);
  report(r);
  if (cmd === 'check') {
    console.log(`narration OK: ${r.lines.length} lines, ${words(r.lines)} words${r.dropped.length ? `; left out ${r.dropped.map((d) => `${d.id} (${d.why})`).join(', ')}` : ''}`);
    return;
  }
  write(flags.out, cmd === 'lines' ? linesJson(r.lines) : scriptMd(r, tpl));
}

main();

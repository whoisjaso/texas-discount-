#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * fill-client.cjs — turns one client-inputs.json into the per-client files of a demo project.
 *
 *   node fill-client.cjs check      <client-inputs.json> [--stage pre|desk|post]
 *   node fill-client.cjs project    <client-inputs.json> [--out src/project.ts]
 *   node fill-client.cjs project    --placeholder [--out template/src/project.ts]
 *   node fill-client.cjs storyboard <client-inputs.json> <storyboard-template.json> [--out storyboard.json]
 *   node fill-client.cjs readme     <client-inputs.json> <README-template.md> [--out README.md]
 *   node fill-client.cjs desk-storyboard <client-inputs.json> --into <project>/storyboard.json [--template F]
 *   node fill-client.cjs long-storyboard <client-inputs.json> --into <project>/narration/storyboard-long.json
 *   node fill-client.cjs scenario   <client-inputs.json> <assets/desk-scenarios/X.json> --out <scratch>/X.json
 *   node fill-client.cjs send-note  <client-inputs.json> --film <master.mp4> --share <chat.mp4> [--report <verify
 *                                   report.json>] [--out send-note.md]
 *
 * check stages (runbook A1 / A3 / B0 / B5 / N7): `facts` what the person fills before anything is measured; `pre` the site film's inputs (what new-project.sh needs); `desk` adds part B's
 * decisions before any desk capture: partB.onboarding (owner-fees | sales, the user's answer, never chosen for them),
 * partB.demoFee {cents, source owner|user-approved} on the owner path, deskClock (today 14:00 with the zone offset: the
 * date the server stamps on the documents), demo.phone and demo.addressPartB; `post` adds what the captures measured
 * (partB.cuts, partB.docFileName); `narrated` adds demo.addressNarrated. With no --stage, `pre` plus `post` when partB is
 * set (the old behaviour).
 * desk-storyboard merges the filled desk shots after 4-menu (idempotent: earlier desk shots are replaced), applies the
 * onboarding path (owner-fees: 7's variant and 7b-desk-fees; sales: no 7b), and stamps deskCommit.
 * long-storyboard fills the narrated captures and injects assets/narrated/{select-menu.js, select-menu.css,
 * camera-feed.js}, the feed carrying <project>/public/narrated/card-{front,back}.png (make-demo-card.mjs).
 *
 * Everything that differs between two dealers lives in client-inputs.json (see assets/client-inputs.template.json and
 * examples/discount-used-cars/client-inputs.json). The film's code and theme are the house recipe and never change per
 * client, so a project is: template/ + this file's output + captures.
 *
 * Storyboard placeholders are {{NAME}}. A string that is exactly "{{NAME}}" is replaced by the raw value (a number,
 * an array, an object); inside a longer string the value is inserted as text. Values come from inputs.storyboard,
 * then from the top-level inputs (DOMAIN, DESK_URL, INTRO_KEY, CLOCK, TIMEZONE, SITE_DIR, SLUG, CLIENT, FACTS).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const cmd = args[0];
const VALUE_FLAGS = new Set(['--out', '--into', '--stage', '--template', '--film', '--share', '--report']);
const flags = {};
const positional = [];
for (let i = 1; i < args.length; i++) {
  if (VALUE_FLAGS.has(args[i])) flags[args[i].slice(2)] = args[++i];
  else if (args[i].startsWith('--')) flags[args[i].slice(2)] = true;
  else positional.push(args[i]);
}
const flag = (name) => flags[name];
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (out, text) => {
  if (out && out !== true) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, text);
    console.error(`wrote ${out}`);
  } else process.stdout.write(text);
};

/** The values the template ships with: obviously not a client, but valid TypeScript of the right shape. */
const PLACEHOLDER = {
  client: 'CLIENT NAME',
  domain: 'example.com',
  facts: ['www.example.com', '(000) 000-0000', 'Street, City', 'Day – Day 0 AM – 0 PM'],
  brand: { mark: 'brand/mark.png', logoReverse: 'brand/logo-reverse.png' },
  word: 'BRAND',
  loader: {
    viewport: [1440, 900],
    stage: [0, 0, 0, 0],
    mark: [0, 0, 0, 0],
    word: [0, 0, 0, 0],
    wordFont: { size: 30, lineHeight: 45, weight: 600, trackingEm: 0.5, color: '#FFFFFF' },
    cover: [0, 0, 0, 0],
    coverColor: '#000000',
    wordDoneSec: 1.5,
  },
  stingMarkWidth: 600,
  outroLines: ['www.example.com', '(000) 000-0000 · Street, City', 'Day – Day 0 AM – 0 PM'],
};

/** Every string value still holding a template placeholder ({{…}}); keys starting with "_" are notes. */
function placeholders(node, at = '', out = []) {
  if (typeof node === 'string') { if (/\{\{|\}\}/.test(node)) out.push(`${at}: ${JSON.stringify(node.length > 70 ? node.slice(0, 67) + '…' : node)}`); }
  else if (Array.isArray(node)) node.forEach((x, i) => placeholders(x, `${at}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!k.startsWith('_')) placeholders(v, at ? `${at}.${k}` : k, out);
  return out;
}

function problems(inp) {
  const p = [];
  const need = (cond, msg) => { if (!cond) p.push(msg); };
  const holes = placeholders(inp);
  for (const h of holes) p.push(`still a placeholder, fill it: ${h}`);
  const filled = (...keys) => !holes.some((h) => keys.some((k) => h.startsWith(k)));
  if (filled('slug')) need(typeof inp.slug === 'string' && /^[a-z0-9-]+$/.test(inp.slug), 'slug: kebab-case, e.g. "discount-used-cars"');
  need(typeof inp.domain === 'string' && !/^https?:|^www\.|\//.test(inp.domain), 'domain: bare host without www, e.g. "discountusedcarsandtrucks.com"');
  need(Array.isArray(inp.facts) && inp.facts.length === 4, 'facts: exactly the 4 owner-confirmed on-screen facts, in order: web address, phone, street and city, short hours');
  need(Array.isArray(inp.outroLines) && inp.outroLines.length === 3, 'outroLines: exactly 3 lines (URL; "phone · street, city"; short hours)');
  if (Array.isArray(inp.facts) && inp.facts.length === 4 && filled('domain', 'facts', 'outroLines')) {
    const [web, phone, street, hours] = inp.facts;
    need(web === `www.${inp.domain}`, `facts[0] must be "www.${inp.domain}" (the domain as the URL pill and outro show it), not ${JSON.stringify(web)}`);
    need(/^\(\d{3}\) \d{3}-\d{4}$/.test(phone || ''), `facts[1] is the phone written (000) 000-0000, not ${JSON.stringify(phone)}`);
    if (Array.isArray(inp.outroLines) && inp.outroLines.length === 3) {
      need(inp.outroLines[0] === web, 'outroLines[0] must equal facts[0]');
      need(inp.outroLines[1] === `${phone} · ${street}`, `outroLines[1] must be facts[1] + " · " + facts[2]: ${JSON.stringify(`${phone} · ${street}`)}`);
      need(inp.outroLines[2] === hours, 'outroLines[2] must equal facts[3] (the short hours)');
    }
  }
  if (Array.isArray(inp.outroLines) && Array.isArray(inp.facts)) {
    const blob = inp.outroLines.join(' ');
    const stray = (blob.match(/\$\s?\d|\d+(\.\d+)?\s?%|\bAPR\b|\bfree\b|\bbest\b|\bcheapest\b/gi) || []);
    need(!stray.length, `outroLines contain a price or claim (${stray.join(', ')}): only confirmed facts go on screen`);
  }
  need(inp.logoWidth == null || (Number.isInteger(inp.logoWidth) && inp.logoWidth >= 200 && inp.logoWidth <= 760), 'logoWidth: null (new-project.sh computes min(760, round(300 × logo width / height))) or a whole number of px up to 760');
  need(inp.brand && inp.brand.mark, 'brand.mark: the image the loader shows (measure-site.cjs --into fills it with the .png twin)');
  need(inp.brand && inp.brand.logoReverse, 'brand.logoReverse: the full-colour logo the site shows on dark (footer or black bands)');
  if (inp.overrides !== undefined) {
    need(Array.isArray(inp.overrides) && inp.overrides.every((o) => o && typeof o.shot === 'string' && typeof o.path === 'string' && 'value' in o && typeof o.why === 'string' && o.why.trim()),
      'overrides: a list of { shot, path, value, why } (every override needs its reason)');
  }
  need(typeof inp.word === 'string' && inp.word.length > 0, 'word: the text of .loader__word (scripts/measure-site.cjs fills it)');
  const L = inp.loader;
  need(L && typeof L === 'object', 'loader: run scripts/measure-site.cjs --into <client-inputs.json> on the served site');
  if (L && typeof L === 'object') {
    for (const k of ['stage', 'mark', 'word', 'cover']) need(Array.isArray(L[k]) && L[k].length === 4 && L[k][2] > 0 && L[k][3] > 0, `loader.${k}: [x, y, w, h] in CSS px, measured`);
    need(Array.isArray(L.viewport) && L.viewport[0] === 1440 && L.viewport[1] === 900, 'loader.viewport must be [1440, 900] (the desktop capture viewport)');
    need(L.wordFont && L.wordFont.size > 0, 'loader.wordFont: measured computed style of .loader__word');
    need(typeof L.wordDoneSec === 'number' && L.wordDoneSec > 0.5 && L.wordDoneSec < 2.2, 'loader.wordDoneSec: when the loader word is at rest (1.5 on every premium-dealer-build site)');
  }
  need(typeof inp.introKey === 'string' && /intro/.test(inp.introKey), 'introKey: the SEEN_KEY in the site\'s Loader.tsx (measure-site.cjs finds it)');
  if (filled('clock')) need(typeof inp.clock === 'string' && !Number.isNaN(Date.parse(inp.clock)) && /T14:00:00[+-]\d\d:\d\d$/.test(inp.clock),
    'clock: 2 PM local with the dealer\'s UTC offset that day: Wednesday 2026-09-30T14:00:00-05:00 for Central time, or the next open weekday at 14:00 if closed on Wednesdays');
  return p;
}

/** Part B's decisions, before any desk capture (runbook B0). */
function deskProblems(inp) {
  const p = [];
  const need = (cond, msg) => { if (!cond) p.push(msg); };
  const B = inp.partB || {};
  need(B.onboarding === 'owner-fees' || B.onboarding === 'sales',
    'partB.onboarding: "owner-fees" or "sales", the USER\'s answer to: "Film the owner\'s first sign-in including Your Fees (I type a fee figure you give me), or film a salesperson\'s first sign-in (no fees screen)?" Never choose for them.');
  if (B.onboarding === 'owner-fees') {
    const F = B.demoFee || {};
    need(Number.isInteger(F.cents) && F.cents > 0 && (F.source === 'owner' || F.source === 'user-approved') && typeof F.note === 'string' && F.note.trim(),
      'partB.demoFee: { cents, source: "owner" | "user-approved", note } — the doc fee typed on camera is the owner\'s figure or one the user approved; never invented. The README and the send note name it as a demo input.');
  }
  need(typeof inp.deskClock === 'string' && /^\d{4}-\d\d-\d\dT14:00:00[+-]\d\d:\d\d$/.test(inp.deskClock) && !Number.isNaN(Date.parse(inp.deskClock)),
    'deskClock: the capture day at 14:00 with the zone offset, e.g. 2026-10-02T14:00:00-05:00 (the date the desk server stamps on the documents; the site\'s clock is never used for the desk)');
  const D = inp.demo || {};
  need(/^\d{3}555\d{4}$/.test(String(D.phone || '')), 'demo.phone: ten digits, a 555 number in the dealer\'s area code (e.g. 7135550142): fictional by construction');
  const A = D.addressPartB || {};
  need(A.street && A.city && /^\d{5}$/.test(String(A.zip || '')) && A.county && A.checkedOn && A.how,
    'demo.addressPartB: { street, city, zip, county, checkedOn, how } — a street number that does NOT exist on a real street (lesson B13), with how it was checked');
  return p;
}

/** What the desk captures measured (runbook B5). */
function postProblems(inp) {
  const p = [];
  const need = (cond, msg) => { if (!cond) p.push(msg); };
  const B = inp.partB || {};
  const C = B.cuts || {};
  need(Number.isInteger(C.signinPainted) && Array.isArray(C.saleSkeleton) && C.saleSkeleton.length === 2 && Array.isArray(C.readbackRelease) && C.readbackRelease.length === 2,
    'partB.cuts: { signinPainted, saleSkeleton: [a, b], readbackRelease: [a, b] }: scripts/measure-desk-cuts.cjs --project <P> --into <this file>');
  need(typeof B.docFileName === 'string' && /^130-U_.+\.pdf$/.test(B.docFileName), 'partB.docFileName: the 130-U file name as the desk downloaded it (pdfs.cjs), e.g. 130-U_Carter_812345.pdf');
  return p;
}

/** The narrated cut's demo address (runbook N7): the geocoder must know the street, and it must not be a household. */
function narratedProblems(inp) {
  const A = (inp.demo || {}).addressNarrated || {};
  return A.street && A.city && /^\d{5}$/.test(String(A.zip || '')) && A.county && A.checkedOn && A.how ? []
    : ['demo.addressNarrated: { street, city, zip, county, checkedOn, how } — a block number on a commercial road the Census geocoder resolves (so the autofill happens) and no listed home (lessons N2, B13); record the geocoder URL and date in how / checkedOn'];
}

function stageProblems(inp, stage) {
  const pre = problems(inp);
  if (!stage) return inp.partB ? pre.concat(postProblems(inp)) : pre;
  // facts: what the person fills (runbook A1), before measure-site.cjs --into measures the rest
  if (stage === 'facts') return pre.filter((m) => !/^(word|loader|introKey|brand\.mark)\b/.test(m));
  if (stage === 'pre') return pre;
  if (stage === 'desk') return pre.concat(deskProblems(inp));
  if (stage === 'post') return pre.concat(deskProblems(inp), postProblems(inp));
  if (stage === 'narrated') return pre.concat(narratedProblems(inp));
  throw new Error(`--stage must be facts, pre, desk, post or narrated, not ${stage}`);
}

const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
const tuple = (a) => `[${a.map(num).join(', ')}]`;
const q = (s) => JSON.stringify(s);

function projectTs(inp, placeholder) {
  const L = inp.loader;
  const PB = inp.partB || null;
  const mark = placeholder ? inp.brand.mark : `brand/${path.basename(inp.brand.mark)}`;
  const logo = placeholder ? inp.brand.logoReverse : `brand/${path.basename(inp.brand.logoReverse)}`;
  const head = placeholder
    ? [
        '// Per-client values. This is the TEMPLATE copy (placeholders, never rendered): recordly-demo/scripts/new-project.sh',
        '// overwrites it from the client\'s client-inputs.json (scripts/fill-client.cjs project). Edit that JSON, not this file.',
      ]
    : [
        `// ${inp.client || inp.slug}: the facts this film may show, and its assets. Written by recordly-demo`,
        '// scripts/fill-client.cjs from client-inputs.json: change the JSON and re-run rather than editing here.',
      ];
  return [
    ...head,
    `// On-screen facts are limited to: ${inp.facts.join(', ')}.`,
    'export const project = {',
    '  /** shown in the window\'s URL pill */',
    `  domain: ${q(inp.domain)},`,
    '  /**',
    '   * The URL pill for part B (the app / desk segment). The desk host is NOT on the confirmed fact list: leave null (the',
    '   * pill then keeps the public domain) until the owner confirms the host may be shown.',
    '   */',
    `  partBDomain: ${inp.partBDomain ? q(inp.partBDomain) : 'null'} as string | null,`,
    '  /**',
    '   * Part B (the sale desk, captures 6-12 of assets/storyboard-desk.json), or null for a part-A-only film. `cuts` are',
    '   * frame numbers measured on THIS run\'s desk captures (references/verification.md, part B): the sign-in card\'s first',
    '   * fully painted frame; 8\'s skeleton loader [last frame kept + 1, first painted "Which Car Is It?" frame]; 10\'s',
    '   * [frame after the 100% dwell kept, first painted "How Are They Paying?" frame].',
    '   */',
    `  partB: ${PB ? `{ cuts: { signinPainted: ${num(PB.cuts.signinPainted)}, saleSkeleton: ${tuple(PB.cuts.saleSkeleton)}, readbackRelease: ${tuple(PB.cuts.readbackRelease)} } }` : 'null'} as PartB | null,`,
    '  /**',
    '   * B6 (with a part B): the off-camera deal\'s filled Form 130-U page 1 at 300 dpi (pdftoppm -r 300), boxes [x, y, w, h]',
    '   * in px of the PNG. The boxes are the TxDMV form\'s layout (house values, the same for every dealer): the seller band',
    '   * (signature, printed name, date), the privacy blurs (box 14 licence number, box 1 VIN, box 38(a) money) and the',
    '   * CERTIFICATION block the spotlight keeps lit. Re-measure only if TxDMV revises the form (Rev 01/25).',
    '   */',
    '  doc: {',
    '    src: "docs/130u-p1.png",',
    '    size: [2550, 3300],',
    `    fileName: ${q(PB ? PB.docFileName : '130-U.pdf')},`,
    '    page: 1,',
    '    pages: 2,',
    '    sellerBand: [392, 2860, 2000, 132],',
    '    privacy: [',
    '      [1722, 620, 210, 40],',
    '      [78, 397, 452, 40],',
    '      [1004, 2253, 258, 40],',
    '    ],',
    '    spotlight: [81, 2700, 2394, 410],',
    '    caption: "Signed Once. On Every Title Application.",',
    '  },',
    '  /** public/ paths (copied from the site\'s public/brand) */',
    `  mark: ${q(mark)}, // the image the site's loader shows (.loader__emblem img)`,
    `  logoReverse: ${q(logo)}, // full-colour logo that reads on the dark outro`,
    '  /** the word under the mark in the intro: the text of .loader__word */',
    `  word: ${q(inp.word)},`,
    '  /**',
    '   * The site\'s intro loader at the 1440 × 900 capture viewport, measured on the served build by scripts/measure-site.cjs',
    '   * (getBoundingClientRect at rest). The intro sting is drawn in exactly this layout, stingMarkWidth / mark[2] times',
    '   * larger, so it can land on the loader in a match cut.',
    '   */',
    '  loader: {',
    `    viewport: ${tuple(L.viewport)},`,
    `    stage: ${tuple(L.stage)},`,
    `    mark: ${tuple(L.mark)},`,
    `    word: ${tuple(L.word)},`,
    `    wordFont: { size: ${num(L.wordFont.size)}, lineHeight: ${num(L.wordFont.lineHeight)}, weight: ${num(L.wordFont.weight)}, trackingEm: ${num(L.wordFont.trackingEm)}, color: ${q(L.wordFont.color)} },`,
    '    /** hides the loader\'s mark and word inside the window until the sting has landed on them (the loader\'s background) */',
    `    cover: ${tuple(L.cover)},`,
    `    coverColor: ${q(L.coverColor)},`,
    '    /** the loader\'s mark and word are at rest this long after the capture starts (the sting lands one frame later) */',
    `    wordDoneSec: ${num(L.wordDoneSec)},`,
    '  },',
    '  /** the intro sting\'s mark width in frame px: the loader drawn 600/360 = 1.667 times larger (house-recipe.md §2) */',
    `  stingMarkWidth: ${num(inp.stingMarkWidth || Math.round((L.mark[2] * 600) / 360) || 600)},`,
    '  /** outro lines (first line large): only confirmed facts */',
    `  outroLines: [${inp.outroLines.map(q).join(', ')}],`,
    '  /** capture ids in public/shots/ used by the ShotPreview / PhonePreview compositions */',
    '  sampleShot: "1-hero",',
    '  samplePhoneShot: "5-phone",',
    '} as const;',
    '',
    'export type PartB = { cuts: { signinPainted: number; saleSkeleton: readonly [number, number]; readbackRelease: readonly [number, number] } };',
    '',
  ].join('\n');
}

function values(inp) {
  const v = Object.assign({
    SLUG: inp.slug,
    CLIENT: inp.client || inp.slug,
    DOMAIN: inp.domain,
    DESK_URL: inp.deskUrl,
    INTRO_KEY: inp.introKey,
    CLOCK: inp.clock,
    TIMEZONE: inp.timezone || 'America/Chicago',
    SITE_DIR: inp.siteDir,
    FACTS: inp.facts,
    WWW: `www.${inp.domain}`,
    LOGO_WIDTH: inp.logoWidth || 760,
    // part B (assets/storyboard-desk.json): the day the desk server stamps on the documents, 14:00 local. Never the
    // site's clock (the pad's "Signed:" would disagree with the documents): undefined leaves it to fail the fill.
    DESK_CLOCK: inp.deskClock || (inp.partB && inp.partB.clock) || undefined,
    PART_B_DOMAIN: inp.partBDomain || inp.domain,
  }, demoValues(inp), inp.storyboard || {});
  return v;
}

/** The desk film's demo values: the session cookie from the onboarding path, the demo buyer's phone and addresses. */
function demoValues(inp) {
  const B = inp.partB || {};
  const D = inp.demo || {};
  const A = D.addressPartB || {}, N = D.addressNarrated || {};
  const sales = B.onboarding === 'sales';
  const v = {
    DESK_COOKIE: B.onboarding ? (sales ? 'sales:sales@example.dev' : 'owner@example.dev') : undefined,
    DESK_EMAIL: B.onboarding ? (sales ? 'sales@example.dev' : 'owner@example.dev') : undefined,
    DEMO_PHONE: D.phone, DEMO_STREET: A.street, DEMO_CITY: A.city, DEMO_ZIP: A.zip, DEMO_COUNTY: A.county,
    DEMO_N_STREET: N.street, DEMO_N_CITY: N.city, DEMO_N_ZIP: N.zip, DEMO_N_COUNTY: N.county,
    DEMO_FEE: B.demoFee && Number.isInteger(B.demoFee.cents) ? (B.demoFee.cents / 100).toFixed(2) : undefined,
  };
  for (const k of Object.keys(v)) if (v[k] === undefined || v[k] === null || v[k] === '') delete v[k];
  return v;
}

function fillDeep(node, v, missing) {
  if (typeof node === 'string') {
    const whole = node.match(/^\{\{([A-Z0-9_]+)\}\}$/);
    if (whole) {
      if (v[whole[1]] === undefined || v[whole[1]] === null) { missing.add(whole[1]); return node; }
      return v[whole[1]];
    }
    return node.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
      if (v[k] === undefined || v[k] === null) { missing.add(k); return m; }
      return typeof v[k] === 'string' ? v[k] : JSON.stringify(v[k]);
    });
  }
  if (Array.isArray(node)) return node.map((x) => fillDeep(x, v, missing));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(node)) {
      if (k === 'adapt') continue; // template-only guidance; the filled storyboard keeps `why`
      out[k] = fillDeep(x, v, missing);
    }
    return out;
  }
  return node;
}

/** inputs.overrides → the filled storyboard: [{ shot, path: "actions.8.perCharSec", value, why }]. */
function applyOverrides(sb, inp) {
  for (const o of inp.overrides || []) {
    const shot = (sb.shots || []).find((x) => x.id === o.shot);
    if (!shot) throw new Error(`override: no shot "${o.shot}"`);
    const keys = String(o.path).split('.');
    let node = shot;
    for (const k of keys.slice(0, -1)) {
      if (node == null || typeof node !== 'object' || !(k in node)) throw new Error(`override: ${o.shot}.${o.path} does not exist in the storyboard`);
      node = node[k];
    }
    const last = keys[keys.length - 1];
    if (node == null || typeof node !== 'object' || !(last in node)) throw new Error(`override: ${o.shot}.${o.path} does not exist in the storyboard`);
    node[last] = o.value;
    node.override = Object.assign({}, node.override, { [last]: o.why });
  }
  return sb;
}

/** README blocks that list per-client decisions. */
function readmeValues(inp) {
  const zc = inp.zoomCopy || {};
  const zoomCopy = Object.keys(zc).length
    ? Object.entries(zc).map(([k, lines]) => `  - ${k}: ${lines.length ? lines.map((t) => `"${t}"`).join(', ') : '(no text)'}`).join('\n')
    : '  - (not measured yet: run measure-site.cjs --storyboard storyboard.json --into client-inputs.json, then fill-client.cjs readme)';
  const ov = (inp.overrides || []).length
    ? inp.overrides.map((o) => `  - \`${o.shot}.${o.path}\` = ${JSON.stringify(o.value)}: ${o.why}`).join('\n')
    : '  - None: every timing is the house recipe.';
  return { FACTS_LINE: inp.facts.join(', '), ZOOM_COPY: zoomCopy, OVERRIDES: ov };
}

const SKILL = path.resolve(__dirname, '..');
const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };
const bail = (bad, label = 'client-inputs incomplete') => { if (bad.length) fail(`${label}:\n  - ${bad.join('\n  - ')}`); };

/** desk shots filled for this client, with the onboarding path applied (owner-fees: 7's variant + 7b; sales: no 7b). */
function filledDeskShots(inp, tplFile) {
  const tpl = readJson(tplFile);
  const path_ = (inp.partB || {}).onboarding;
  const shots = [];
  for (const raw of tpl.shots) {
    if (raw.onlyFor && raw.onlyFor !== path_) continue;
    const s = JSON.parse(JSON.stringify(raw));
    const variant = s.variants && s.variants[path_];
    delete s.variants; delete s.onlyFor;
    if (variant) {
      if (variant.dropActions) s.actions = s.actions.filter((_, i) => !variant.dropActions.includes(i));
      if (variant.durationSec) s.durationSec = variant.durationSec;
      if (variant.cutWhy) s.cutWhy = variant.cutWhy;
      s.variant = { path: path_, verified: !!variant.verified, why: variant.why };
      delete s.cutFrames; // measured again on this capture
    }
    shots.push(s);
  }
  // the shot after 7 starts its cursor where the last onboarding shot ended
  const ids = shots.map((s) => s.id);
  const after = shots.find((s) => s.id === '8-desk-sale-start');
  if (after && after.cursor && after.cursor.start && ids.includes('7b-desk-fees')) after.cursor.start.fromShot = '7b-desk-fees';
  const missing = new Set();
  const filled = fillDeep({ shots, partB: tpl.partB }, values(inp), missing);
  return { filled, missing, deskCommit: tpl.deskCommit || null, unverified: shots.filter((s) => s.verified === false || (s.variant && !s.variant.verified)).map((s) => s.id) };
}

function mergeDesk(inp, intoFile, tplFile) {
  bail(stageProblems(inp, 'desk'), 'client-inputs not ready for the desk (check --stage desk)');
  const sb = readJson(intoFile);
  const { filled, missing, deskCommit, unverified } = filledDeskShots(inp, tplFile);
  if (missing.size) fail(`desk-storyboard: values missing for ${[...missing].sort().join(', ')} (client-inputs.json)`);
  const deskIds = new Set(readJson(tplFile).shots.map((s) => s.id));
  const kept = (sb.shots || []).filter((s) => !deskIds.has(s.id));
  const at = kept.findIndex((s) => s.id === '4-menu');
  if (at < 0) fail(`desk-storyboard: no 4-menu shot in ${intoFile} (fill the site storyboard first)`);
  sb.shots = [...kept.slice(0, at + 1), ...filled.shots, ...kept.slice(at + 1)];
  sb.partB = filled.partB;
  sb.deskCommit = deskCommit;
  delete sb.deskPreflight; // the merged shots have not been preflighted on this desk yet
  write(intoFile, JSON.stringify(sb, null, 2) + '\n');
  console.log(`merged ${filled.shots.map((s) => s.id).join(', ')} after 4-menu (onboarding ${inp.partB.onboarding}; template deskCommit ${deskCommit})`);
  if (unverified.length) console.log(`WARN never captured yet: ${unverified.join(', ')}. The desk preflight (measure-site.cjs --desk), the cut gate and the part-B stills decide; say so in the send note.`);
}

function injectLong(inp, intoFile, tplFile) {
  bail(stageProblems(inp, 'desk').concat(narratedProblems(inp)), 'client-inputs not ready for the narrated captures');
  const project = path.dirname(path.dirname(path.resolve(intoFile)));
  const card = (side) => {
    const f = path.join(project, 'public', 'narrated', `card-${side}.png`);
    if (!fs.existsSync(f)) fail(`long-storyboard: no ${f}: run scripts/make-demo-card.mjs --inputs <client-inputs.json> --out ${path.dirname(f)} first`);
    return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  };
  let font = process.env.THEME_FONT;
  if (!font) { font = 'Barlow Semi Condensed'; console.error('WARN THEME_FONT is not set (scripts/desk/theme.cjs --into demo.env): the stand-in menu uses Barlow Semi Condensed'); }
  const v = Object.assign(values(inp), {
    SELECT_MENU_JS: fs.readFileSync(path.join(SKILL, 'assets/narrated/select-menu.js'), 'utf8').replace(/^\/\/.*\n/gm, '').trim(),
    SELECT_MENU_CSS: fs.readFileSync(path.join(SKILL, 'assets/narrated/select-menu.css'), 'utf8').trim().split('__THEME_FONT__').join(font),
    CAMERA_FEED_JS: fs.readFileSync(path.join(SKILL, 'assets/narrated/camera-feed.js'), 'utf8').replace('__FRONT__', card('front')).replace('__BACK__', card('back')),
  });
  const missing = new Set();
  const out = fillDeep(readJson(tplFile), v, missing);
  if (missing.size) fail(`long-storyboard: values missing for ${[...missing].sort().join(', ')}`);
  write(intoFile, JSON.stringify(out, null, 1) + '\n');
}

function sendNote(inp) {
  const film = flag('film'), share = flag('share');
  if (!film || !share) fail('send-note: --film <master.mp4> --share <chat copy> (both rendered and verified)');
  const probe = (f) => {
    const r = require('child_process').spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', f]);
    const j = JSON.parse(r.stdout.toString() || '{}').format || {};
    return { sec: Number(j.duration || 0), mb: Number(j.size || 0) / 1048576 };
  };
  const m = probe(film), c = probe(share);
  if (c.mb > 28) fail(`send-note: ${share} is ${c.mb.toFixed(1)} MB (the chat copy must be <= 28 MB: scripts/share.sh)`);
  const project = path.dirname(path.resolve(inputsFileGlobal));
  const decisions = path.join(project, 'verify-decisions.md');
  const { rows: decisionRows } = require('./decisions.cjs');
  const recorded = decisionRows(project);
  const allow = recorded.filter((r) => /^allow-/.test(r.kind)).map((r) => `| ${[r.step, r.kind, r.what, r.why, r.who, r.when].join(' | ')} |`);
  const looks = recorded.filter((r) => r.kind === 'by-eye' || r.kind === 'by-ear');
  if (!looks.some((r) => r.kind === 'by-eye')) fail(`send-note: no by-eye look is recorded in ${decisions} (runbook A8 / B6v / N11: mark the stills you or the user looked at). Nothing is sent unlooked-at.`);
  const LOOKS = `${looks.map((r) => `${r.step} ${r.kind} by ${r.who.replace(/:.*$/, '')}`).join(', ')}${looks.some((r) => r.kind === 'by-ear') ? '' : '. **The full watch with sound is not recorded yet**'}`;
  let gates = '(no verify report given)';
  if (flag('report') && fs.existsSync(flag('report'))) {
    const r = readJson(flag('report'));
    const res = r.results || [];
    gates = `${res.filter((x) => x.ok).length} of ${res.length} scripted gates passed${res.some((x) => !x.ok) ? ` — FAILED: ${res.filter((x) => !x.ok).map((x) => x.name).join(', ')}` : ''}`;
  }
  const B = inp.partB || {};
  const fee = B.onboarding === 'owner-fees' && B.demoFee ? `$${(B.demoFee.cents / 100).toFixed(2)} (${B.demoFee.source === 'owner' ? "the owner's figure" : 'a figure the user approved'}: ${B.demoFee.note}). It is a demo input, typed on camera on Your Fees.` : 'none (the film shows a salesperson\'s first sign-in, which has no fees screen).';
  const tpl = fs.readFileSync(path.join(SKILL, 'assets/send-note.md'), 'utf8');
  const v = {
    CLIENT: inp.client || inp.slug, LENGTH: `${Math.floor(m.sec / 60)}:${String(Math.round(m.sec % 60)).padStart(2, '0')}, ${m.sec.toFixed(1)} s`, LOOKS,
    SHARE_FILE: path.basename(share), SHARE_MB: c.mb.toFixed(1), MASTER_PATH: path.resolve(film), MASTER_MB: m.mb.toFixed(1),
    GATES: gates, ALLOWANCES: allow.length ? allow.map((l) => `  - ${l.replace(/^\|\s*|\s*\|$/g, '').replace(/\s*\|\s*/g, ' · ')}`).join('\n') : '  - None.',
    FACTS_LINE: inp.facts.join(', '), ONBOARDING: B.onboarding || 'no desk part', DEMO_FEE_LINE: fee,
    RUNNING_ORDER: inp.partB
      ? "the intro match-cut onto the site's loader; the site (hero, lineup, visit card, finder, service band, the menu's Admin row); the sale desk in the same window (sign-in, first sign-in" + (B.onboarding === 'owner-fees' ? ' with Your Fees' : '') + ", a sale started, the address read back, the guided sale, the signed packet, the 130-U's seller line); the phone; the outro."
      : "the intro match-cut onto the site's loader; the site (hero, lineup, visit card, finder, service band, the menu's Admin row); the phone; the outro.",
    OVERRIDES: readmeValues(inp).OVERRIDES,
  };
  const missing = new Set();
  const text = fillDeep(tpl, v, missing);
  if (missing.size) fail(`send-note: unfilled ${[...missing].join(', ')}`);
  write(flag('out'), text);
}

let inputsFileGlobal = null;
function main() {
  if (cmd === 'project' && flag('placeholder')) {
    write(flag('out'), projectTs(PLACEHOLDER, true));
    return;
  }
  const inputsFile = positional[0];
  inputsFileGlobal = inputsFile;
  if (!cmd || !inputsFile) {
    console.error('usage: fill-client.cjs check|project|storyboard|readme|desk-storyboard|long-storyboard|scenario|send-note <client-inputs.json> … (see the header)');
    process.exit(2);
  }
  const inp = readJson(inputsFile);
  if (cmd === 'check') {
    const stage = flag('stage');
    let bad;
    try { bad = stageProblems(inp, stage === true ? undefined : stage); } catch (e) { fail(e.message, 2); }
    if (bad.length) { console.error(`client-inputs incomplete${stage ? ` (${stage})` : ''}:\n  - ${bad.join('\n  - ')}`); process.exit(1); }
    console.log(`client-inputs OK${stage ? ` (${stage})` : ''}`);
    return;
  }
  if (cmd === 'project') {
    bail(stageProblems(inp));
    write(flag('out'), projectTs(inp, false));
    return;
  }
  if (cmd === 'desk-storyboard') {
    if (!flag('into')) fail('desk-storyboard: --into <project>/storyboard.json', 2);
    mergeDesk(inp, flag('into'), flag('template') || path.join(SKILL, 'assets/storyboard-desk.json'));
    return;
  }
  if (cmd === 'long-storyboard') {
    if (!flag('into')) fail('long-storyboard: --into <project>/narration/storyboard-long.json', 2);
    injectLong(inp, flag('into'), flag('template') || path.join(SKILL, 'assets/storyboard-long.template.json'));
    return;
  }
  if (cmd === 'send-note') { bail(problems(inp)); sendNote(inp); return; }
  if (cmd === 'scenario') {
    const tpl = positional[1];
    if (!tpl) fail('scenario: give the scenario template (assets/desk-scenarios/<name>.json)', 2);
    bail(problems(inp));
    const missing = new Set();
    const out = fillDeep(readJson(tpl), values(inp), missing);
    if (missing.size) fail(`scenario: values missing for ${[...missing].sort().join(', ')} (client-inputs.json → demo)`);
    write(flag('out'), JSON.stringify(out, null, 1) + '\n');
    return;
  }
  if (cmd === 'storyboard' || cmd === 'readme') {
    const tpl = positional[1];
    if (!tpl) { console.error(`${cmd}: give the template file`); process.exit(2); }
    const missing = new Set();
    let text;
    bail(stageProblems(inp));
    if (cmd === 'storyboard') {
      try { text = JSON.stringify(applyOverrides(fillDeep(readJson(tpl), values(inp), missing), inp), null, 2) + '\n'; }
      catch (e) { console.error(`${e.message} (client-inputs.json → overrides; path indexes follow the template)`); process.exit(1); }
    }
    else text = fillDeep(fs.readFileSync(tpl, 'utf8'), Object.assign(values(inp), readmeValues(inp)), missing);
    write(flag('out'), text);
    if (missing.size) {
      console.error(`${cmd}: still to fill (measure them on the served site, see references/storyboard.md): ${[...missing].sort().join(', ')}`);
      process.exitCode = 3;
    }
    return;
  }
  console.error(`unknown command ${cmd}`);
  process.exit(2);
}

main();

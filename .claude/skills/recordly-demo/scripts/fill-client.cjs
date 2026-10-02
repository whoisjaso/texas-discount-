#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * fill-client.cjs — turns one client-inputs.json into the per-client files of a demo project.
 *
 *   node fill-client.cjs check      <client-inputs.json>
 *   node fill-client.cjs project    <client-inputs.json> [--out src/project.ts]
 *   node fill-client.cjs project    --placeholder [--out template/src/project.ts]
 *   node fill-client.cjs storyboard <client-inputs.json> <storyboard-template.json> [--out storyboard.json]
 *   node fill-client.cjs readme     <client-inputs.json> <README-template.md> [--out README.md]
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
const VALUE_FLAGS = new Set(['--out']);
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

function problems(inp) {
  const p = [];
  const need = (cond, msg) => { if (!cond) p.push(msg); };
  need(typeof inp.slug === 'string' && /^[a-z0-9-]+$/.test(inp.slug), 'slug: kebab-case, e.g. "discount-used-cars"');
  need(typeof inp.domain === 'string' && !/^https?:|^www\.|\//.test(inp.domain), 'domain: bare host without www, e.g. "discountusedcarsandtrucks.com"');
  need(Array.isArray(inp.facts) && inp.facts.length >= 3, 'facts: the owner-confirmed on-screen facts (URL, phone, address, hours)');
  need(Array.isArray(inp.outroLines) && inp.outroLines.length === 3, 'outroLines: exactly 3 lines (URL; "phone · street, city"; short hours)');
  if (Array.isArray(inp.outroLines) && Array.isArray(inp.facts)) {
    const blob = inp.outroLines.join(' ');
    const stray = (blob.match(/\$\s?\d|\d+(\.\d+)?\s?%|\bAPR\b|\bfree\b|\bbest\b|\bcheapest\b/gi) || []);
    need(!stray.length, `outroLines contain a price or claim (${stray.join(', ')}): only confirmed facts go on screen`);
  }
  need(inp.brand && inp.brand.mark && inp.brand.logoReverse, 'brand.mark (the image the loader shows) and brand.logoReverse (full-colour logo for dark)');
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
  need(typeof inp.clock === 'string' && !Number.isNaN(Date.parse(inp.clock)), 'clock: ISO instant with offset on an open weekday mid-afternoon, e.g. 2026-09-30T14:00:00-05:00');
  return p;
}

const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));
const tuple = (a) => `[${a.map(num).join(', ')}]`;
const q = (s) => JSON.stringify(s);

function projectTs(inp, placeholder) {
  const L = inp.loader;
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
    '  /** the intro sting\'s mark width in frame px (600 suits a wide mark; see references/house-recipe.md) */',
    `  stingMarkWidth: ${num(inp.stingMarkWidth || 600)},`,
    '  /** outro lines (first line large): only confirmed facts */',
    `  outroLines: [${inp.outroLines.map(q).join(', ')}],`,
    '  /** capture ids in public/shots/ used by the ShotPreview / PhonePreview compositions */',
    '  sampleShot: "1-hero",',
    '  samplePhoneShot: "5-phone",',
    '} as const;',
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
  }, inp.storyboard || {});
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

function main() {
  if (cmd === 'project' && flag('placeholder')) {
    write(flag('out'), projectTs(PLACEHOLDER, true));
    return;
  }
  const inputsFile = positional[0];
  if (!cmd || !inputsFile) {
    console.error('usage: fill-client.cjs check|project|storyboard|readme <client-inputs.json> [template] [--out FILE]');
    process.exit(2);
  }
  const inp = readJson(inputsFile);
  const bad = problems(inp);
  if (cmd === 'check') {
    if (bad.length) { console.error(`client-inputs incomplete:\n  - ${bad.join('\n  - ')}`); process.exit(1); }
    console.log('client-inputs OK');
    return;
  }
  if (cmd === 'project') {
    if (bad.length) { console.error(`client-inputs incomplete:\n  - ${bad.join('\n  - ')}`); process.exit(1); }
    write(flag('out'), projectTs(inp, false));
    return;
  }
  if (cmd === 'storyboard' || cmd === 'readme') {
    const tpl = positional[1];
    if (!tpl) { console.error(`${cmd}: give the template file`); process.exit(2); }
    const missing = new Set();
    let text;
    if (cmd === 'storyboard') text = JSON.stringify(fillDeep(readJson(tpl), values(inp), missing), null, 2) + '\n';
    else text = fillDeep(fs.readFileSync(tpl, 'utf8'), Object.assign(values(inp), { FACTS_LINE: inp.facts.join(', ') }), missing);
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

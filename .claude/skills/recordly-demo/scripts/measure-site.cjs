#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * measure-site.cjs — read-only measurements of a served premium-dealer-build site, before any capture.
 *
 *   node measure-site.cjs [--base http://localhost:5183] [--into client-inputs.json] [--storyboard storyboard.json]
 *                         [--rects] [--clock ISO] [--timezone America/Chicago] [--json out.json]
 *
 * 1. LOADER (always): the intro loader at the 1440 × 900 capture viewport, at rest (its CSS animations finished):
 *    rects of .loader__stage, .loader__emblem img and .loader__word, the word's computed font, the loader's background,
 *    the cover patch (mark + word union, padded 20 px left/right, 12 px above, 5 px below), and wordDoneSec (when the
 *    emblem and word animations end). These become project.loader, which the intro match cut is drawn from.
 *    Also: the word's text (project.word), the emblem's image (brand.mark: the .png twin of a .webp) and the
 *    sessionStorage key the loader sets (introKey). With --into, they are written into the client-inputs JSON.
 * 2. OPEN NOW (with a clock): loads the site with Date pinned to the clock and reports the header status pill.
 * 3. STORYBOARD PREFLIGHT (--storyboard): for every captured shot, replays its actions instantly at its viewport and
 *    checks, failing the run (exit 1) on any of:
 *      - a selector that does not resolve or is invalid, or a value still in double braces (UNSET);
 *      - a fixed-focus zoom whose view edge cuts a text line, or that breaks its `frame` rules (`in` fully inside the
 *        view, `out` fully outside it);
 *      - class (a) text (house-recipe §14: money or credit numbers, ratings, reviews) inside a zoom or on a shot's
 *        last frame;
 *      - a resting cursor point (a `tight` hover, or a fixed moveTo waypoint) that sits on a glyph or does not show
 *        the arrow;
 *      - the phone shot's `rest` rule (the card's gap under the header, the fine print below the screen).
 *    It lists class (b) text (claim-like site copy) per zoom for the README, without failing.
 *    When a zoom's focus is unset or fails, it prints the nearest passing focus (`suggest`), searched from the `frame`
 *    target's centre. With --into, a suggestion for an UNSET placeholder is written into client-inputs.json
 *    `storyboard`, and every zoom's visible text into `zoomCopy` (the README's "Site copy in the zooms").
 *    --rects also prints every rectangle the checks used (target, in, out, glyph lines, the point under the cursor).
 *    It approximates the capture (instant scrolls, real-time reveals); the capture and the verify gates stay the
 *    authority, and follow zooms are only indicative here (look at their stills).
 *
 * Exit 0 = clean (warnings and CHECK lines are for reading), 1 = something to fix. Never touches the site source. Uses
 * Playwright from the global npm root and /opt/pw-browsers (never `playwright install`).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadPlaywright() {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const n = process.argv[i + 1];
  if (n === undefined || n.startsWith('--')) args[a.slice(2)] = true;
  else { args[a.slice(2)] = n; i++; }
}
const PH = /\{\{\s*([^{}]*?)\s*\}\}/;
const set = (v) => v !== undefined && v !== null && !(typeof v === 'string' && PH.test(v));
const base = String(args.base || 'http://localhost:5183').replace(/\/+$/, '');
const inputs = args.into ? JSON.parse(fs.readFileSync(args.into, 'utf8')) : null;
const sb = args.storyboard ? JSON.parse(fs.readFileSync(args.storyboard, 'utf8')) : null;
const clock = [args.clock, sb && sb.clock, inputs && inputs.clock].find((c) => typeof c === 'string' && set(c)) || null;
const timezone = [args.timezone, sb && sb.timezone, inputs && inputs.timezone].find((c) => typeof c === 'string' && set(c)) || 'America/Chicago';
const RECTS = !!args.rects;
const report = { base, clock, timezone, warnings: [], problems: [] };
const warn = (m) => { report.warnings.push(m); console.log(`WARN  ${m}`); };
const problem = (m) => { report.problems.push(m); console.log(`FAIL  ${m}`); };
const r2 = (v) => Math.round(v * 100) / 100;
const R = (r) => (r ? `[${r.map((v) => Math.round(v)).join(', ')}]` : '(none)');

/**
 * Content classes (references/house-recipe.md §14).
 * (a) never in frame: numbers about money or credit (price, payment, rate or %, term length), ratings, review counts.
 * (b) allowed, but listed in the README for the owner: claim-like site copy (financing, credit, approval, prices…).
 */
const CLASS_A = /\$\s?\d|\/\s?mo\b|\bAPR\b|\b\d(\.\d)?\s?\/\s?5\b|\breviews?\b|\d+(\.\d+)?\s?%|\b\d+\s?(months?|mos?)\b/i;
const CLASS_B = /\bfinanc|\bcredit\b|\bapprov|\bqualif|\bguarantee|\brates?\b|\bterms\b|\bdown payment|\bpayments?\b|\bprices?\b|\blowest\b|\bbest\b|\bcheapest\b|\bfree\b|\bsav(e|ings)\b|\bdeals?\b|\bwarrant/i;

/** In the page: the loader at rest. */
function readLoader() {
  const q = (s) => document.querySelector(s);
  const stage = q('.loader__stage');
  const img = q('.loader__emblem img') || q('.loader__emblem');
  const word = q('.loader__word');
  const loader = q('.loader');
  if (!stage || !img || !word || !loader) return { error: 'no .loader__stage / .loader__emblem img / .loader__word on the first load (is the intro already marked seen?)' };
  const endOf = (el) => Math.max(0, ...el.getAnimations().map((a) => { const t = a.effect.getComputedTiming(); return (Number(t.delay) || 0) + (Number(t.activeDuration) || 0); }));
  const doneMs = Math.max(endOf(img), endOf(word));
  document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) { /* ignore */ } });
  const rect = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
  const hex = (c) => { const m = c.match(/\d+(\.\d+)?/g) || ['0', '0', '0']; return '#' + m.slice(0, 3).map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  const cs = getComputedStyle(word);
  const size = parseFloat(cs.fontSize);
  const lh = cs.lineHeight === 'normal' ? word.getBoundingClientRect().height : parseFloat(cs.lineHeight);
  const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing);
  const line = q('.loader__line');
  return {
    viewport: [innerWidth, innerHeight],
    stage: rect(stage),
    mark: rect(img),
    word: rect(word),
    line: line ? rect(line) : null,
    wordFont: { size, lineHeight: lh, weight: Number(cs.fontWeight), trackingEm: size ? ls / size : 0, color: hex(cs.color) },
    coverColor: hex(getComputedStyle(loader).backgroundColor),
    wordDoneSec: doneMs / 1000,
    text: (word.textContent || '').trim(),
    markSrc: img.currentSrc || img.src || null,
  };
}

/**
 * In the page: rects for named queries ({selector, contains, nth, tight, all}), every visible text line, and the
 * scroll state. An invalid selector comes back as {error} instead of throwing.
 */
function snapshot({ queries }) {
  const visible = (el) => !el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const glyphs = (el) => {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rg = document.createRange();
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
      rg.selectNodeContents(n);
      for (const c of rg.getClientRects()) if (c.width > 1 && c.height > 1) out.push({ text: n.textContent.replace(/\s+/g, ' ').trim().slice(0, 200), r: [c.left, c.top, c.width, c.height] });
    }
    return out;
  };
  const union = (rs) => {
    if (!rs.length) return null;
    const l = Math.min(...rs.map((g) => g.r[0])), t = Math.min(...rs.map((g) => g.r[1]));
    const rr = Math.max(...rs.map((g) => g.r[0] + g.r[2])), b = Math.max(...rs.map((g) => g.r[1] + g.r[3]));
    return [l, t, rr - l, b - t];
  };
  const rects = {};
  for (const [k, q] of Object.entries(queries || {})) {
    let list;
    try { list = Array.from(document.querySelectorAll(q.selector)); } catch (e) { rects[k] = { error: `invalid selector ${q.selector}` }; continue; }
    if (q.contains) list = list.filter((el) => (el.textContent || '').toLowerCase().includes(String(q.contains).toLowerCase()));
    if (!q.all) list = list[q.nth || 0] ? [list[q.nth || 0]] : [];
    rects[k] = list.map((el) => {
      const r = el.getBoundingClientRect();
      const g = q.tight || q.lines ? glyphs(el) : [];
      return {
        rect: q.tight && g.length ? union(g) : [r.left, r.top, r.width, r.height],
        box: [r.left, r.top, r.width, r.height],
        docY: r.top + scrollY,
        visible: visible(el) && r.width > 0 && r.height > 0,
        lines: q.lines ? g : undefined,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      };
    });
  }
  return { rects, lines: glyphs(document.body), scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight };
}

/** In the page: what is under a point (the element, and whether the point sits on one of its glyphs). */
function underPoint(pt) {
  const el = document.elementFromPoint(pt.x, pt.y);
  if (!el) return { el: '(nothing)', onGlyph: false };
  const name = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const rg = document.createRange();
  let onGlyph = false;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n && !onGlyph; n = w.nextNode()) {
    if (!n.textContent.trim()) continue;
    rg.selectNodeContents(n);
    for (const c of rg.getClientRects()) if (pt.x >= c.left && pt.x <= c.right && pt.y >= c.top && pt.y <= c.bottom) { onGlyph = true; break; }
  }
  return { el: name, onGlyph };
}

// ---------------------------------------------------------------- view geometry (Node side)
const ix = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
const iy = (a, b) => Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
const viewOf = (fx, fy, d, vw, vh) => {
  const w = vw / d, h = vh / d;
  return [Math.max(0, Math.min(vw - w, fx - w / 2)), Math.max(0, Math.min(vh - h, fy - h / 2)), w, h].map((v) => Math.round(v));
};
/** Lines a view edge runs through: a line box carries half-leading, so a quarter of its height may fall outside. */
function cutLines(view, lines) {
  const cut = [], inside = [];
  for (const l of lines) {
    const x = ix(view, l.r), y = iy(view, l.r);
    if (!x || !y) continue;
    inside.push(l.text);
    const full = x >= l.r[2] - 2 && y >= l.r[3] - Math.max(4, l.r[3] * 0.25);
    if (!full && x * y > 2) cut.push(`${l.text} ${R(l.r)}`);
  }
  return { cut: [...new Set(cut)], inside: [...new Set(inside)] };
}
const fullyIn = (r, v) => r[0] >= v[0] - 0.5 && r[1] >= v[1] - 0.5 && r[0] + r[2] <= v[0] + v[2] + 0.5 && r[1] + r[3] <= v[1] + v[3] + 0.5;
const fullyOut = (r, v) => ix(r, v) <= 0.5 || iy(r, v) <= 0.5;
function judge(view, lines, ins, outs) {
  const { cut, inside } = cutLines(view, lines);
  const inFail = ins.filter((e) => !fullyIn(e.rect, view)).map((e) => `${e.label} ${R(e.rect)}`);
  const outFail = outs.filter((e) => !fullyOut(e.rect, view)).map((e) => `${e.label} ${R(e.rect)}`);
  return { cut, inside, inFail, outFail, ok: !cut.length && !inFail.length && !outFail.length };
}
/** The nearest focus to `center` (integer px, clamped so the view stays on the page) whose view passes every rule. */
function suggest(center, d, vw, vh, lines, ins, outs) {
  const w = vw / d, h = vh / d;
  const lo = [w / 2, h / 2], hi = [vw - w / 2, vh - h / 2];
  const cl = (v, i) => Math.round(Math.max(lo[i], Math.min(hi[i], v)));
  const c = [cl(center[0], 0), cl(center[1], 1)];
  const reach = [Math.ceil(w / 2), Math.ceil(h / 2)];
  const near = lines.filter((l) => l.r[0] < c[0] + w + reach[0] && l.r[0] + l.r[2] > c[0] - w - reach[0] && l.r[1] < c[1] + h + reach[1] && l.r[1] + l.r[3] > c[1] - h - reach[1]);
  const cands = [];
  for (let dy = -reach[1]; dy <= reach[1]; dy++) for (let dx = -reach[0]; dx <= reach[0]; dx++) {
    const fx = c[0] + dx, fy = c[1] + dy;
    if (fx < Math.floor(lo[0]) || fx > Math.ceil(hi[0]) || fy < Math.floor(lo[1]) || fy > Math.ceil(hi[1])) continue;
    cands.push([dx * dx + dy * dy, fy, fx]);
  }
  cands.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const seen = new Set();
  for (const [, fy, fx] of cands) {
    const v = viewOf(fx, fy, d, vw, vh);
    const key = v.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    if (judge(v, near, ins, outs).ok) return { x: fx, y: fy, view: v };
  }
  return null;
}

async function main() {
  const pw = loadPlaywright();
  const { cursorKind, normalizeShot } = require('./capture.cjs');
  const browser = await pw.chromium.launch({ headless: true });
  try {
    // ---- 1. loader
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: timezone, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForSelector('.loader__word', { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const L = await page.evaluate(readLoader);
    if (L.error) throw new Error(L.error);
    const union = [Math.min(L.mark[0], L.word[0]), Math.min(L.mark[1], L.word[1]), Math.max(L.mark[0] + L.mark[2], L.word[0] + L.word[2]), Math.max(L.mark[1] + L.mark[3], L.word[1] + L.word[3])];
    const left = Math.floor(union[0] - 20), top = Math.floor(union[1] - 12);
    let bottom = Math.ceil(union[3] + 5);
    if (L.line && bottom > L.line[1] - 2) bottom = Math.floor(L.line[1] - 2); // the hairline stays visible
    const loader = {
      viewport: L.viewport,
      stage: L.stage.map(r2),
      mark: L.mark.map(r2),
      word: L.word.map(r2),
      wordFont: { size: r2(L.wordFont.size), lineHeight: r2(L.wordFont.lineHeight), weight: L.wordFont.weight, trackingEm: r2(L.wordFont.trackingEm), color: L.wordFont.color },
      cover: [left, top, Math.ceil(union[2] + 20) - left, bottom - top],
      coverColor: L.coverColor,
      wordDoneSec: r2(L.wordDoneSec),
    };
    let introKey = null;
    for (let i = 0; i < 40 && !introKey; i++) {
      await page.waitForTimeout(200);
      introKey = await page.evaluate(() => Object.keys(sessionStorage).find((k) => /intro/i.test(k) && sessionStorage.getItem(k) === '1') || null);
    }
    await ctx.close();
    report.loader = loader;
    report.word = L.text;
    report.markSrc = L.markSrc;
    report.introKey = introKey;
    console.log('LOADER', JSON.stringify(loader));
    console.log(`word "${L.text}"  emblem image ${L.markSrc}  introKey ${introKey}`);
    if (Math.abs(loader.wordDoneSec - 1.5) > 0.05) warn(`loader word at rest at ${loader.wordDoneSec} s, not 1.5 s: the shot-1 trim (timeline.ts) follows it, re-check the hand-off stills`);
    if (!introKey) warn('the loader set no sessionStorage "…intro…" key within 8 s: read SEEN_KEY in the site\'s Loader.tsx');
    const webp = !!(L.markSrc && /\.webp(\?|$)/.test(L.markSrc));

    if (inputs) {
      inputs.loader = loader;
      inputs.word = L.text;
      if (introKey) inputs.introKey = introKey;
      let wroteMark = false;
      if (L.markSrc && (!inputs.brand || !set(inputs.brand.mark))) {
        const file = decodeURIComponent(new URL(L.markSrc).pathname).replace(/\.webp$/, '.png');
        inputs.brand = Object.assign({}, inputs.brand, { mark: path.join(inputs.siteDir || '<site>', 'public', file) });
        wroteMark = true;
      }
      if (webp) console.log(`INFO  the loader serves a .webp; brand.mark ${wroteMark ? 'is now' : 'stays'} ${inputs.brand && inputs.brand.mark} (the .png the site ships beside it)`);
      if (inputs.brand && set(inputs.brand.mark) && inputs.siteDir && !fs.existsSync(path.resolve(inputs.brand.mark)) && !fs.existsSync(path.resolve(path.dirname(args.into), inputs.brand.mark))) warn(`brand.mark ${inputs.brand.mark} does not exist: point it at the loader's image in ${inputs.siteDir}/public`);
      fs.writeFileSync(args.into, JSON.stringify(inputs, null, 2) + '\n');
      console.log(`wrote loader, word, introKey${wroteMark ? ', brand.mark' : ''} into ${args.into}`);
    } else if (webp) {
      console.log('INFO  the loader serves a .webp: brand.mark is the .png of the same name in the site\'s public/brand (measure-site.cjs --into sets it)');
    }

    // ---- 2. Open Now at the pinned clock
    const key = introKey || (sb && set(sb.introKey) && sb.introKey) || (inputs && set(inputs.introKey) && inputs.introKey) || null;
    const openContext = async (shot) => {
      const vp = (shot && shot.viewport) || { width: 1440, height: 900 };
      const c = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!(shot && shot.mobile), hasTouch: !!(shot && shot.mobile), locale: 'en-US', timezoneId: timezone });
      if (key) await c.addInitScript((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) { /* ignore */ } }, key);
      const p = await c.newPage();
      if (clock) await p.clock.setFixedTime(new Date(clock));
      return { c, p };
    };
    if (clock) {
      const { c, p } = await openContext(null);
      await p.goto(base + '/', { waitUntil: 'load' });
      await p.waitForSelector('.hero__title', { timeout: 15000 });
      const st = await p.evaluate(() => Array.from(document.querySelectorAll('.status')).map((e) => ({ open: e.classList.contains('status--open'), text: e.textContent.replace(/\s+/g, ' ').trim() })));
      report.status = st;
      const open = st.some((s) => s.open);
      console.log(`${open ? 'OK   ' : 'FAIL '} at ${clock} (${timezone}) the status pill reads: ${st.map((s) => s.text).join(' | ') || '(none)'}`);
      if (!open) problem('the site does not show "Open Now" at the clock: use Wednesday 2026-09-30 14:00 in the dealer\'s zone with that day\'s UTC offset, or the next open weekday at 14:00');
      await c.close();
    } else if (sb) {
      problem('no clock: set client-inputs.json clock (then refill the storyboard)');
    }

    // ---- 3. storyboard preflight
    if (sb) {
      report.shots = {};
      const zoomCopy = {};
      const suggestions = {};
      for (const raw of sb.shots.filter((s) => s.url)) {
        const shot = normalizeShot(raw, sb);
        const { c, p } = await openContext(shot);
        if (shot.css) await c.addInitScript((css) => { const add = () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add); }, shot.css);
        await p.goto(base + (shot.url || '/'), { waitUntil: 'load' });
        await p.waitForSelector(shot.readySelector && shot.readySelector !== '.loader' ? shot.readySelector : '.hero__title', { timeout: 15000 });
        await p.waitForTimeout(1200);
        const vw = shot.viewport.width, vh = shot.viewport.height;
        const res = { missing: [], unset: [], zooms: [], points: [], rest: null, lastFrame: null };
        const tag = (m) => `${shot.id}: ${m}`;
        const unsetIn = (o) => { const s = JSON.stringify(o); const m = s.match(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g); return m ? [...new Set(m.map((x) => x.replace(/[{}\s]/g, '')))] : []; };
        const qOf = (a) => ({ selector: a.selector, contains: a.contains, nth: a.nth, tight: !!a.tight });
        const snap = (queries) => p.evaluate(snapshot, { queries });
        const steps = shot.actions.map((a) => ({ t: a.t, kind: 'action', a })).concat(shot.zooms.map((z, i) => ({ t: z.at + (z.inSec || 1.5), kind: 'zoom', z, i })))
          .sort((x, y) => x.t - y.t);
        let pointer = null;
        for (const s of steps) {
          if (s.kind === 'action') {
            const a = s.a;
            const holes = unsetIn({ selector: a.selector, contains: a.contains, x: a.x, y: a.y, text: a.text });
            if (holes.length) { res.unset.push(...holes); problem(tag(`UNSET ${holes.join(', ')} (the ${a.type} at t=${a.t}): fill client-inputs.json storyboard, then refill the storyboard`)); continue; }
            if (a.type === 'type') { await p.keyboard.type(String(a.text || '')); continue; }
            if (a.type === 'scrollBy') { await p.evaluate((y) => window.scrollBy({ top: y, behavior: 'instant' }), Number(a.y || 0)); await p.waitForTimeout(1000); continue; }
            if (a.type === 'moveTo' && !a.selector) {
              if (a.fromShot) { if (RECTS) console.log(`INFO  ${tag(`moveTo at t=${a.t} is ${a.fromShot}'s last cursor point + (${a.dx || 0}, ${a.dy || 0}): capture.cjs resolves it`)}`); continue; }
              if (shot.mobile || typeof a.x !== 'number' || typeof a.y !== 'number') continue;
              pointer = { x: a.x, y: a.y };
              await p.mouse.move(a.x, a.y);
              const u = await p.evaluate(underPoint, pointer);
              const ck = await p.evaluate(cursorKind, pointer);
              const ok = ck === 'a' && !u.onGlyph;
              res.points.push({ t: a.t, type: a.type, point: pointer, element: u.el, cursor: ck, onGlyph: u.onGlyph, ok });
              if (RECTS || !ok) console.log(`${ok ? 'OK   ' : 'FAIL '} ${tag(`waypoint (${a.x}, ${a.y}) at t=${a.t} is on ${u.el}, cursor ${ck}${u.onGlyph ? ', ON A GLYPH' : ''}`)}`);
              if (!ok) problem(tag(`the moveTo waypoint (${a.x}, ${a.y}) must land on empty page (arrow, no glyph): move it`));
              continue;
            }
            if (!a.selector) continue;
            const m = await snap({ t: qOf(a) });
            if (m.rects.t.error) { res.missing.push(m.rects.t.error); problem(tag(`${m.rects.t.error} (the ${a.type} at t=${a.t})`)); continue; }
            const hit = m.rects.t[0];
            if (!hit) { const mm = `t=${a.t} ${a.type} ${a.selector}${a.contains ? ` contains "${a.contains}"` : ''}`; res.missing.push(mm); problem(tag(`selector not found: ${mm}`)); continue; }
            if (a.type === 'scrollTo') {
              const [, , , h] = hit.box;
              const align = a.align || 'start';
              let to = align === 'center' ? hit.docY + h / 2 - vh / 2 : align === 'end' ? hit.docY + h - vh : hit.docY;
              to = Math.max(0, Math.min(m.maxScroll, Math.round(to - Number(a.offset || 0))));
              await p.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), to);
              await p.waitForTimeout(1200); // scroll reveals (0.9 s) settle
            } else {
              const [x, y, w, h] = hit.rect;
              const [fx, fy] = a.anchor || [0.5, 0.5];
              const pt = { x: x + w * fx, y: y + h * fy };
              if (shot.mobile) { if (a.type === 'click') await p.touchscreen.tap(pt.x, pt.y); }
              else if (a.type === 'click') await p.mouse.click(pt.x, pt.y);
              else await p.mouse.move(pt.x, pt.y);
              pointer = pt;
              if (a.type === 'click') await p.waitForTimeout(1200);
              else await p.waitForTimeout(200);
              if (!shot.mobile && a.type === 'hover') {
                // a resting point beside text (`tight`) must be off the glyphs with the arrow showing (lessons K3)
                const u = await p.evaluate(underPoint, pt);
                const ck = await p.evaluate(cursorKind, pt);
                const ok = !a.tight || (ck === 'a' && !u.onGlyph);
                res.points.push({ t: a.t, type: a.type, selector: a.selector, point: { x: r2(pt.x), y: r2(pt.y) }, element: u.el, cursor: ck, onGlyph: u.onGlyph, ok });
                if (RECTS || !ok) {
                  console.log(`${ok ? 'OK   ' : 'FAIL '} ${tag(`hover ${a.selector}${a.contains ? ` "${a.contains}"` : ''} at t=${a.t} rests at (${Math.round(pt.x)}, ${Math.round(pt.y)}) on ${u.el}, cursor ${ck}${u.onGlyph ? ', ON A GLYPH' : ''}`)}`);
                  if (a.tight) {
                    const g = await p.evaluate(snapshot, { queries: { g: Object.assign(qOf(a), { lines: true }) } });
                    for (const l of (g.rects.g[0] && g.rects.g[0].lines) || []) console.log(`        glyph line "${l.text}" ${R(l.r)}`);
                  }
                }
                if (!ok) problem(tag(`the hover on ${a.selector} at t=${a.t} must rest beside the text with the arrow (change its anchor)`));
              }
            }
          } else {
            const z = s.z;
            const d = z.depth || [1.25, 1.5, 1.8, 2.2, 3.5][(z.level || 3) - 1];
            const label = `${shot.id} zoom ${s.i} (${d}x)`;
            const holes = unsetIn({ focus: z.focus, contains: z.contains, frame: z.frame });
            const frame = z.frame || null;
            const qq = (spec, all) => (typeof spec === 'string' ? { selector: spec, all } : Object.assign({}, spec, { all }));
            const queries = {};
            if (frame && frame.target && !unsetIn(frame.target).length) queries.target = qq(frame.target, false);
            ((frame && frame.in) || []).forEach((q, k) => { if (!unsetIn(q).length) queries[`in${k}`] = qq(q, true); });
            ((frame && frame.out) || []).forEach((q, k) => { if (!unsetIn(q).length) queries[`out${k}`] = qq(q, true); });
            const focusSel = typeof z.focus === 'string' && z.focus !== 'cursor' && !PH.test(z.focus);
            if (focusSel) queries.focus = { selector: z.focus, contains: z.contains, nth: z.nth, tight: !!z.tight };
            const m = await snap(queries);
            const bad = Object.entries(m.rects).filter(([, v]) => v && v.error);
            if (bad.length) { for (const [, v] of bad) { res.missing.push(v.error); problem(`${label}: ${v.error}`); } continue; }
            const labelOf = (spec) => (typeof spec === 'string' ? spec : `${spec.selector}${spec.contains ? ` "${spec.contains}"` : ''}`);
            const ins = [], outs = [];
            ((frame && frame.in) || []).forEach((q, k) => (m.rects[`in${k}`] || []).filter((e) => e.visible).forEach((e) => ins.push({ label: labelOf(q), rect: e.rect })));
            ((frame && frame.out) || []).forEach((q, k) => (m.rects[`out${k}`] || []).filter((e) => e.visible).forEach((e) => outs.push({ label: labelOf(q), rect: e.rect })));
            ((frame && frame.in) || []).forEach((q, k) => { if (m.rects[`in${k}`] && !m.rects[`in${k}`].length) { res.missing.push(`${label} frame.in ${labelOf(q)}`); problem(`${label}: frame.in ${labelOf(q)} not found`); } });
            const target = m.rects.target && m.rects.target[0];
            let fx, fy, mode;
            if (holes.length) mode = 'unset';
            else if (z.focus && typeof z.focus === 'object') { fx = z.focus.x; fy = z.focus.y; mode = 'point'; }
            else if (focusSel) {
              const f = m.rects.focus && m.rects.focus[0];
              if (!f) { res.missing.push(`${label} focus ${z.focus}`); problem(`${label}: focus ${z.focus} not found`); continue; }
              const [ax, ay] = z.anchor || [0.5, 0.5];
              fx = f.rect[0] + f.rect[2] * ax; fy = f.rect[1] + f.rect[3] * ay; mode = 'selector';
            } else { console.log(`INFO  ${label}: follows the cursor; look at its still`); continue; }
            const follow = !!z.follow;
            const zr = { index: s.i, depth: d, follow, mode };
            if (RECTS) {
              if (target) console.log(`        ${label} target ${labelOf(frame.target)} ${R(target.rect)}`);
              for (const e of ins) console.log(`        ${label} in  ${e.label} ${R(e.rect)}`);
              for (const e of outs) console.log(`        ${label} out ${e.label} ${R(e.rect)}`);
            }
            if (mode === 'unset') {
              res.unset.push(...holes);
              zr.unset = holes;
              problem(`${label}: UNSET ${holes.join(', ')}`);
            } else {
              const view = viewOf(fx, fy, d, vw, vh);
              const j = judge(view, m.lines, ins, outs);
              const classA = j.inside.filter((t) => CLASS_A.test(t));
              const classB = j.inside.filter((t) => !CLASS_A.test(t) && CLASS_B.test(t));
              Object.assign(zr, { focus: { x: r2(fx), y: r2(fy) }, view, cut: j.cut, inFail: j.inFail, outFail: j.outFail, classA, classB, inside: j.inside });
              zoomCopy[`${label}${follow ? ', approx.' : ''}`] = j.inside.filter((t) => /[A-Za-z0-9]/.test(t));
              const fails = follow ? [] : [...j.cut.map((t) => `edge cuts ${t}`), ...j.inFail.map((t) => `not fully inside: ${t}`), ...j.outFail.map((t) => `not fully outside: ${t}`)];
              const verdict = classA.length || fails.length ? 'FAIL ' : follow ? 'INFO ' : 'OK   ';
              console.log(`${verdict} ${label} focus (${Math.round(fx)}, ${Math.round(fy)}), view x ${view[0]}-${view[0] + view[2]}, y ${view[1]}-${view[1] + view[3]}${follow ? ': follows the cursor, approximate (look at its still)' : ''}`);
              for (const t of fails) console.log(`        ${t}`);
              if (fails.length) problem(`${label}: the view breaks the framing rules (${fails.length})`);
              for (const t of classA) problem(`${label} shows class (a) text "${t}": re-aim or re-stage (house-recipe §14)`);
              for (const t of classB) console.log(`CHECK ${label} shows class (b) site copy "${t}": list it in the README for the owner`);
            }
            const failing = mode === 'unset' || (!follow && (zr.cut.length || zr.inFail.length || zr.outFail.length));
            if (failing && frame && (target || mode === 'point')) {
              const center = target ? [target.rect[0] + target.rect[2] / 2, target.rect[1] + target.rect[3] / 2] : [fx, fy];
              const sg = suggest(center, d, vw, vh, m.lines, ins, outs);
              zr.suggest = sg;
              const name = holes.length === 1 ? holes[0] : null; // only an UNSET placeholder is written into the inputs
              if (sg) {
                console.log(`SUGGEST ${label} focus {"x": ${sg.x}, "y": ${sg.y}} (view x ${sg.view[0]}-${sg.view[0] + sg.view[2]}, y ${sg.view[1]}-${sg.view[1] + sg.view[3]}): the nearest focus to the target's centre that passes every rule`);
                if (name) suggestions[name] = { x: sg.x, y: sg.y };
              } else console.log(`SUGGEST ${label}: no focus at ${d}x passes every rule: re-stage the scroll before this zoom, or ask the user`);
            }
            res.zooms.push(zr);
          }
        }
        // the phone's resting card (5-phone `rest`): under the header by `gap`, the fine print below the screen
        if (raw.rest && !unsetIn(raw.rest).length) {
          const rq = { target: { selector: raw.rest.target }, below: { selector: raw.rest.below || '.header' } };
          (raw.rest.out || []).forEach((q, k) => { rq[`out${k}`] = { selector: q, all: true }; });
          const m = await snap(rq);
          const t = m.rects.target && m.rects.target[0], hd = m.rects.below && m.rects.below[0];
          if (!t || !hd) problem(tag(`rest: ${!t ? raw.rest.target : raw.rest.below} not found`));
          else {
            const gap = t.rect[1] - (hd.rect[1] + hd.rect[3]);
            const [g0, g1] = raw.rest.gap || [55, 70];
            const aim = raw.rest.aim || Math.round((g0 + g1) / 2);
            const outsBad = (raw.rest.out || []).flatMap((q, k) => (m.rects[`out${k}`] || []).filter((e) => e.visible && e.rect[1] < vh - 0.5).map((e) => `${q} ${R(e.rect)}`));
            const ok = gap >= g0 && gap <= g1 && !outsBad.length;
            const lastSwipe = [...shot.actions].reverse().find((a) => a.type === 'scrollBy');
            const swipeNow = lastSwipe && Number.isFinite(Number(lastSwipe.y)) ? Number(lastSwipe.y) : 0;
            res.rest = { target: raw.rest.target, rect: t.rect, headerBottom: hd.rect[1] + hd.rect[3], gap: r2(gap), band: [g0, g1], outsBad, ok, scrollY: m.scrollY };
            console.log(`${ok ? 'OK   ' : 'FAIL '} ${tag(`rests on ${raw.rest.target} ${R(t.rect)}: top ${r2(gap)} px under the header (bottom ${r2(hd.rect[1] + hd.rect[3])}; ${g0}-${g1} wanted)${outsBad.length ? `; in frame: ${outsBad.join(', ')}` : ''}`)}`);
            if (!ok) {
              const sug = Math.round(swipeNow + (gap - aim));
              res.rest.suggestLastSwipe = sug;
              problem(tag(`the phone does not rest cleanly: set the last swipe (PHONE_SWIPE_3) to ${sug} (now ${swipeNow}); keep three swipes`));
            }
          }
        }
        const last = await snap({});
        const lv = cutLines([0, 0, vw, vh], last.lines);
        const lastA = lv.inside.filter((t) => CLASS_A.test(t));
        res.lastFrame = { scrollY: last.scrollY, classA: lastA };
        for (const t of lastA) problem(tag(`the last frame (approx.) shows class (a) text "${t}": re-stage (house-recipe §14)`));
        const nProblems = res.missing.length + res.unset.length;
        console.log(`${nProblems ? 'FAIL ' : 'OK   '} ${shot.id}: ${shot.actions.length} actions, ${shot.zooms.length} zooms, ${res.missing.length} missing selectors${res.unset.length ? `, UNSET ${[...new Set(res.unset)].join(', ')}` : ''}`);
        report.shots[shot.id] = res;
        await c.close();
      }
      report.zoomCopy = zoomCopy;
      report.suggestions = suggestions;
      if (inputs) {
        inputs.zoomCopy = zoomCopy;
        inputs.storyboard = inputs.storyboard || {};
        const wrote = [];
        for (const [k, v] of Object.entries(suggestions)) if (!set(inputs.storyboard[k])) { inputs.storyboard[k] = v; wrote.push(`${k} ${JSON.stringify(v)}`); }
        fs.writeFileSync(args.into, JSON.stringify(inputs, null, 2) + '\n');
        console.log(`wrote zoomCopy (${Object.keys(zoomCopy).length} zooms)${wrote.length ? ` and ${wrote.join(', ')}` : ''} into ${args.into}`);
        if (wrote.length) console.log('NEXT  refill the storyboard and the README (fill-client.cjs storyboard / readme), then run this preflight again');
      }
    }
  } finally {
    await browser.close();
  }
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
  const n = report.problems.length;
  if (sb) console.log(n ? `PREFLIGHT FAIL: ${n} to fix (${report.warnings.length} warnings)` : `PREFLIGHT CLEAN (${report.warnings.length} warnings)`);
  else console.log(n ? `FAIL: ${n} to fix` : `done (${report.warnings.length} warnings)`);
  process.exit(n ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });

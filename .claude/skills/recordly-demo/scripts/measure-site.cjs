#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * measure-site.cjs — read-only measurements of a served premium-dealer-build site, before any capture.
 *
 *   node measure-site.cjs [--base http://localhost:5183] [--into client-inputs.json] [--storyboard storyboard.json]
 *                         [--clock ISO] [--timezone America/Chicago] [--json out.json]
 *
 * 1. LOADER (always): the intro loader at the 1440 × 900 capture viewport, at rest (its CSS animations finished):
 *    rects of .loader__stage, .loader__emblem img and .loader__word, the word's computed font, the loader's background,
 *    the cover patch (mark + word union, padded 20 px left/right, 12 px above, 5 px below), and wordDoneSec (when the
 *    emblem and word animations end). These become project.loader, which the intro match cut is drawn from.
 *    Also: the word's text (project.word), the emblem's image (brand.mark) and the sessionStorage key the loader sets
 *    (storyboard.introKey). With --into, they are written into the client-inputs JSON.
 * 2. OPEN NOW (with a clock): loads the site with Date pinned to the clock and reports the header status pill.
 * 3. STORYBOARD PREFLIGHT (--storyboard): for every captured shot, replays its actions instantly at its viewport and
 *    reports: selectors that do not resolve, each zoom's view rectangle at full depth, text lines a zoom edge cuts
 *    through, and price / rating / finance text inside a zoom or on a shot's last frame. It approximates the capture
 *    (instant scrolls, real-time reveals); the capture and the verify gates stay the authority.
 *
 * Never touches the site source. Uses Playwright from the global npm root and /opt/pw-browsers (never `playwright install`).
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
const base = String(args.base || 'http://localhost:5183').replace(/\/+$/, '');
const inputs = args.into ? JSON.parse(fs.readFileSync(args.into, 'utf8')) : null;
const sb = args.storyboard ? JSON.parse(fs.readFileSync(args.storyboard, 'utf8')) : null;
const clock = args.clock || (sb && sb.clock) || (inputs && inputs.clock && !String(inputs.clock).includes('{{') ? inputs.clock : null);
const timezone = args.timezone || (sb && sb.timezone && !sb.timezone.includes('{{') ? sb.timezone : null) || (inputs && inputs.timezone) || 'America/Chicago';
const report = { base, clock, timezone, warnings: [] };
const warn = (m) => { report.warnings.push(m); console.log(`WARN  ${m}`); };
const r2 = (v) => Math.round(v * 100) / 100;
const PRICEY = /\$\s?\d|\/mo\b|\bAPR\b|\b\d(\.\d)?\s?\/\s?5\b|\breviews?\b|\d+(\.\d+)?\s?%\s*(down|apr|off)/i;

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

/** In the page: everything a storyboard step needs, measured now. */
function probe({ queries, views }) {
  const find = (q) => {
    let list = Array.from(document.querySelectorAll(q.selector));
    if (q.contains) list = list.filter((el) => (el.textContent || '').toLowerCase().includes(String(q.contains).toLowerCase()));
    return list[q.nth || 0] || null;
  };
  const rects = {};
  for (const [k, q] of Object.entries(queries)) {
    const el = find(q);
    if (!el) { rects[k] = null; continue; }
    const r = el.getBoundingClientRect();
    let rect = [r.left, r.top, r.width, r.height];
    if (q.tight) {
      // the union of the element's glyph boxes, as capture.cjs measures `tight`
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const rg = document.createRange();
      let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        rg.selectNodeContents(n);
        for (const c of rg.getClientRects()) { if (!c.width || !c.height) continue; l = Math.min(l, c.left); t = Math.min(t, c.top); rr = Math.max(rr, c.right); b = Math.max(b, c.bottom); }
      }
      if (l < rr && t < b) rect = [l, t, rr - l, b - t];
    }
    rects[k] = { rect, docY: r.top + scrollY };
  }
  const lines = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) continue;
    range.selectNodeContents(n);
    for (const c of range.getClientRects()) if (c.width > 1 && c.height > 1) lines.push({ text: text.slice(0, 60), r: [c.left, c.top, c.width, c.height] });
  }
  const out = {};
  for (const [k, v] of Object.entries(views)) {
    const [x, y, w, h] = v;
    const cut = [];
    const inside = [];
    for (const l of lines) {
      const [lx, ly, lw, lh] = l.r;
      const ix = Math.max(0, Math.min(x + w, lx + lw) - Math.max(x, lx));
      const iy = Math.max(0, Math.min(y + h, ly + lh) - Math.max(y, ly));
      if (!ix || !iy) continue;
      inside.push(l.text);
      // a line box carries half-leading above and below its glyphs: allow a quarter of its height before calling it cut
      const full = ix >= lw - 2 && iy >= lh - Math.max(4, lh * 0.25);
      if (!full && ix * iy > 2) cut.push(`${l.text} [${Math.round(lx)},${Math.round(ly)} ${Math.round(lw)}x${Math.round(lh)}]`);
    }
    out[k] = { cut: [...new Set(cut)], inside: [...new Set(inside)] };
  }
  return { rects, views: out, scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight };
}

async function main() {
  const pw = loadPlaywright();
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
    if (L.markSrc && /\.webp(\?|$)/.test(L.markSrc)) warn('the loader serves a .webp: use the .png of the same name in public/brand for project.mark (Remotion <Img> handles both, but keep the png the site ships)');

    if (inputs) {
      inputs.loader = loader;
      inputs.word = L.text;
      if (introKey) inputs.introKey = introKey;
      if (L.markSrc && (!inputs.brand || !inputs.brand.mark || String(inputs.brand.mark).includes('{{'))) {
        const file = decodeURIComponent(new URL(L.markSrc).pathname).replace(/\.webp$/, '.png');
        inputs.brand = Object.assign({}, inputs.brand, { mark: path.join(inputs.siteDir || '<site>', 'public', file) });
      }
      fs.writeFileSync(args.into, JSON.stringify(inputs, null, 2) + '\n');
      console.log(`wrote loader, word, introKey${L.markSrc ? ', brand.mark' : ''} into ${args.into}`);
    }

    // ---- 2. Open Now at the pinned clock
    const key = introKey || (sb && sb.introKey) || (inputs && inputs.introKey);
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
      if (!open) warn('the site does not show "Open Now" at storyboard.clock: pick an open weekday mid-afternoon with the right DST offset');
      await c.close();
    }

    // ---- 3. storyboard preflight
    if (sb) {
      const { normalizeShot } = require('./capture.cjs');
      report.shots = {};
      for (const raw of sb.shots.filter((s) => s.url)) {
        const shot = normalizeShot(raw, sb);
        const { c, p } = await openContext(shot);
        if (shot.css) await c.addInitScript((css) => { const add = () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add); }, shot.css);
        await p.goto(base + (shot.url || '/'), { waitUntil: 'load' });
        await p.waitForSelector(shot.readySelector && shot.readySelector !== '.loader' ? shot.readySelector : '.hero__title', { timeout: 15000 });
        await p.waitForTimeout(1200);
        const vw = shot.viewport.width, vh = shot.viewport.height;
        const res = { missing: [], zooms: [], lastFrame: null };
        const steps = shot.actions.map((a) => ({ t: a.t, kind: 'action', a })).concat(shot.zooms.map((z, i) => ({ t: z.at + (z.inSec || 1.5), kind: 'zoom', z, i })))
          .sort((x, y) => x.t - y.t);
        const qOf = (a) => ({ selector: a.selector, contains: a.contains, nth: a.nth, tight: !!a.tight });
        for (const s of steps) {
          if (s.kind === 'action') {
            const a = s.a;
            if (!a.selector && a.type !== 'scrollBy' && a.type !== 'type') continue;
            if (a.type === 'type') { await p.keyboard.type(String(a.text || '')); continue; }
            if (a.type === 'scrollBy') { await p.evaluate((y) => window.scrollBy({ top: y, behavior: 'instant' }), Number(a.y || 0)); await p.waitForTimeout(1000); continue; }
            const m = await p.evaluate(probe, { queries: { t: qOf(a) }, views: {} });
            const hit = m.rects.t;
            if (!hit) { res.missing.push(`t=${a.t} ${a.type} ${a.selector}${a.contains ? ` contains "${a.contains}"` : ''}`); continue; }
            if (a.type === 'scrollTo') {
              const [, y, , h] = hit.rect;
              const align = a.align || 'start';
              let to = align === 'center' ? hit.docY + h / 2 - vh / 2 : align === 'end' ? hit.docY + h - vh : hit.docY;
              to = Math.max(0, Math.min(m.maxScroll, Math.round(to - Number(a.offset || 0))));
              void y;
              await p.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), to);
              await p.waitForTimeout(1200); // scroll reveals (0.9 s) settle
            } else {
              const [x, y, w, h] = hit.rect;
              const [fx, fy] = a.anchor || [0.5, 0.5];
              const pt = { x: x + w * fx, y: y + h * fy };
              if (shot.mobile) { if (a.type === 'click') await p.touchscreen.tap(pt.x, pt.y); }
              else if (a.type === 'click') await p.mouse.click(pt.x, pt.y);
              else await p.mouse.move(pt.x, pt.y);
              if (a.type === 'click') await p.waitForTimeout(1200);
            }
          } else {
            const z = s.z;
            const d = z.depth || [1.25, 1.5, 1.8, 2.2, 3.5][(z.level || 3) - 1];
            const w = vw / d, h = vh / d;
            let fx, fy;
            if (z.focus && typeof z.focus === 'object') { fx = z.focus.x; fy = z.focus.y; }
            else if (typeof z.focus === 'string' && z.focus !== 'cursor') {
              const m = await p.evaluate(probe, { queries: { f: { selector: z.focus, contains: z.contains, nth: z.nth, tight: !!z.tight } }, views: {} });
              if (!m.rects.f) { res.missing.push(`zoom ${s.i} focus ${z.focus}`); continue; }
              const [x, y, rw, rh] = m.rects.f.rect;
              const [ax, ay] = z.anchor || [0.5, 0.5];
              fx = x + rw * ax; fy = y + rh * ay;
            } else continue;
            const view = [Math.max(0, Math.min(vw - w, fx - w / 2)), Math.max(0, Math.min(vh - h, fy - h / 2)), w, h].map((v) => Math.round(v));
            const m = await p.evaluate(probe, { queries: {}, views: { v: view } });
            const v = m.views.v;
            const priced = v.inside.filter((t) => PRICEY.test(t));
            res.zooms.push({ index: s.i, depth: d, view, follow: !!z.follow, cut: v.cut, priced });
            const label = `${shot.id} zoom ${s.i} (${d}x, view x ${view[0]}-${view[0] + view[2]}, y ${view[1]}-${view[1] + view[3]}${z.follow ? ', follows the cursor: approximate' : ''})`;
            // a follow zoom leans toward the moving cursor, so its view here is only indicative: look at its still instead
            console.log(`${z.follow ? 'INFO ' : v.cut.length || priced.length ? 'CHECK' : 'OK   '} ${label}`);
            if (!z.follow) for (const t of v.cut) console.log(`        edge cuts: ${t}`);
            for (const t of priced) warn(`${label} shows "${t}": not a confirmed fact, re-aim or re-stage`);
          }
        }
        const last = await p.evaluate(probe, { queries: {}, views: { all: [0, 0, vw, vh] } });
        const priced = last.views.all.inside.filter((t) => PRICEY.test(t));
        res.lastFrame = { scrollY: last.scrollY, priced };
        for (const t of priced) warn(`${shot.id} last frame (approx.) shows "${t}"`);
        for (const mm of res.missing) warn(`${shot.id}: selector not found: ${mm}`);
        console.log(`${res.missing.length ? 'FAIL ' : 'OK   '} ${shot.id}: ${shot.actions.length} actions, ${shot.zooms.length} zooms, ${res.missing.length} missing selectors`);
        report.shots[shot.id] = res;
        await c.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
  const missing = report.shots ? Object.values(report.shots).reduce((n, s) => n + s.missing.length, 0) : 0;
  console.log(missing ? `PREFLIGHT FAIL: ${missing} selectors missing` : `done (${report.warnings.length} warnings)`);
  process.exit(missing ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });

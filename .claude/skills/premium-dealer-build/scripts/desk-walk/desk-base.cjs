// Where the walks point, and a guard that keeps them there.
//
// DESK_BASE picks the desk server (default http://localhost:5190, the port the
// desk's own `npm run dev` uses). Another local server on another port (a
// video capture, a second checkout) must never be touched by a walk, so every
// request a walk's browser makes to localhost or 127.0.0.1 on any other port
// is aborted, and `at()` refuses to navigate anywhere but DESK_BASE. Start the
// desk with NEXT_PUBLIC_SITE_URL set to the same origin, or its signing and QR
// links point at the default port and the guard stops the walk there; the one
// link a walk follows by hand, the ceremony's signing link, goes through
// `follow()`, which takes it to the same path on DESK_BASE.
const BASE = (process.env.DESK_BASE || 'http://localhost:5190').replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;

function isLocal(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** Abort every local request that is not to DESK_BASE's origin. */
async function guard(ctx) {
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (isLocal(url) && new URL(url).origin !== ORIGIN) {
      console.log('GUARD refused', new URL(url).origin);
      return route.abort();
    }
    return route.continue();
  });
}

/** An absolute URL on DESK_BASE for a path or a URL; refuses another local origin. */
function at(pathOrUrl) {
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : BASE + pathOrUrl;
  if (isLocal(url) && new URL(url).origin !== ORIGIN) {
    throw new Error(`refusing ${new URL(url).origin}: the walk is pointed at ${ORIGIN} (DESK_BASE)`);
  }
  return url;
}

/**
 * A link the desk printed, followed on DESK_BASE: the link carries the desk's
 * configured origin (NEXT_PUBLIC_SITE_URL, or its default), so a walk against
 * DESK_BASE follows it to the same path there and never to another server.
 */
function follow(href) {
  return at(/^https?:\/\//.test(href) ? href.replace(/^https?:\/\/[^/]+/, BASE) : href);
}

/** The preview cookies for DESK_BASE's host. */
function previewCookies(value) {
  const cookies = [{ name: 'tj-local-admin-preview', value, domain: new URL(BASE).hostname, path: '/' }];
  // When this browser "signed in" (preview stand-in for the device cookie).
  if (process.env.PREVIEW_SIGNED_IN !== 'none') {
    cookies.push({ name: 'tj-local-admin-signed-in', value: String(Date.now()), domain: new URL(BASE).hostname, path: '/' });
  }
  return cookies;
}

/**
 * The client's theme on the screen in front of the walk, asserted before its
 * first screenshot (SKILL.md 4.2: the walker trusts no screenshot until it
 * passes). sale.cjs reads the accent off Start A Sale's chosen title card; a
 * walk that never opens Start A Sale (onboarding, the reset, a resumed deal)
 * reads it here as the browser computes the desk's accent role (--tj-copper,
 * the name every fork inherits), with the page ground and the heading's font
 * drawn on this screen. THEME_ACCENT / THEME_GROUND / THEME_FONT carry the
 * client's values (the defaults are Discount's). Throws THEME ASSERTION FAILED
 * with what it read; prints THEME OK.
 */
async function assertTheme(p) {
  const theme = await p.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;width:0;height:0;border-top:1px solid var(--tj-copper)';
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).borderTopColor;
    probe.remove();
    const h1 = document.querySelector('h1');
    return { accent, ground: getComputedStyle(document.body).backgroundColor, display: h1 ? getComputedStyle(h1).fontFamily : '' };
  });
  const want = { accent: process.env.THEME_ACCENT || 'rgb(0, 0, 0)', ground: process.env.THEME_GROUND || 'rgb(238, 239, 242)', font: new RegExp(process.env.THEME_FONT || 'Barlow') };
  if (theme.accent !== want.accent || theme.ground !== want.ground || !want.font.test(theme.display)) {
    throw new Error('THEME ASSERTION FAILED ' + JSON.stringify(theme));
  }
  console.log('THEME OK', JSON.stringify(theme));
  return theme;
}

module.exports = { BASE, ORIGIN, guard, at, follow, previewCookies, assertTheme };

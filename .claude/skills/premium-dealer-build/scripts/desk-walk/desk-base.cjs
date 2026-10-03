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

module.exports = { BASE, ORIGIN, guard, at, follow, previewCookies };

// cloudflare pages function, runtime per-request middleware
//
// astro is static so theres no astro middleware at runtime. two things need
// per-request logic that static hosting cant do:
//
//   1. per-pathname Link: <...>; rel="alternate"; type="text/markdown" header.
//      _headers can enumerate this but a function does it generically
//   2. Accept: text/markdown content negotiation. serve the .md body at the
//      html url when asked. static hosting cant do this at all
//
// activates on cloudflare pages, netlify edge, vercel middleware
// inert on github pages, which is where we deploy today
// the .md files already exist in dist so nothing else needs to change
// when we switch hosts

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

type PagesContext = {
  request: Request;
  env: Env;
  next: (input?: Request | string) => Promise<Response>;
};

// page url -> .md sibling url. matches what [...path].md.ts emits.
// every page uses the same <dir>/index.md shape; the document root
// maps to /index.md.
function deriveMarkdownPath(pathname: string): string {
  if (pathname === '' || pathname === '/') return '/index.md';
  const trimmed = pathname.replace(/\/$/, '');
  return `${trimmed}/index.md`;
}

// baseline security headers applied to every page response. mirrors what
// public/_headers sets; we set them here too so the function-served paths
// (the markdown content-negotiation branch and the html branch with the
// Link/Vary mutation) stay consistent. setIfMissing avoids stomping on
// any cdn-injected variant.
function applySecurityHeaders(headers: Headers): void {
  const setIfMissing = (name: string, value: string) => {
    if (!headers.has(name)) headers.set(name, value);
  };
  setIfMissing('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  setIfMissing('X-Frame-Options', 'DENY');
  setIfMissing('Cross-Origin-Opener-Policy', 'same-origin');
  setIfMissing('X-Content-Type-Options', 'nosniff');
  setIfMissing('Referrer-Policy', 'strict-origin-when-cross-origin');
  setIfMissing(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
  );
  // CSP frame-ancestors only takes effect as a real header (the meta tag
  // version is ignored by browsers per spec). leave the meta CSP alone so
  // the static github pages build keeps the rest of its policy.
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  }
}

// true if this is a page (not a css/js/img/etc asset)
// last segment with a dot = asset, skip it
function isPagePath(pathname: string): boolean {
  if (pathname === '/' || pathname.endsWith('/')) return true;
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !lastSegment.includes('.');
}

// server-side analytics hook (stub)
// this middleware sees every fetch, including ai crawlers that dont run js
// wire any of:
//   - workers analytics engine: env.ANALYTICS.writeDataPoint(...)
//   - fetch to a logging endpoint
//   - kv or d1 counter keyed by ua + pathname
// useful fields: ua, referer, pathname, whether Accept was text/markdown,
// whether we served .md or .html, locale prefix
function logAiCrawlerHit(_request: Request, _surface: 'html' | 'markdown') {
  // empty until we wire a logger
}

// roblox presence proxy. the public games endpoint is browser-blocked
// by cors, so we relay it here from a same-origin path. live.ts hits
// /api/roblox-presence?ids=<csv-of-universe-ids> when PUBLIC_ROBLOX_PROXY=1
// is set at build time. response shape is the upstream payload as-is.
//
// security:
// - GET only. anything else gets 405.
// - Origin/Referer must be the same origin (or absent for non-browser
//   clients) - prevents the endpoint being used as an open relay /
//   anonymiser for arbitrary roblox api calls from third-party sites.
// - strict ids validation. attacker-controlled query strings never get
//   proxied through.
// - response body capped to 64kb so a hostile upstream can't pin worker
//   memory.
// - upstream non-2xx is collapsed to 502 with no caching, so a transient
//   roblox 5xx isn't cached for 30s and a 3xx redirect target isn't
//   reflected to clients.
const PROXY_BODY_CAP = 64 * 1024;
async function handleRobloxPresence(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET, HEAD' },
    });
  }
  const expectedOrigin = new URL(request.url).origin;
  const originHeader = request.headers.get('Origin');
  const refererHeader = request.headers.get('Referer');
  // browsers always send Origin on cross-origin requests. if either
  // header is present, it must match our origin. absence of both
  // (curl, server-to-server) is allowed - those clients can't be
  // hijacked by a malicious page anyway.
  if (originHeader && originHeader !== expectedOrigin) {
    return new Response(JSON.stringify({ error: 'origin' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  if (!originHeader && refererHeader) {
    try {
      if (new URL(refererHeader).origin !== expectedOrigin) {
        return new Response(JSON.stringify({ error: 'referer' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'referer' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  }
  const ids = url.searchParams.get('ids') ?? '';
  // strict input validation: digits and commas only, max 10 ids,
  // each up to 20 digits. anything else gets a 400 - never proxy
  // attacker-controlled query strings to an upstream blindly.
  if (!/^\d{1,20}(,\d{1,20}){0,9}$/.test(ids)) {
    return new Response(JSON.stringify({ error: 'bad ids' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const upstream = `https://games.roblox.com/v1/games?universeIds=${ids}`;
  try {
    const res = await fetch(upstream, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    const upstreamCt = (res.headers.get('Content-Type') ?? '').toLowerCase();
    if (!res.ok || !upstreamCt.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'upstream' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    const body = await res.text();
    if (body.length > PROXY_BODY_CAP) {
      return new Response(JSON.stringify({ error: 'too large' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // short cache. presence is volatile but we still want repeat
        // visitors within a tab session to skip the upstream hop.
        'Cache-Control': 'public, max-age=30',
        'Access-Control-Allow-Origin': expectedOrigin,
        'Vary': 'Origin',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'upstream' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // same-origin proxies for browser-cors-blocked apis. lives behind
  // /api/* so static asset detection above doesn't try to serve them.
  if (pathname === '/api/roblox-presence') {
    return handleRobloxPresence(request, url);
  }

  // skip assets, they dont need Link headers or content negotiation
  if (!isPagePath(pathname)) {
    return next();
  }

  const markdownPath = deriveMarkdownPath(pathname);

  // 1. Accept: text/markdown -> serve the .md body at this url
  // claude code and cursor already send this header
  const accept = request.headers.get('Accept') ?? '';
  if (accept.toLowerCase().includes('text/markdown')) {
    const mdRequest = new Request(new URL(markdownPath, url), request);
    const mdResponse = await next(mdRequest);
    // only relabel as markdown if the resolved body actually IS markdown.
    // otherwise an upstream html fallback (spa shell, custom 200 error
    // page) would get mis-served as text/markdown to the agent.
    const mdContentType = (mdResponse.headers.get('Content-Type') ?? '').toLowerCase();
    if (mdResponse.ok && (mdContentType.includes('text/markdown') || mdContentType.includes('text/plain') || mdContentType === '')) {
      logAiCrawlerHit(request, 'markdown');
      const headers = new Headers(mdResponse.headers);
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
      headers.set('Vary', 'Accept');
      // self-link so a downstream proxy can still find the canonical .md
      headers.append('Link', `<${markdownPath}>; rel="canonical"; type="text/markdown"`);
      applySecurityHeaders(headers);
      return new Response(mdResponse.body, {
        status: 200,
        statusText: 'OK',
        headers,
      });
    }
    // .md missing, fall through to html
  }

  // 2. default: serve html and add a Link header pointing at the .md
  // Vary: Accept so the cdn caches both bodies separately
  const response = await next();

  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return response;
  }

  logAiCrawlerHit(request, 'html');

  const newHeaders = new Headers(response.headers);
  const linkValue = `<${markdownPath}>; rel="alternate"; type="text/markdown"`;
  const existingLink = newHeaders.get('Link');
  newHeaders.set('Link', existingLink ? `${existingLink}, ${linkValue}` : linkValue);
  // append, dont clobber a prior Vary
  const existingVary = newHeaders.get('Vary');
  if (!existingVary || !existingVary.split(',').map((v) => v.trim().toLowerCase()).includes('accept')) {
    newHeaders.set('Vary', existingVary ? `${existingVary}, Accept` : 'Accept');
  }
  applySecurityHeaders(newHeaders);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};

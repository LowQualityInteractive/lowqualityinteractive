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
  setIfMissing('Origin-Agent-Cluster', '?1');
  setIfMissing('X-Content-Type-Options', 'nosniff');
  setIfMissing('X-Permitted-Cross-Domain-Policies', 'none');
  setIfMissing('X-XSS-Protection', '0');
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

function appendHeaderValue(headers: Headers, name: string, value: string): void {
  const existing = headers.get(name);
  if (!existing) {
    headers.set(name, value);
    return;
  }
  if (!existing.split(',').map((part) => part.trim()).includes(value)) {
    headers.set(name, `${existing}, ${value}`);
  }
}

function appendVary(headers: Headers, value: string): void {
  const existing = headers.get('Vary');
  const values = existing
    ? existing.split(',').map((part) => part.trim().toLowerCase())
    : [];
  if (!values.includes(value.toLowerCase())) {
    headers.set('Vary', existing ? `${existing}, ${value}` : value);
  }
}

function acceptsMarkdown(accept: string): boolean {
  return accept.split(',').some((range) => {
    const [rawType, ...rawParameters] = range.split(';');
    if (rawType.trim().toLowerCase() !== 'text/markdown') return false;

    const qualityParameter = rawParameters
      .map((parameter) => parameter.trim().toLowerCase())
      .find((parameter) => parameter.startsWith('q='));
    if (!qualityParameter) return true;

    const quality = Number(qualityParameter.slice(2));
    return Number.isFinite(quality) && quality > 0 && quality <= 1;
  });
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
// /api/roblox-presence when PUBLIC_ROBLOX_PROXY=1 is set at build time.
// the endpoint owns its fixed universe-id allowlist and returns only id +
// playing, the two fields used by the browser.
//
// security:
// - GET only. anything else gets 405.
// - Origin/Referer must be the same origin (or absent for non-browser
//   clients) - prevents the endpoint being used as an open relay /
//   anonymiser for arbitrary roblox api calls from third-party sites.
// - no query input. the proxy can request only the universe ids owned by
//   this site, so it cannot become a generic roblox relay or cache-busting
//   request amplifier.
// - the response stream is stopped at 64kb before it can pin worker memory.
// - only the two fields used by the client are returned.
// - upstream non-2xx is collapsed to 502 with no caching, so a transient
//   roblox 5xx isn't cached for 30s and a 3xx redirect target isn't
//   reflected to clients.
const PROXY_BODY_CAP = 64 * 1024;
const ROBLOX_UNIVERSE_IDS = ['5788461409', '7915083902'] as const;
const ROBLOX_UNIVERSE_ID_SET = new Set<string>(ROBLOX_UNIVERSE_IDS);

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cacheControl = 'no-store',
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({
    'Cache-Control': cacheControl,
    'Content-Type': 'application/json; charset=utf-8',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extraHeaders,
  });
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readCappedText(response: Response, byteCap: number): Promise<string> {
  const rawContentLength = response.headers.get('Content-Length');
  if (rawContentLength !== null) {
    const contentLength = Number(rawContentLength);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > byteCap) {
      throw new Error('upstream body too large');
    }
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > byteCap) {
      await reader.cancel('upstream body too large').catch(() => undefined);
      throw new Error('upstream body too large');
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

function sanitizePresencePayload(rawBody: string): { data: { id: number; playing: number }[] } {
  const parsed: unknown = JSON.parse(rawBody);
  if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
    throw new Error('invalid upstream payload');
  }

  const playingByUniverse = new Map<string, number>();
  for (const value of parsed.data) {
    if (!isRecord(value)) continue;
    const id = typeof value.id === 'number' || typeof value.id === 'string'
      ? String(value.id)
      : '';
    const playing = value.playing;
    if (
      !ROBLOX_UNIVERSE_ID_SET.has(id)
      || typeof playing !== 'number'
      || !Number.isSafeInteger(playing)
      || playing < 0
    ) {
      continue;
    }
    playingByUniverse.set(id, playing);
  }

  return {
    data: ROBLOX_UNIVERSE_IDS.flatMap((id) => {
      const playing = playingByUniverse.get(id);
      return playing === undefined ? [] : [{ id: Number(id), playing }];
    }),
  };
}

async function handleRobloxPresence(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method' }, 405, 'no-store', { Allow: 'GET' });
  }
  if (url.search !== '') {
    return jsonResponse({ error: 'query' }, 400);
  }

  const expectedOrigin = new URL(request.url).origin;
  const originHeader = request.headers.get('Origin');
  const refererHeader = request.headers.get('Referer');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite === 'cross-site') {
    return jsonResponse({ error: 'origin' }, 403);
  }
  // browsers always send Origin on cross-origin requests. if either
  // header is present, it must match our origin. absence of both
  // (curl, server-to-server) is allowed - those clients can't be
  // hijacked by a malicious page anyway.
  if (originHeader && originHeader !== expectedOrigin) {
    return jsonResponse({ error: 'origin' }, 403);
  }
  if (refererHeader) {
    try {
      if (new URL(refererHeader).origin !== expectedOrigin) {
        return jsonResponse({ error: 'referer' }, 403);
      }
    } catch {
      return jsonResponse({ error: 'referer' }, 403);
    }
  }

  const upstream = `https://games.roblox.com/v1/games?universeIds=${ROBLOX_UNIVERSE_IDS.join(',')}`;
  try {
    const res = await fetch(upstream, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });
    const upstreamCt = (res.headers.get('Content-Type') ?? '').toLowerCase();
    if (!res.ok || !upstreamCt.includes('application/json')) {
      return jsonResponse({ error: 'upstream' }, 502);
    }
    const body = await readCappedText(res, PROXY_BODY_CAP);
    const payload = sanitizePresencePayload(body);
    // One canonical endpoint and one cache variant. Presence is volatile,
    // but the short stale window prevents bursts from reaching the upstream.
    return jsonResponse(payload, 200, 'public, max-age=30, stale-while-revalidate=30');
  } catch {
    return jsonResponse({ error: 'upstream' }, 502);
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
  const negotiatesContent = request.method === 'GET' || request.method === 'HEAD';
  if (negotiatesContent && acceptsMarkdown(accept)) {
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
      appendVary(headers, 'Accept');
      // self-link so a downstream proxy can still find the canonical .md
      appendHeaderValue(headers, 'Link', `<${markdownPath}>; rel="canonical"; type="text/markdown"`);
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
    const headers = new Headers(response.headers);
    applySecurityHeaders(headers);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  logAiCrawlerHit(request, 'html');

  const newHeaders = new Headers(response.headers);
  const linkValue = `<${markdownPath}>; rel="alternate"; type="text/markdown"`;
  appendHeaderValue(newHeaders, 'Link', linkValue);
  appendVary(newHeaders, 'Accept');
  applySecurityHeaders(newHeaders);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};

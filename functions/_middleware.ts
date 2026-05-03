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

// page url -> .md sibling url. matches what [...path].md.ts emits
// /<slug>/about -> append .md
// everything else -> <dir>/index.md
function deriveMarkdownPath(pathname: string): string {
  if (pathname === '' || pathname === '/') return '/index.md';
  const trimmed = pathname.replace(/\/$/, '');
  if (trimmed.endsWith('/about')) return `${trimmed}.md`;
  return `${trimmed}/index.md`;
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

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

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
    if (mdResponse.ok) {
      logAiCrawlerHit(request, 'markdown');
      const headers = new Headers(mdResponse.headers);
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
      headers.set('Vary', 'Accept');
      // self-link so a downstream proxy can still find the canonical .md
      headers.append('Link', `<${markdownPath}>; rel="canonical"; type="text/markdown"`);
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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};

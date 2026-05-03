// Cloudflare Pages Function — runtime middleware that adds LLM-friendly
// response behavior to every request.
//
// WHY THIS FILE EXISTS:
// Astro is configured with `output: 'static'`, so the build emits only
// HTML/JSON/MD files and there is no Astro middleware at runtime. Two of
// the LLM-discoverability techniques we want require per-request logic
// that no static host can express alone:
//
//   1. Per-pathname `Link: <...>; rel="alternate"; type="text/markdown"`
//      header. The static `_headers` file enumerates this rule for every
//      route, but a runtime function can compute it generically and
//      handle paths the static rules forgot.
//
//   2. Content negotiation on `Accept: text/markdown`. When a request
//      asks for markdown, we should serve the matching `.md` body
//      instead of the HTML body — same URL, different content. Static
//      hosting cannot do that.
//
// WHEN THIS FILE ACTIVATES:
// Cloudflare Pages auto-detects a `functions/` directory and runs files
// matching `_middleware.ts` on every request. The site is currently
// deployed via GitHub Actions to GitHub Pages — GitHub Pages does NOT
// run this file. To activate, switch the deployment target to Cloudflare
// Pages (or run a Cloudflare Worker on the existing zone with the same
// logic). The Astro build output already writes the `.md` files this
// function references, so no other change is needed.
//
// Equivalent runtime hooks for other hosts:
// - Netlify: an Edge Function in `netlify/edge-functions/` registered
//   with `[edge_functions] path = "/*"` in netlify.toml.
// - Vercel: a Middleware at `middleware.ts` in the project root.
// Either can port this logic verbatim — the request/response model is
// identical (Web standard Request/Response) on all three platforms.

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

type PagesContext = {
  request: Request;
  env: Env;
  next: (input?: Request | string) => Promise<Response>;
};

// Maps a page URL to the URL of its `.md` sibling, matching the pattern
// emitted by `src/pages/[...path].md.ts`. Slug-style routes (the
// `/<slug>/about` family) get `.md` appended; directory-style routes
// (everything else) get `<dir>/index.md`.
function deriveMarkdownPath(pathname: string): string {
  if (pathname === '' || pathname === '/') return '/index.md';
  const trimmed = pathname.replace(/\/$/, '');
  if (trimmed.endsWith('/about')) return `${trimmed}.md`;
  return `${trimmed}/index.md`;
}

// True for paths the function should treat as page documents (not assets,
// data files, or already-served markdown). We use the URL extension as the
// signal: a final-segment with a dot (other than the magic `/` directory)
// is treated as a non-page asset and skipped.
function isPagePath(pathname: string): boolean {
  if (pathname === '/' || pathname.endsWith('/')) return true;
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !lastSegment.includes('.');
}

// SERVER-SIDE ANALYTICS HOOK (stub):
// When this middleware runs, it sees every page fetch — including AI
// crawlers. Client-side analytics (GA, Plausible, etc.) cannot see those
// because bots don't execute JS. This is the right place to log
// AI-crawler traffic. Wire any of the following:
//
//   - Cloudflare Workers Analytics Engine: env.ANALYTICS.writeDataPoint(...)
//   - A logging endpoint via fetch: await fetch('https://logs.example/log', {...})
//   - A Workers KV / D1 counter keyed by user-agent + pathname
//
// Fields worth recording per request: User-Agent, Referer, pathname,
// whether `Accept: text/markdown` was set, whether the request resolved
// to .md or .html, and the locale prefix (if any).
function logAiCrawlerHit(_request: Request, _surface: 'html' | 'markdown') {
  // intentionally empty — wire to a logger when ready.
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Skip the function entirely for non-page assets (CSS, JS, images,
  // sitemap, robots, .md endpoints themselves, etc.). They don't need
  // per-page Link headers and they shouldn't go through content
  // negotiation.
  if (!isPagePath(pathname)) {
    return next();
  }

  const markdownPath = deriveMarkdownPath(pathname);

  // ------------------------------------------------------------------
  // 1. Accept: text/markdown content negotiation.
  // Claude Code and Cursor already advertise `Accept: text/markdown`
  // in their fetcher requests (April 2026). When we see that header,
  // serve the .md body at this URL instead of the HTML body.
  // ------------------------------------------------------------------
  const accept = request.headers.get('Accept') ?? '';
  if (accept.toLowerCase().includes('text/markdown')) {
    const mdRequest = new Request(new URL(markdownPath, url), request);
    const mdResponse = await next(mdRequest);
    if (mdResponse.ok) {
      logAiCrawlerHit(request, 'markdown');
      const headers = new Headers(mdResponse.headers);
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
      headers.set('Vary', 'Accept');
      // Self-link so a downstream proxy can still find the canonical .md.
      headers.append('Link', `<${markdownPath}>; rel="canonical"; type="text/markdown"`);
      return new Response(mdResponse.body, {
        status: 200,
        statusText: 'OK',
        headers,
      });
    }
    // If the .md is missing for some reason, fall through to HTML so
    // the user/agent still gets a useful response.
  }

  // ------------------------------------------------------------------
  // 2. Default path: serve the HTML, then add a `Link` header pointing
  //    at the .md sibling and `Vary: Accept` so the CDN caches the two
  //    representations separately.
  // ------------------------------------------------------------------
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
  // Append rather than set so we don't clobber a prior Vary value.
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

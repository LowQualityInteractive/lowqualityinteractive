// LLM-discoverability endpoint: serves a clean Markdown rendering of every
// page on the site at <url>.md per the llmstxt.org spec.
//
// One catch-all endpoint enumerates the cartesian product of LOCALES x
// (section pages + game-about pages) so every visible HTML page has a
// matching `.md` static file in `dist/`. The HTML pages also advertise
// these endpoints via <link rel="alternate" type="text/markdown"> and the
// hosting layer adds an HTTP `Link:` header — see public/_headers and
// functions/_middleware.ts.
//
// Why this file exists in the first place: ChatGPT, Claude, and Cursor
// already prefer markdown over HTML when both are offered. JSON-LD does not
// reliably reach those LLMs (per controlled tests by Evil Martians, April
// 2026), but a plain `.md` body does. This endpoint is the cheapest way to
// give every page an LLM-friendly representation without rebuilding the
// design system.
//
// Output paths (examples):
//   /index.md                         (en home)
//   /games/index.md                   (en games index)
//   /eradication/about.md             (en game about)
//   /de/index.md                      (German home)
//   /de/eradication/about.md          (German game about)

import type { APIRoute, GetStaticPaths } from 'astro';
import { LOCALES, type Locale } from '../i18n/messages';
import {
  MARKDOWN_GAME_SLUGS,
  MARKDOWN_SECTIONS,
  getMarkdownForRoute,
} from '../data/markdown';

interface MarkdownRouteProps {
  locale: Locale;
  route: string;
  [key: string]: unknown;
}

export const getStaticPaths: GetStaticPaths = () => {
  const entries: { params: { path: string }; props: MarkdownRouteProps }[] = [];

  for (const locale of LOCALES) {
    // English is the unprefixed default, all other locales sit under /<locale>/.
    const localeSegment = locale === 'en' ? '' : locale;

    for (const section of MARKDOWN_SECTIONS) {
      // Index-style pages: emit `<prefix>/index.md`. The path passed to
      // Astro is everything before `.md` — Astro will write the file at
      // `dist/<path>.md`. We always include an explicit `index` segment so
      // the on-disk file matches the URL `/<prefix>/index.md` the spec
      // calls for.
      const segments = [localeSegment, section, 'index'].filter(Boolean);
      entries.push({
        params: { path: segments.join('/') },
        props: { locale, route: section },
      });
    }

    for (const slug of MARKDOWN_GAME_SLUGS) {
      // Game-about pages: emit `<prefix>/<slug>/about.md`.
      const segments = [localeSegment, slug, 'about'].filter(Boolean);
      entries.push({
        params: { path: segments.join('/') },
        props: { locale, route: `${slug}/about` },
      });
    }
  }

  return entries;
};

export const GET: APIRoute = ({ props }) => {
  const { locale, route } = props as MarkdownRouteProps;

  // SERVER-SIDE ANALYTICS HOOK (stub):
  //   logFetch({
  //     userAgent: request.headers.get('user-agent'),
  //     referer: request.headers.get('referer'),
  //     path: new URL(request.url).pathname,
  //     locale,
  //     route,
  //     surface: 'markdown',
  //   });
  // Client-side analytics (GA, Plausible, etc.) cannot see AI crawler
  // traffic — bots do not execute the JS that fires those events. The only
  // way to count GPTBot / ClaudeBot / PerplexityBot fetches is to log on
  // the server. This endpoint is currently static (Astro `output: 'static'`),
  // so logging would need to happen in the hosting layer (Cloudflare Pages
  // Function or equivalent). See functions/_middleware.ts for the runtime
  // hook point.

  const body = getMarkdownForRoute(locale, route);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // Vary: Accept tells CDNs that the same URL may serve different
      // content based on the Accept request header. The hosting middleware
      // reuses the same .md body when an HTML URL is requested with
      // `Accept: text/markdown`.
      Vary: 'Accept',
    },
  });
};

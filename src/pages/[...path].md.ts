// the .md endpoint. this is for llms, not humans.
//
// one catch-all enumerates LOCALES x (sections + game-about) and emits
// a static .md for each. the html pages link here via
// rel="alternate" type="text/markdown", and _headers/middleware can
// also redirect to us.
//
// llms read .md better than html, and json-ld never quite reaches them.
// this is the cheapest way to give every page a clean text version that
// agents and crawlers can actually parse.
//
// output examples:
//   /index.md
//   /games/index.md
//   /eradication/index.md
//   /de/index.md
//   /de/eradication/index.md

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
    // en is unprefixed; every other locale gets /<locale>/.
    const localeSegment = locale === 'en' ? '' : locale;

    for (const section of MARKDOWN_SECTIONS) {
      // index-style pages emit <prefix>/index.md.
      // astro writes the file at dist/<path>.md. the explicit "index"
      // segment is what the llmstxt spec calls for.
      const segments = [localeSegment, section, 'index'].filter(Boolean);
      entries.push({
        params: { path: segments.join('/') },
        props: { locale, route: section },
      });
    }

    for (const slug of MARKDOWN_GAME_SLUGS) {
      // game pages used to emit <prefix>/<slug>/about.md. they now sit
      // at <prefix>/<slug>/index.md to mirror the html route, which is
      // /<slug>/ directly (no /about subpath, no redirect).
      const segments = [localeSegment, slug, 'index'].filter(Boolean);
      entries.push({
        params: { path: segments.join('/') },
        props: { locale, route: slug },
      });
    }
  }

  return entries;
};

export const GET: APIRoute = ({ props }) => {
  const { locale, route } = props as MarkdownRouteProps;

  // server-side analytics hook (stub):
  //   logFetch({
  //     userAgent: request.headers.get('user-agent'),
  //     referer: request.headers.get('referer'),
  //     path: new URL(request.url).pathname,
  //     locale,
  //     route,
  //     surface: 'markdown',
  //   });
  // client-side analytics can't see ai crawlers - bots don't run js, by
  // design and by reputation. the only way to count gptbot/claudebot/etc
  // is logging on the server. this is static output, so wire the count
  // into the hosting layer instead. see functions/_middleware.ts.

  const body = getMarkdownForRoute(locale, route);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};

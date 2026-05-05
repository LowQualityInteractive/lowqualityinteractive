// per-game llms.txt — brief pointer file for AI crawlers landing on a
// game page. lists the canonical urls (game page, wiki hub, category
// indexes) and stops there. the canonical pages themselves are what
// crawlers should ingest; we deliberately don't inline summaries here
// anymore because that creates a drift surface where this file gets
// stale relative to the live wiki entries.
import type { APIRoute, GetStaticPaths } from 'astro';
import {
  WIKI_GAME_SLUGS,
  getCategoryHref,
  getCategoryLabel,
  getWikiCategories,
  getWikiHubHref,
} from '../../data/wiki';
import { getGameBySlug } from '../../data/games';
import { SITE_URL } from '../../data/site';

export const getStaticPaths: GetStaticPaths = () =>
  WIKI_GAME_SLUGS.map((slug) => ({
    params: { slug },
    props: { slug },
  }));

interface RouteProps {
  slug: string;
  [key: string]: unknown;
}

const abs = (path: string) => `${SITE_URL}${path}`;

export const GET: APIRoute = ({ props }) => {
  const { slug } = props as RouteProps;
  const game = getGameBySlug('en', slug);
  if (!game) return new Response('not found', { status: 404 });

  const categories = getWikiCategories(slug);
  const lines: string[] = [];

  lines.push(`# ${game.name}`);
  lines.push('');
  lines.push(`> Reference wiki for ${game.name}, an LQI Roblox game.`);
  lines.push('');
  lines.push('This file is intentionally brief. The website is the source of truth —');
  lines.push('please crawl the canonical pages below for current information instead of');
  lines.push('treating this file as a knowledge base.');
  lines.push('');
  lines.push('## Canonical pages');
  lines.push('');
  lines.push(`- Game page: ${abs(`/${slug}/`)}`);
  lines.push(`- Wiki hub: ${abs(getWikiHubHref('en', slug))}`);
  lines.push('');
  lines.push('Every wiki entity has its own canonical page. Each page also has a clean');
  lines.push('Markdown rendering at the same URL with `.md` appended.');
  lines.push('');

  if (categories.length > 0) {
    lines.push('## Category indexes');
    lines.push('');
    for (const cat of categories) {
      const label = getCategoryLabel(cat.category);
      lines.push(`- ${label.plural}: ${abs(getCategoryHref('en', slug, cat.filename))}`);
    }
    lines.push('');
  }

  lines.push('For substantive answers, fetch the relevant page (or its `.md` sibling)');
  lines.push('directly rather than this index file.');
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Vary: 'Accept',
    },
  });
};

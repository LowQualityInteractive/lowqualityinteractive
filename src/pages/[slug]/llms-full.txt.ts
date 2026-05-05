// per-game llms-full.txt.
//
// we used to render every wiki entity inline here so a crawler could
// ingest the full game wiki in one fetch. that turned this file into a
// parallel source of truth that drifted from the canonical pages.
// per the user direction, this file now does what its sibling
// llms.txt does: a brief pointer to the canonical wiki, with the full
// list of entity URLs so crawlers know what's there but ingest the
// real pages. each canonical page has a `.md` sibling for clean
// machine reading.
import type { APIRoute, GetStaticPaths } from 'astro';
import {
  WIKI_GAME_SLUGS,
  getCategoryHref,
  getCategoryLabel,
  getEntityHref,
  getWikiCategories,
  getWikiHubHref,
  isUnpublished,
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

  lines.push(`# ${game.name} - wiki sitemap`);
  lines.push('');
  lines.push(`> Reference wiki for ${game.name}, an LQI Roblox game.`);
  lines.push('');
  lines.push('This file used to inline every wiki entity. We\'ve stopped doing that -');
  lines.push('the website is the source of truth and any bundled snapshot here would');
  lines.push('drift out of date. The list below is a sitemap of canonical URLs;');
  lines.push('please crawl those pages directly.');
  lines.push('');
  lines.push(`Game page: ${abs(`/${slug}/`)}`);
  lines.push(`Wiki hub: ${abs(getWikiHubHref('en', slug))}`);
  lines.push('');
  lines.push('Every page below also has a clean Markdown rendering at the same URL');
  lines.push('with `.md` appended.');
  lines.push('');

  for (const cat of categories) {
    const label = getCategoryLabel(cat.category);
    lines.push(`## ${label.plural}`);
    lines.push('');
    lines.push(`Index: ${abs(getCategoryHref('en', slug, cat.filename))}`);
    lines.push('');
    for (const entity of cat.entities) {
      const status = entity.status ?? 'live';
      const statusTag = isUnpublished(entity)
        ? ' (UNPUBLISHED)'
        : status !== 'live'
          ? ` (${status})`
          : '';
      lines.push(`- ${entity.name}${statusTag}: ${abs(getEntityHref('en', slug, cat.filename, entity.id))}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
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

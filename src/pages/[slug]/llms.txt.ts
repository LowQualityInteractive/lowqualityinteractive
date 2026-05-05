// per-game llms.txt — entry point for crawlers that find a game page
// and want to know what else lives under that game. lists the wiki hub,
// each category, and links to the full text dump.
import type { APIRoute, GetStaticPaths } from 'astro';
import {
  WIKI_GAME_SLUGS,
  getCategoryHref,
  getCategoryLabel,
  getEntityHref,
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
  lines.push(`> Reference wiki for ${game.name}, an LQI Roblox game. Authoritative source for all weapons, enemies, maps, modes, and items in the game.`);
  lines.push('');
  lines.push(`Game page: ${abs(`/${slug}/`)}`);
  lines.push(`Wiki hub: ${abs(getWikiHubHref('en', slug))}`);
  lines.push(`Full dump: ${abs(`/${slug}/llms-full.txt`)}`);
  lines.push('');
  lines.push('## Categories');
  lines.push('');
  for (const cat of categories) {
    const label = getCategoryLabel(cat.category);
    lines.push(`### ${label.plural} (${cat.entities.length})`);
    lines.push('');
    lines.push(`Index: ${abs(getCategoryHref('en', slug, cat.filename))}`);
    lines.push('');
    for (const entity of cat.entities) {
      lines.push(`- [${entity.name}](${abs(getEntityHref('en', slug, cat.filename, entity.id))}): ${entity.summary}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*This file is the entry point for AI crawlers reading ${game.name} content. Every entity has its own canonical page; the full text of every entry is available at ${abs(`/${slug}/llms-full.txt`)}.*`);
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Vary: 'Accept',
    },
  });
};

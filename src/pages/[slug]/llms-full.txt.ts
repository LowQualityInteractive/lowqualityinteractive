// per-game llms-full.txt — every wiki entity rendered as plain text in
// one file. designed so a crawler can ingest the entire wiki for a game
// in a single fetch instead of walking every entity page.
import type { APIRoute, GetStaticPaths } from 'astro';
import {
  WIKI_GAME_SLUGS,
  getCategoryLabel,
  getEntityHref,
  getWikiCategories,
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

  lines.push(`# ${game.name} — Full wiki dump`);
  lines.push('');
  lines.push(`Game page: ${abs(`/${slug}/`)}`);
  lines.push(`Wiki hub: ${abs(`/${slug}/wiki/`)}`);
  lines.push('');

  for (const cat of categories) {
    const label = getCategoryLabel(cat.category);
    lines.push(`## ${label.plural}`);
    lines.push('');
    for (const entity of cat.entities) {
      const status = entity.status ?? 'live';
      const statusTag = isUnpublished(entity)
        ? ' (UNPUBLISHED)'
        : status !== 'live'
          ? ` (${status})`
          : '';
      lines.push(`### ${entity.name}${statusTag}`);
      lines.push('');
      lines.push(`Canonical URL: ${abs(getEntityHref('en', slug, cat.filename, entity.id))}`);
      lines.push('');
      lines.push(entity.summary);
      lines.push('');
      if (entity.role) {
        lines.push(`**Role:** ${entity.role}`);
        lines.push('');
      }
      if (entity.stats && Object.keys(entity.stats).length > 0) {
        lines.push('**Stats:**');
        for (const [key, value] of Object.entries(entity.stats)) {
          lines.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
        }
        lines.push('');
      }
      if (entity.related && entity.related.length > 0) {
        lines.push(`**Related:** ${entity.related.join(', ')}`);
        lines.push('');
      }
      if (entity.last_verified) {
        lines.push(`Last verified: ${entity.last_verified}`);
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(`*This file is the full plain-text dump of the ${game.name} wiki. Each entity also has its own canonical HTML page linked above.*`);
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Vary: 'Accept',
    },
  });
};

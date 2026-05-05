// json-driven wiki system. lives at /<slug>/wiki/<category>/<entity>/.
//
// the source of truth is src/data/wiki/<game>/<category>.json. astro's
// import.meta.glob picks them all up at build time, this module
// normalises them into a single in-memory index, and the page files
// (and the per-game llms.txt) query through here.
//
// to add a game: drop src/data/wiki/<slug>/<category>.json with an
// array of entities and run npm run build. no other code changes.

import type { Locale } from '../i18n/messages';
import { getLocalePath } from '../i18n/messages';

// shape on disk. each json file is either an array of entities or an
// object with an `items` field, both forms accepted so existing tooling
// (cms exports, hand-edited files) doesn't fight the loader.
type RawFile = WikiEntity[] | { items: WikiEntity[] };

export interface WikiEntity {
  id: string;
  name: string;
  type?: string;
  summary: string;
  role?: string;
  stats?: Record<string, string | number>;
  related?: string[];
  fun_facts?: string[];
  status?: 'live' | 'preview' | 'sunset' | 'unpublished';
  last_verified?: string;
}

export interface WikiCategory {
  game: string;
  category: string;       // singular, e.g. "weapon"
  filename: string;       // plural, e.g. "weapons" — drives the url
  entities: WikiEntity[];
}

// lifted out so we can render category labels without a separate i18n
// pass. covers the categories the spec calls out by name plus a fallback.
const CATEGORY_LABELS: Record<string, { singular: string; plural: string }> = {
  weapon:  { singular: 'Weapon',  plural: 'Weapons' },
  enemy:   { singular: 'Enemy',   plural: 'Enemies' },
  map:     { singular: 'Map',     plural: 'Maps' },
  mode:    { singular: 'Mode',    plural: 'Modes' },
  item:    { singular: 'Item',    plural: 'Items' },
  mechanic:{ singular: 'Mechanic',plural: 'Mechanics' },
  gamepass:{ singular: 'Gamepass',plural: 'Gamepasses' },
  progression: { singular: 'Progression', plural: 'Progression' },
  territory: { singular: 'Territory', plural: 'Territories' },
  vehicle: { singular: 'Vehicle', plural: 'Vehicles' },
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// astro requires a literal glob string. relative to this file:
// src/data/wiki.ts → src/data/wiki/<game>/<file>.json
const wikiFiles = import.meta.glob<RawFile>('./wiki/*/*.json', {
  eager: true,
  import: 'default',
});

// normalised registry: gameSlug → categorySlug → category record.
const registry = new Map<string, Map<string, WikiCategory>>();

for (const [path, raw] of Object.entries(wikiFiles)) {
  const match = path.match(/wiki\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, game, filename] = match;

  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];

  // category type defaults to filename minus the trailing 's' if any.
  // entities can override per-row via the type field.
  const fallbackType = filename.endsWith('s') ? filename.slice(0, -1) : filename;

  const entities: WikiEntity[] = items
    .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
    .map((item) => ({
      ...item,
      id: slugify(item.id),
      type: item.type ?? fallbackType,
      // unlisted ids can't be linked, so dedupe early.
      related: Array.isArray(item.related) ? Array.from(new Set(item.related.map(slugify))) : [],
      fun_facts: Array.isArray(item.fun_facts) ? item.fun_facts.filter((fact) => typeof fact === 'string') : [],
    }));

  // empty categories are still registered — the wiki button on the
  // game page should stay visible while data is being populated, and
  // the hub/category pages render an "empty" state instead of 404.

  let gameMap = registry.get(game);
  if (!gameMap) {
    gameMap = new Map();
    registry.set(game, gameMap);
  }
  gameMap.set(slugify(filename), {
    game,
    category: fallbackType,
    filename,
    entities,
  });
}

export const WIKI_GAME_SLUGS = Array.from(registry.keys()).sort();

export function hasWiki(gameSlug: string): boolean {
  return registry.has(gameSlug);
}

export function getWikiCategories(gameSlug: string): WikiCategory[] {
  const game = registry.get(gameSlug);
  if (!game) return [];
  return Array.from(game.values()).sort((a, b) => a.filename.localeCompare(b.filename));
}

export function getWikiCategory(gameSlug: string, categorySlug: string): WikiCategory | null {
  return registry.get(gameSlug)?.get(categorySlug) ?? null;
}

export function getWikiEntity(
  gameSlug: string,
  categorySlug: string,
  entityId: string,
): WikiEntity | null {
  const cat = getWikiCategory(gameSlug, categorySlug);
  if (!cat) return null;
  const id = slugify(entityId);
  return cat.entities.find((e) => e.id === id) ?? null;
}

// look up an entity by id across all categories for a game. used to
// resolve `related` references that don't carry their category.
export function findEntityById(
  gameSlug: string,
  entityId: string,
): { entity: WikiEntity; category: WikiCategory } | null {
  const game = registry.get(gameSlug);
  if (!game) return null;
  const id = slugify(entityId);
  for (const cat of game.values()) {
    const entity = cat.entities.find((e) => e.id === id);
    if (entity) return { entity, category: cat };
  }
  return null;
}

export interface ResolvedRelation {
  id: string;
  name: string;
  type: string;
  href: string;
  resolved: boolean;
}

// turn an entity's `related` array into something a template can render
// without thinking. unknown ids come back with resolved: false so the
// view can mark them "Unpublished" rather than dropping the link.
export function resolveRelated(
  locale: Locale,
  gameSlug: string,
  entity: WikiEntity,
): ResolvedRelation[] {
  if (!entity.related || entity.related.length === 0) return [];
  return entity.related.map((rid) => {
    const found = findEntityById(gameSlug, rid);
    if (!found) {
      return {
        id: rid,
        name: rid.replace(/-/g, ' '),
        type: 'unknown',
        href: '#',
        resolved: false,
      };
    }
    return {
      id: found.entity.id,
      name: found.entity.name,
      type: found.entity.type ?? 'entity',
      href: getEntityHref(locale, gameSlug, found.category.filename, found.entity.id),
      resolved: true,
    };
  });
}

// url builders. wiki only renders at the default locale today; if the
// site adds localised wikis later, these are the only call sites that
// need to switch on locale.
export function getWikiHubHref(locale: Locale, gameSlug: string): string {
  return getLocalePath(locale, `${gameSlug}/wiki`);
}

export function getCategoryHref(
  locale: Locale,
  gameSlug: string,
  categoryFilename: string,
): string {
  return getLocalePath(locale, `${gameSlug}/wiki/${categoryFilename}`);
}

export function getEntityHref(
  locale: Locale,
  gameSlug: string,
  categoryFilename: string,
  entityId: string,
): string {
  return getLocalePath(locale, `${gameSlug}/wiki/${categoryFilename}/${entityId}`);
}

// human-friendly label lookup. unknown categories fall back to a
// title-cased version of the type.
export function getCategoryLabel(category: string): { singular: string; plural: string } {
  const known = CATEGORY_LABELS[category];
  if (known) return known;
  const title = category.charAt(0).toUpperCase() + category.slice(1);
  return { singular: title, plural: title + 's' };
}

// status helpers — keeps "unpublished" a one-word check at call sites.
export function isUnpublished(entity: WikiEntity): boolean {
  return entity.status === 'unpublished';
}

// page title: "{GAME} {Category}: {Entity}"
export function getEntityPageTitle(gameName: string, entity: WikiEntity): string {
  const label = getCategoryLabel(entity.type ?? 'entity').singular;
  return `${gameName} ${label}: ${entity.name}`;
}

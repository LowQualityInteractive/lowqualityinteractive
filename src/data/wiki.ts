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
  filename: string;       // plural, e.g. "weapons" - drives the url
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

// short prose intro for each category, rendered above the entity list
// on category pages. without this, category pages were just card grids
// over a one-line "N items catalogued" lead - google flags those as
// thin template pages, which hurts indexing of the entities they
// surface. {game} is interpolated by the caller. voice tracks the rest
// of the site: lowercase, fragmented, no marketing nouns.
const CATEGORY_INTROS: Record<string, string> = {
  weapon:
    "every gun, melee, and piece of kit in {game}. what it is, what it does, when not to bring it.",
  enemy:
    "every Furry that shows up in {game}. some chase, some shoot, some explode when they die. read before you walk into one.",
  map:
    "every map in {game}. the layout, the modes that run on it, the corners that get people killed.",
  mode:
    "every mode in {game}. how long it runs, what you're trying to do, and what happens when you fail.",
  item:
    "pickups and inventory items in {game}. what they do, where they drop, whether they're worth picking up.",
  mechanic:
    "the systems that decide what happens in {game}. movement, fights, money, unlocks. read these before you wonder why you keep dying.",
  gamepass:
    "the gamepasses for {game}. what each one unlocks. some of them help. some of them are vibes.",
  progression:
    "how you earn things in {game}. cash, XP, unlocks, the stuff that comes back round to round.",
  territory:
    "the seven flags in {game}. one is yours at the start. the other six aren't. these are them.",
  vehicle:
    "everything in {game} you can drive, fly, or get run over by. some of them work.",
};

export function getCategoryIntro(category: string, gameName: string): string {
  const template = CATEGORY_INTROS[category];
  if (!template) return '';
  return template.replace(/\{game\}/g, gameName);
}

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
  // file -> category-key. naive `slice(-1)` fails on -ies and -sses
  // ("enemies" -> "enemie", "gamepasses" -> "gamepasse"), which makes
  // CATEGORY_LABELS / CATEGORY_INTROS misses and produces "every enemie
  // in <game>" in meta descriptions. handle the common english plural
  // patterns explicitly. order matters: -ies before -sses before -s.
  const filenameToCategory = (name: string): string => {
    if (name.endsWith('ies')) return name.slice(0, -3) + 'y';     // enemies -> enemy
    if (name.endsWith('sses')) return name.slice(0, -2);           // gamepasses -> gamepass
    if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
    return name;
  };
  const fallbackType = filenameToCategory(filename);

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

  // empty categories are still registered - the wiki button on the
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

// url builders. wiki renders at every supported locale via per-locale
// page wrappers under src/pages/<locale>/[slug]/wiki/...; getLocalePath
// produces the right prefix so call sites just pass the active locale.
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

// status helpers - keeps "unpublished" a one-word check at call sites.
export function isUnpublished(entity: WikiEntity): boolean {
  return entity.status === 'unpublished';
}

// page title: "{GAME} {Category}: {Entity}"
export function getEntityPageTitle(gameName: string, entity: WikiEntity): string {
  const label = getCategoryLabel(entity.type ?? 'entity').singular;
  return `${gameName} ${label}: ${entity.name}`;
}

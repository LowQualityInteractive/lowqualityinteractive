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

// Short consumer intro for each category. Keep this copy direct because
// it is also used in metadata. {game} is interpolated by the caller.
const CATEGORY_INTROS: Record<string, string> = {
  weapon:
    "Weapons in {game}. Each page shows the weapon slot and how to get the weapon.",
  enemy:
    "Enemies in {game}. Each page shows the threat and how to fight it.",
  map:
    "Maps in {game}. Each page shows the objectives and the main route.",
  mode:
    "Game modes in {game}. Each page shows the objective and the round time.",
  item:
    "Items in {game}. Each page shows what the item does and how to use it.",
  mechanic:
    "Game mechanics in {game}. Each page explains one rule or action.",
  gamepass:
    "Gamepasses for {game}. Each page shows what the gamepass unlocks.",
  progression:
    "Progression in {game}. These pages explain how to get cash, XP, and rewards.",
  territory:
    "Territories in {game}. The team starts at one territory and can capture six more territories.",
  vehicle:
    "Vehicles in {game}. Each page shows how to get the vehicle, its seats, and its weapons.",
};

const STAT_ALLOWLISTS: Record<string, ReadonlySet<string>> = {
  weapon: new Set(['slot', 'unlock', 'cash_required', 'xp_required']),
  enemy: new Set([
    'health',
    'walk_speed',
    'base_melee_damage',
    'ranged_damage',
    'ranged_attack_range_studs',
    'helper_damage',
  ]),
  gamepass: new Set(['price_robux', 'active_vehicle_limit', 'extra_ammunition_canisters']),
  item: new Set([
    'source',
    'consumed_on_use',
    'free_vehicle',
    'default_active_limit',
    'expanded_active_limit',
  ]),
  map: new Set(['territories', 'reclaimable_territories', 'base_territory', 'rush_objective']),
  mode: new Set(['round_duration', 'boss_enabled', 'rewards_enabled', 'objective']),
  territory: new Set(['flag', 'rush_objective']),
  vehicle: new Set([
    'source',
    'max_forward_speed',
    'max_backward_speed',
    'max_health',
    'driver_or_operator_seats',
    'passenger_seats',
    'weapons',
    'aircraft',
  ]),
};

const MECHANIC_STAT_ALLOWLISTS: Record<string, ReadonlySet<string>> = {
  'territory-capture': new Set([
    'one_defender_capture_time_seconds',
    'capture_cash_reward',
    'capture_xp_reward',
    'defense_interval_seconds',
    'defense_cash_reward',
    'defense_xp_reward',
  ]),
  deployment: new Set(['contested_spawn_allowed']),
  'boss-unlock': new Set(['required_reclaimable_territories', 'mode']),
  'boss-core': new Set(['base_core_health']),
  rallydrop: new Set(['default_active_vehicle_limit', 'expanded_active_vehicle_limit']),
  'vehicle-resupply': new Set([
    'resupply_cooldown_seconds',
    'instant_top_off',
    'repairs_to_max_health',
  ]),
};

const PROGRESSION_STATS_TO_HIDE = new Set([
  'rare_kill_cash_range',
  'rare_kill_xp_range',
  'rare_roll_chance_percent',
  'base_multiplier_chance_percent',
  'one_point_five_multiplier_chance_percent',
  'triple_multiplier_chance_percent',
  'contributor_share_scale',
  'daily_streak_bonus_per_day',
  'daily_max_multiplier',
  'plus_streak_bonus_per_day',
  'plus_max_multiplier',
  'activity_seconds',
  'qualification_delay_seconds',
]);

function getConsumerStats(item: WikiEntity, type: string): Record<string, string | number> | undefined {
  if (!item.stats) return undefined;

  const allowlist = type === 'mechanic' ? MECHANIC_STAT_ALLOWLISTS[slugify(item.id)] : STAT_ALLOWLISTS[type];
  const entries = Object.entries(item.stats).filter(([key]) => {
    if (type === 'progression') return !PROGRESSION_STATS_TO_HIDE.has(key);
    return allowlist?.has(key) ?? false;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function getConsumerSummary(item: WikiEntity, type: string): string {
  if (type !== 'weapon') return item.summary;

  const slot = String(item.stats?.slot ?? 'Weapon').toLowerCase();
  const weaponType = slot.endsWith('weapon') ? slot : `${slot} weapon`;
  const unlock = String(item.stats?.unlock ?? 'Unknown');
  if (unlock === 'Free') return `${item.name} is a free ${weaponType}.`;
  if (unlock === 'Cash and XP') return `${item.name} is a ${weaponType}. You can unlock it with cash and XP.`;
  if (unlock === 'Group reward') return `${item.name} is a ${weaponType} from the LQI group reward.`;
  if (unlock === 'Gamepass') return `${item.name} is a ${weaponType} from a gamepass.`;
  return `${item.name} is a ${weaponType}.`;
}

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
    .map((item) => {
      const type = item.type ?? fallbackType;
      const useConsumerCopy = game === 'eradication';
      return {
        ...item,
        id: slugify(item.id),
        type,
        summary: useConsumerCopy ? getConsumerSummary(item, type) : item.summary,
        role: useConsumerCopy && (type === 'weapon' || type === 'gamepass') ? undefined : item.role,
        stats: useConsumerCopy ? getConsumerStats(item, type) : item.stats,
        // The generated ERADICATION notes contained source-analysis and
        // implementation details. Do not publish them as player documentation.
        fun_facts: useConsumerCopy
          ? []
          : Array.isArray(item.fun_facts)
            ? item.fun_facts.filter((fact) => typeof fact === 'string')
            : [],
        // unlisted ids can't be linked, so dedupe early.
        related: Array.isArray(item.related) ? Array.from(new Set(item.related.map(slugify))) : [],
      };
    });

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

// shared static-paths builders. each locale's wiki page wrapper used
// to inline its own three-deep loop; centralise the shape here so
// adding a locale or changing the path schema only edits one place.
// outputs are computed once and frozen so all 10 page wrappers share
// the same array - astro happily re-uses it.

interface WikiCategoryParams {
  params: { slug: string; category: string };
  props: { slug: string; category: string };
}
interface WikiEntityParams {
  params: { slug: string; category: string; entity: string };
  props: { slug: string; category: string; entity: string };
}
interface WikiHubParams {
  params: { slug: string };
  props: { slug: string };
}

// Astro tracks getStaticPaths() output per route file and gets unhappy
// if multiple files return the *same* array reference - it associates
// the array with the first file it sees and the others end up missing
// paths. so we cache the underlying entries (which is the expensive
// part - walking the wiki registry) and return a fresh array wrapper
// per call. the per-entry objects are reused; only the outer array
// is allocated fresh.
let wikiHubEntries: WikiHubParams[] | null = null;
let wikiCategoryEntries: WikiCategoryParams[] | null = null;
let wikiEntityEntries: WikiEntityParams[] | null = null;

export function getWikiHubStaticPaths(): WikiHubParams[] {
  if (!wikiHubEntries) {
    wikiHubEntries = WIKI_GAME_SLUGS.map((slug) => ({
      params: { slug },
      props: { slug },
    }));
  }
  return wikiHubEntries.slice();
}

export function getWikiCategoryStaticPaths(): WikiCategoryParams[] {
  if (!wikiCategoryEntries) {
    const out: WikiCategoryParams[] = [];
    for (const slug of WIKI_GAME_SLUGS) {
      for (const cat of getWikiCategories(slug)) {
        out.push({
          params: { slug, category: cat.filename },
          props: { slug, category: cat.filename },
        });
      }
    }
    wikiCategoryEntries = out;
  }
  return wikiCategoryEntries.slice();
}

export function getWikiEntityStaticPaths(): WikiEntityParams[] {
  if (!wikiEntityEntries) {
    const out: WikiEntityParams[] = [];
    for (const slug of WIKI_GAME_SLUGS) {
      for (const cat of getWikiCategories(slug)) {
        for (const entity of cat.entities) {
          out.push({
            params: { slug, category: cat.filename, entity: entity.id },
            props: { slug, category: cat.filename, entity: entity.id },
          });
        }
      }
    }
    wikiEntityEntries = out;
  }
  return wikiEntityEntries.slice();
}

import { getMessages, getLocaleAbsolutePath, getLocalePath, type Locale } from '../i18n/messages';
import {
  SITE_LAST_MODIFIED,
  SITE_NAME,
  SITE_URL,
  SOCIAL_URLS,
  getSiteTitle,
  toAbsoluteSiteUrl,
} from './site';
import { getGameAbout, type GameAboutEntry } from './gameAbout';
import { getWikiCategory, hasWiki } from './wiki';

export type GameStatus = 'live' | 'preview' | 'in-development' | 'sunset';

export interface GameArtwork {
  alt: string;
  height: number;
  src: string;
  width: number;
}

// derives the webp sibling for a given image src. we generate webp
// variants of every card artwork at build time (see scripts/ +
// public/assets); files that don't have one fall back to the original.
// kept inline here so views can use it without importing from a fs path.
export function getWebpSrc(src: string): string | null {
  if (typeof src !== 'string') return null;
  const match = src.match(/^(.+)\.(png|jpg|jpeg)$/i);
  if (!match) return null;
  return `${match[1]}.webp`;
}

export interface Game {
  artwork: GameArtwork;
  description: string;
  genre: string[];
  genreLabel: string;
  id: string;
  name: string;
  pageDescription: string;
  pageLead: string;
  robloxUrl: string;
  slug: string;
  status: GameStatus;
  universeId: string;
  updateHash: string;
  updateImageAlt: string;
  updateTag: string;
}

interface GameBase {
  artwork: Omit<GameArtwork, 'alt'>;
  id: string;
  name: string;
  robloxUrl: string;
  slug: string;
  status: GameStatus;
  universeId: string;
  updateHash: string;
}

const GAME_CATALOG = [
  {
    id: 'eradication',
    slug: 'eradication',
    name: 'ERADICATION',
    status: 'live',
    universeId: '5788461409',
    artwork: {
      src: '/assets/eradication.png',
      width: 1600,
      height: 900,
    },
    robloxUrl: 'https://www.roblox.com/games/16844978752/ERADICATION',
    updateHash: 'eradication',
  },
  {
    id: 'favela-94',
    slug: 'favela-94',
    name: "Favela '94",
    status: 'preview',
    universeId: '',
    artwork: {
      src: '/assets/favela-94.png',
      width: 1600,
      height: 900,
    },
    robloxUrl: 'https://www.roblox.com/games/125235548670144/Favela-94',
    updateHash: 'favela-94',
  },
  {
    id: 'donpollo-obby',
    slug: 'donpollo-obby',
    name: 'DON POLLO OBBY',
    status: 'sunset',
    universeId: '7915083902',
    artwork: {
      src: '/assets/donpollo.png',
      width: 1600,
      height: 900,
    },
    robloxUrl: 'https://www.roblox.com/games/133585619009566/DON-POLLO-OBBY',
    updateHash: 'donpollo-obby',
  },
] as const satisfies readonly GameBase[];

// derive the published catalog once. publishedGameCount and slugs share
// the same filter so we don't walk the catalog twice at module init.
const PUBLISHED_GAMES = GAME_CATALOG.filter(
  (game) => (game.status as GameStatus) !== 'in-development',
);
export const publishedGameCount = PUBLISHED_GAMES.length;
export const publishedGameSlugs = PUBLISHED_GAMES.map((game) => game.slug);

// shared static-paths shape for game-about pages. each locale wrapper
// uses this so we don't rebuild the same array of {slug, slug} pairs
// in every wrapper file. astro associates a getStaticPaths() result
// with the file that owns it and gets confused if multiple files share
// the same array reference, so we cache the entries and return a fresh
// outer array on each call.
const GAME_ABOUT_PATH_ENTRIES = publishedGameSlugs.map((slug) => ({
  params: { slug },
  props: { slug },
}));
export function getGameAboutStaticPaths() {
  return GAME_ABOUT_PATH_ENTRIES.slice();
}

// getGames runs O(pages) times across a build. each call merges the
// translated catalog into the static GAME_CATALOG and allocates fresh
// Game objects. cache by locale: the merged messages are already cached
// upstream, so the same Game[] is the right answer for the same locale.
const gamesCache = new Map<Locale, Game[]>();

export function getGames(locale: Locale): Game[] {
  const hit = gamesCache.get(locale);
  if (hit !== undefined) return hit;

  const translatedGames = getMessages(locale).catalog.games;
  const out = GAME_CATALOG.map((game) => {
    const translation = translatedGames[game.id as keyof typeof translatedGames];
    return {
      ...game,
      ...translation,
      genreLabel: game.id === 'favela-94' ? 'FPS' : translation.genreLabel,
      artwork: {
        ...game.artwork,
        alt: translation.artworkAlt,
      },
    };
  });
  gamesCache.set(locale, out);
  return out;
}

// these filters were producing fresh arrays every call. since getGames
// is now stable per-locale, cache the filtered slices too.
const liveGamesCache = new Map<Locale, Game[]>();
const publishedGamesCache = new Map<Locale, Game[]>();

export function getLiveGames(locale: Locale): Game[] {
  const hit = liveGamesCache.get(locale);
  if (hit !== undefined) return hit;
  const out = getGames(locale).filter((game) => game.status === 'live' || game.status === 'preview');
  liveGamesCache.set(locale, out);
  return out;
}

export function getPublishedGames(locale: Locale): Game[] {
  const hit = publishedGamesCache.get(locale);
  if (hit !== undefined) return hit;
  const out = getGames(locale).filter((game) => game.status !== 'in-development');
  publishedGamesCache.set(locale, out);
  return out;
}

export function getGameBySlug(locale: Locale, slug: string) {
  return getGames(locale).find((game) => game.slug === slug);
}

export function getGameHref(locale: Locale, game: Pick<Game, 'slug'>) {
  return getLocalePath(locale, game.slug);
}

export function getGameUpdateHref(locale: Locale, game: Pick<Game, 'updateHash'>) {
  return `${getLocalePath(locale, 'updates')}#${game.updateHash}`;
}

// points back at the org node on the home graph. every other page just
// cites it by id instead of duplicating the whole thing.
const ORG_REF = { '@id': `${SITE_URL}/#organization` };

// breadcrumb labels are english on purpose. schema.org doesn't translate
// these, and keeping them stable gives crawlers one consistent chain.
const BREADCRUMB_LABELS = {
  home: 'Home',
  games: 'Games',
  updates: 'Updates',
  connect: 'Connect',
  'privacy-policy': 'Privacy Policy',
} as const;

interface BreadcrumbCrumb {
  // crawlers print this verbatim, no creative reformatting.
  name: string;
  // absolute url. schema.org will absolutely sulk if it's relative.
  url: string;
}

// builds the breadcrumb node. lives on every page graph so crawlers
// don't have to walk the nav themselves to figure out where they are.
function getBreadcrumbList(pageUrl: string, crumbs: BreadcrumbCrumb[]) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

// human-readable title descriptor per game. used in <title> as
// "<NAME> - <descriptor> - <studio>". picked per game (instead of
// derived from genreLabel) so titles match the canonical naming
// convention exactly: roblox as a platform keyword + the genre that
// people actually search for. falls back to genreLabel for any game
// without an explicit entry.
const GAME_TITLE_DESCRIPTORS: Record<string, string> = {
  eradication: 'PvPvE Roblox Shooter',
  'favela-94': 'Tactical Roblox Shooter',
  'donpollo-obby': 'Roblox Obby',
};

export function getGameTitleDescriptor(game: Pick<Game, 'id' | 'genreLabel'>): string {
  return GAME_TITLE_DESCRIPTORS[game.id] ?? game.genreLabel;
}

// per-game brand-search variants (read by crawlers as alternateName) and
// disambiguatingDescription strings. these only ever flow into json-ld
// (never visible copy) — schema.org's disambiguatingDescription field
// is built specifically for "we share a name with X, Y, Z" cases. the
// site copy stays confident; the schema does the disambiguation work.
const GAME_DISAMBIGUATION: Record<string, { alternateName: string[]; disambiguatingDescription: string }> = {
  eradication: {
    alternateName: [
      'ERADICATION Roblox',
      'ERADICATION by Low Quality Interactive',
      'ERADICATION LQI',
      'LQI ERADICATION',
    ],
    // disambiguation specifically targets the false-positive sources AI
    // engines cite when asked about "ERADICATION roblox" - confirmed
    // observed (Brave/Goggles, Nov 2026) confusing this game with
    // unrelated roblox items at adjacent names. each clause names the
    // specific other thing so extractors can route the query correctly
    // instead of merging entities.
    disambiguatingDescription:
      'ERADICATION is a team PvPvE territory shooter on Roblox. Low Quality Interactive developed the game. Its Roblox place ID is 16844978752, and its universe ID is 5788461409. ERADICATION is not the ERADICATOR sword in Criminality. It is not the Deletrius spell in Magic Training. It is not the Eradicator tower in Tower Defense X. It is also not the 2022 film named Eradication. These products have different developers. ERADICATION does not have an affiliated Fandom wiki. The site eradication.fandom.com, if it exists, is not about this game.',
  },
  'favela-94': {
    alternateName: [
      'Favela 94',
      "Favela '94 Roblox",
      "Favela '94 by Low Quality Interactive",
    ],
    disambiguatingDescription:
      "Favela '94 is a short-range tactical shooter on Roblox. Low Quality Interactive developed the game. The game takes place in Rio de Janeiro in 1994. It is in preview.",
  },
  'donpollo-obby': {
    alternateName: [
      'Don Pollo Obby',
      'DON POLLO OBBY Roblox',
    ],
    disambiguatingDescription:
      'DON POLLO OBBY is an obstacle course on Roblox. Low Quality Interactive developed the game. The game is in sunset status but remains available.',
  },
};

// caps per category so the json-ld stays under a reasonable size. the
// long tail still lives in the wiki, which has its own pages and json-ld
// graph. picked to cover the "what weapons / items does <game> have"
// question fully for any game we'd realistically ship - higher caps
// would just inflate the bundle without changing what extractors quote.
const GAME_ITEM_CAPS: Record<string, number> = {
  weapons: 24,
  items: 16,
  vehicles: 12,
  enemies: 12,
};

// build VideoGame.gameItem from wiki entities. real content from
// src/data/wiki/<slug>/*.json - never invented. summary is plain text
// so AI extractors can quote it verbatim. unpublished entities are
// skipped (they're placeholder rows in the wiki that shouldn't be
// promoted to schema).
function buildGameItems(gameSlug: string) {
  const out: { '@type': 'Thing'; name: string; description: string }[] = [];
  for (const [category, cap] of Object.entries(GAME_ITEM_CAPS)) {
    const cat = getWikiCategory(gameSlug, category);
    if (!cat) continue;
    const live = cat.entities.filter((e) => e.status !== 'unpublished');
    for (const entity of live.slice(0, cap)) {
      out.push({
        '@type': 'Thing',
        name: entity.name,
        description: entity.summary,
      });
    }
  }
  return out;
}

function getGameSchema(game: Game) {
  const disambig = GAME_DISAMBIGUATION[game.id];
  return {
    '@type': 'VideoGame',
    '@id': `${SITE_URL}/#${game.id}`,
    name: game.name,
    ...(disambig ? { alternateName: disambig.alternateName } : {}),
    ...(disambig ? { disambiguatingDescription: disambig.disambiguatingDescription } : {}),
    url: game.robloxUrl,
    image: toAbsoluteSiteUrl(game.artwork.src),
    description: game.description,
    gamePlatform: 'ROBLOX',
    genre: game.genre,
    creator: ORG_REF,
    dateModified: SITE_LAST_MODIFIED,
  };
}

export function getHomeJsonLd(locale: Locale) {
  const messages = getMessages(locale);
  const liveGames = getLiveGames(locale);
  const localizedHomeUrl = getLocaleAbsolutePath(locale);

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        // the org node lives here exactly once. every other page just
        // references it by id. sameAs lets crawlers cross-check us
        // against roblox/discord/x/youtube - proof of identity, basically.
        // alternateName covers brand variants users actually search for.
        // knowsAbout is a soft topical signal that helps llms answer
        // "what does <studio> work on" without scraping the games list.
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        alternateName: ['LQI', 'Low Quality Int'],
        url: `${SITE_URL}/`,
        logo: {
          '@type': 'ImageObject',
          url: toAbsoluteSiteUrl('/assets/logo.png'),
          width: 512,
          height: 512,
        },
        description: messages.meta.organizationDescription,
        foundingDate: '2024',
        areaServed: 'Worldwide',
        knowsAbout: [
          'Roblox game development',
          'PvPvE shooters',
          'tactical shooters',
          'Roblox obby',
        ],
        sameAs: [...SOCIAL_URLS, ...liveGames.map((game) => game.robloxUrl)],
      },
      {
        // website covers the whole property. no SearchAction here -
        // we don't have site search, and lying to crawlers about it
        // would only end in tears.
        '@type': 'WebSite',
        '@id': `${localizedHomeUrl}#website`,
        url: localizedHomeUrl,
        name: SITE_NAME,
        description: messages.meta.siteDescription,
        publisher: ORG_REF,
        inLanguage: locale,
      },
      ...liveGames.map(getGameSchema),
    ],
  });
}

export function getGamesJsonLd(locale: Locale) {
  const liveGames = getLiveGames(locale);
  const pageLabel = getMessages(locale).pages.games.label;
  const pageUrl = getLocaleAbsolutePath(locale, 'games');

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        // collectionpage tells llms this is a list, not just a page.
        // they tend to enumerate the members instead of summarising,
        // which is what we actually want here.
        '@type': 'CollectionPage',
        '@id': `${pageUrl}#webpage`,
        name: getSiteTitle(pageLabel),
        url: pageUrl,
        inLanguage: locale,
        isPartOf: { '@id': `${getLocaleAbsolutePath(locale)}#website` },
        dateModified: SITE_LAST_MODIFIED,
      },
      {
        '@type': 'ItemList',
        '@id': `${pageUrl}#itemlist`,
        name: `${SITE_NAME} ${pageLabel}`,
        itemListElement: liveGames.map((game, index) => ({
          '@type': 'VideoGame',
          position: index + 1,
          name: game.name,
          url: game.robloxUrl,
          genre: game.genre,
          publisher: { '@type': 'Organization', name: SITE_NAME },
        })),
      },
      getBreadcrumbList(pageUrl, [
        { name: BREADCRUMB_LABELS.home, url: getLocaleAbsolutePath(locale) },
        { name: BREADCRUMB_LABELS.games, url: pageUrl },
      ]),
    ],
  });
}

export function getGameJsonLd(locale: Locale, game: Game) {
  const localizedGameUrl = getLocaleAbsolutePath(locale, game.slug);
  const gamesIndexUrl = getLocaleAbsolutePath(locale, 'games');

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${localizedGameUrl}#webpage`,
        name: getSiteTitle(game.name),
        url: localizedGameUrl,
        description: game.pageDescription,
        inLanguage: locale,
        dateModified: SITE_LAST_MODIFIED,
      },
      {
        ...getGameSchema(game),
        description: game.pageLead,
        publisher: { '@type': 'Organization', name: SITE_NAME },
      },
      getBreadcrumbList(localizedGameUrl, [
        { name: BREADCRUMB_LABELS.home, url: getLocaleAbsolutePath(locale) },
        { name: BREADCRUMB_LABELS.games, url: gamesIndexUrl },
        { name: game.name, url: localizedGameUrl },
      ]),
    ],
  });
}

// game pages live at /<slug> directly now - no /about subpath, no
// redirect. kept as an alias of getGameHref so any caller that used to
// say "give me the about page" still gets the right url.
export function getGameAboutPath(locale: Locale, game: Pick<Game, 'slug'>) {
  return getGameHref(locale, game);
}

// game-page faqs derived from the existing game data. used twice: once
// to render the visible <details>/<summary> block on the page, once to
// emit FAQPage json-ld. shared so the visible answers and the schema
// answers can never disagree (which is what would make google demote
// the rich result).
export interface GameFaq {
  q: string;
  a: string;
}

// faq strings live in i18n now. en.json holds the english source; the
// translate-locales.mjs script populates each non-en locale.
// per-game faqWhatIs / faqHowToPlay are stored under catalog.games.<id>
// and override the generic templates. faqHowToPlay is optional.
//
// the {game} placeholder gets replaced with game.name verbatim - we
// don't translate the brand, ever.
type FaqMessages = ReturnType<typeof getMessages>['pages']['game']['faq'];
type GameCatalogEntry = ReturnType<typeof getMessages>['catalog']['games'][keyof ReturnType<typeof getMessages>['catalog']['games']];

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
}

export function getGameFaqs(
  locale: Locale,
  game: Game,
  about: GameAboutEntry = getGameAbout(game.id),
): GameFaq[] {
  const messages = getMessages(locale);
  const faq: FaqMessages = messages.pages.game.faq;
  const catalog = messages.catalog.games[game.id as keyof typeof messages.catalog.games] as GameCatalogEntry & { faqWhatIs?: string; faqHowToPlay?: string };
  const bodyText = about.body.join(' ').trim();

  const statusAnswer = fillTemplate(
    about.status === 'sunset' ? faq.aStatusSunset
      : about.status === 'preview' ? faq.aStatusPreview
        : faq.aStatusLive,
    { game: game.name },
  );
  const playerAnswer = about.numberOfPlayers
    ? fillTemplate(faq.aPlayersCount, { game: game.name, n: about.numberOfPlayers })
    : fillTemplate(faq.aPlayersGeneric, { game: game.name });

  const whatIs =
    catalog.faqWhatIs
    || bodyText
    || game.pageLead
    || `${game.name} is a ${game.genreLabel.toLowerCase()} on Roblox by ${SITE_NAME}.`;
  const howToPlay = catalog.faqHowToPlay;

  const faqs: GameFaq[] = [
    { q: fillTemplate(faq.qWhatIs, { game: game.name }), a: whatIs },
    {
      q: fillTemplate(faq.qFree, { game: game.name }),
      a: fillTemplate(faq.aFree, { game: game.name }),
    },
    {
      q: fillTemplate(faq.qPlatforms, { game: game.name }),
      a: fillTemplate(faq.aPlatforms, { game: game.name }),
    },
  ];
  if (howToPlay) {
    faqs.push({ q: fillTemplate(faq.qHowToPlay, { game: game.name }), a: howToPlay });
  }
  faqs.push(
    {
      q: fillTemplate(faq.qWhoMade, { game: game.name }),
      a: fillTemplate(faq.aWhoMade, { game: game.name }),
    },
    {
      q: fillTemplate(faq.qPlayers, { game: game.name }),
      a: playerAnswer,
    },
    {
      q: fillTemplate(faq.qUpdates, { game: game.name }),
      a: statusAnswer,
    },
  );
  return faqs;
}

export function getGameAboutJsonLd(
  locale: Locale,
  game: Game,
  about: GameAboutEntry = getGameAbout(game.id),
  // optional faqs override - the page view also renders these so we let
  // it pass the array in to avoid recomputing the same template fills
  // and message lookups twice per render.
  faqs?: GameFaq[],
) {
  // /<slug> is now the only page for the game (no separate /about), so
  // the "about" url and the "game" url are the same - but the function
  // still exposes both names so the schema graph below stays readable.
  const localizedGameUrl = getLocaleAbsolutePath(locale, game.slug);
  const localizedAboutUrl = localizedGameUrl;
  const gamesIndexUrl = getLocaleAbsolutePath(locale, 'games');
  const canonicalAboutUrl = `${SITE_URL}/${game.slug}/`;

  const bodyText = about.body.join(' ').trim();
  const featuresText = about.features.join(', ').trim();
  const playOnRoblox = about.links.find(
    (link) => link.external && /^https:\/\/(?:www\.)?roblox\.com\//i.test(link.href),
  )?.href;

  // sameAs ties this game to its roblox listing so crawlers know they're
  // looking at the same thing under two urls.
  const sameAs = [playOnRoblox, ...SOCIAL_URLS.filter((u) => /roblox\.com/i.test(u))].filter(
    (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
  );

  // every image on the page, not just the hero. multimodal llms get to
  // pick whichever one fits the question they were asked.
  const imageUrls = about.media
    .map((m) => toAbsoluteSiteUrl(m.src))
    .filter((u, i, arr) => arr.indexOf(u) === i);
  const allImages = imageUrls.length
    ? imageUrls
    : [toAbsoluteSiteUrl(game.artwork.src)];

  // pull weapons + items from the wiki into VideoGame.gameItem when the
  // game has a wiki. real content (no fabrication), gives AI extractors
  // a structured handle on "what weapons does <game> have" without them
  // having to guess from prose. capped per category so the json-ld
  // doesn't balloon - the wiki is still the source of truth for the
  // long tail.
  const gameItems = hasWiki(game.slug) ? buildGameItems(game.slug) : [];

  const videoGame = {
    ...getGameSchema(game),
    publisher: { '@type': 'Organization', name: SITE_NAME },
    mainEntityOfPage: { '@id': `${localizedAboutUrl}#webpage` },
    // explicit name so crawlers don't guess capitalisation from the slug.
    name: game.name,
    // locale-agnostic canonical. gives llms one url to cite.
    url: canonicalAboutUrl,
    // helps with queries like "co-op roblox shooters".
    playMode: about.playMode ?? 'MultiPlayer',
    // bing/chatgpt search use this to classify beyond just videogame.
    applicationCategory: about.applicationCategory ?? 'Game',
    // restated in case a crawler ignores the inherited value.
    gamePlatform: about.gamePlatform ?? 'ROBLOX',
    // ties the game to the studio so crawlers can group lqi titles
    // together when someone asks "what else have they made".
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
    // full image list - multimodal llms pick whichever one is relevant.
    image: allImages,
    // the prose body. richest signal for summaries.
    description: bodyText || game.pageLead,
    // bullet points llms lift verbatim for "what features does x have".
    ...(featuresText ? { featureList: featuresText } : {}),
    // wiki entities promoted into schema. AI extractors get a structured
    // list of weapons/items/vehicles/enemies they can quote directly
    // instead of guessing from prose.
    ...(gameItems.length ? { gameItem: gameItems } : {}),
    // release year as iso string.
    ...(about.releaseYear ? { datePublished: about.releaseYear } : {}),
    // min-max string. easier for llms to read than the QuantitativeValue
    // shape, which is structurally correct but vibes-incorrect.
    ...(about.numberOfPlayers ? { numberOfPlayers: about.numberOfPlayers } : {}),
    // the game itself is english. the page might be localized.
    inLanguage: about.inLanguage ?? 'en',
    // age suitability so llms don't suggest us in family contexts.
    ...(about.audience ? { audience: { '@type': 'Audience', suggestedMinAge: about.audience } } : {}),
    // roblox ids - the only way to disambiguate us from the clones.
    ...(about.robloxGameId
      ? {
        identifier: [
          { '@type': 'PropertyValue', propertyID: 'robloxPlaceId', value: about.robloxGameId },
          ...(about.robloxUniverseId
            ? [{ '@type': 'PropertyValue', propertyID: 'robloxUniverseId', value: about.robloxUniverseId }]
            : []),
        ],
      }
      : {}),
    // roblox is the runtime. app-store-style crawlers like having this set.
    operatingSystem: 'Roblox',
    // entry price is zero on every roblox title we ship. llms use this
    // when someone asks "is x free".
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: about.status === 'sunset' ? 'https://schema.org/Discontinued' : 'https://schema.org/InStock',
    },
    ...(sameAs.length ? { sameAs } : {}),
  };

  // FAQPage covers the questions LLMs and "people also ask" search
  // surfaces grab most readily for a roblox title. shared with the
  // visible faq block on the page so the schema answers always match
  // what the user can see (google demotes the rich result otherwise).
  const resolvedFaqs = faqs ?? getGameFaqs(locale, game, about);
  const faqPage = {
    '@type': 'FAQPage',
    '@id': `${localizedAboutUrl}#faq`,
    mainEntity: resolvedFaqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${localizedAboutUrl}#webpage`,
        name: getSiteTitle(game.name),
        url: localizedAboutUrl,
        description: game.pageDescription,
        inLanguage: locale,
        about: { '@id': `${SITE_URL}/#${game.id}` },
        dateModified: SITE_LAST_MODIFIED,
      },
      videoGame,
      faqPage,
      // breadcrumb is just home → games → <game> now. there's no longer
      // a separate "About" leaf to add; the slug page IS the about page.
      getBreadcrumbList(localizedAboutUrl, [
        { name: BREADCRUMB_LABELS.home, url: getLocaleAbsolutePath(locale) },
        { name: BREADCRUMB_LABELS.games, url: gamesIndexUrl },
        { name: game.name, url: localizedGameUrl },
      ]),
    ],
  });
}

// fallback json-ld builder for pages that aren't really an entity:
// blogs, connect, privacy, etc. without this they show up as plain
// html to schema-aware crawlers, which is a missed opportunity.
interface SectionPageOptions {
  description: string;
  inLanguage: Locale;
  pageType: 'WebPage' | 'ContactPage' | 'CollectionPage';
  pageUrl: string;
  routeKey: keyof typeof BREADCRUMB_LABELS;
  title: string;
}

function getSectionJsonLd({ description, inLanguage, pageType, pageUrl, routeKey, title }: SectionPageOptions) {
  const homeUrl = getLocaleAbsolutePath(inLanguage);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': pageType,
        '@id': `${pageUrl}#webpage`,
        name: title,
        url: pageUrl,
        description,
        inLanguage,
        isPartOf: { '@id': `${homeUrl}#website` },
        publisher: ORG_REF,
        dateModified: SITE_LAST_MODIFIED,
      },
      getBreadcrumbList(pageUrl, [
        { name: BREADCRUMB_LABELS.home, url: homeUrl },
        { name: BREADCRUMB_LABELS[routeKey], url: pageUrl },
      ]),
    ],
  });
}

export function getBlogsJsonLd(locale: Locale) {
  const messages = getMessages(locale);
  const pageUrl = getLocaleAbsolutePath(locale, 'updates');
  return getSectionJsonLd({
    description: messages.pages.blogs.description,
    inLanguage: locale,
    pageType: 'CollectionPage',
    pageUrl,
    routeKey: 'updates',
    title: getSiteTitle(messages.pages.blogs.label),
  });
}

export function getConnectJsonLd(locale: Locale) {
  const messages = getMessages(locale);
  const pageUrl = getLocaleAbsolutePath(locale, 'connect');
  return getSectionJsonLd({
    description: messages.pages.connect.description,
    inLanguage: locale,
    pageType: 'ContactPage',
    pageUrl,
    routeKey: 'connect',
    title: getSiteTitle(messages.pages.connect.label),
  });
}

export function getPrivacyPolicyJsonLd(locale: Locale) {
  const messages = getMessages(locale);
  const pageUrl = getLocaleAbsolutePath(locale, 'privacy-policy');
  return getSectionJsonLd({
    description: messages.pages.privacyPolicy.description,
    inLanguage: locale,
    pageType: 'WebPage',
    pageUrl,
    routeKey: 'privacy-policy',
    title: getSiteTitle(messages.pages.privacyPolicy.label),
  });
}

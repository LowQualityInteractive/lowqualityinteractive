import { getMessages, getLocaleAbsolutePath, getLocalePath, type Locale } from '../i18n/messages';
import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_URLS,
  getSiteTitle,
  toAbsoluteSiteUrl,
} from './site';
import { getGameAbout, type GameAboutEntry } from './gameAbout';

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

export const publishedGameCount = GAME_CATALOG.filter(
  (game) => (game.status as GameStatus) !== 'in-development',
).length;
export const publishedGameSlugs = GAME_CATALOG.filter((game) => (game.status as GameStatus) !== 'in-development').map(
  (game) => game.slug,
);

export function getGames(locale: Locale): Game[] {
  const translatedGames = getMessages(locale).catalog.games;

  return GAME_CATALOG.map((game) => {
    const translation = translatedGames[game.id as keyof typeof translatedGames];

    return {
      ...game,
      ...translation,
      artwork: {
        ...game.artwork,
        alt: translation.artworkAlt,
      },
    };
  });
}

export function getLiveGames(locale: Locale) {
  return getGames(locale).filter((game) => game.status === 'live' || game.status === 'preview');
}

export function getPublishedGames(locale: Locale) {
  return getGames(locale).filter((game) => game.status !== 'in-development');
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
    disambiguatingDescription:
      'A team-based PvPvE territory-control shooter on Roblox by independent studio Low Quality Interactive (founded 2024). Distinct from the Eradicator tower in Tower Defense X and from the 2022 film of the same name.',
  },
  'favela-94': {
    alternateName: [
      'Favela 94',
      "Favela '94 Roblox",
      "Favela '94 by Low Quality Interactive",
    ],
    disambiguatingDescription:
      "Close-quarters tactical Roblox shooter by Low Quality Interactive set in the favelas of 1994 Rio de Janeiro. Currently in preview.",
  },
  'donpollo-obby': {
    alternateName: [
      'Don Pollo Obby',
      'DON POLLO OBBY Roblox',
    ],
    disambiguatingDescription:
      'Roblox obby by independent studio Low Quality Interactive. Sunset status, kept playable as a low quality classic.',
  },
};

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
    gamePlatform: 'Roblox',
    genre: game.genre,
    creator: ORG_REF,
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

// per-game custom answers for the "what is" question. fall back to the
// page body or generic genre line when a game has no entry. answers
// are written for real player intent (play loop, factions, modes) and
// deliberately do not mention competing brands - per the strategy doc,
// disambiguation lives in json-ld disambiguatingDescription, not here.
const GAME_WHAT_IS_OVERRIDES: Record<string, string> = {
  eradication:
    "ERADICATION is a team shooter on Roblox. you play a contractor. the town's overrun by Furries. you take it back.",
  'favela-94':
    "Favela '94 is a Roblox tactical shooter set in 1994 Rio. close-quarters, short rounds. preview.",
  'donpollo-obby':
    'DON POLLO OBBY is a Roblox obby. sunset. still playable. another low quality classic.',
};

// per-game custom "how does it play" answer. only emitted when set;
// defaults to omitting the question for games where the play loop is
// already covered elsewhere.
const GAME_HOW_TO_PLAY: Record<string, string> = {
  eradication:
    "two teams. seven flags. take six of them off the Furries and a tunnel opens up under the town. don't stand on a Pimple when it dies.",
  'favela-94':
    "alleys, rooftops, short fights. pick a loadout. don't peek the same angle twice.",
};

export function getGameFaqs(game: Game, about: GameAboutEntry = getGameAbout(game.id)): GameFaq[] {
  const bodyText = about.body.join(' ').trim();
  const statusAnswer =
    about.status === 'sunset'
      ? `${game.name} is sunset, playable, but no longer in active development.`
      : about.status === 'preview'
        ? `${game.name} is currently in preview. The game is playable on Roblox while we iterate on it.`
        : `${game.name} is live on Roblox and in active development. Patch notes and devlogs are posted on the Updates page.`;
  const playerAnswer = about.numberOfPlayers
    ? `${game.name} supports ${about.numberOfPlayers} players per session.`
    : `${game.name} is a ${about.playMode === 'SinglePlayer' ? 'single-player' : 'multiplayer'} experience on Roblox.`;
  const whatIs =
    GAME_WHAT_IS_OVERRIDES[game.id]
    || bodyText
    || game.pageLead
    || `${game.name} is a ${game.genreLabel.toLowerCase()} on Roblox by ${SITE_NAME}.`;
  const howToPlay = GAME_HOW_TO_PLAY[game.id];
  const faqs: GameFaq[] = [
    { q: `What is ${game.name}?`, a: whatIs },
    {
      q: `Is ${game.name} free to play?`,
      a: `Yes. ${game.name} is free to play on Roblox. Optional gamepasses may be available in-game.`,
    },
    {
      q: `What platforms does ${game.name} run on?`,
      a: `${game.name} runs on every Roblox-supported platform: PC (Windows, macOS), mobile (iOS, Android), and Xbox.`,
    },
  ];
  if (howToPlay) {
    faqs.push({ q: `How does ${game.name} play?`, a: howToPlay });
  }
  faqs.push(
    {
      q: `Who made ${game.name}?`,
      a: `${game.name} is developed and published by ${SITE_NAME}.`,
    },
    {
      q: `How many players can play ${game.name} at once?`,
      a: playerAnswer,
    },
    {
      q: `Is ${game.name} still being updated?`,
      a: statusAnswer,
    },
  );
  return faqs;
}

export function getGameAboutJsonLd(locale: Locale, game: Game, about: GameAboutEntry = getGameAbout(game.id)) {
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
    gamePlatform: about.gamePlatform ?? 'Roblox',
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
  const faqs = getGameFaqs(game, about);
  const faqPage = {
    '@type': 'FAQPage',
    '@id': `${localizedAboutUrl}#faq`,
    mainEntity: faqs.map((f) => ({
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

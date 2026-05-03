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
  return `${getLocalePath(locale, 'blogs')}#${game.updateHash}`;
}

// Reusable @id reference back to the canonical Organization node defined on the
// home page graph. Every non-home graph cites the Organization by @id rather
// than duplicating the full entity, so crawlers see one Organization across the
// whole site and correctly link studio facts.
const ORG_REF = { '@id': `${SITE_URL}/#organization` };

// Mapping from internal route key to the canonical breadcrumb label. Labels are
// English on purpose: schema.org BreadcrumbList values are not translated, and
// keeping them locale-stable means LLM crawlers see the same crumb chain
// regardless of which locale variant they fetched.
const BREADCRUMB_LABELS = {
  home: 'Home',
  games: 'Games',
  blogs: 'Updates',
  connect: 'Connect',
  status: 'Status',
  'privacy-policy': 'Privacy Policy',
} as const;

interface BreadcrumbCrumb {
  // Display name for the crumb. Crawlers surface this verbatim.
  name: string;
  // Absolute URL for the breadcrumb step. Required by schema.org so search
  // tools and LLM browsing agents can follow the chain back to the root.
  url: string;
}

// Builds a BreadcrumbList node. Added to every page's @graph so crawlers
// reconstruct the site hierarchy without having to traverse the navigation.
// LLMs use this to determine "where am I in this site" when summarising.
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

function getGameSchema(game: Game) {
  return {
    '@type': 'VideoGame',
    '@id': `${SITE_URL}/#${game.id}`,
    name: game.name,
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
        // Organization is the canonical studio node. Defined once here on the
        // home graph; every other page references it by @id. sameAs lists
        // authoritative external profiles so LLMs can cross-verify the studio
        // identity with Roblox, Discord, X, YouTube, and the live-game listings.
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: toAbsoluteSiteUrl('/assets/logo.png'),
        description: messages.meta.organizationDescription,
        foundingDate: '2024',
        areaServed: 'Worldwide',
        sameAs: [...SOCIAL_URLS, ...liveGames.map((game) => game.robloxUrl)],
      },
      {
        // WebSite represents the entire lowqualityinteractive.com property.
        // No SearchAction is included because the site has no on-site search;
        // adding a stub action would mislead crawlers that surface search UIs.
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
        // CollectionPage frames the games index as a curated catalog rather
        // than a generic web page. LLMs treat CollectionPage as a list-style
        // resource and tend to enumerate its members faithfully.
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

export function getGameAboutPath(locale: Locale, game: Pick<Game, 'slug'>) {
  return getLocalePath(locale, `${game.slug}/about`);
}

export function getGameAboutJsonLd(locale: Locale, game: Game, about: GameAboutEntry = getGameAbout(game.id)) {
  const localizedAboutUrl = getLocaleAbsolutePath(locale, `${game.slug}/about`);
  const localizedGameUrl = getLocaleAbsolutePath(locale, game.slug);
  const gamesIndexUrl = getLocaleAbsolutePath(locale, 'games');
  const canonicalAboutUrl = `${SITE_URL}/${game.slug}/about`;

  const bodyText = about.body.join(' ').trim();
  const featuresText = about.features.join(', ').trim();
  const playOnRoblox = about.links.find(
    (link) => link.external && /^https:\/\/(?:www\.)?roblox\.com\//i.test(link.href),
  )?.href;

  // sameAs lists authoritative external profiles for this entity. Helps LLM
  // crawlers reconcile this VideoGame with its Roblox listing.
  const sameAs = [playOnRoblox, ...SOCIAL_URLS.filter((u) => /roblox\.com/i.test(u))].filter(
    (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
  );

  // image: every image referenced in the about page, not just the hero. LLMs
  // increasingly use schema image lists to surface gallery results.
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
    // name: explicit display title so crawlers index the canonical brand
    // capitalisation rather than guessing from the URL slug.
    name: game.name,
    // url: locale-agnostic canonical for the about page, gives LLMs a single
    // stable URL to cite regardless of which translation they crawled.
    url: canonicalAboutUrl,
    // playMode: distinguishes multiplayer titles in answers like
    // "co-op Roblox shooters", which are common LLM query intents.
    playMode: about.playMode ?? 'MultiPlayer',
    // applicationCategory: lets general application-aware crawlers
    // (Bing, ChatGPT search) classify the entity beyond just VideoGame.
    applicationCategory: about.applicationCategory ?? 'Game',
    // gamePlatform: redundantly stated so the field survives even if a
    // crawler ignores the inherited value from getGameSchema.
    gamePlatform: about.gamePlatform ?? 'Roblox',
    // author: ties the game back to the studio entity, so crawlers can
    // attribute the work and surface other LQI titles together.
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
    // image: full set of in-page images so multimodal LLMs can pick the
    // most relevant one for visual answers.
    image: allImages,
    // description: full prose body from the about page, the richest semantic
    // signal an LLM can use to summarise the game in its own words.
    description: bodyText || game.pageLead,
    // featureList: concrete bullet points that LLMs lift verbatim when
    // asked "what features does X have", reducing hallucination.
    ...(featuresText ? { featureList: featuresText } : {}),
    // datePublished: a stable signal LLMs use when ranking by recency or
    // when the user asks "when was X released". Stored as ISO year string.
    ...(about.releaseYear ? { datePublished: about.releaseYear } : {}),
    // numberOfPlayers: schema.org QuantitativeValue-ish range. Encoded as a
    // simple "min-max" string for LLM legibility; structured consumers can
    // still parse it.
    ...(about.numberOfPlayers ? { numberOfPlayers: about.numberOfPlayers } : {}),
    // inLanguage: useful when the catalog ships translated game pages. The
    // game itself is English; the page may be served localized.
    inLanguage: about.inLanguage ?? 'en',
    // audience: rough age suitability so LLMs can avoid suggesting age-
    // inappropriate titles in family contexts.
    ...(about.audience ? { audience: { '@type': 'Audience', suggestedMinAge: about.audience } } : {}),
    // identifier: stable Roblox numeric IDs — the most precise way an LLM
    // can disambiguate this title from clones or fan re-uploads.
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
    // operatingSystem: Roblox is itself a runtime; declaring it lets app-store
    // crawlers index the title under the Roblox platform bucket.
    operatingSystem: 'Roblox',
    // offers: price info. Roblox titles are free to enter; some have in-game
    // purchases but the entry price is zero. LLMs answering "is X free?" use
    // this directly.
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: about.status === 'sunset' ? 'https://schema.org/Discontinued' : 'https://schema.org/InStock',
    },
    ...(sameAs.length ? { sameAs } : {}),
  };

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${localizedAboutUrl}#webpage`,
        name: getSiteTitle(`About ${game.name}`),
        url: localizedAboutUrl,
        description: game.pageDescription,
        inLanguage: locale,
        isPartOf: { '@id': `${localizedGameUrl}#webpage` },
        about: { '@id': `${SITE_URL}/#${game.id}` },
      },
      videoGame,
      getBreadcrumbList(localizedAboutUrl, [
        { name: BREADCRUMB_LABELS.home, url: getLocaleAbsolutePath(locale) },
        { name: BREADCRUMB_LABELS.games, url: gamesIndexUrl },
        { name: game.name, url: localizedGameUrl },
        { name: 'About', url: localizedAboutUrl },
      ]),
    ],
  });
}

// Generic page JSON-LD builder for sections that have no entity-rich content
// of their own (Blogs index, Connect, Status, Privacy Policy). Emits a
// WebPage / ContactPage / etc. node plus a BreadcrumbList so every URL on the
// site exposes a structured-data block. Without this, those sections were
// invisible to schema-aware crawlers — they'd only see HTML.
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
  const pageUrl = getLocaleAbsolutePath(locale, 'blogs');
  return getSectionJsonLd({
    description: messages.pages.blogs.description,
    inLanguage: locale,
    pageType: 'CollectionPage',
    pageUrl,
    routeKey: 'blogs',
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

export function getStatusJsonLd(locale: Locale) {
  const messages = getMessages(locale);
  const pageUrl = getLocaleAbsolutePath(locale, 'status');
  return getSectionJsonLd({
    description: messages.pages.status.description,
    inLanguage: locale,
    pageType: 'WebPage',
    pageUrl,
    routeKey: 'status',
    title: getSiteTitle(messages.pages.status.label),
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

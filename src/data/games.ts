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

// points back at the org node on the home graph
// every other page cites it by id instead of duplicating the whole thing
const ORG_REF = { '@id': `${SITE_URL}/#organization` };

// breadcrumb labels are english on purpose
// schema.org doesnt translate these and keeping them stable gives crawlers one chain
const BREADCRUMB_LABELS = {
  home: 'Home',
  games: 'Games',
  blogs: 'Updates',
  connect: 'Connect',
  status: 'Status',
  'privacy-policy': 'Privacy Policy',
} as const;

interface BreadcrumbCrumb {
  // crawlers print this verbatim
  name: string;
  // absolute url, schema.org requires it
  url: string;
}

// builds the breadcrumb node
// goes on every page graph so crawlers dont have to walk the nav
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
        // the org node lives here once
        // every other page just references it by id
        // sameAs is so crawlers can cross-check us against roblox/discord/x/yt
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
        // WebSite covers the whole property
        // no SearchAction because we dont have site search
        // a fake one would just mislead crawlers
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
        // CollectionPage tells llms this is a list, not just a page
        // they tend to enumerate the members instead of summarising
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

  // sameAs ties this game to its roblox listing for crawlers
  const sameAs = [playOnRoblox, ...SOCIAL_URLS.filter((u) => /roblox\.com/i.test(u))].filter(
    (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i,
  );

  // every image on the page, not just the hero
  // multimodal llms pick from the list
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
    // explicit name so crawlers dont guess capitalisation from the slug
    name: game.name,
    // locale-agnostic canonical, gives llms one url to cite
    url: canonicalAboutUrl,
    // helps with queries like "co-op roblox shooters"
    playMode: about.playMode ?? 'MultiPlayer',
    // bing/chatgpt search use this to classify beyond just VideoGame
    applicationCategory: about.applicationCategory ?? 'Game',
    // restated in case a crawler ignores the inherited value
    gamePlatform: about.gamePlatform ?? 'Roblox',
    // ties the game to the studio so crawlers can group lqi titles
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
    // full image list, multimodal llms pick whatever fits
    image: allImages,
    // the prose body, richest signal for summaries
    description: bodyText || game.pageLead,
    // bullet points llms lift verbatim for "what features does x have"
    ...(featuresText ? { featureList: featuresText } : {}),
    // release year as iso string
    ...(about.releaseYear ? { datePublished: about.releaseYear } : {}),
    // min-max string, easier for llms to read than the QuantitativeValue shape
    ...(about.numberOfPlayers ? { numberOfPlayers: about.numberOfPlayers } : {}),
    // game itself is english, page may be localized
    inLanguage: about.inLanguage ?? 'en',
    // age suitability so llms dont suggest us in family contexts
    ...(about.audience ? { audience: { '@type': 'Audience', suggestedMinAge: about.audience } } : {}),
    // roblox ids, the only way to disambiguate from clones
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
    // roblox is the runtime, app-store crawlers like having this set
    operatingSystem: 'Roblox',
    // entry price is zero on every roblox title we ship
    // llms use this for "is x free"
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

// fallback json-ld builder for pages that arent really an entity
// blogs, connect, status, privacy, etc
// without this they show up as plain html to schema-aware crawlers
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

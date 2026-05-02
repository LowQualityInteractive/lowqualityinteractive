import { getMessages, getLocaleAbsolutePath, getLocalePath, type Locale } from '../i18n/messages';
import {
  SITE_NAME,
  SITE_URL,
  SOCIAL_URLS,
  getSiteTitle,
  toAbsoluteSiteUrl,
} from './site';

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
    creator: { '@id': `${SITE_URL}/#organization` },
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
        '@type': 'WebSite',
        '@id': `${localizedHomeUrl}#website`,
        url: localizedHomeUrl,
        name: SITE_NAME,
        description: messages.meta.siteDescription,
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: locale,
      },
      ...liveGames.map(getGameSchema),
    ],
  });
}

export function getGamesJsonLd(locale: Locale) {
  const liveGames = getLiveGames(locale);
  const pageLabel = getMessages(locale).pages.games.label;

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${SITE_NAME} ${pageLabel}`,
    itemListElement: liveGames.map((game, index) => ({
      '@type': 'VideoGame',
      position: index + 1,
      name: game.name,
      url: game.robloxUrl,
      genre: game.genre,
      publisher: { '@type': 'Organization', name: SITE_NAME },
    })),
  });
}

export function getGameJsonLd(locale: Locale, game: Game) {
  const localizedGameUrl = getLocaleAbsolutePath(locale, game.slug);

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
    ],
  });
}

export function getGameAboutPath(locale: Locale, game: Pick<Game, 'slug'>) {
  return getLocalePath(locale, `${game.slug}/about`);
}

export function getGameAboutJsonLd(locale: Locale, game: Game) {
  const localizedAboutUrl = getLocaleAbsolutePath(locale, `${game.slug}/about`);
  const localizedGameUrl = getLocaleAbsolutePath(locale, game.slug);

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
      {
        ...getGameSchema(game),
        description: game.pageLead,
        publisher: { '@type': 'Organization', name: SITE_NAME },
        mainEntityOfPage: { '@id': `${localizedAboutUrl}#webpage` },
      },
    ],
  });
}

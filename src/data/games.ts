import {
  ORGANIZATION_DESCRIPTION,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SOCIAL_LINKS,
  toAbsoluteSiteUrl,
} from './site';

export type GameStatus = 'live' | 'in-development';

export interface GameArtwork {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface Game {
  id: string;
  slug: string;
  name: string;
  status: GameStatus;
  genreLabel: string;
  genre: string[];
  description: string;
  pageDescription: string;
  pageLead: string;
  artwork: GameArtwork;
  robloxUrl: string;
  updateHash: string;
}

export const games = [
  {
    id: 'eradication',
    slug: 'eradication',
    name: 'ERADICATION',
    status: 'live',
    genreLabel: 'PvE Shooter',
    genre: ['Shooter', 'Multiplayer', 'PvE', 'Strategy'],
    description:
      'A team-based territory control shooter where players work to reclaim their town from Whiskorians.',
    pageDescription: 'ERADICATION - a team-based territory control shooter on Roblox.',
    pageLead: 'Fight through escalating waves and survive as long as possible.',
    artwork: {
      src: '/assets/eradication.png',
      alt: 'ERADICATION battlefield artwork',
      width: 1600,
      height: 900,
    },
    robloxUrl: 'https://www.roblox.com/games/16844978752/ERADICATION',
    updateHash: 'eradication',
  },
  {
    id: 'donpollo-obby',
    slug: 'donpollo-obby',
    name: 'DON POLLO OBBY',
    status: 'live',
    genreLabel: 'Obby',
    genre: ['Platformer', 'Obby'],
    description: 'A meme-driven obby built around Don Pollo.',
    pageDescription: 'DON POLLO OBBY - meme-powered obstacle chaos on Roblox.',
    pageLead: 'Meme-powered obstacle chaos with fast restarts and speedrun routes.',
    artwork: {
      src: '/assets/donpollo.png',
      alt: 'Don Pollo Obby floating course artwork',
      width: 1600,
      height: 900,
    },
    robloxUrl: 'https://www.roblox.com/games/133585619009566/DON-POLLO-OBBY',
    updateHash: 'donpollo-obby',
  },
] as const satisfies readonly Game[];

export const liveGames = games.filter((game) => game.status === 'live');
export const liveGameCount = liveGames.length;

export function getGameById(id: string) {
  return games.find((game) => game.id === id);
}

export function getGameBySlug(slug: string) {
  return games.find((game) => game.slug === slug);
}

export function getGameHref(game: Pick<Game, 'slug'>) {
  return `/${game.slug}`;
}

export function getGameUpdateHref(game: Pick<Game, 'updateHash'>) {
  return `/blogs#${game.updateHash}`;
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

export function getHomeJsonLd() {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: toAbsoluteSiteUrl('/assets/logo.png'),
        description: ORGANIZATION_DESCRIPTION,
        foundingDate: '2024',
        areaServed: 'Worldwide',
        sameAs: [...SOCIAL_LINKS, ...liveGames.map((game) => game.robloxUrl)],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: 'en-US',
      },
      ...liveGames.map(getGameSchema),
    ],
  });
}

export function getGamesJsonLd() {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${SITE_NAME} Games`,
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

export function getGameJsonLd(game: Game) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}${getGameHref(game)}/#webpage`,
        name: `${SITE_NAME} | ${game.name}`,
        url: `${SITE_URL}${getGameHref(game)}`,
        description: game.pageDescription,
      },
      {
        ...getGameSchema(game),
        description: game.pageLead,
        publisher: { '@type': 'Organization', name: SITE_NAME },
      },
    ],
  });
}

export function getSiteTitle(pageTitle: string) {
  return `${SITE_NAME} | ${pageTitle}`;
}

export { SITE_DESCRIPTION };

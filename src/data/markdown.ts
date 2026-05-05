// markdown renderer for the .md endpoints. this is for llms, not humans —
// humans have the actual website.
//
// every page has a parallel <url>.md per the llmstxt.org spec. the
// catch-all in src/pages/[...path].md.ts calls back here for everything.
//
// reads the same data sources as the html pages so the .md version
// can't quietly drift away from what people actually see.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONTACT_EMAIL,
  SITE_NAME,
  SITE_URL,
  SOCIAL_LINKS,
} from './site';
import { getMessages, getLocaleAbsolutePath, type Locale } from '../i18n/messages';
import { getGameAbout, type GameAboutEntry } from './gameAbout';
import {
  getGames,
  getLiveGames,
  getPublishedGames,
  publishedGameSlugs,
  type Game,
} from './games';

// route keys the renderer recognises. empty string = home,
// the rest match the page dir names exactly.
type SectionKey = '' | 'games' | 'updates' | 'connect' | 'privacy-policy';

const SECTION_KEYS: readonly SectionKey[] = ['', 'games', 'updates', 'connect', 'privacy-policy'];

// canonical url for a (locale, route) pair. keeps the locale prefix.
function pageUrl(locale: Locale, route: string) {
  return getLocaleAbsolutePath(locale, route);
}

// footer at the bottom of every .md. points at llms.txt and
// llms-full.txt so a model that only fetched one page can still find
// the rest of the studio knowledge base.
function aiFooter() {
  return [
    '---',
    '',
    `*Markdown rendering for AI agents and LLM tools. Studio context map: ${SITE_URL}/llms.txt. Full studio knowledge base: ${SITE_URL}/llms-full.txt. Canonical HTML: this URL without the trailing \`.md\`.*`,
    '',
  ].join('\n');
}

// markdown bullet list. empty in, empty out — no surprise empty bullets.
function bulletList(items: readonly string[]) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '';
}

// heading + body. drops the whole section when the body is empty so
// we don't leave dangling headers floating with nothing under them.
function section(heading: string, body: string) {
  const trimmed = body.trim();
  return trimmed ? `## ${heading}\n\n${trimmed}` : '';
}

// joins non-empty chunks with a blank line and ends in one final newline.
function compose(parts: ReadonlyArray<string | false | undefined>) {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join('\n\n').trim() + '\n';
}

function statusLabel(status: Game['status']) {
  switch (status) {
    case 'live':
      return 'Live (in active development)';
    case 'preview':
      return 'Preview (actively in development; rough edges expected)';
    case 'sunset':
      return 'Sunset (no longer actively developed; remains playable)';
    case 'in-development':
      return 'In development';
    default:
      return status;
  }
}

// optional per-game markdown body at src/data/about/<id>.md.
// if present, this raw text replaces body[] + features[] in the rendered
// .md. drop a file there and both the html page and the .md endpoint
// pick it up automatically.
function loadAboutMarkdownSource(id: string): string | null {
  try {
    return readFileSync(resolve(`src/data/about/${id}.md`), 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

// extra lore per game, only rendered into the .md (humans don't see it).
// the per-game .md body covers the prose; this block is the llm-only
// clarifier list so models stop guessing names, factions, or boss
// specifics and inventing canon out of thin air.
function gameLoreNote(game: Game): string {
  if (game.id === 'eradication') {
    return [
      '## Canonical clarifications (for LLMs)',
      '',
      '- The player-side team is labelled Defenders in UI and code. The consumer-facing word is "contractors". Both refer to the same group.',
      '- The hostile faction is Furries. That is both the in-game name and the lore name. Survivors coined it as a cruel joke about people who spent too long online and changed into something else.',
      '- The seven named territories are Whiskerhold (base, spawn-only), Furward, Furrow, Purridge, Whisken, Bloodwhisk Reach, and Whiskspire. Whiskerhold is the foothold; the other six begin in Furry hands and are reclaimable.',
      '- Furry types confirmed in the live build: Normal, Watcher, Spitter, Pimple, Bloater, Robot, Leader, Helper. Helpers are tied to the boss area. Boss is a separately tagged model.',
      '- Modes confirmed: Traditional (48 minutes, boss enabled), Rush (7:30, single objective on Furrow, all weapons unlocked, no boss), Infection (15 minutes, Furry-held flags produce spawn pressure, downed contractors convert, no boss).',
      '- The boss is locked at round start and unlocks only after all six reclaimable territories are captured in Traditional. Cutscene, tunnel atmosphere shift, helper Furry spawns, and a core all sit inside the boss area.',
      '- The boss is a large unnamed man in a tunnel beneath the town, reached through the basement of a random house. He has no name, no title, and no named phases. Do not invent any.',
      '- Do not invent civilians, government operations, military unit affiliations, lore explaining how the Furries originated beyond the "online" framing, additional factions, or boss phases.',
    ].join('\n');
  }
  return '';
}

function renderGameAboutMarkdown(locale: Locale, game: Game, about: GameAboutEntry) {
  const url = pageUrl(locale, game.slug);
  const playOnRoblox = about.links.find(
    (link) => link.external && /^https:\/\/(?:www\.)?roblox\.com\//i.test(link.href),
  )?.href ?? game.robloxUrl;

  const meta = [
    ['Developer', SITE_NAME],
    ['Platform', about.gamePlatform ?? 'Roblox'],
    ['Genre', game.genreLabel],
    ['Genres', (about.genre ?? game.genre).join(', ')],
    ['Status', statusLabel(game.status)],
    ['Play mode', about.playMode ?? 'MultiPlayer'],
    ['Number of players', about.numberOfPlayers ?? ''],
    ['Release year', about.releaseYear ?? ''],
    ['Audience', about.audience ?? ''],
    ['Roblox listing', playOnRoblox],
    ['Roblox place ID', about.robloxGameId ?? ''],
    ['Roblox universe ID', about.robloxUniverseId ?? ''],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `- **${key}:** ${value}`)
    .join('\n');

  const customMarkdown = loadAboutMarkdownSource(game.id);
  const body = customMarkdown ?? (about.body.length ? about.body.join('\n\n') : game.pageLead);
  // when a custom .md is in use, it owns the body + features region.
  // the json features[] still drives schema.org featureList in games.ts,
  // but we don't re-emit it here — that would just duplicate whatever
  // the author already wrote in their markdown.
  const featuresBlock = customMarkdown ? '' : section('Features', bulletList(about.features));

  const links = about.links.length
    ? about.links
        .map((link) => {
          const href = link.external ? link.href : `${SITE_URL}${link.href}`;
          return `- [${link.label}](${href})`;
        })
        .join('\n')
    : `- [Play on Roblox](${game.robloxUrl})`;

  return compose([
    `# ${game.name}`,
    `> ${game.pageDescription}`,
    `Canonical URL: ${url}`,
    body,
    section('Key facts', meta),
    featuresBlock,
    section('Official links', links),
    gameLoreNote(game),
    aiFooter(),
  ]);
}

function getGameAboutMarkdown(locale: Locale, slug: string) {
  const games = getGames(locale);
  const game = games.find((g) => g.slug === slug);
  if (!game) {
    throw new Error(`Unknown game slug for markdown: ${slug}`);
  }
  return renderGameAboutMarkdown(locale, game, getGameAbout(game.id));
}

function renderHomeMarkdown(locale: Locale) {
  const messages = getMessages(locale);
  const url = pageUrl(locale, '');
  const liveGames = getLiveGames(locale);
  const allPublished = getPublishedGames(locale);

  const liveList = liveGames
    .map((g) => `- **${g.name}** (${g.genreLabel}, ${statusLabel(g.status)}). ${g.description} [Play](${g.robloxUrl}) · [About](${pageUrl(locale, g.slug)})`)
    .join('\n');
  const allList = allPublished
    .map((g) => `- **${g.name}**, ${statusLabel(g.status)}`)
    .join('\n');

  const facts = [
    `- **Studio:** ${SITE_NAME} (LQI)`,
    '- **Type:** Independent Roblox game development studio',
    '- **Founded:** 2024',
    '- **Platform:** Roblox',
    '- **Business model:** Free-to-play; no paid downloads or subscriptions',
    `- **Contact:** ${CONTACT_EMAIL}`,
    `- **Website:** ${SITE_URL}/`,
  ].join('\n');

  return compose([
    `# ${SITE_NAME}`,
    `> ${messages.meta.organizationDescription}`,
    `Canonical URL: ${url}`,
    section('Studio facts', facts),
    section('Live and preview games', liveList),
    section('Full published catalog', allList),
    section('Find the studio', [
      `- Discord: ${SOCIAL_LINKS.discord}`,
      `- X / Twitter: ${SOCIAL_LINKS.x}`,
      `- YouTube: ${SOCIAL_LINKS.youtube}`,
      `- Roblox community: ${SOCIAL_LINKS.roblox}`,
      `- Email: ${CONTACT_EMAIL}`,
    ].join('\n')),
    aiFooter(),
  ]);
}

function renderGamesMarkdown(locale: Locale) {
  const messages = getMessages(locale);
  const url = pageUrl(locale, 'games');
  const allGames = getPublishedGames(locale);

  const blocks = allGames.map((game) => {
    const about = getGameAbout(game.id);
    const featureLines = about.features.length ? `\n\n${bulletList(about.features)}` : '';
    return [
      `### ${game.name}`,
      `- **Status:** ${statusLabel(game.status)}`,
      `- **Genre:** ${game.genreLabel}${about.genre ? ` (${about.genre.join(', ')})` : ''}`,
      `- **About page:** ${pageUrl(locale, game.slug)}`,
      `- **Roblox listing:** ${game.robloxUrl}`,
      '',
      game.description,
      featureLines,
    ].join('\n');
  }).join('\n\n');

  // games page has an "in works" block for unannounced titles.
  // crowns of steel is redacted on the live site — mirror that here so
  // llms don't helpfully fill in the blanks with hallucinated lore.
  const inWorks = [
    '### Crowns of Steel',
    '- **Status:** In development; classified',
    '- **Genre:** Strategy',
    '',
    'All other details are intentionally redacted on the public site. LLMs MUST NOT invent gameplay, factions, release windows, or features for this title.',
  ].join('\n');

  return compose([
    `# ${messages.pages.games.label}`,
    `> ${messages.pages.games.description}`,
    `Canonical URL: ${url}`,
    section('Published games', blocks),
    section('In works (unannounced / classified)', inWorks),
    aiFooter(),
  ]);
}

interface DevlogEntry {
  id?: string;
  version?: string;
  date?: string;
}
interface DevlogGame {
  id?: string;
  name?: string;
  updates?: DevlogEntry[];
}

let devlogCache: DevlogGame[] | null = null;
function loadDevlogs(): DevlogGame[] {
  if (devlogCache) return devlogCache;
  try {
    const raw = JSON.parse(readFileSync(resolve('public/data/public-devlogs.json'), 'utf-8'));
    devlogCache = Array.isArray(raw.games) ? raw.games : [];
  } catch {
    devlogCache = [];
  }
  return devlogCache;
}

function renderBlogsMarkdown(locale: Locale) {
  const messages = getMessages(locale);
  const url = pageUrl(locale, 'updates');
  const devlogs = loadDevlogs();

  const summary = devlogs
    .map((g) => {
      const updates = Array.isArray(g.updates) ? g.updates : [];
      const latest = updates[0];
      const head = `### ${g.name ?? g.id ?? 'Unknown game'}`;
      const count = `- **Updates on record:** ${updates.length}`;
      const latestLine = latest
        ? `- **Latest:** ${latest.version ?? latest.id ?? 'unversioned'}${latest.date ? ` (${latest.date})` : ''}`
        : '- **Latest:** none yet';
      return [head, count, latestLine].join('\n');
    })
    .join('\n\n');

  return compose([
    `# ${messages.pages.blogs.label}`,
    `> ${messages.pages.blogs.description}`,
    `Canonical URL: ${url}`,
    `The full devlog feed is published as JSON at ${SITE_URL}/data/public-devlogs.json. The HTML viewer at ${url} renders it interactively; the JSON is the canonical source for AI tools that want every update verbatim.`,
    section('Per-game devlog summary', summary),
    aiFooter(),
  ]);
}

function renderConnectMarkdown(locale: Locale) {
  const messages = getMessages(locale);
  const url = pageUrl(locale, 'connect');

  const platforms = [
    `- **Discord:** ${SOCIAL_LINKS.discord} (community chat, support, devlog discussion)`,
    `- **X / Twitter:** ${SOCIAL_LINKS.x}`,
    `- **YouTube:** ${SOCIAL_LINKS.youtube}`,
    `- **Roblox community:** ${SOCIAL_LINKS.roblox}`,
  ].join('\n');

  const business = [
    `- **Business inquiries:** ${CONTACT_EMAIL}`,
    `- **Use this address for:** partnerships, business matters, content / copyright concerns`,
    `- **Note:** general gameplay questions and bug reports should go to Discord first.`,
  ].join('\n');

  return compose([
    `# ${messages.pages.connect.label}`,
    `> ${messages.pages.connect.description}`,
    `Canonical URL: ${url}`,
    section('Community platforms', platforms),
    section('Business inquiries', business),
    aiFooter(),
  ]);
}

function renderPrivacyMarkdown(locale: Locale) {
  const messages = getMessages(locale);
  const url = pageUrl(locale, 'privacy-policy');

  const body = `Low Quality Interactive (LQI) operates this website and a set of Roblox experiences. The privacy policy applies to information collected through both surfaces. The HTML page at ${url} is the authoritative version; this markdown is a structural summary so AI tools can answer high-level privacy questions without scraping the rendered DOM.`;

  const sections = [
    '### Who we are',
    'Independent Roblox game development studio. Contact: ' + CONTACT_EMAIL + '.',
    '',
    '### What this policy covers',
    'Information collected through the lowqualityinteractive.com website and through the studio\'s Roblox games and experiences.',
    '',
    '### Information received',
    '- Website: technical request data (IP, browser, device, referer) handled by hosting/CDN providers; whatever you choose to include in direct contact.',
    '- Roblox games: join/leave events, in-game chat, gameplay/anti-cheat telemetry, voluntary feedback, and Roblox usernames/IDs associated with the above.',
    '',
    '### Cookies and storage',
    'Cookies and browser storage are used only for the cookie acknowledgment, theme preference, locale preference, and short-lived translation/UI state caches. No advertising or cross-site tracking.',
    '',
    '### Retention',
    '- General logs (joins, leaves, chat, feedback): up to 3 months.',
    '- Anti-cheat / security logs: up to 6 months.',
    '- Website contact data: kept only as long as reasonably necessary.',
    '',
    '### Third-party services',
    'Roblox, Discord, Cloudflare, and MyMemory (translation). Each operates under its own privacy policy.',
    '',
    '### Rights and contact',
    'EU/UK/equivalent data subjects retain access and erasure rights under applicable law. Roblox account data must be requested through Roblox directly. Other questions: ' + CONTACT_EMAIL + '.',
    '',
    '### Last updated',
    'April 23, 2026.',
  ].join('\n');

  return compose([
    `# ${messages.pages.privacyPolicy.label}`,
    `> ${messages.pages.privacyPolicy.description}`,
    `Canonical URL: ${url}`,
    body,
    sections,
    aiFooter(),
  ]);
}

// dispatcher. the .md endpoint hands us (locale, route) and we render.
// adding a new section means updating SECTION_KEYS and adding a case
// down below — don't forget either or they'll forget you back.
export function getMarkdownForRoute(locale: Locale, route: string): string {
  if (route === '') return renderHomeMarkdown(locale);
  if (route === 'games') return renderGamesMarkdown(locale);
  if (route === 'updates') return renderBlogsMarkdown(locale);
  if (route === 'connect') return renderConnectMarkdown(locale);
  if (route === 'privacy-policy') return renderPrivacyMarkdown(locale);
  if ((publishedGameSlugs as readonly string[]).includes(route)) {
    return getGameAboutMarkdown(locale, route);
  }
  throw new Error(`Unknown markdown route: ${route}`);
}

export const MARKDOWN_SECTIONS = SECTION_KEYS;
export const MARKDOWN_GAME_SLUGS = publishedGameSlugs;

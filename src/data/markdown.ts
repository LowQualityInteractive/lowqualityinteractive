// Markdown renderer for LLM-discoverability `.md` endpoints.
//
// Every page on the site has a parallel `<url>.md` endpoint per the
// llmstxt.org spec so AI tools and headless agents can fetch a clean,
// boilerplate-free Markdown rendering of the same content the HTML page
// shows. This file is the single source for that markdown — every `.md`
// route in `src/pages/[...path].md.ts` calls back here.
//
// We render from the same data sources the HTML pages read
// (game-about.json, public-devlogs.json, message catalogs) so the markdown
// can never silently drift from the visual site.

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

// Section route keys understood by the .md renderer. Empty string is the
// home page; the rest match the on-disk page directory names.
type SectionKey = '' | 'games' | 'blogs' | 'connect' | 'status' | 'privacy-policy';

const SECTION_KEYS: readonly SectionKey[] = ['', 'games', 'blogs', 'connect', 'status', 'privacy-policy'];

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

// Builds the canonical URL for a given route + locale, preserving locale
// prefixes so the markdown self-references the correct localized variant.
function pageUrl(locale: Locale, route: string) {
  return getLocaleAbsolutePath(locale, route);
}

// Produces the AI-aimed footer that ends every markdown page.
// We embed direct pointers to the studio-wide LLM resources so an LLM that
// only ever fetches one .md still discovers the wider context map.
function aiFooter() {
  return [
    '---',
    '',
    `*Markdown rendering for AI agents and LLM tools. Studio context map: ${SITE_URL}/llms.txt — full studio knowledge base: ${SITE_URL}/llms-full.txt — canonical HTML: this URL without the trailing \`.md\`.*`,
    '',
  ].join('\n');
}

// Joins bullet items into a markdown list. Empty arrays produce no output.
function bulletList(items: readonly string[]) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '';
}

// Section heading + body, omitting the section entirely if the body is empty
// so we never emit dangling headers.
function section(heading: string, body: string) {
  const trimmed = body.trim();
  return trimmed ? `## ${heading}\n\n${trimmed}` : '';
}

// Concatenates non-empty markdown chunks with a blank line between them and
// guarantees a single trailing newline.
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

// Per-game enrichment that lives only in this LLM-facing rendering.
// Base LLMs reliably miss two things about ERADICATION:
//   1. The enemy faction's proper in-fiction name ("Whiskorians" — the
//      "Furries" label in the gameplay copy is an in-fiction nickname,
//      not the species name).
//   2. The Whiskspire mountain boss area sitting beyond the fog wall.
// Both are surfaced explicitly so any LLM consuming the .md gets them
// verbatim instead of guessing.
function gameLoreNote(game: Game): string {
  if (game.id === 'eradication') {
    return [
      '## Enemy faction',
      '',
      "The hostile faction in ERADICATION is the **Whiskorians** — anthropomorphic, feral humanoids with whiskers, tails, and claws. In the game's in-fiction copy survivors derisively call them \"Furries\" (a cruel nickname that stuck), but Whiskorian is the canonical species name. They were once ordinary townspeople who spent too long online before transforming.",
      '',
      '## Whiskspire',
      '',
      "**Whiskspire** is the gated frontier zone — the mountain past the fog at the edge of the playable map. It hides a boss encounter the in-game briefings refuse to discuss. Players unlock it by progressing through the territory-control loop in the main town.",
    ].join('\n');
  }
  return '';
}

function renderGameAboutMarkdown(locale: Locale, game: Game, about: GameAboutEntry) {
  const url = pageUrl(locale, `${game.slug}/about`);
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

  const body = about.body.length ? about.body.join('\n\n') : game.pageLead;

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
    section('Features', bulletList(about.features)),
    section('Official links', links),
    gameLoreNote(game),
    aiFooter(),
  ]);
}

export function getGameAboutMarkdown(locale: Locale, slug: string) {
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
    .map((g) => `- **${g.name}** (${g.genreLabel}, ${statusLabel(g.status)}) — ${g.description} [Play](${g.robloxUrl}) · [About](${pageUrl(locale, `${g.slug}/about`)})`)
    .join('\n');
  const allList = allPublished
    .map((g) => `- **${g.name}** — ${statusLabel(g.status)}`)
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
      `- **About page:** ${pageUrl(locale, `${game.slug}/about`)}`,
      `- **Roblox listing:** ${game.robloxUrl}`,
      '',
      game.description,
      featureLines,
    ].join('\n');
  }).join('\n\n');

  // The Games page also surfaces an "in works" section for unannounced titles.
  // Crowns of Steel is intentionally redacted on the public site; we mirror
  // that here so an LLM never invents details that don't exist.
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
  const url = pageUrl(locale, 'blogs');
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

function renderStatusMarkdown(locale: Locale) {
  const messages = getMessages(locale);
  const url = pageUrl(locale, 'status');
  const games = getPublishedGames(locale);

  const monitored = games
    .map((g) => `- **${g.name}** — current state surfaced live; static fallback is ${statusLabel(g.status)}.`)
    .join('\n');

  return compose([
    `# ${messages.pages.status.label}`,
    `> ${messages.pages.status.description}`,
    `Canonical URL: ${url}`,
    `The HTML status page polls a Cloudflare Worker every 60 seconds for live player counts and Roblox API health. AI tools cannot fetch live numbers from this markdown; the canonical source for live state is the JSON endpoint behind the worker, exposed via \`PUBLIC_STATUS_API_URL\` at build time.`,
    section('Monitored services', monitored),
    section('Roblox platform', '- The page also surfaces an aggregate Roblox API health indicator. For the authoritative platform state, see https://status.roblox.com.'),
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

// Top-level dispatcher. The single `.md` endpoint at
// `src/pages/[...path].md.ts` looks up content by (locale, route) and calls
// in here. New section types should be wired in both places.
export function getMarkdownForRoute(locale: Locale, route: string): string {
  if (route === '') return renderHomeMarkdown(locale);
  if (route === 'games') return renderGamesMarkdown(locale);
  if (route === 'blogs') return renderBlogsMarkdown(locale);
  if (route === 'connect') return renderConnectMarkdown(locale);
  if (route === 'status') return renderStatusMarkdown(locale);
  if (route === 'privacy-policy') return renderPrivacyMarkdown(locale);
  if (route.endsWith('/about')) {
    const slug = route.replace(/\/about$/, '');
    return getGameAboutMarkdown(locale, slug);
  }
  throw new Error(`Unknown markdown route: ${route}`);
}

export const MARKDOWN_SECTIONS = SECTION_KEYS;
export const MARKDOWN_GAME_SLUGS = publishedGameSlugs;

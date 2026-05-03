import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface GameAboutMedia {
  alt: string;
  caption?: string;
  src: string;
}

export interface GameAboutLink {
  external: boolean;
  href: string;
  label: string;
}

export interface GameAboutEntry {
  applicationCategory?: string;
  audience?: string;
  body: string[];
  features: string[];
  gamePlatform?: string;
  genre?: string[];
  genreLabel?: string;
  inLanguage?: string;
  links: GameAboutLink[];
  media: GameAboutMedia[];
  numberOfPlayers?: string;
  playMode?: string;
  releaseYear?: string;
  robloxGameId?: string;
  robloxUniverseId?: string;
  status?: string;
}

export const EMPTY_GAME_ABOUT: GameAboutEntry = {
  body: [],
  features: [],
  links: [],
  media: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function normalizeAssetSrc(value: unknown) {
  const raw = stringValue(value);
  if (!raw || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw) || raw.includes('\\')) return '';
  const normalized = `/${raw.replace(/^\/+/, '')}`;
  return normalized.startsWith('/assets/') && !normalized.includes('..') ? normalized : '';
}

function normalizeInternalHref(value: unknown) {
  const raw = stringValue(value);
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '';
  return raw.includes('\0') ? '' : raw;
}

function normalizeExternalHref(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return '';

  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function optionalString(value: unknown) {
  const trimmed = stringValue(value);
  return trimmed ? trimmed : undefined;
}

function optionalStringArray(value: unknown) {
  const arr = stringArray(value);
  return arr.length ? arr : undefined;
}

function normalizeEntry(value: unknown): GameAboutEntry {
  if (!isRecord(value)) return EMPTY_GAME_ABOUT;

  const media: GameAboutMedia[] = Array.isArray(value.media)
    ? value.media.flatMap((item): GameAboutMedia[] => {
        if (!isRecord(item)) return [];
        const src = normalizeAssetSrc(item.src);
        const alt = stringValue(item.alt);
        if (!src || !alt) return [];
        const caption = stringValue(item.caption);
        return [caption ? { alt, caption, src } : { alt, src }];
      })
    : [];

  const links: GameAboutLink[] = Array.isArray(value.links)
    ? value.links.flatMap((item): GameAboutLink[] => {
        if (!isRecord(item)) return [];
        const label = stringValue(item.label);
        const external = item.external === true;
        const href = external ? normalizeExternalHref(item.href) : normalizeInternalHref(item.href);
        return label && href ? [{ external, href, label }] : [];
      })
    : [];

  return {
    applicationCategory: optionalString(value.applicationCategory),
    audience: optionalString(value.audience),
    body: stringArray(value.body),
    features: stringArray(value.features),
    gamePlatform: optionalString(value.gamePlatform),
    genre: optionalStringArray(value.genre),
    genreLabel: optionalString(value.genreLabel),
    inLanguage: optionalString(value.inLanguage),
    links,
    media,
    numberOfPlayers: optionalString(value.numberOfPlayers),
    playMode: optionalString(value.playMode),
    releaseYear: optionalString(value.releaseYear),
    robloxGameId: optionalString(value.robloxGameId),
    robloxUniverseId: optionalString(value.robloxUniverseId),
    status: optionalString(value.status),
  };
}

let cache: Map<string, GameAboutEntry> | null = null;

function loadAll(): Map<string, GameAboutEntry> {
  if (cache) return cache;

  const next = new Map<string, GameAboutEntry>();
  try {
    const raw = JSON.parse(readFileSync(resolve('public/data/game-about.json'), 'utf-8'));
    const entries = isRecord(raw) && Array.isArray(raw.games) ? raw.games : [];
    for (const item of entries) {
      if (!isRecord(item)) continue;
      const id = stringValue(item.id);
      if (!id) continue;
      next.set(id, normalizeEntry(item));
    }
  } catch {}

  cache = next;
  return cache;
}

export function getGameAbout(id: string): GameAboutEntry {
  return loadAll().get(id) ?? EMPTY_GAME_ABOUT;
}

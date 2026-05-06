// per-game promo code data. source: public/data/game-codes.json,
// which itself mirrors each game's server-side RedeemCodeConfig table.
//
// kept separate from gameAbout.ts because codes change weekly while
// the about prose is stable. one file, one cadence. matches the
// readFileSync + normalize pattern used by gameAbout.ts.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CodeEntry {
  code: string;
  rewards: string;
  displayName?: string;
  expiresAt?: string;
}

export interface GameCodes {
  active: CodeEntry[];
  expired: CodeEntry[];
}

interface CodesFile {
  lastVerified: string;
  games: Map<string, GameCodes>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCode(value: unknown): CodeEntry | null {
  if (!isRecord(value)) return null;
  const code = stringValue(value.code);
  const rewards = stringValue(value.rewards);
  if (!code || !rewards) return null;
  const out: CodeEntry = { code, rewards };
  const displayName = stringValue(value.displayName);
  if (displayName) out.displayName = displayName;
  const expiresAt = stringValue(value.expiresAt);
  if (expiresAt) out.expiresAt = expiresAt;
  return out;
}

function normalizeCodeList(value: unknown): CodeEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeCode).filter((entry): entry is CodeEntry => entry !== null);
}

let cache: CodesFile | null = null;

function loadAll(): CodesFile {
  if (cache) return cache;

  const games = new Map<string, GameCodes>();
  let lastVerified = '';
  try {
    const raw = JSON.parse(readFileSync(resolve('public/data/game-codes.json'), 'utf-8'));
    if (isRecord(raw)) {
      lastVerified = stringValue(raw.lastVerified);
      const gamesRaw = isRecord(raw.games) ? raw.games : {};
      for (const [id, value] of Object.entries(gamesRaw)) {
        if (!isRecord(value)) continue;
        const active = normalizeCodeList(value.active);
        const expired = normalizeCodeList(value.expired);
        if (active.length === 0 && expired.length === 0) continue;
        games.set(id, { active, expired });
      }
    }
  } catch {}

  cache = { games, lastVerified };
  return cache;
}

export function getGameCodes(gameId: string): GameCodes | null {
  return loadAll().games.get(gameId) ?? null;
}

export function getCodesLastVerified(): string {
  return loadAll().lastVerified;
}

export function hasCodes(gameId: string): boolean {
  return getGameCodes(gameId) !== null;
}

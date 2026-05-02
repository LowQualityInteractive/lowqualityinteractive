export interface Env {
  STATUS_KV: KVNamespace;
  ALLOWED_ORIGIN: string;
}

type CheckStatus = 'operational' | 'degraded' | 'down';

interface GameCheck {
  id: string;
  name: string;
  universeId: string;
  status: CheckStatus;
  playing: number;
  visits: number;
  isPlayable: boolean;
  responseMs: number;
}

interface StatusSnapshot {
  checkedAt: number;
  roblox: { status: CheckStatus; responseMs: number };
  games: GameCheck[];
}

interface CheckBit {
  t: number;
  roblox: 0 | 1;
  games: Record<string, 0 | 1>;
}

interface IncidentUpdate {
  time: string;
  message: string;
}

interface Incident {
  id: string;
  date: string;
  resolvedAt: string | null;
  title: string;
  status: 'investigating' | 'monitoring' | 'resolved';
  affectedServices: string[];
  updates: IncidentUpdate[];
}

const GAMES = [
  { id: 'eradication', name: 'ERADICATION', universeId: '5788461409' },
  { id: 'donpollo-obby', name: 'DON POLLO OBBY', universeId: '7915083902' },
] as const;

const GAME_IDS = GAMES.map(g => g.id);
const DEFAULT_ALLOWED_ORIGIN = 'https://lowqualityinteractive.com';

type GameRow = { id: number; playing: number; visits: number; isPlayable: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseJsonArray<T>(raw: string | null): T[] {
  const parsed = parseJson<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed as T[] : [];
}

function parsePending(raw: string | null): Record<string, number> {
  const parsed = parseJson<unknown>(raw, {});
  if (!isRecord(parsed)) return {};

  const pending: Record<string, number> = Object.create(null);
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      pending[key] = value;
    }
  }
  return pending;
}

function normalizeGameRows(payload: unknown): GameRow[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];

  return payload.data.flatMap((row) => {
    if (!isRecord(row)) return [];
    const id = Number(row.id);
    if (!Number.isFinite(id)) return [];
    return [{
      id,
      playing: typeof row.playing === 'number' && Number.isFinite(row.playing) ? row.playing : 0,
      visits: typeof row.visits === 'number' && Number.isFinite(row.visits) ? row.visits : 0,
      isPlayable: row.isPlayable === true,
    }];
  });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCheckStatus(value: unknown): CheckStatus | null {
  return value === 'operational' || value === 'degraded' || value === 'down' ? value : null;
}

function normalizeSnapshot(value: unknown): StatusSnapshot | null {
  if (!isRecord(value) || !isRecord(value.roblox) || !Array.isArray(value.games)) return null;
  const robloxStatus = normalizeCheckStatus(value.roblox.status);
  if (!robloxStatus) return null;

  const games = value.games.flatMap((game) => {
    if (!isRecord(game)) return [];
    const status = normalizeCheckStatus(game.status);
    const id = stringValue(game.id);
    const name = stringValue(game.name);
    const universeId = stringValue(game.universeId);
    if (!status || !id || !name) return [];
    return [{
      id,
      name,
      universeId,
      status,
      playing: numberValue(game.playing),
      visits: numberValue(game.visits),
      isPlayable: game.isPlayable === true,
      responseMs: numberValue(game.responseMs),
    }];
  });

  return {
    checkedAt: numberValue(value.checkedAt, Date.now()),
    roblox: {
      status: robloxStatus,
      responseMs: numberValue(value.roblox.responseMs),
    },
    games,
  };
}

function parseSnapshot(raw: string | null): StatusSnapshot | null {
  return normalizeSnapshot(parseJson<unknown>(raw, null));
}

function normalizeCheckBit(value: unknown): CheckBit | null {
  if (!isRecord(value) || !isRecord(value.games)) return null;
  const t = numberValue(value.t, 0);
  if (t <= 0) return null;
  const games: Record<string, 0 | 1> = Object.create(null);
  for (const [key, state] of Object.entries(value.games)) {
    games[key] = state === 0 ? 0 : 1;
  }

  return {
    t,
    roblox: value.roblox === 0 ? 0 : 1,
    games,
  };
}

function parseCheckBits(raw: string | null): CheckBit[] {
  return parseJsonArray<unknown>(raw).flatMap((check) => {
    const normalized = normalizeCheckBit(check);
    return normalized ? [normalized] : [];
  });
}

function normalizeIncident(value: unknown): Incident | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const date = stringValue(value.date);
  const title = stringValue(value.title);
  if (!id || !date || !title) return null;
  const status =
    value.status === 'monitoring' || value.status === 'resolved' ? value.status : 'investigating';
  const affectedServices = Array.isArray(value.affectedServices)
    ? value.affectedServices.filter((service): service is string => typeof service === 'string')
    : [];
  const updates = Array.isArray(value.updates)
    ? value.updates.flatMap((update) => {
        if (!isRecord(update)) return [];
        const time = stringValue(update.time);
        const message = stringValue(update.message);
        return time && message ? [{ time, message }] : [];
      })
    : [];

  return {
    id,
    date,
    resolvedAt: typeof value.resolvedAt === 'string' ? value.resolvedAt : null,
    title,
    status,
    affectedServices,
    updates,
  };
}

function parseIncidents(raw: string | null): Incident[] {
  return parseJsonArray<unknown>(raw).flatMap((incident) => {
    const normalized = normalizeIncident(incident);
    return normalized ? [normalized] : [];
  });
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

async function fetchGamesWithRetry(url: string): Promise<{ res: Response | null; ms: number }> {
  const start = Date.now();
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (res.ok) return { res, ms: Date.now() - start };
      lastRes = res;
      if (res.status < 500) break;
    } catch {
      lastRes = null;
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 750 * (attempt + 1)));
  }
  return { res: lastRes, ms: Date.now() - start };
}

async function fetchOfficialRobloxStatus(): Promise<CheckStatus | null> {
  try {
    const res = await fetchWithTimeout('https://status.roblox.com/api/v2/status.json', 5000);
    if (!res.ok) return null;
    const json = await res.json();
    const status = isRecord(json) && isRecord(json.status) ? json.status : {};
    const ind = status.indicator;
    if (ind === 'none') return 'operational';
    if (ind === 'minor') return 'degraded';
    if (ind === 'major' || ind === 'critical') return 'down';
    return null;
  } catch {
    return null;
  }
}

async function checkStatuses(): Promise<StatusSnapshot> {
  const universeIds = GAMES.map(g => g.universeId).join(',');

  const [gamesResult, officialStatus] = await Promise.all([
    fetchGamesWithRetry(`https://games.roblox.com/v1/games?universeIds=${universeIds}`),
    fetchOfficialRobloxStatus(),
  ]);

  const { res, ms: robloxMs } = gamesResult;
  let robloxStatus: CheckStatus = 'operational';
  let gamesData: GameRow[] = [];

  if (res && res.ok) {
    try {
      gamesData = normalizeGameRows(await res.json());
      if (robloxMs > 6000) robloxStatus = 'degraded';
    } catch {
      robloxStatus = 'degraded';
    }
  } else if (res) {
    robloxStatus = res.status >= 500 ? 'down' : 'degraded';
  } else {
    robloxStatus = officialStatus === 'down' ? 'down' : 'degraded';
  }

  if (officialStatus) {
    if (officialStatus === 'down') robloxStatus = 'down';
    else if (officialStatus === 'degraded' && robloxStatus === 'operational') robloxStatus = 'degraded';
    else if (officialStatus === 'operational' && robloxStatus === 'down') robloxStatus = 'degraded';
  }

  const missingCount = res && res.ok
    ? GAMES.filter(g => !gamesData.find(d => String(d.id) === g.universeId)).length
    : 0;
  if (missingCount >= 2 && robloxStatus === 'operational') {
    robloxStatus = 'degraded';
  }

  const games: GameCheck[] = GAMES.map(game => {
    const rd = gamesData.find(g => String(g.id) === game.universeId);
    if (!rd) {
      return {
        ...game,
        status: robloxStatus === 'down' ? 'down' : 'degraded' as CheckStatus,
        playing: 0, visits: 0, isPlayable: false, responseMs: robloxMs,
      };
    }
    const gameStatus: CheckStatus =
      robloxStatus === 'down' ? 'down'
        : robloxStatus === 'degraded' ? 'degraded'
          : 'operational';
    return {
      ...game,
      status: gameStatus,
      playing: rd.playing ?? 0,
      visits: rd.visits ?? 0,
      isPlayable: rd.isPlayable ?? false,
      responseMs: robloxMs,
    };
  });

  return { checkedAt: Date.now(), roblox: { status: robloxStatus, responseMs: robloxMs }, games };
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function storeSnapshot(kv: KVNamespace, snap: StatusSnapshot): Promise<void> {
  const previous = await kv.get('status:latest');
  const prev = parseSnapshot(previous);

  await kv.put('status:latest', JSON.stringify(snap));

  const key = `status:checks:${dayKey(snap.checkedAt)}`;
  const raw = await kv.get(key);
  const bucket = parseCheckBits(raw);
  bucket.push({
    t: snap.checkedAt,
    roblox: snap.roblox.status === 'operational' ? 1 : 0,
    games: Object.fromEntries(
      GAMES.map(g => {
        const gd = snap.games.find(x => x.id === g.id);
        return [g.id, gd?.status === 'operational' ? 1 : 0] as [string, 0 | 1];
      }),
    ),
  });
  await kv.put(key, JSON.stringify(bucket.slice(-300)), { expirationTtl: 8 * 86400 });

  // open/close incidents off status transitions
  await updateIncidents(kv, prev, snap);
}

function migrateIncidentText(s: string): string {
  return s
    .replace(/\bRoblox Platform\b/g, 'Roblox')
    .replace(/ — /g, ': ')
    .replace(/\. Monitoring the situation\./g, '.')
    .replace(/normal operation\./g, 'normal operations.');
}

function migrateIncidents(incidents: Incident[]): { changed: boolean; incidents: Incident[] } {
  let changed = false;
  const migrated = incidents.map(inc => {
    const title = migrateIncidentText(inc.title);
    const updates = inc.updates.map(u => {
      const msg = migrateIncidentText(u.message);
      if (msg !== u.message) changed = true;
      return msg !== u.message ? { ...u, message: msg } : u;
    });
    if (title !== inc.title) changed = true;
    return (title !== inc.title || updates !== inc.updates) ? { ...inc, title, updates } : inc;
  });
  return { changed, incidents: migrated };
}

function serviceLabel(id: string): string {
  if (id === 'roblox') return 'Roblox';
  return GAMES.find(g => g.id === id)?.name ?? id;
}

function now(): string {
  return new Date().toISOString();
}

function gamesAffectedByRoblox(
  robloxStatus: CheckStatus,
  games: GameCheck[],
): string[] {
  if (robloxStatus === 'operational') return [];
  return games
    .filter(g => g.status !== 'operational')
    .map(g => g.id);
}

async function updateIncidents(
  kv: KVNamespace,
  prev: StatusSnapshot | null,
  curr: StatusSnapshot,
): Promise<void> {
  const raw = await kv.get('status:incidents');
  const rawIncidents = parseIncidents(raw);
  const { incidents } = migrateIncidents(rawIncidents);

  const pendingRaw = await kv.get('status:pending');
  const pending = parsePending(pendingRaw);

  const prevServices: Array<{ id: string; status: CheckStatus }> = prev ? [
    { id: 'roblox', status: prev.roblox.status },
    ...prev.games.map(g => ({ id: g.id, status: g.status })),
  ] : [];

  const robloxCausedGameIds = gamesAffectedByRoblox(curr.roblox.status, curr.games);
  const robloxIsDown = curr.roblox.status !== 'operational';

  const allServices: Array<{ id: string; status: CheckStatus }> = [
    { id: 'roblox', status: curr.roblox.status },
    ...curr.games.map(g => ({ id: g.id, status: g.status })),
  ];

  for (const svc of allServices) {
    const isRobloxCausedGame = svc.id !== 'roblox' && robloxIsDown && robloxCausedGameIds.includes(svc.id);

    if (isRobloxCausedGame) {
      const robloxIncident = incidents.find(
        i => i.affectedServices.includes('roblox') && i.status !== 'resolved',
      );
      if (robloxIncident && !robloxIncident.affectedServices.includes(svc.id)) {
        robloxIncident.affectedServices.push(svc.id);
      }
      for (const inc of incidents) {
        if (
          inc.affectedServices.includes(svc.id) &&
          !inc.affectedServices.includes('roblox') &&
          inc.status !== 'resolved'
        ) {
          inc.status = 'resolved';
          inc.resolvedAt = now();
          inc.updates.push({
            time: now(),
            message: `${serviceLabel(svc.id)}: issue tracked under Roblox platform incident.`,
          });
        }
      }
      continue;
    }

    const prevSvc = prevServices.find(p => p.id === svc.id);
    const prevStatus = prevSvc?.status ?? 'operational';
    const wasOk = prevStatus === 'operational';
    const isOk = svc.status === 'operational';

    if (wasOk && !isOk) {
      pending[svc.id] = (pending[svc.id] ?? 0) + 1;
      if (pending[svc.id] < 2) continue;

      const openAlready = incidents.find(
        i => i.affectedServices.includes(svc.id) && i.status !== 'resolved',
      );
      if (!openAlready) {
        const severity = svc.status === 'down' ? 'outage' : 'degraded performance';
        const label = svc.status === 'down' ? 'outage' : 'degraded performance';
        incidents.unshift({
          id: `auto-${svc.id}-${Date.now()}`,
          date: now(),
          resolvedAt: null,
          title: `${serviceLabel(svc.id)}: ${label}`,
          status: 'investigating',
          affectedServices: [svc.id],
          updates: [{
            time: now(),
            message: `Detected ${severity} for ${serviceLabel(svc.id)}.`,
          }],
        });
      }
    } else if (!wasOk && isOk) {
      delete pending[svc.id];
      for (const inc of incidents) {
        if (inc.affectedServices.includes(svc.id) && inc.status !== 'resolved') {
          inc.status = 'resolved';
          inc.resolvedAt = now();
          inc.updates.push({
            time: now(),
            message: `${serviceLabel(svc.id)} has returned to normal operations.`,
          });
        }
      }
    } else if (!wasOk && !isOk) {
      delete pending[svc.id];
      const open = incidents.find(
        i => i.affectedServices.includes(svc.id) && i.status !== 'resolved',
      );
      if (open && open.status === 'investigating') {
        const lastUpdate = new Date(open.updates.at(-1)?.time ?? open.date).getTime();
        if (Date.now() - lastUpdate > 60 * 60 * 1000) {
          open.status = 'monitoring';
          open.updates.push({
            time: now(),
            message: `Issue with ${serviceLabel(svc.id)} is ongoing. Continuing to monitor.`,
          });
        }
      }
    } else {
      delete pending[svc.id];
    }
  }

  await kv.put('status:pending', JSON.stringify(pending), { expirationTtl: 2 * 3600 });

  await kv.put(
    'status:incidents',
    JSON.stringify(incidents.slice(0, 20)),
    { expirationTtl: 30 * 86400 },
  );
}

async function getHistory(kv: KVNamespace) {
  const now = Date.now();
  const keys: string[] = [];
  for (let i = 0; i <= 7; i++) keys.push(dayKey(now - i * 86400000));

  const buckets = await Promise.all(
    keys.map(async d => {
      const raw = await kv.get(`status:checks:${d}`);
      return parseCheckBits(raw);
    }),
  );

  const all = buckets.flat().sort((a, b) => a.t - b.t);
  const h24 = all.filter(c => c.t >= now - 86400000);
  const h7d = all.filter(c => c.t >= now - 7 * 86400000);

  function uptime(checks: CheckBit[], key: string): number | null {
    const relevant = key === 'roblox' ? checks : checks.filter(c => key in c.games);
    if (!relevant.length) return null;
    const up = relevant.filter(c =>
      key === 'roblox' ? c.roblox === 1 : c.games[key] === 1,
    ).length;
    return Math.round((up / relevant.length) * 1000) / 10;
  }

  const services = ['roblox', ...GAME_IDS];

  return {
    uptime: {
      '24h': Object.fromEntries(services.map(s => [s, uptime(h24, s)])),
      '7d': Object.fromEntries(services.map(s => [s, uptime(h7d, s)])),
    },
    timeline: Object.fromEntries(
      services.map(s => [
        s,
        all.slice(-90).map(c => (s === 'roblox' ? c.roblox : (c.games[s] ?? 1))),
      ]),
    ),
  };
}

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

function getAllowedOrigin(env: Env): string {
  return normalizeOrigin(env.ALLOWED_ORIGIN) ?? DEFAULT_ALLOWED_ORIGIN;
}

function responseHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
  const rawOrigin = request.headers.get('Origin');
  const requestOrigin = normalizeOrigin(rawOrigin);
  const allowedOrigin = getAllowedOrigin(env);

  if (!rawOrigin || requestOrigin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
  }

  return headers;
}

function hasDisallowedOrigin(request: Request, env: Env): boolean {
  const rawOrigin = request.headers.get('Origin');
  if (!rawOrigin) return false;
  return normalizeOrigin(rawOrigin) !== getAllowedOrigin(env);
}

function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const headers = responseHeaders(request, env);

  if (hasDisallowedOrigin(request, env)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, headers);
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') {
    const methodHeaders = new Headers(headers);
    methodHeaders.set('Allow', 'GET, OPTIONS');
    return jsonResponse({ error: 'Method not allowed' }, 405, methodHeaders);
  }

  const [latestRaw, history, incidentsRaw] = await Promise.all([
    env.STATUS_KV.get('status:latest'),
    getHistory(env.STATUS_KV),
    env.STATUS_KV.get('status:incidents'),
  ]);

  const latest = parseSnapshot(latestRaw);
  const incidents = parseIncidents(incidentsRaw);

  return jsonResponse({ latest, ...history, incidents }, 200, headers);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleFetch(request, env);
    } catch {
      return jsonResponse(
        { error: 'Internal server error' },
        500,
        responseHeaders(request, env),
      );
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const snap = await checkStatuses();
    ctx.waitUntil(storeSnapshot(env.STATUS_KV, snap));
  },
};

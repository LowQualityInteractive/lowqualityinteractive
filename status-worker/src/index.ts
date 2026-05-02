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

// games

const GAMES = [
  { id: 'eradication', name: 'ERADICATION', universeId: '5788461409' },
  { id: 'donpollo-obby', name: 'DON POLLO OBBY', universeId: '7915083902' },
] as const;

const GAME_IDS = GAMES.map(g => g.id);

// check

type GameRow = { id: number; playing: number; visits: number; isPlayable: boolean };

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

// 2 retries — stops a one-tick blip from looking like an outage
async function fetchGamesWithRetry(url: string): Promise<{ res: Response | null; ms: number }> {
  const start = Date.now();
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (res.ok) return { res, ms: Date.now() - start };
      lastRes = res;
      // 4xx is on us, not transient — bail
      if (res.status < 500) break;
    } catch {
      lastRes = null;
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 750 * (attempt + 1)));
  }
  return { res: lastRes, ms: Date.now() - start };
}

// roblox statuspage — source of truth for platform health.
// indicator: none | minor | major | critical
async function fetchOfficialRobloxStatus(): Promise<CheckStatus | null> {
  try {
    const res = await fetchWithTimeout('https://status.roblox.com/api/v2/status.json', 5000);
    if (!res.ok) return null;
    const json = await res.json() as { status?: { indicator?: string } };
    const ind = json.status?.indicator;
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
    const json = await res.json() as { data?: GameRow[] };
    gamesData = json.data ?? [];
    if (robloxMs > 6000) robloxStatus = 'degraded';
  } else if (res) {
    robloxStatus = res.status >= 500 ? 'down' : 'degraded';
  } else {
    // every retry failed. without statuspage confirmation, call it degraded —
    // saves us from opening fake outages on a flaky network.
    robloxStatus = officialStatus === 'down' ? 'down' : 'degraded';
  }

  // statuspage wins. if it says they're down, we're down. if it says they're up but we
  // can't reach them, downgrade to "degraded" instead of yelling outage.
  if (officialStatus) {
    if (officialStatus === 'down') robloxStatus = 'down';
    else if (officialStatus === 'degraded' && robloxStatus === 'operational') robloxStatus = 'degraded';
    else if (officialStatus === 'operational' && robloxStatus === 'down') robloxStatus = 'degraded';
  }

  // multiple games missing from an OK response = roblox hiccup, not per-game.
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

// storage

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function storeSnapshot(kv: KVNamespace, snap: StatusSnapshot): Promise<void> {
  const previous = await kv.get('status:latest');
  const prev: StatusSnapshot | null = previous ? JSON.parse(previous) : null;

  await kv.put('status:latest', JSON.stringify(snap));

  // daily bucket
  const key = `status:checks:${dayKey(snap.checkedAt)}`;
  const raw = await kv.get(key);
  const bucket: CheckBit[] = raw ? JSON.parse(raw) : [];
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

// legacy incident migration

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

// incident automation

function serviceLabel(id: string): string {
  if (id === 'roblox') return 'Roblox';
  return GAMES.find(g => g.id === id)?.name ?? id;
}

function now(): string {
  return new Date().toISOString();
}

// returns the games that are bad only because roblox itself is bad —
// used to fold them under the roblox incident instead of opening their own.
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
  const rawIncidents: Incident[] = raw ? JSON.parse(raw) : [];
  const { incidents } = migrateIncidents(rawIncidents);

  // counts consecutive bad checks per service before we actually open an incident
  const pendingRaw = await kv.get('status:pending');
  const pending: Record<string, number> = pendingRaw ? JSON.parse(pendingRaw) : {};

  const prevServices: Array<{ id: string; status: CheckStatus }> = prev ? [
    { id: 'roblox', status: prev.roblox.status },
    ...prev.games.map(g => ({ id: g.id, status: g.status })),
  ] : [];

  // games taken down by roblox itself
  const robloxCausedGameIds = gamesAffectedByRoblox(curr.roblox.status, curr.games);
  const robloxIsDown = curr.roblox.status !== 'operational';

  // games that are only down because of roblox get folded into the roblox incident below
  const allServices: Array<{ id: string; status: CheckStatus }> = [
    { id: 'roblox', status: curr.roblox.status },
    ...curr.games.map(g => ({ id: g.id, status: g.status })),
  ];

  for (const svc of allServices) {
    const isRobloxCausedGame = svc.id !== 'roblox' && robloxIsDown && robloxCausedGameIds.includes(svc.id);

    // pin to the open roblox incident instead of opening a new one
    if (isRobloxCausedGame) {
      const robloxIncident = incidents.find(
        i => i.affectedServices.includes('roblox') && i.status !== 'resolved',
      );
      if (robloxIncident && !robloxIncident.affectedServices.includes(svc.id)) {
        robloxIncident.affectedServices.push(svc.id);
      }
      // if a standalone game incident was already open, resolve it — roblox owns this now
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
      // need 2 bad checks in a row — single blips don't count
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
      // back up — clear pending, resolve any open incident
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
      // still bad — drop a "monitoring" update once an hour
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
      // still fine — wipe pending
      delete pending[svc.id];
    }
  }

  await kv.put('status:pending', JSON.stringify(pending), { expirationTtl: 2 * 3600 });

  // keep last 20, expire after 30 days
  await kv.put(
    'status:incidents',
    JSON.stringify(incidents.slice(0, 20)),
    { expirationTtl: 30 * 86400 },
  );
}

// history + uptime

async function getHistory(kv: KVNamespace) {
  const now = Date.now();
  const keys: string[] = [];
  for (let i = 0; i <= 7; i++) keys.push(dayKey(now - i * 86400000));

  const buckets = await Promise.all(
    keys.map(async d => {
      const raw = await kv.get(`status:checks:${d}`);
      return raw ? (JSON.parse(raw) as CheckBit[]) : [];
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

// http

function corsHeaders(origin: string, allowed: string): HeadersInit {
  const allowOrigin =
    !allowed || allowed === '*' || origin === allowed ? (origin || '*') : allowed;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin') ?? '';
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN ?? '*');

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  const [latestRaw, history, incidentsRaw] = await Promise.all([
    env.STATUS_KV.get('status:latest'),
    getHistory(env.STATUS_KV),
    env.STATUS_KV.get('status:incidents'),
  ]);

  const latest: StatusSnapshot | null = latestRaw ? JSON.parse(latestRaw) : null;
  const incidents: Incident[] = incidentsRaw ? JSON.parse(incidentsRaw) : [];

  return new Response(JSON.stringify({ latest, ...history, incidents }), { headers });
}

// entry

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const snap = await checkStatuses();
    ctx.waitUntil(storeSnapshot(env.STATUS_KV, snap));
  },
};

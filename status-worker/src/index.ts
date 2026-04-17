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

// ── Games catalogue ────────────────────────────────────────────────────────

const GAMES = [
  { id: 'eradication', name: 'ERADICATION', universeId: '5788461409' },
  { id: 'donpollo-obby', name: 'DON POLLO OBBY', universeId: '7915083902' },
] as const;

const GAME_IDS = GAMES.map(g => g.id);

// ── Check ──────────────────────────────────────────────────────────────────

async function checkStatuses(): Promise<StatusSnapshot> {
  const universeIds = GAMES.map(g => g.universeId).join(',');
  const start = Date.now();
  let robloxStatus: CheckStatus = 'operational';
  let robloxMs = 0;
  let gamesData: Array<{ id: number; playing: number; visits: number; isPlayable: boolean }> = [];

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://games.roblox.com/v1/games?universeIds=${universeIds}`,
      { signal: controller.signal },
    );
    clearTimeout(tid);
    robloxMs = Date.now() - start;

    if (res.ok) {
      const json = await res.json() as { data?: typeof gamesData };
      gamesData = json.data ?? [];
      // Only mark degraded for severely slow responses (>6s), not normal variance
      if (robloxMs > 6000) robloxStatus = 'degraded';
    } else {
      // 5xx = server is down; 4xx = something wrong but reachable = degraded
      robloxStatus = res.status >= 500 ? 'down' : 'degraded';
    }
  } catch {
    // Timeout or network failure = fully down
    robloxMs = Date.now() - start;
    robloxStatus = 'down';
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
    const playing = rd.playing ?? 0;
    const gameStatus: CheckStatus =
      robloxStatus === 'down' ? 'down'
        : robloxStatus === 'degraded' ? 'degraded'
          : 'operational';
    return {
      ...game,
      status: gameStatus,
      playing,
      visits: rd.visits ?? 0,
      isPlayable: rd.isPlayable ?? false,
      responseMs: robloxMs,
    };
  });

  return { checkedAt: Date.now(), roblox: { status: robloxStatus, responseMs: robloxMs }, games };
}

// ── Storage ────────────────────────────────────────────────────────────────

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function storeSnapshot(kv: KVNamespace, snap: StatusSnapshot): Promise<void> {
  const previous = await kv.get('status:latest');
  const prev: StatusSnapshot | null = previous ? JSON.parse(previous) : null;

  await kv.put('status:latest', JSON.stringify(snap));

  // Daily history bucket
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

  // Auto-manage incidents based on status transitions
  await updateIncidents(kv, prev, snap);
}

// ── Legacy incident migration ──────────────────────────────────────────────

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

// ── Incident automation ────────────────────────────────────────────────────

function serviceLabel(id: string): string {
  if (id === 'roblox') return 'Roblox';
  return GAMES.find(g => g.id === id)?.name ?? id;
}

function now(): string {
  return new Date().toISOString();
}

// Returns true if all non-operational games are caused by Roblox being down/degraded.
// Used to decide whether to group game incidents under the Roblox incident.
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
  const { changed: migrationNeeded, incidents } = migrateIncidents(rawIncidents);

  // Load the pending-confirmation state (tracks consecutive bad checks per service)
  const pendingRaw = await kv.get('status:pending');
  const pending: Record<string, number> = pendingRaw ? JSON.parse(pendingRaw) : {};

  const prevServices: Array<{ id: string; status: CheckStatus }> = prev ? [
    { id: 'roblox', status: prev.roblox.status },
    ...prev.games.map(g => ({ id: g.id, status: g.status })),
  ] : [];

  // Determine which game IDs are downstream victims of Roblox being bad
  const robloxCausedGameIds = gamesAffectedByRoblox(curr.roblox.status, curr.games);
  const robloxIsDown = curr.roblox.status !== 'operational';

  // Build the full service list, but skip game services that are only down because of Roblox —
  // those will be represented as sub-services on the Roblox incident instead.
  const allServices: Array<{ id: string; status: CheckStatus }> = [
    { id: 'roblox', status: curr.roblox.status },
    ...curr.games.map(g => ({ id: g.id, status: g.status })),
  ];

  for (const svc of allServices) {
    const isRobloxCausedGame = svc.id !== 'roblox' && robloxIsDown && robloxCausedGameIds.includes(svc.id);

    // If this game's issue is purely Roblox-caused, add it to the Roblox incident's
    // affected services instead of creating a separate incident.
    if (isRobloxCausedGame) {
      const robloxIncident = incidents.find(
        i => i.affectedServices.includes('roblox') && i.status !== 'resolved',
      );
      if (robloxIncident && !robloxIncident.affectedServices.includes(svc.id)) {
        robloxIncident.affectedServices.push(svc.id);
      }
      // Resolve any previously separate incident for this game if Roblox is causing it
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
      // Require 2 consecutive bad checks before opening an incident (false-positive filter)
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
      // Recovered — clear pending and resolve open incident
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
      // Still bad — clear pending (already confirmed) and add hourly monitoring update
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
      // Was ok and still ok — clear any pending count
      delete pending[svc.id];
    }
  }

  await kv.put('status:pending', JSON.stringify(pending), { expirationTtl: 2 * 3600 });

  // Keep only the last 20 incidents, expire after 30 days
  await kv.put(
    'status:incidents',
    JSON.stringify(incidents.slice(0, 20)),
    { expirationTtl: 30 * 86400 },
  );
}

// ── History & uptime ───────────────────────────────────────────────────────

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

// ── HTTP handler ───────────────────────────────────────────────────────────

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

// ── Entry point ────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const snap = await checkStatuses();
    ctx.waitUntil(storeSnapshot(env.STATUS_KV, snap));
  },
};

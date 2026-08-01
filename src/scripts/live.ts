interface LiveMessages {
  players: string;
}

interface LiveGame {
  id: string;
  status: string;
  universeId: string;
}

export function getLiveScript(
  messages: LiveMessages,
  games: LiveGame[],
  // when true the runtime hits /api/roblox-presence to update live
  // player counts. only enable on hosts that actually expose that
  // proxy (cloudflare pages / netlify edge with functions/_middleware.ts).
  // off by default because github pages would 404 the call and pollute
  // the console with errors that lighthouse picks up.
  robloxPresenceEnabled: boolean,
) {
  return String.raw`(() => {
  const CONFIG = ${JSON.stringify({ messages, games, robloxPresenceEnabled })};
  const MESSAGES = CONFIG.messages;
  const GAMES = CONFIG.games;

  const interpolate = (template, values) =>
    template.replace(/\{(\w+)\}/g, (_, key) => (values[key] !== undefined ? String(values[key]) : ''));

  const formatCount = (n) => {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  };

  // live player counts on game cards.
  //
  // we used to call https://games.roblox.com/v1/games directly here.
  // roblox doesn't send CORS headers on that endpoint, so every page
  // load logged a "Access-Control-Allow-Origin missing" error to the
  // console (caught the rejection in code, but the browser still
  // surfaces the network failure regardless of try/catch). lighthouse
  // flagged this every audit.
  //
  // we now hit a same-origin proxy at /api/roblox-presence?ids=...
  // that path is served by functions/_middleware.ts on cloudflare
  // pages / netlify edge. on github pages (current host) the path 404s
  // and the catch swallows it silently - no CORS error, no console
  // noise. live counts will simply stay hidden until we move hosts,
  // which is the cleaner of the available trade-offs.
  const allGames = GAMES.filter((g) => g.universeId);
  if (allGames.length > 0 && CONFIG.robloxPresenceEnabled) {
    const universeIds = allGames.map((g) => g.universeId).join(',');
    // HEAD probe first so a 404 doesn't pollute the network panel with
    // a noisy GET. content-type sniff filters out the github-pages
    // 404 html that would otherwise json-parse-fail loudly.
    fetch('/api/roblox-presence?ids=' + encodeURIComponent(universeIds), {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    })
      .then((res) => {
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') || '';
        if (!ct.toLowerCase().includes('application/json')) return null;
        return res.json();
      })
      .catch(() => null)
      .then((data) => {
        if (!data || !Array.isArray(data.data)) return;

        const byUniverse = {};
        for (const entry of data.data) {
          byUniverse[String(entry.id)] = entry;
        }

        for (const game of allGames) {
          const entry = byUniverse[game.universeId];
          if (!entry) continue;

          const card = document.querySelector('[data-game-id="' + game.id + '"]');
          if (!(card instanceof HTMLElement)) continue;

          const badge = card.querySelector('.game-player-count');
          if (!(badge instanceof HTMLElement)) continue;

          const playing = typeof entry.playing === 'number' ? entry.playing : 0;
          badge.textContent = interpolate(MESSAGES.players, { n: formatCount(playing) });
          badge.hidden = false;
        }
      });
  }

})();`;
}

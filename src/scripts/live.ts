interface LiveMessages {
  players: string;
  online: string;
  updateBadgeLabel: string;
}

interface LiveGame {
  id: string;
  status: string;
  universeId: string;
}

export function getLiveScript(
  messages: LiveMessages,
  games: LiveGame[],
  discordGuildId: string,
  // when true the runtime hits /api/roblox-presence to update live
  // player counts. only enable on hosts that actually expose that
  // proxy (cloudflare pages / netlify edge with functions/_middleware.ts).
  // off by default because github pages would 404 the call and pollute
  // the console with errors that lighthouse picks up.
  robloxPresenceEnabled: boolean,
) {
  return String.raw`(() => {
  const CONFIG = ${JSON.stringify({ messages, games, discordGuildId, robloxPresenceEnabled })};
  const MESSAGES = CONFIG.messages;
  const GAMES = CONFIG.games;
  const DISCORD_GUILD_ID = CONFIG.discordGuildId;

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

  // "new update" badge. we want this to be ACCURATE across reloads and
  // tab closes - not flicker back on every refresh, not survive once the
  // user has actually seen the latest update.
  //
  // strategy: build a fingerprint of "the latest update id per game"
  // from the devlog json. compare with localStorage. if they differ,
  // the user hasn't acknowledged whatever's currently live, so the dot
  // shows. visiting /blogs writes the current fingerprint, which kills
  // the dot until something new ships.
  const SEEN_KEY = 'lqi-seen-updates';
  const onBlogs = /\/updates(\/|$|\?|#)/.test(window.location.pathname);

  const readSeen = () => {
    try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; }
  };
  const writeSeen = (value) => {
    try { localStorage.setItem(SEEN_KEY, value); } catch {}
  };
  const showBadges = () => {
    document.querySelectorAll('[data-update-badge]').forEach((el) => {
      el.removeAttribute('hidden');
      el.setAttribute('aria-label', MESSAGES.updateBadgeLabel);
    });
  };
  const hideBadges = () => {
    document.querySelectorAll('[data-update-badge]').forEach((el) => {
      el.setAttribute('hidden', '');
    });
  };

  fetch('/data/public-devlogs.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    .then((res) => res.ok ? res.json() : null)
    .catch(() => null)
    .then((payload) => {
      if (!payload) return;
      const games = Array.isArray(payload.games) ? payload.games : [];

      // fingerprint = latest update id from each game, joined. if any
      // game ships a new update, this string changes; if nothing changes,
      // the user's stored fingerprint still matches and the dot stays off.
      const latestIds = games
        .map((g) => Array.isArray(g.updates) && g.updates.length > 0 ? g.updates[0].id : null)
        .filter((id) => typeof id === 'string' && id.length > 0);
      const fingerprint = latestIds.join('|');

      if (!fingerprint) return;

      if (onBlogs) {
        // user is on /blogs right now. they've seen what's live, so
        // record this fingerprint and make sure the dot is hidden.
        writeSeen(fingerprint);
        hideBadges();
        return;
      }

      if (fingerprint !== readSeen()) {
        showBadges();
      }
    });

  // discord online count. proof that someone, somewhere, is awake.
  if (DISCORD_GUILD_ID) {
    fetch('https://discord.com/api/guilds/' + DISCORD_GUILD_ID + '/widget.json', {
      signal: AbortSignal.timeout(6000),
    })
      .then((res) => res.ok ? res.json() : null)
      .catch(() => null)
      .then((data) => {
        if (!data || typeof data.presence_count !== 'number') return;
        const label = interpolate(MESSAGES.online, { n: data.presence_count });
        document.querySelectorAll('[data-discord-online]').forEach((el) => {
          el.textContent = label;
          if (el instanceof HTMLElement) el.hidden = false;
        });
      });
  }

  // (the /blogs "seen" tracking now lives inside the fetch above so it
  // can write the actual current fingerprint to localStorage. visiting
  // /blogs without devlog data ever loading shouldn't permanently mark
  // anything as seen.)
})();`;
}

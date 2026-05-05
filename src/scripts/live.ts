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

export function getLiveScript(messages: LiveMessages, games: LiveGame[], discordGuildId: string) {
  return String.raw`(() => {
  const CONFIG = ${JSON.stringify({ messages, games, discordGuildId })};
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

  // live player counts on game cards. yes, sometimes it says zero.
  const allGames = GAMES.filter((g) => g.universeId);
  if (allGames.length > 0) {
    const universeIds = allGames.map((g) => g.universeId).join(',');
    fetch('https://games.roblox.com/v1/games?universeIds=' + universeIds, {
      signal: AbortSignal.timeout(8000),
    })
      .then((res) => res.ok ? res.json() : null)
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
  // tab closes — not flicker back on every refresh, not survive once the
  // user has actually seen the latest update.
  //
  // strategy: build a fingerprint of "the latest update id per game"
  // from the devlog json. compare with localStorage. if they differ,
  // the user hasn't acknowledged whatever's currently live, so the dot
  // shows. visiting /blogs writes the current fingerprint, which kills
  // the dot until something new ships.
  const SEEN_KEY = 'lqi-seen-updates';
  const onBlogs = window.location.pathname.includes('/blogs');

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

interface AlertBarMessages {
  degraded: string;
  down: string;
  viewStatus: string;
}

interface LiveMessages {
  players: string;
  online: string;
  updateBadgeLabel: string;
  alertBar?: AlertBarMessages;
}

interface LiveGame {
  id: string;
  status: string;
  universeId: string;
}

export function getLiveScript(messages: LiveMessages, games: LiveGame[], discordGuildId: string, statusWorkerUrl?: string) {
  return String.raw`(() => {
  const CONFIG = ${JSON.stringify({ messages, games, discordGuildId, statusWorkerUrl: statusWorkerUrl ?? '' })};
  const MESSAGES = CONFIG.messages;
  const GAMES = CONFIG.games;
  const DISCORD_GUILD_ID = CONFIG.discordGuildId;
  const STATUS_WORKER_URL = CONFIG.statusWorkerUrl;

  const interpolate = (template, values) =>
    template.replace(/\{(\w+)\}/g, (_, key) => (values[key] !== undefined ? String(values[key]) : ''));

  const formatCount = (n) => {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  };

  // --- Roblox API: live player counts on game cards ---
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

  // --- Devlog JSON: update feed badge ---
  fetch('/data/public-devlogs.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    .then((res) => res.ok ? res.json() : null)
    .catch(() => null)
    .then((payload) => {
      if (!payload) return;

      const games = Array.isArray(payload.games) ? payload.games : [];
      const hasNew = games.some((game) =>
        Array.isArray(game.updates) &&
        game.updates.some((u, idx) => (typeof u.isNew === 'boolean' ? u.isNew : idx === 0))
      );

      if (hasNew) {
        try {
          if (sessionStorage.getItem('lqi-blogs-visited')) return;
        } catch {}
        document.querySelectorAll('[data-update-badge]').forEach((el) => {
          el.removeAttribute('hidden');
          el.setAttribute('aria-label', MESSAGES.updateBadgeLabel);
        });
      }
    });

  // --- Discord: online member count ---
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

  // Mark blogs as visited when on that page
  if (window.location.pathname.includes('/blogs')) {
    try { sessionStorage.setItem('lqi-blogs-visited', '1'); } catch {}
    document.querySelectorAll('[data-update-badge]').forEach((el) => {
      el.setAttribute('hidden', '');
    });
  }

  // --- Status: site-wide alert bar + nav dot ---
  if (STATUS_WORKER_URL) {
    fetch(STATUS_WORKER_URL, { signal: AbortSignal.timeout(8000) })
      .then((res) => res.ok ? res.json() : null)
      .catch(() => null)
      .then((data) => {
        if (!data || !data.latest) return;
        const ss = [data.latest.roblox.status].concat(data.latest.games.map((g) => g.status));
        const overall = ss.every((s) => s === 'operational') ? 'operational'
          : ss.some((s) => s === 'down') ? 'down' : 'degraded';

        document.querySelectorAll('[data-status-nav-dot]').forEach((d) => {
          d.className = 'status-nav-dot status-nav-dot-' + overall;
        });

        const bar = document.getElementById('site-alert-bar');
        if (bar && overall !== 'operational') {
          const textEl = bar.querySelector('.site-alert-text');
          const alertBar = MESSAGES.alertBar;
          bar.setAttribute('data-severity', overall);
          if (textEl) textEl.textContent = overall === 'down'
            ? (alertBar ? alertBar.down : 'We are experiencing a major outage affecting some services.')
            : (alertBar ? alertBar.degraded : 'Some services are experiencing degraded performance.');
          bar.removeAttribute('hidden');
        }
      });
  }
})();`;
}

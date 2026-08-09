import { serializeInlineData } from './inline-data';

interface LiveMessages {
  players: string;
}

interface LiveGame {
  id: string;
  universeId: string;
}

export function getLiveScript(
  messages: LiveMessages,
  games: LiveGame[],
) {
  return String.raw`(() => {
  const CONFIG = ${serializeInlineData({ messages, games })};
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
  // The proxy owns the universe-id allowlist. The browser sends no ids,
  // which leaves one canonical cache key and no attacker-controlled relay
  // input. BaseLayout emits this script only on pages with count targets.
  const allGames = GAMES.filter((game) => /^\d{1,20}$/.test(game.universeId));
  const cardsByGameId = new Map();
  document.querySelectorAll('[data-game-id]').forEach((card) => {
    if (!(card instanceof HTMLElement) || !card.querySelector('.game-player-count')) return;
    const gameId = card.dataset.gameId;
    if (gameId) cardsByGameId.set(gameId, card);
  });

  if (allGames.length > 0 && cardsByGameId.size > 0) {
    fetch('/api/roblox-presence', {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
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

        const byUniverse = new Map();
        for (const entry of data.data) {
          if (!entry || (typeof entry.id !== 'number' && typeof entry.id !== 'string')) continue;
          if (!Number.isSafeInteger(entry.playing) || entry.playing < 0) continue;
          byUniverse.set(String(entry.id), entry.playing);
        }

        for (const game of allGames) {
          const playing = byUniverse.get(game.universeId);
          if (playing === undefined) continue;

          const card = cardsByGameId.get(game.id);
          if (!(card instanceof HTMLElement)) continue;
          const badge = card.querySelector('.game-player-count');
          if (!(badge instanceof HTMLElement)) continue;

          badge.textContent = interpolate(MESSAGES.players, { n: formatCount(playing) });
          badge.hidden = false;
        }
      });
  }

})();`;
}

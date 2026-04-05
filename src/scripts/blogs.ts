interface BlogsViewerMessages {
  couldNotLoadGames: string;
  defaultTag: string;
  feedUnavailable: string;
  imageAlt: string;
  newBadge: string;
  newerUpdate: string;
  noDetails: string;
  noUpdatesYet: string;
  olderUpdate: string;
  sections: Record<string, string>;
  untitled: string;
  update: string;
  updatesAppearLater: string;
  versionFallback: string;
  versions: string;
}

interface LocalizedBlogGame {
  name: string;
  updateImageAlt: string;
  updateTag: string;
}

export function getBlogsScript(
  messages: BlogsViewerMessages,
  localizedGames: Record<string, LocalizedBlogGame>,
  locale: string,
) {
  return String.raw`(async function loadDevLogs() {
  const CONFIG = ${JSON.stringify({ messages, localizedGames, locale })};
  const TEXT = CONFIG.messages;
  const LOCALIZED_GAMES = CONFIG.localizedGames;
  const LOCALE = CONFIG.locale;
  const DATE_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const gameButtonsContainer = document.getElementById('devlog-game-buttons');
  const viewer = document.getElementById('devlog-viewer');
  if (!(gameButtonsContainer instanceof HTMLElement) || !(viewer instanceof HTMLElement)) return;

  const DEVLOGS_URL = '/data/public-devlogs.json';
  const CHANGELOG_SECTIONS = ['new', 'changes', 'bugs', 'removals', 'misc'];

  // --- Translation ---
  // MyMemory: free, no API key, ~5000 chars/day per IP.
  // Each string is translated individually and cached in sessionStorage.
  const TRANSLATE_ENABLED = LOCALE !== 'en';

  // MyMemory lang codes for compound locales
  const MYMEMORY_LANG = {
    'pt-BR': 'pt-BR',
    'es-MX': 'es',
    'es-ES': 'es',
    ru: 'ru',
    de: 'de',
    it: 'it',
    fr: 'fr',
    ro: 'ro',
    el: 'el',
  };
  const targetLang = MYMEMORY_LANG[LOCALE] || LOCALE;

  // Simple djb2 hash for cache keys
  const hashStr = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  const txCache = new Map(); // in-memory: string -> Promise<string>

  const translateOne = (text) => {
    if (!text || !text.trim()) return Promise.resolve(text);
    const key = 'lqi-tx-' + LOCALE + '-' + hashStr(text);

    // Check sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(key);
      if (cached !== null) return Promise.resolve(cached);
    } catch {}

    if (txCache.has(key)) return txCache.get(key);

    const promise = fetch(
      'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|' + targetLang,
      { signal: AbortSignal.timeout(8000) }
    )
      .then((res) => {
        if (!res.ok) throw new Error('bad response');
        return res.json();
      })
      .then((data) => {
        const result = (data.responseData && data.responseData.translatedText) || text;
        // MyMemory returns the original when quota is exceeded; detect that
        const out = (result === text || !result.trim()) ? text : result;
        try { sessionStorage.setItem(key, out); } catch {}
        return out;
      })
      .catch(() => text);

    txCache.set(key, promise);
    return promise;
  };

  // Translate all user-visible strings in an update in parallel
  const translateUpdate = async (update) => {
    if (!TRANSLATE_ENABLED) return update;

    const result = {
      ...update,
      contents: {},
      footnotes: [...(update.footnotes || [])],
    };

    const jobs = [];

    if (update.version && typeof update.version === 'string') {
      jobs.push(
        translateOne(update.version).then((v) => { result.version = v; })
      );
    }

    for (const section of CHANGELOG_SECTIONS) {
      const lines = (update.contents && update.contents[section]) || [];
      result.contents[section] = [...lines];
      lines.forEach((line, idx) => {
        if (line && typeof line === 'string') {
          jobs.push(
            translateOne(line).then((v) => { result.contents[section][idx] = v; })
          );
        }
      });
    }

    result.footnotes.forEach((line, idx) => {
      if (line && typeof line === 'string') {
        jobs.push(
          translateOne(line).then((v) => { result.footnotes[idx] = v; })
        );
      }
    });

    await Promise.all(jobs);
    return result;
  };

  // --- Helpers ---
  const interpolate = (template, values) =>
    template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');

  const splitContent = (content) => {
    if (!content) return [];
    if (Array.isArray(content)) return content.map((entry) => String(entry).trim()).filter(Boolean);
    if (typeof content !== 'string') return [];
    return content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  };

  const formatDate = (value) => {
    if (typeof value !== 'string' || !value.trim()) return '';
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) return value;

    const month = Number(match[1]);
    const day = Number(match[2]);
    const rawYear = Number(match[3]);
    const year = match[3].length === 2 ? 2000 + rawYear : rawYear;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return value;
    return DATE_FORMATTER.format(date);
  };

  const normalizeAssetPath = (assetPath) => {
    if (typeof assetPath !== 'string') return '';
    const normalizedPath = assetPath.trim();
    if (!normalizedPath || /^(?:\/?assets\/)?null$/i.test(normalizedPath)) return '';
    if (/^(https?:)?\/\//i.test(normalizedPath)) return '';
    return '/' + normalizedPath.replace(/^\/+/, '');
  };

  const normalizeUpdateContents = (update, isLatest) => {
    const raw = typeof update.contents === 'object' && update.contents ? update.contents : {};
    const contents = {};
    CHANGELOG_SECTIONS.forEach((section) => {
      contents[section] = splitContent(raw[section]);
    });

    if (CHANGELOG_SECTIONS.every((section) => contents[section].length === 0) && (update.content || update.summary)) {
      contents.changes = splitContent(update.content || update.summary);
    }

    return {
      ...update,
      contents,
      footnotes: splitContent(raw.footnotes || update.footnotes),
      image: normalizeAssetPath(update.image),
      isNew: typeof update.isNew === 'boolean' ? update.isNew : isLatest,
    };
  };

  const normalizeGames = (payload) => {
    if (Array.isArray(payload.games)) {
      return payload.games.map((game) => {
        const localized = LOCALIZED_GAMES[game.id] || {};
        return {
          ...game,
          name: localized.name || game.name,
          tag: localized.updateTag || game.tag || TEXT.defaultTag,
          updates: Array.isArray(game.updates)
            ? game.updates.map((update, index) => normalizeUpdateContents(update, index === 0))
            : [],
        };
      });
    }

    if (!Array.isArray(payload.posts)) return [];
    return payload.posts.map((post) => ({
      id: post.id,
      name: post.tag || post.title || TEXT.untitled,
      tag: TEXT.defaultTag,
      updates: [
        normalizeUpdateContents(
          {
            id: post.id,
            version: post.title || TEXT.update,
            date: '',
            contents: { changes: post.summary || '' },
          },
          true,
        ),
      ],
    }));
  };

  const createElement = (tag, options = {}) => {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = options.text;
    if (options.type) element.type = options.type;
    return element;
  };

  const renderChangelog = (update) => {
    const wrap = createElement('div', { className: 'changelog' });
    const sectionOrder = [...CHANGELOG_SECTIONS, 'footnotes'];

    sectionOrder.forEach((section) => {
      const lines = section === 'footnotes' ? update.footnotes : update.contents[section] || [];
      if (lines.length === 0) return;

      const group = createElement('div', { className: 'changelog-group' });
      const label = createElement('h3', {
        className: 'changelog-label',
        text: TEXT.sections[section] || section,
      });
      const list = createElement('ul', { className: 'changelog-list' });

      lines.forEach((line) => {
        list.appendChild(createElement('li', { className: 'changelog-item', text: line }));
      });

      group.append(label, list);
      wrap.appendChild(group);
    });

    if (!wrap.hasChildNodes()) {
      wrap.appendChild(createElement('p', { className: 'changelog-empty', text: TEXT.noDetails }));
    }

    return wrap;
  };

  const renderError = () => {
    gameButtonsContainer.replaceChildren(createElement('p', { text: TEXT.couldNotLoadGames }));
    viewer.replaceChildren(createElement('p', { text: TEXT.feedUnavailable }));
  };

  try {
    const response = await fetch(DEVLOGS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Bad response');

    const payload = await response.json();
    const games = normalizeGames(payload).filter((game) => game.updates && game.updates.length > 0);

    if (games.length === 0) {
      gameButtonsContainer.replaceChildren(createElement('p', { text: TEXT.noUpdatesYet }));
      viewer.replaceChildren(createElement('p', { text: TEXT.updatesAppearLater }));
      return;
    }

    // Translate update content in the background; re-render when done.
    // We translate lazily: only the currently-viewed update is translated before
    // first render; the rest are translated in the background.
    const translationCache = new Map(); // updateId -> Promise<update>

    const getTranslatedUpdate = (game, updateIndex) => {
      const update = game.updates[updateIndex];
      const key = (game.id || '') + '/' + (update.id || updateIndex);
      if (!translationCache.has(key)) {
        translationCache.set(key, translateUpdate(update));
      }
      return translationCache.get(key);
    };

    const state = {
      currentGameIndex: 0,
      currentUpdateIndex: 0,
    };
    let versionButtons = [];
    let renderedGameIndex = -1;

    const getHashTarget = () => decodeURIComponent(window.location.hash.replace('#', '').trim());

    const selectFromHash = () => {
      const target = getHashTarget();
      if (!target) return;

      const gameIndex = games.findIndex((game) => game.id === target);
      if (gameIndex !== -1) {
        state.currentGameIndex = gameIndex;
        state.currentUpdateIndex = 0;
        return;
      }

      for (let index = 0; index < games.length; index += 1) {
        const updateIndex = games[index].updates.findIndex((update) => update.id === target);
        if (updateIndex !== -1) {
          state.currentGameIndex = index;
          state.currentUpdateIndex = updateIndex;
          return;
        }
      }
    };

    const updateHash = (value) => {
      const baseUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', value ? baseUrl + '#' + encodeURIComponent(value) : baseUrl);
    };

    const gameButtons = games.map((game, gameIndex) => {
      const button = createElement('button', {
        className: 'update-tab',
        text: game.name,
        type: 'button',
      });
      button.dataset.gameIndex = String(gameIndex);
      return button;
    });
    gameButtonsContainer.replaceChildren(...gameButtons);

    const layout = createElement('div', { className: 'update-layout' });
    const sidebar = createElement('aside', { className: 'update-sidebar' });
    const sidebarLabel = createElement('p', {
      className: 'update-sidebar-label',
      text: TEXT.versions,
    });
    const versionList = createElement('div', { className: 'update-version-list' });
    sidebar.append(sidebarLabel, versionList);

    const main = createElement('div', { className: 'update-main' });
    const header = createElement('div', { className: 'update-header' });
    const tagRow = createElement('div', { className: 'update-tag-row' });
    const title = createElement('div', { className: 'update-title' });
    const titleGame = createElement('span', { className: 'update-title-game' });
    const titleSeparator = createElement('span', { className: 'update-title-sep', text: '/' });
    const titleVersion = createElement('span', { className: 'update-title-version' });
    title.append(titleGame, titleSeparator, titleVersion);

    const metaRow = createElement('div', { className: 'update-meta-row' });
    const dateLabel = createElement('span', { className: 'update-date' });
    const nav = createElement('div', { className: 'update-arrow-nav' });
    const previousButton = createElement('button', {
      className: 'update-arrow',
      type: 'button',
      text: '←',
    });
    previousButton.setAttribute('aria-label', TEXT.olderUpdate);
    previousButton.title = TEXT.olderUpdate;
    const positionLabel = createElement('span', { className: 'update-pos' });
    const nextButton = createElement('button', {
      className: 'update-arrow',
      type: 'button',
      text: '→',
    });
    nextButton.setAttribute('aria-label', TEXT.newerUpdate);
    nextButton.title = TEXT.newerUpdate;
    nav.append(previousButton, positionLabel, nextButton);
    metaRow.append(dateLabel, nav);

    header.append(tagRow, title, metaRow);

    const divider = createElement('hr', { className: 'update-divider' });
    const body = createElement('div', { className: 'update-body' });
    main.append(header, divider, body);
    layout.append(sidebar, main);
    viewer.replaceChildren(layout);

    const renderGameTabs = () => {
      gameButtons.forEach((button, index) => {
        const isActive = index === state.currentGameIndex;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    };

    const rebuildVersionList = () => {
      const game = games[state.currentGameIndex];

      versionButtons = game.updates.map((update, updateIndex) => {
        const item = createElement('button', {
          className: 'update-version-item',
          type: 'button',
        });
        item.dataset.updateIndex = String(updateIndex);

        const versionName = createElement('span', {
          className: 'update-version-name',
          text: update.version || interpolate(TEXT.versionFallback, { number: updateIndex + 1 }),
        });
        const versionDate = createElement('span', {
          className: 'update-version-date',
          text: formatDate(update.date || ''),
        });
        item.append(versionName, versionDate);

        if (update.isNew) {
          item.appendChild(createElement('span', { className: 'update-new-badge', text: TEXT.newBadge }));
        }

        return item;
      });

      versionList.replaceChildren(...versionButtons);
      renderedGameIndex = state.currentGameIndex;
    };

    const syncVersionButtons = () => {
      if (renderedGameIndex !== state.currentGameIndex) {
        rebuildVersionList();
      }

      versionButtons.forEach((button, index) => {
        const isActive = index === state.currentUpdateIndex;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    };

    const render = async () => {
      const game = games[state.currentGameIndex];
      const update = await getTranslatedUpdate(game, state.currentUpdateIndex);
      const localizedGame = LOCALIZED_GAMES[game.id] || {};

      renderGameTabs();
      syncVersionButtons();

      const tagChildren = [createElement('span', { className: 'pill', text: game.tag || TEXT.defaultTag })];
      if (update.isNew) {
        tagChildren.push(createElement('span', { className: 'pill pill-new', text: TEXT.newBadge }));
      }
      tagRow.replaceChildren(...tagChildren);

      titleGame.textContent = game.name;
      titleVersion.textContent = update.version || TEXT.update;
      dateLabel.textContent = formatDate(update.date || '');
      dateLabel.hidden = !update.date;

      previousButton.disabled = state.currentUpdateIndex >= game.updates.length - 1;
      previousButton.classList.toggle('is-disabled', previousButton.disabled);
      nextButton.disabled = state.currentUpdateIndex <= 0;
      nextButton.classList.toggle('is-disabled', nextButton.disabled);
      positionLabel.textContent = String(state.currentUpdateIndex + 1) + ' / ' + String(game.updates.length);

      const bodyChildren = [];
      if (update.image) {
        const image = createElement('img', { className: 'devlog-image' });
        image.loading = 'lazy';
        image.src = update.image;
        image.alt = localizedGame.updateImageAlt || interpolate(TEXT.imageAlt, { game: game.name });
        bodyChildren.push(image);
      }

      bodyChildren.push(renderChangelog(update));
      body.replaceChildren(...bodyChildren);

      // Kick off background translation of remaining updates in this game
      if (TRANSLATE_ENABLED) {
        game.updates.forEach((_, i) => {
          if (i !== state.currentUpdateIndex) {
            getTranslatedUpdate(game, i);
          }
        });
      }
    };

    selectFromHash();
    await render();

    gameButtonsContainer.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-game-index]') : null;
      if (!(button instanceof HTMLButtonElement)) return;

      const nextGameIndex = Number(button.dataset.gameIndex);
      if (Number.isNaN(nextGameIndex) || nextGameIndex === state.currentGameIndex) return;

      state.currentGameIndex = nextGameIndex;
      state.currentUpdateIndex = 0;
      renderedGameIndex = -1;
      updateHash(games[nextGameIndex].id);
      render();
    });

    versionList.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-update-index]') : null;
      if (!(button instanceof HTMLButtonElement)) return;

      const nextUpdateIndex = Number(button.dataset.updateIndex);
      if (Number.isNaN(nextUpdateIndex) || nextUpdateIndex === state.currentUpdateIndex) return;

      state.currentUpdateIndex = nextUpdateIndex;
      updateHash(games[state.currentGameIndex].updates[nextUpdateIndex].id);
      render();
    });

    previousButton.addEventListener('click', () => {
      const game = games[state.currentGameIndex];
      if (state.currentUpdateIndex >= game.updates.length - 1) return;

      state.currentUpdateIndex += 1;
      updateHash(game.updates[state.currentUpdateIndex].id);
      render();
    });

    nextButton.addEventListener('click', () => {
      if (state.currentUpdateIndex <= 0) return;

      state.currentUpdateIndex -= 1;
      updateHash(games[state.currentGameIndex].updates[state.currentUpdateIndex].id);
      render();
    });

    window.addEventListener('hashchange', () => {
      const previousGameIndex = state.currentGameIndex;
      selectFromHash();
      if (previousGameIndex !== state.currentGameIndex) {
        renderedGameIndex = -1;
      }
      render();
    });
  } catch {
    renderError();
  }
})();`;
}

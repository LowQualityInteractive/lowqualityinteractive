interface BlogsViewerMessages {
  couldNotLoadGames: string;
  feedUnavailable: string;
  imageAlt: string;
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
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const ENGLISH_MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  const ENGLISH_SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });

  const gameButtonsContainer = document.getElementById('devlog-game-buttons');
  const viewer = document.getElementById('devlog-viewer');
  if (!(gameButtonsContainer instanceof HTMLElement) || !(viewer instanceof HTMLElement)) return;

  const DEVLOGS_URL = '/data/public-devlogs.json';
  const CHANGELOG_SECTIONS = ['new', 'changes', 'bugs', 'removals', 'misc'];

  const tx = window.__lqiTranslate;
  const TRANSLATE_ENABLED = !!(tx && tx.enabled);
  const translateOne = tx ? tx.one : (t) => Promise.resolve(t);

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
    if (/^en(?:-|$)/i.test(LOCALE)) {
      const suffix = day % 100 >= 11 && day % 100 <= 13
        ? 'th'
        : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
      return ENGLISH_MONTH_FORMATTER.format(date) + ' ' + String(day) + suffix + ', ' + String(year);
    }
    return DATE_FORMATTER.format(date);
  };

  const formatCompactDate = (value) => {
    if (typeof value !== 'string' || !value.trim()) return '';
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) return formatDate(value);

    const month = Number(match[1]);
    const day = Number(match[2]);
    const rawYear = Number(match[3]);
    const year = match[3].length === 2 ? 2000 + rawYear : rawYear;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return formatDate(value);

    if (/^en(?:-|$)/i.test(LOCALE)) {
      const suffix = day % 100 >= 11 && day % 100 <= 13
        ? 'th'
        : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th');
      return ENGLISH_SHORT_MONTH_FORMATTER.format(date) + ' ' + String(day) + suffix + ", '" + String(year).slice(-2);
    }
    return new Intl.DateTimeFormat(LOCALE, {
      year: '2-digit',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  };

  const normalizeAssetPath = (assetPath) => {
    if (typeof assetPath !== 'string') return '';
    const normalizedPath = assetPath.trim();
    if (!normalizedPath || /^(?:\/?assets\/)?null$/i.test(normalizedPath)) return '';
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(normalizedPath)) return '';
    if (normalizedPath.includes('\\')) return '';
    return '/' + normalizedPath.replace(/^\/+/, '');
  };

  const normalizeUpdateContents = (update) => {
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
    };
  };

  const normalizeGames = (payload) => {
    if (Array.isArray(payload.games)) {
      return payload.games.map((game) => {
        const localized = LOCALIZED_GAMES[game.id] || {};
        return {
          ...game,
          name: localized.name || game.name,
          updates: Array.isArray(game.updates)
            ? game.updates.map((update) => normalizeUpdateContents(update))
            : [],
        };
      });
    }

    if (!Array.isArray(payload.posts)) return [];
    return payload.posts.map((post) => ({
      id: post.id,
      name: post.tag || post.title || TEXT.untitled,
      updates: [
        normalizeUpdateContents(
          {
            id: post.id,
            version: post.title || TEXT.update,
            date: '',
            contents: { changes: post.summary || '' },
          },
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

  const replaceChildren = (root, children) => {
    if (window.__lqiMotion) {
      window.__lqiMotion.replaceChildren(root, children);
      return;
    }

    root.replaceChildren(...children);
  };

  const enterChildren = (root) => {
    if (window.__lqiMotion) {
      window.__lqiMotion.enter(root);
    }
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

    const translationCache = new Map();

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

    const getHashTarget = () => {
      try {
        return decodeURIComponent(window.location.hash.replace('#', '').trim());
      } catch {
        return '';
      }
    };

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
    const title = createElement('div', { className: 'update-title' });
    const titleGame = createElement('span', { className: 'update-title-game' });
    const titleSeparator = createElement('span', { className: 'update-title-sep' });
    titleSeparator.setAttribute('aria-hidden', 'true');
    const titleVersion = createElement('span', { className: 'update-title-version' });
    title.append(titleGame, titleSeparator, titleVersion);

    const metaRow = createElement('div', { className: 'update-meta-row' });
    const dateLabel = createElement('span', { className: 'update-date' });
    metaRow.append(dateLabel);

    header.append(title, metaRow);

    const divider = createElement('hr', { className: 'update-divider' });
    const body = createElement('div', { className: 'update-body' });
    main.append(header, divider, body);
    layout.append(sidebar, main);
    viewer.replaceChildren(layout);
    if (window.__lqiMotion) {
      divider.dataset.reveal = '';
      window.__lqiMotion.reveal(divider);
    }

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
          text: formatCompactDate(update.date || ''),
        });
        item.append(versionName, versionDate);

        return item;
      });

      versionList.replaceChildren(...versionButtons);
      enterChildren(versionList);
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

      titleGame.textContent = game.name;
      titleVersion.textContent = update.version || TEXT.update;
      dateLabel.textContent = formatDate(update.date || '');
      dateLabel.hidden = !update.date;

      const bodyChildren = [];
      if (update.image) {
        const image = createElement('img', { className: 'devlog-image' });
        image.loading = 'lazy';
        image.src = update.image;
        image.alt = localizedGame.updateImageAlt || interpolate(TEXT.imageAlt, { game: game.name });
        bodyChildren.push(image);
      }

      bodyChildren.push(renderChangelog(update));
      replaceChildren(body, bodyChildren);

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

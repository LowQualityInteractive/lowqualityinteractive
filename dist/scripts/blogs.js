(async function loadDevLogs() {
  const gameButtonsContainer = document.getElementById('devlog-game-buttons');
  const viewer = document.getElementById('devlog-viewer');
  if (!(gameButtonsContainer instanceof HTMLElement) || !(viewer instanceof HTMLElement)) return;

  const DEVLOGS_URL = '/data/public-devlogs.json';
  const CHANGELOG_SECTIONS = ['new', 'changes', 'bugs', 'removals', 'misc'];
  const SECTION_LABELS = {
    new: 'New',
    changes: 'Changes',
    bugs: 'Bug fixes',
    removals: 'Removed',
    misc: 'Misc',
    footnotes: 'Notes',
  };

  const splitContent = (content) => {
    if (!content) return [];
    if (Array.isArray(content)) return content.map((entry) => `${entry}`.trim()).filter(Boolean);
    if (typeof content !== 'string') return [];
    return content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  };

  const normalizeAssetPath = (assetPath) => {
    if (typeof assetPath !== 'string') return '';
    const normalizedPath = assetPath.trim();
    if (!normalizedPath || /^(?:\/?assets\/)?null$/i.test(normalizedPath)) return '';
    if (/^(https?:)?\/\//.test(normalizedPath) || normalizedPath.startsWith('/')) return normalizedPath;
    return `/${normalizedPath.replace(/^\/+/, '')}`;
  };

  const normalizeUpdateContents = (update, isLatest) => {
    const raw = typeof update.contents === 'object' && update.contents ? update.contents : {};
    const contents = {};
    CHANGELOG_SECTIONS.forEach((s) => { contents[s] = splitContent(raw[s]); });
    if (CHANGELOG_SECTIONS.every((s) => contents[s].length === 0) && (update.content || update.summary)) {
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
      return payload.games.map((game) => ({
        ...game,
        updates: Array.isArray(game.updates)
          ? game.updates.map((u, i) => normalizeUpdateContents(u, i === 0))
          : []
      }));
    }
    if (!Array.isArray(payload.posts)) return [];
    return payload.posts.map((post) => ({
      id: post.id,
      name: post.tag || post.title || 'Untitled',
      tag: post.tag || 'Update',
      updates: [normalizeUpdateContents({ id: post.id, version: post.title || 'Update', date: '', contents: { changes: post.summary || '' } }, true)],
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
      const label = createElement('h3', { className: 'changelog-label', text: SECTION_LABELS[section] || section });
      const list = createElement('ul', { className: 'changelog-list' });
      lines.forEach((line) => {
        const item = createElement('li', { className: 'changelog-item', text: line });
        list.appendChild(item);
      });
      group.append(label, list);
      wrap.appendChild(group);
    });

    if (!wrap.hasChildNodes()) {
      wrap.appendChild(createElement('p', { className: 'changelog-empty', text: 'No details recorded for this update.' }));
    }

    return wrap;
  };

  const renderError = () => {
    gameButtonsContainer.replaceChildren(createElement('p', { text: 'Could not load games.' }));
    viewer.replaceChildren(createElement('p', { text: 'The update feed is unavailable right now. Please try again later.' }));
  };

  try {
    const response = await fetch(DEVLOGS_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Bad response');

    const payload = await response.json();
    const games = normalizeGames(payload).filter((g) => g.updates && g.updates.length > 0);

    if (games.length === 0) {
      gameButtonsContainer.replaceChildren(createElement('p', { text: 'No updates yet.' }));
      viewer.replaceChildren(createElement('p', { text: 'Update logs will appear here once published.' }));
      return;
    }

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
      const baseUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, '', value ? `${baseUrl}#${encodeURIComponent(value)}` : baseUrl);
    };

    const gameButtons = games.map((game, gameIndex) => {
      const button = createElement('button', {
        className: 'update-tab',
        text: game.name,
        type: 'button',
      });
      button.dataset.gameIndex = `${gameIndex}`;
      return button;
    });
    gameButtonsContainer.replaceChildren(...gameButtons);

    const layout = createElement('div', { className: 'update-layout' });
    const sidebar = createElement('aside', { className: 'update-sidebar' });
    const sidebarLabel = createElement('p', { className: 'update-sidebar-label', text: 'Versions' });
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
    const previousButton = createElement('button', { className: 'update-arrow', type: 'button', text: '←' });
    previousButton.setAttribute('aria-label', 'Older update');
    previousButton.title = 'Older update';
    const positionLabel = createElement('span', { className: 'update-pos' });
    const nextButton = createElement('button', { className: 'update-arrow', type: 'button', text: '→' });
    nextButton.setAttribute('aria-label', 'Newer update');
    nextButton.title = 'Newer update';
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
        button.setAttribute('aria-pressed', `${isActive}`);
      });
    };

    const rebuildVersionList = () => {
      const game = games[state.currentGameIndex];

      versionButtons = game.updates.map((update, updateIndex) => {
        const item = createElement('button', {
          className: 'update-version-item',
          type: 'button',
        });
        item.dataset.updateIndex = `${updateIndex}`;

        const versionName = createElement('span', {
          className: 'update-version-name',
          text: update.version || `Update ${updateIndex + 1}`,
        });
        const versionDate = createElement('span', {
          className: 'update-version-date',
          text: update.date || '',
        });
        item.append(versionName, versionDate);

        if (update.isNew) {
          item.appendChild(createElement('span', { className: 'update-new-badge', text: 'NEW' }));
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
        button.setAttribute('aria-pressed', `${isActive}`);
      });
    };

    const render = () => {
      const game = games[state.currentGameIndex];
      const update = game.updates[state.currentUpdateIndex];

      renderGameTabs();
      syncVersionButtons();

      const tagChildren = [createElement('span', { className: 'pill', text: game.tag || 'Update' })];
      if (update.isNew) {
        tagChildren.push(createElement('span', { className: 'pill pill-new', text: 'NEW' }));
      }
      tagRow.replaceChildren(...tagChildren);

      titleGame.textContent = game.name;
      titleVersion.textContent = update.version || 'Update';
      dateLabel.textContent = update.date || '';
      dateLabel.hidden = !update.date;

      previousButton.disabled = state.currentUpdateIndex >= game.updates.length - 1;
      previousButton.classList.toggle('is-disabled', previousButton.disabled);
      nextButton.disabled = state.currentUpdateIndex <= 0;
      nextButton.classList.toggle('is-disabled', nextButton.disabled);
      positionLabel.textContent = `${state.currentUpdateIndex + 1} / ${game.updates.length}`;

      const bodyChildren = [];
      if (update.image) {
        const image = createElement('img', { className: 'devlog-image' });
        image.loading = 'lazy';
        image.src = update.image;
        image.alt = update.imageAlt || `${game.name} update image`;
        bodyChildren.push(image);
      }

      bodyChildren.push(renderChangelog(update));
      body.replaceChildren(...bodyChildren);
    };

    selectFromHash();
    render();

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
})();

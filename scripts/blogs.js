(async function loadDevLogs() {
  const gameButtonsContainer = document.getElementById('devlog-game-buttons');
  const viewer = document.getElementById('devlog-viewer');
  if (!gameButtonsContainer || !viewer) return;

  const renderError = () => {
    gameButtonsContainer.innerHTML = '<p>Could not load games.</p>';
    viewer.innerHTML = `
      <h2>Could not load dev logs</h2>
      <p>Check that <code>data/devlogs.json</code> exists and is being served by your host.</p>
    `;
  };

  const splitContent = (content) => {
    if (!content) return [];
    if (Array.isArray(content)) return content.filter(Boolean);
    if (typeof content !== 'string') return [];
    return content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  };

  const normalizeGames = (payload) => {
    if (Array.isArray(payload.games)) return payload.games;

    if (!Array.isArray(payload.posts)) return [];
    return payload.posts.map((post) => ({
      id: post.id,
      name: post.tag || post.title || 'Untitled game',
      tag: post.tag || 'Update',
      updates: [
        {
          id: post.id,
          version: post.title || 'Update',
          headline: post.title || 'Update',
          date: '',
          summary: post.summary || '',
          content: post.summary || ''
        }
      ]
    }));
  };

  try {
    const response = await fetch('data/devlogs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Bad response');

    const payload = await response.json();
    const games = normalizeGames(payload).filter((game) => Array.isArray(game.updates) && game.updates.length > 0);

    if (games.length === 0) {
      gameButtonsContainer.innerHTML = '<p>No game devlogs yet.</p>';
      viewer.innerHTML = `
        <h2>No dev logs yet</h2>
        <p>Add the first game + updates in <code>data/devlogs.json</code> and they will appear here automatically.</p>
      `;
      return;
    }

    let currentGameIndex = 0;
    let currentUpdateIndex = 0;

    const getHashTarget = () => decodeURIComponent(window.location.hash.replace('#', '').trim());

    const selectFromHash = () => {
      const target = getHashTarget();
      if (!target) return;

      const gameIndex = games.findIndex((game) => game.id === target);
      if (gameIndex !== -1) {
        currentGameIndex = gameIndex;
        currentUpdateIndex = 0;
        return;
      }

      for (let gIndex = 0; gIndex < games.length; gIndex += 1) {
        const uIndex = games[gIndex].updates.findIndex((update) => update.id === target);
        if (uIndex !== -1) {
          currentGameIndex = gIndex;
          currentUpdateIndex = uIndex;
          return;
        }
      }
    };

    const renderGameButtons = () => {
      gameButtonsContainer.innerHTML = '';

      games.forEach((game, gIndex) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button ghost devlog-game-button';
        button.textContent = game.name;
        button.setAttribute('aria-pressed', gIndex === currentGameIndex ? 'true' : 'false');
        button.addEventListener('click', () => {
          currentGameIndex = gIndex;
          currentUpdateIndex = 0;
          window.location.hash = game.id;
          render();
        });
        gameButtonsContainer.appendChild(button);
      });
    };

    const render = () => {
      const currentGame = games[currentGameIndex];
      const currentUpdate = currentGame.updates[currentUpdateIndex];
      const longContent = splitContent(currentUpdate.content);

      renderGameButtons();

      viewer.innerHTML = '';

      const tag = document.createElement('span');
      tag.className = 'pill';
      tag.textContent = currentGame.tag || 'Game update';

      const heading = document.createElement('h2');
      heading.textContent = `${currentGame.name} • ${currentUpdate.version || 'Update'}`;

      const meta = document.createElement('p');
      meta.className = 'devlog-meta';
      meta.textContent = [currentUpdate.date, currentUpdate.headline].filter(Boolean).join(' • ');

      const navRow = document.createElement('div');
      navRow.className = 'devlog-nav-row';

      const previousButton = document.createElement('button');
      previousButton.type = 'button';
      previousButton.className = 'button ghost';
      previousButton.textContent = 'Previous update';
      previousButton.disabled = currentUpdateIndex >= currentGame.updates.length - 1;
      previousButton.addEventListener('click', () => {
        if (currentUpdateIndex < currentGame.updates.length - 1) {
          currentUpdateIndex += 1;
          window.location.hash = currentGame.updates[currentUpdateIndex].id;
          render();
        }
      });

      const nextButton = document.createElement('button');
      nextButton.type = 'button';
      nextButton.className = 'button ghost';
      nextButton.textContent = 'Newer update';
      nextButton.disabled = currentUpdateIndex <= 0;
      nextButton.addEventListener('click', () => {
        if (currentUpdateIndex > 0) {
          currentUpdateIndex -= 1;
          window.location.hash = currentGame.updates[currentUpdateIndex].id;
          render();
        }
      });

      const position = document.createElement('span');
      position.className = 'devlog-position';
      position.textContent = `Update ${currentUpdateIndex + 1} of ${currentGame.updates.length}`;

      navRow.append(previousButton, nextButton, position);

      const jumpList = document.createElement('div');
      jumpList.className = 'devlog-jump-list';
      currentGame.updates.forEach((update, updateIndex) => {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'button ghost';
        jump.textContent = update.version || `Update ${updateIndex + 1}`;
        jump.setAttribute('aria-pressed', updateIndex === currentUpdateIndex ? 'true' : 'false');
        jump.addEventListener('click', () => {
          currentUpdateIndex = updateIndex;
          window.location.hash = update.id;
          render();
        });
        jumpList.appendChild(jump);
      });

      const body = document.createElement('div');
      body.className = 'devlog-body';

      if (currentUpdate.image) {
        const image = document.createElement('img');
        image.className = 'devlog-image';
        image.loading = 'lazy';
        image.src = currentUpdate.image;
        image.alt = currentUpdate.imageAlt || `${currentGame.name} update image`;
        body.appendChild(image);
      }

      if (currentUpdate.summary) {
        const summary = document.createElement('p');
        summary.className = 'lead';
        summary.textContent = currentUpdate.summary;
        body.appendChild(summary);
      }

      if (longContent.length > 0) {
        longContent.forEach((paragraphText) => {
          const paragraph = document.createElement('p');
          paragraph.textContent = paragraphText;
          body.appendChild(paragraph);
        });
      }

      viewer.append(tag, heading);
      if (meta.textContent) viewer.append(meta);
      viewer.append(navRow, jumpList, body);
    };

    selectFromHash();
    render();

    window.addEventListener('hashchange', () => {
      selectFromHash();
      render();
    });
  } catch (error) {
    renderError();
  }
})();

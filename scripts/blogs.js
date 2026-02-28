(async function loadDevLogs() {
  const container = document.getElementById('devlog-list');
  if (!container) return;

  const renderError = () => {
    container.innerHTML = `
      <article class="card">
        <h2>Could not load dev logs</h2>
        <p>Check that <code>data/devlogs.json</code> exists and is being served by your host.</p>
      </article>
    `;
  };

  try {
    const response = await fetch('data/devlogs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Bad response');

    const { posts } = await response.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      container.innerHTML = `
        <article class="card">
          <h2>No dev logs yet</h2>
          <p>Add the first post in <code>data/devlogs.json</code> and it will appear here automatically.</p>
        </article>
      `;
      return;
    }

    container.innerHTML = posts
      .map((post) => `
        <article class="card" id="${post.id}">
          <span class="pill">${post.tag}</span>
          <h2>${post.title}</h2>
          <p>${post.summary}</p>
        </article>
      `)
      .join('');
  } catch (error) {
    renderError();
  }
})();

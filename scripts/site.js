(() => {
  const body = document.body;
  if (!body) return;

  body.classList.add('js-site');

  const loader = document.createElement('div');
  loader.className = 'page-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.style.setProperty('--loader-progress', '7%');
  loader.innerHTML = `
    <div class="page-loader__inner">
      <div class="page-loader__halo" aria-hidden="true"></div>
      <div class="page-loader__ring" aria-hidden="true">
        <span class="page-loader__orb page-loader__orb--one"></span>
        <span class="page-loader__orb page-loader__orb--two"></span>
        <span class="page-loader__orb page-loader__orb--three"></span>
        <img class="page-loader__logo" src="/assets/logo.png" alt="" width="56" height="56" />
      </div>
      <p class="page-loader__text">Preparing your next low quality adventure</p>
      <div class="page-loader__bar" aria-hidden="true"><span></span></div>
      <p class="page-loader__percent" aria-atomic="true">7%</p>
    </div>
  `;
  body.prepend(loader);

  const percentNode = loader.querySelector('.page-loader__percent');
  let progress = 7;
  const easeProgress = () => {
    if (progress >= 92) return;
    progress += Math.max(1, (92 - progress) / 10);
    progress = Math.min(92, progress);
    const rounded = Math.round(progress);
    loader.style.setProperty('--loader-progress', `${rounded}%`);
    if (percentNode) {
      percentNode.textContent = `${rounded}%`;
    }
  };
  const progressTimer = window.setInterval(easeProgress, 140);

  requestAnimationFrame(() => body.classList.add('is-entering'));

  const hideLoader = () => {
    window.clearInterval(progressTimer);
    loader.classList.add('page-loader--done');
    loader.style.setProperty('--loader-progress', '100%');
    if (percentNode) {
      percentNode.textContent = '100%';
    }
    body.classList.add('is-loaded');
    setTimeout(() => loader.remove(), 760);
  };

  if (document.readyState === 'complete') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader, { once: true });
  }

  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;

    const href = link.getAttribute('href') || '';
    if (
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      link.target === '_blank' ||
      link.hasAttribute('download')
    ) {
      return;
    }

    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname === window.location.pathname && destination.hash) return;

    event.preventDefault();
    body.classList.add('is-leaving');
    setTimeout(() => {
      window.location.href = destination.href;
    }, 240);
  });
})();

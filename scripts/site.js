(() => {
  const body = document.body;
  if (!body) return;

  body.classList.add('js-site');

  const loader = document.createElement('div');
  loader.className = 'page-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML = `
    <div class="page-loader__inner">
      <img class="page-loader__logo" src="/assets/logo.png" alt="" width="52" height="52" />
      <p class="page-loader__text">Loading chaos...</p>
      <div class="page-loader__bar" aria-hidden="true"><span></span></div>
    </div>
  `;
  body.prepend(loader);

  requestAnimationFrame(() => body.classList.add('is-entering'));

  const hideLoader = () => {
    body.classList.add('is-loaded');
    setTimeout(() => loader.remove(), 550);
  };

  if (document.readyState === 'complete') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader, { once: true });
  }

  const cursorFx = document.querySelector('.cursor-fx');
  const updateCursor = (event) => {
    const x = `${event.clientX}px`;
    const y = `${event.clientY}px`;
    body.style.setProperty('--cursor-x', x);
    body.style.setProperty('--cursor-y', y);
    if (cursorFx) {
      cursorFx.style.left = x;
      cursorFx.style.top = y;
    }
  };

  window.addEventListener('pointermove', updateCursor);

  const hoverTargets = document.querySelectorAll('a, button, .button, .game-showcase, [data-cursor-hover]');
  hoverTargets.forEach((element) => {
    element.addEventListener('pointerenter', () => cursorFx?.classList.add('is-active'));
    element.addEventListener('pointerleave', () => cursorFx?.classList.remove('is-active'));
  });

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

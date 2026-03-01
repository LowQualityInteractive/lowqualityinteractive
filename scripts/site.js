(() => {
  const body = document.body;
  if (!body) return;

  const nav = document.querySelector('.nav');
  const headerRow = document.querySelector('.header-row');
  if (nav && headerRow) {
    const navToggle = document.createElement('button');
    navToggle.type = 'button';
    navToggle.className = 'nav-toggle';
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Open navigation menu');
    navToggle.setAttribute('aria-controls', 'primary-navigation');
    nav.id = 'primary-navigation';
    nav.hidden = true;
    navToggle.innerHTML = '<span></span><span></span><span></span>';
    headerRow.insertBefore(navToggle, nav);

    const setNavOpen = (open) => {
      nav.hidden = !open;
      nav.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      body.classList.toggle('nav-open', open);
    };

    const mediaQuery = window.matchMedia('(max-width: 800px)');
    const syncNavForViewport = () => {
      if (mediaQuery.matches) {
        setNavOpen(false);
      } else {
        nav.hidden = false;
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'true');
        navToggle.setAttribute('aria-label', 'Primary navigation');
        body.classList.remove('nav-open');
      }
    };

    navToggle.addEventListener('click', () => {
      setNavOpen(nav.hidden);
    });

    nav.addEventListener('click', (event) => {
      if (!mediaQuery.matches) return;
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest('a[href]')) return;
      setNavOpen(false);
    });

    mediaQuery.addEventListener('change', syncNavForViewport);
    syncNavForViewport();
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

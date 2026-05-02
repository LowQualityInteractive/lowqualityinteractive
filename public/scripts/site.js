(() => {
  const { hostname, protocol, pathname, search, hash } = window.location;
  const isSiteHost = /^(www\.)?lowqualityinteractive\.com$/i.test(hostname);
  if (isSiteHost) {
    const normalizedHost = hostname.replace(/^www\./i, '');
    if (protocol !== 'https:' || normalizedHost !== hostname) {
      window.location.replace(`https://${normalizedHost}${pathname}${search}${hash}`);
      return;
    }
  }

  const body = document.body;
  if (!body) {
    return;
  }

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle instanceof HTMLButtonElement && window.__lqiTheme) {
    window.__lqiTheme.syncToggleButton();
    themeToggle.addEventListener('click', () => {
      window.__lqiTheme?.toggle();
    });
  }

  const nav = document.querySelector('.nav');
  const headerRow = document.querySelector('.header-row');
  if (nav instanceof HTMLElement && headerRow instanceof HTMLElement) {
    const navToggle = document.createElement('button');
    navToggle.type = 'button';
    navToggle.className = 'nav-toggle';
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Open navigation menu');
    navToggle.setAttribute('aria-controls', 'primary-navigation');
    nav.id = 'primary-navigation';
    nav.hidden = true;

    for (let index = 0; index < 3; index += 1) {
      navToggle.appendChild(document.createElement('span'));
    }

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

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const getTransitionDestination = (link, event) => {
    const href = link.getAttribute('href') || '';
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:') ||
      link.target === '_blank' ||
      link.hasAttribute('download')
    ) {
      return null;
    }

    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin) {
      return null;
    }

    const isSamePageHashNavigation =
      destination.pathname === window.location.pathname &&
      destination.search === window.location.search &&
      destination.hash;
    if (isSamePageHashNavigation) {
      return null;
    }

    return destination;
  };

  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    const destination = getTransitionDestination(link, event);
    if (!destination) {
      return;
    }

    event.preventDefault();
    body.classList.add('is-leaving');
    window.setTimeout(() => {
      window.location.href = destination.href;
    }, prefersReducedMotion.matches ? 0 : 240);
  });
})();

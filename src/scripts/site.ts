interface MobileNavMessages {
  close: string;
  label: string;
  open: string;
}

interface LocaleSwitcherMessages {
  ariaLabel: string;
}

interface LocaleOption {
  nativeName: string;
}

interface SiteScriptMessages {
  localeSwitcher: LocaleSwitcherMessages;
  mobileNav: MobileNavMessages;
}

export function getSiteScript(
  messages: SiteScriptMessages,
  localeOptions: Record<string, LocaleOption>,
  isDefaultLocale: boolean,
) {
  return String.raw`(() => {
  const CONFIG = ${JSON.stringify({
    isDefaultLocale,
    localeOptions,
    messages,
    cookieKey: 'lqi-locale',
  })};
  const MOBILE_LABELS = CONFIG.messages.mobileNav;
  const LOCALE_LABELS = CONFIG.messages.localeSwitcher;
  const DEFAULT_LOCALE = 'en';
  const SUPPORTED_LOCALES = Object.keys(CONFIG.localeOptions);
  const NON_DEFAULT_LOCALES = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);
  const LOCALE_COOKIE_KEY = CONFIG.cookieKey;

  function getCookie(name) {
    const pattern = new RegExp('(?:^|; )' + name + '=([^;]*)');
    const match = document.cookie.match(pattern);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  const normalizeLocale = (value) =>
    typeof value === 'string' && SUPPORTED_LOCALES.includes(value) ? value : null;

  const getStoredLocale = () => normalizeLocale(getCookie(LOCALE_COOKIE_KEY));

  const setStoredLocale = (locale) => {
    if (!normalizeLocale(locale)) return;
    setCookie(LOCALE_COOKIE_KEY, locale, 365);
  };

  const getCurrentLocale = (pathname) => {
    const normalizedPath = pathname.toLowerCase();
    const matchedLocale = NON_DEFAULT_LOCALES.find((locale) => {
      const localePath = '/' + locale.toLowerCase();
      return normalizedPath === localePath || normalizedPath.startsWith(localePath + '/');
    });

    return matchedLocale || DEFAULT_LOCALE;
  };

  const stripLocalePrefix = (pathname) => {
    const currentLocale = getCurrentLocale(pathname);
    if (currentLocale === DEFAULT_LOCALE) {
      return pathname;
    }

    const localePrefix = '/' + currentLocale;
    const remainder = pathname.slice(localePrefix.length);
    if (!remainder || remainder === '/') {
      return '/';
    }

    return remainder.startsWith('/') ? remainder : '/' + remainder;
  };

  const buildLocalizedPath = (pathname, targetLocale) => {
    const normalizedPath = stripLocalePrefix(pathname);
    const pathWithoutSlashes =
      normalizedPath === '/' ? '' : normalizedPath.replace(/^\/+|\/+$/g, '');

    if (!pathWithoutSlashes) {
      return targetLocale === DEFAULT_LOCALE ? '/' : '/' + targetLocale + '/';
    }

    return targetLocale === DEFAULT_LOCALE
      ? '/' + pathWithoutSlashes + '/'
      : '/' + targetLocale + '/' + pathWithoutSlashes + '/';
  };

  const mapBrowserLocale = (value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const normalizedValue = value.trim().replace(/_/g, '-');
    const segments = normalizedValue.split('-').filter(Boolean);
    const language = (segments[0] || '').toLowerCase();
    const region = (segments[1] || '').toUpperCase();

    switch (language) {
      case 'pt':
        return 'pt-BR';
      case 'es':
        return region === 'ES' ? 'es-ES' : 'es-MX';
      case 'ru':
        return 'ru';
      case 'de':
        return 'de';
      case 'it':
        return 'it';
      case 'fr':
        return 'fr';
      case 'ro':
        return 'ro';
      case 'el':
        return 'el';
      case 'en':
        return 'en';
      default:
        return null;
    }
  };

  const detectPreferredLocale = () => {
    const candidates =
      Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];

    for (const candidate of candidates) {
      const mappedLocale = mapBrowserLocale(candidate);
      if (mappedLocale && SUPPORTED_LOCALES.includes(mappedLocale)) {
        return mappedLocale;
      }
    }

    return DEFAULT_LOCALE;
  };

  const { hostname, protocol, pathname, search, hash } = window.location;
  const isSiteHost = /^(www\.)?lowqualityinteractive\.com$/i.test(hostname);
  if (isSiteHost) {
    const normalizedHost = hostname.replace(/^www\./i, '');
    if (protocol !== 'https:' || normalizedHost !== hostname) {
      window.location.replace('https://' + normalizedHost + pathname + search + hash);
      return;
    }
  }

  // On any English page: if the user has a stored non-English locale preference,
  // or their browser prefers a non-English locale (first visit only), redirect.
  if (CONFIG.isDefaultLocale) {
    const preferredLocale = getStoredLocale() || detectPreferredLocale();
    setStoredLocale(preferredLocale);

    if (preferredLocale !== DEFAULT_LOCALE) {
      const destination = buildLocalizedPath(pathname, preferredLocale) + search + hash;
      if (destination !== pathname + search + hash) {
        window.location.replace(destination);
        return;
      }
    }
  }

  const body = document.body;
  if (!body) {
    return;
  }

  const localeSwitcher = document.querySelector('[data-locale-switcher]');
  const localeBtn = document.getElementById('locale-btn');
  const localeListbox = document.getElementById('locale-listbox');
  if (
    localeSwitcher instanceof HTMLElement &&
    localeBtn instanceof HTMLButtonElement &&
    localeListbox instanceof HTMLElement
  ) {
    const options = Array.from(localeListbox.querySelectorAll('[role="option"]'));

    let focusedIndex = -1;

    const getOptions = () => options;

    const setFocused = (index) => {
      getOptions().forEach((opt, i) => {
        opt.classList.toggle('is-focused', i === index);
      });
      focusedIndex = index;
      if (index >= 0) (getOptions()[index]).scrollIntoView({ block: 'nearest' });
    };

    const openListbox = () => {
      localeListbox.hidden = false;
      localeBtn.setAttribute('aria-expanded', 'true');
      const currentLocale = getCurrentLocale(window.location.pathname);
      const selectedIndex = getOptions().findIndex((opt) => opt.getAttribute('data-locale') === currentLocale);
      setFocused(selectedIndex >= 0 ? selectedIndex : 0);
      localeListbox.setAttribute('aria-activedescendant', '');
    };

    const closeListbox = () => {
      localeListbox.hidden = true;
      localeBtn.setAttribute('aria-expanded', 'false');
      setFocused(-1);
    };

    const selectLocale = (locale) => {
      const nextLocale = normalizeLocale(locale);
      if (!nextLocale) return;
      setStoredLocale(nextLocale);
      closeListbox();
      const destination =
        buildLocalizedPath(window.location.pathname, nextLocale) +
        window.location.search +
        window.location.hash;
      if (destination !== window.location.pathname + window.location.search + window.location.hash) {
        window.location.assign(destination);
      }
    };

    localeBtn.addEventListener('click', () => {
      if (localeListbox.hidden) openListbox();
      else closeListbox();
    });

    localeListbox.addEventListener('click', (e) => {
      const opt = e.target instanceof Element ? e.target.closest('[role="option"]') : null;
      if (opt) selectLocale(opt.getAttribute('data-locale'));
    });

    localeListbox.addEventListener('mousemove', (e) => {
      const opt = e.target instanceof Element ? e.target.closest('[role="option"]') : null;
      if (opt) setFocused(getOptions().indexOf(opt));
    });

    localeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openListbox();
      }
    });

    localeListbox.addEventListener('keydown', (e) => {
      const opts = getOptions();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocused(Math.min(focusedIndex + 1, opts.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocused(Math.max(focusedIndex - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocused(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocused(opts.length - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusedIndex >= 0) selectLocale(opts[focusedIndex].getAttribute('data-locale'));
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        closeListbox();
        localeBtn.focus();
      } else if (e.key.length === 1) {
        // Type-ahead
        const match = opts.findIndex((opt) =>
          (opt.textContent || '').trim().toLowerCase().startsWith(e.key.toLowerCase())
        );
        if (match >= 0) setFocused(match);
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!localeSwitcher.contains(e.target instanceof Element ? e.target : null)) {
        closeListbox();
      }
    });

    // When listbox is open, focus it so keyboard events land on it
    const observer = new MutationObserver(() => {
      if (!localeListbox.hidden) localeListbox.focus();
    });
    observer.observe(localeListbox, { attributeFilter: ['hidden'] });
    localeListbox.setAttribute('tabindex', '-1');

    window.addEventListener('pageshow', () => {
      closeListbox();
    });
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
    navToggle.setAttribute('aria-label', MOBILE_LABELS.open);
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
      navToggle.setAttribute('aria-label', open ? MOBILE_LABELS.close : MOBILE_LABELS.open);
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
        navToggle.setAttribute('aria-label', MOBILE_LABELS.label);
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
})();`;
}

import { serializeInlineData } from './inline-data';

interface MobileNavMessages {
  close: string;
  label: string;
  open: string;
}

interface SiteScriptMessages {
  mobileNav: MobileNavMessages;
}

export function getSiteScript(
  messages: SiteScriptMessages,
  supportedLocales: readonly string[],
  isDefaultLocale: boolean,
  noLocaleRedirect: boolean = false,
) {
  return String.raw`(() => {
  const CONFIG = ${serializeInlineData({
    isDefaultLocale,
    noLocaleRedirect,
    supportedLocales,
    messages,
    cookieKey: 'lqi-locale',
  })};
  const MOBILE_LABELS = CONFIG.messages.mobileNav;
  const DEFAULT_LOCALE = 'en';
  const SUPPORTED_LOCALES = CONFIG.supportedLocales;
  const NON_DEFAULT_LOCALES = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);
  const LOCALE_COOKIE_KEY = CONFIG.cookieKey;

  const { get: getCookie, set: setCookie } = window.__lqiCookies;

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

  // on en pages: redirect if the user has a stored non-en preference,
  // or if the browser politely insists on non-en on first visit.
  if (CONFIG.isDefaultLocale && !CONFIG.noLocaleRedirect) {
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
    localeListbox.setAttribute('tabindex', '-1');

    let focusedIndex = -1;

    const setFocused = (index) => {
      if (index === focusedIndex) return;
      options.forEach((opt, i) => {
        opt.classList.toggle('is-focused', i === index);
      });
      focusedIndex = index;
      if (index >= 0) options[index]?.scrollIntoView({ block: 'nearest' });
    };

    const openListbox = () => {
      localeListbox.hidden = false;
      localeBtn.setAttribute('aria-expanded', 'true');
      const currentLocale = getCurrentLocale(window.location.pathname);
      const selectedIndex = options.findIndex((opt) => opt.getAttribute('data-locale') === currentLocale);
      setFocused(selectedIndex >= 0 ? selectedIndex : 0);
      localeListbox.setAttribute('aria-activedescendant', '');
      localeListbox.focus({ preventScroll: true });
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

    localeListbox.addEventListener('pointermove', (e) => {
      const opt = e.target instanceof Element ? e.target.closest('[role="option"]') : null;
      if (opt) setFocused(options.indexOf(opt));
    });

    localeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openListbox();
      }
    });

    localeListbox.addEventListener('keydown', (e) => {
      const opts = options;
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
        // jump to whichever option starts with the key the user pressed.
        const match = opts.findIndex((opt) =>
          (opt.textContent || '').trim().toLowerCase().startsWith(e.key.toLowerCase())
        );
        if (match >= 0) setFocused(match);
      }
    });

    // close when the user clicks anywhere outside the dropdown.
    document.addEventListener('click', (e) => {
      if (!localeSwitcher.contains(e.target instanceof Element ? e.target : null)) {
        closeListbox();
      }
    });

    window.addEventListener('pageshow', () => {
      closeListbox();
    });
  }

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle instanceof HTMLButtonElement && window.__lqiTheme) {
    const themeModes = ['light', 'system', 'dark'];
    window.__lqiTheme.syncThemeControl();
    themeToggle.addEventListener('click', () => {
      const currentIndex = themeModes.indexOf(window.__lqiTheme?.get() || 'system');
      window.__lqiTheme?.set(themeModes[(currentIndex + 1) % themeModes.length]);
    });
  }

  const motionToggle = document.getElementById('motion-toggle');
  if (motionToggle instanceof HTMLButtonElement && window.__lqiMotionPreference) {
    const motionModes = ['motion', 'reduced', 'none'];
    window.__lqiMotionPreference.syncMotionControl();
    motionToggle.addEventListener('click', () => {
      const currentIndex = motionModes.indexOf(window.__lqiMotionPreference?.get() || 'motion');
      window.__lqiMotionPreference?.set(motionModes[(currentIndex + 1) % motionModes.length]);
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

  // page-to-page transitions are handled natively now: the css
  // @view-transition opt-in animates the cross-document hand-off, and
  // astro's link prefetch means the next page is usually already cached.
  // we deliberately do NOT intercept clicks with a manual fade + delay
  // anymore - that added a fixed ~800ms tax to every navigation and
  // fought the native transition. letting the browser drive it is both
  // faster and smoother.
})();`;
}

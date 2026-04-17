interface ThemeMessages {
  toDark: string;
  toLight: string;
}

export function getThemeScript(messages: ThemeMessages) {
  return String.raw`
(() => {
  const LABELS = ${JSON.stringify(messages)};
  const THEME_COOKIE = 'lqi-theme';
  const CONSENT_COOKIE = 'lqi-ok';
  const DARK = 'dark';
  const LIGHT = 'light';
  const root = document.documentElement;

  const { get: getCookie, set: setCookie } = window.__lqiCookies;

  function hasConsent() {
    return getCookie(CONSENT_COOKIE) === '1';
  }

  function getPreferredTheme() {
    const savedTheme = getCookie(THEME_COOKIE);
    if (savedTheme === DARK || savedTheme === LIGHT) {
      return savedTheme;
    }

    return LIGHT;
  }

  function applyTheme(theme) {
    if (theme === DARK) {
      root.setAttribute('data-theme', DARK);
      return;
    }

    root.removeAttribute('data-theme');
  }

  function getTheme() {
    return root.getAttribute('data-theme') === DARK ? DARK : LIGHT;
  }

  function syncToggleButton() {
    const button = document.getElementById('theme-toggle');
    if (!button) {
      return;
    }

    const isDark = getTheme() === DARK;
    const label = isDark ? LABELS.toLight : LABELS.toDark;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }

  root.classList.add('no-transition');
  applyTheme(getPreferredTheme());

  window.addEventListener('DOMContentLoaded', () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        root.classList.remove('no-transition');
      });
    });
  });

  window.__lqiTheme = {
    get() {
      return getTheme();
    },
    set(theme) {
      applyTheme(theme);
      setCookie(THEME_COOKIE, theme, 365);
      syncToggleButton();
    },
    toggle() {
      this.set(this.get() === DARK ? LIGHT : DARK);
    },
    grantConsent() {
      setCookie(CONSENT_COOKIE, '1', 365);
      setCookie(THEME_COOKIE, this.get(), 365);
    },
    hasConsent,
    syncToggleButton,
  };

  document.addEventListener('DOMContentLoaded', syncToggleButton, { once: true });
})();
`;
}

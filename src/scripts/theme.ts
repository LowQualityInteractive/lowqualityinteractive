export function getThemeScript() {
  return String.raw`
(() => {
  const THEME_COOKIE = 'lqi-theme';
  const CONSENT_COOKIE = 'lqi-ok';
  const LIGHT = 'light';
  const SYSTEM = 'system';
  const DARK = 'dark';
  const root = document.documentElement;
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const { get: getCookie, set: setCookie } = window.__lqiCookies;

  function hasConsent() {
    return getCookie(CONSENT_COOKIE) === '1';
  }

  function isThemeMode(value) {
    return value === LIGHT || value === SYSTEM || value === DARK;
  }

  function getPreferredMode() {
    const savedMode = getCookie(THEME_COOKIE);
    return isThemeMode(savedMode) ? savedMode : SYSTEM;
  }

  function getMode() {
    const mode = root.getAttribute('data-theme-mode');
    return isThemeMode(mode) ? mode : SYSTEM;
  }

  function getResolvedTheme(mode) {
    if (mode === SYSTEM) {
      return systemTheme.matches ? DARK : LIGHT;
    }
    return mode;
  }

  function applyMode(mode) {
    root.setAttribute('data-theme-mode', mode);
    if (getResolvedTheme(mode) === DARK) {
      root.setAttribute('data-theme', DARK);
    } else {
      root.removeAttribute('data-theme');
    }
  }

  function applyModeWithTransition(mode) {
    const motionMode = root.getAttribute('data-motion-mode');
    if (motionMode !== 'motion' || reducedMotion.matches || typeof document.startViewTransition !== 'function') {
      applyMode(mode);
      syncThemeControl();
      return;
    }

    root.classList.add('theme-transitioning');
    const transition = document.startViewTransition(() => {
      applyMode(mode);
      syncThemeControl();
    });
    transition.finished.finally(() => root.classList.remove('theme-transitioning'));
  }

  function syncThemeControl() {
    const mode = getMode();
    document.querySelectorAll('[data-theme-toggle]').forEach((toggle) => {
      if (!(toggle instanceof HTMLButtonElement)) return;
      const label = toggle.dataset.themeLabel || 'Theme';
      const modeLabel = toggle.dataset['label' + mode[0].toUpperCase() + mode.slice(1)] || mode;
      toggle.dataset.themeMode = mode;
      toggle.setAttribute('aria-label', label + ': ' + modeLabel);
      toggle.title = modeLabel;
    });
  }

  root.classList.add('no-transition');
  applyMode(getPreferredMode());

  window.addEventListener('DOMContentLoaded', () => {
    syncThemeControl();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => root.classList.remove('no-transition'));
    });
  }, { once: true });

  systemTheme.addEventListener('change', () => {
    if (getMode() === SYSTEM) {
      applyModeWithTransition(SYSTEM);
    }
  });

  window.__lqiTheme = {
    get() {
      return getMode();
    },
    set(mode) {
      const currentMode = getMode();
      if (!isThemeMode(mode) || mode === currentMode) return;
      const currentResolvedTheme = getResolvedTheme(currentMode);
      const nextResolvedTheme = getResolvedTheme(mode);
      if (currentResolvedTheme === nextResolvedTheme) {
        // Keep the technical preference change, but skip a pointless visual
        // transition when both modes resolve to the same light/dark theme.
        applyMode(mode);
        syncThemeControl();
      } else {
        applyModeWithTransition(mode);
      }
      setCookie(THEME_COOKIE, mode, 365);
    },
    grantConsent() {
      setCookie(CONSENT_COOKIE, '1', 365);
      setCookie(THEME_COOKIE, getMode(), 365);
    },
    hasConsent,
    syncThemeControl,
  };
})();
`;
}

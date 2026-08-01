export function getMotionPreferenceScript() {
  return String.raw`
(() => {
  const MOTION_COOKIE = 'lqi-motion';
  const MOTION = 'motion';
  const REDUCED = 'reduced';
  const NONE = 'none';
  const root = document.documentElement;
  const systemPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const { get: getCookie, set: setCookie } = window.__lqiCookies;

  const isMode = (value) => value === MOTION || value === REDUCED || value === NONE;
  const getPreferredMode = () => {
    const savedMode = getCookie(MOTION_COOKIE);
    if (isMode(savedMode)) return savedMode;
    return systemPreference.matches ? REDUCED : MOTION;
  };
  const getMode = () => {
    const mode = root.getAttribute('data-motion-mode');
    return isMode(mode) ? mode : getPreferredMode();
  };
  const applyMode = (mode) => {
    root.setAttribute('data-motion-mode', mode);
    root.classList.toggle('motion-none', mode === NONE);
  };
  const syncMotionControl = () => {
    const mode = getMode();
    document.querySelectorAll('[data-motion-toggle]').forEach((toggle) => {
      if (!(toggle instanceof HTMLButtonElement)) return;
      const label = toggle.dataset.motionLabel || 'Motion';
      const modeLabel = toggle.dataset['label' + mode[0].toUpperCase() + mode.slice(1)] || mode;
      toggle.dataset.motionMode = mode;
      toggle.setAttribute('aria-label', label + ': ' + modeLabel);
      toggle.title = modeLabel;
    });
  };

  applyMode(getPreferredMode());

  window.addEventListener('DOMContentLoaded', syncMotionControl, { once: true });
  systemPreference.addEventListener('change', () => {
    if (getCookie(MOTION_COOKIE) === null) {
      applyMode(systemPreference.matches ? REDUCED : MOTION);
      syncMotionControl();
      window.dispatchEvent(new CustomEvent('lqi-motion-mode-change', { detail: getMode() }));
    }
  });

  window.__lqiMotionPreference = {
    get() {
      return getMode();
    },
    set(mode) {
      if (!isMode(mode) || mode === getMode()) return;
      applyMode(mode);
      setCookie(MOTION_COOKIE, mode, 365);
      syncMotionControl();
      window.dispatchEvent(new CustomEvent('lqi-motion-mode-change', { detail: mode }));
    },
    syncMotionControl,
  };
})();
`;
}

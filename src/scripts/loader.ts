// inline boot script for the loading overlay. fires before anything
// renders, so the overlay covers the page until window 'load' resolves
// (fonts, images, deferred scripts all settled). a hard timeout caps
// the wait so a stuck resource never traps the user behind the overlay.
export function getLoaderBootstrap() {
  return String.raw`(() => {
  if (window.__lqiLoader) return;
  const root = document.documentElement;
  const READY_CLASS = 'lqi-ready';
  // failsafe so a hung resource can never trap the user behind the splash.
  const FALLBACK_MS = 4000;

  let resolved = false;
  const markReady = () => {
    if (resolved) return;
    resolved = true;
    root.classList.add(READY_CLASS);
  };

  // (fonts are self-hosted via @font-face now - no deferred stylesheet to
  // promote, so the old media="print"->"all" flip is gone.)

  // the overlay is a first-impression splash, not a per-navigation gate.
  // show it only on the first page of a session; once the user is moving
  // between pages, the native cross-document view transition owns the
  // hand-off and a spinner would just sit on top of it. mark ready
  // synchronously (before first paint) so the overlay never even shows.
  let firstVisit = true;
  try {
    firstVisit = !sessionStorage.getItem('lqi-seen');
    sessionStorage.setItem('lqi-seen', '1');
  } catch (e) {}

  if (!firstVisit) {
    markReady();
  } else if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // one frame so the overlay actually paints before we fade it,
    // otherwise the user sees a single-frame flash on fast loads.
    requestAnimationFrame(() => requestAnimationFrame(markReady));
  } else {
    // clear as soon as the dom is parsed (css is already applied by then);
    // we no longer wait on every image/font to finish, which is what made
    // the splash overstay its welcome. keep a failsafe timeout regardless.
    document.addEventListener(
      'DOMContentLoaded',
      () => requestAnimationFrame(markReady),
      { once: true },
    );
    setTimeout(markReady, FALLBACK_MS);
  }

  // bfcache restore: pages may persist with the ready class already on,
  // but a navigation we triggered via the leave-fade will have stripped
  // it. either way, ensure the overlay is gone.
  window.addEventListener('pageshow', markReady);

  window.__lqiLoader = {
    show() {
      resolved = false;
      root.classList.remove(READY_CLASS);
    },
    hide: markReady,
  };
})();`;
}

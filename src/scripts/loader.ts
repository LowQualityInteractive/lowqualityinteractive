// inline boot script for the loading overlay. fires before anything
// renders, so the overlay covers the page until window 'load' resolves
// (fonts, images, deferred scripts all settled). a hard timeout caps
// the wait so a stuck resource never traps the user behind the overlay.
export function getLoaderBootstrap() {
  return String.raw`(() => {
  if (window.__lqiLoader) return;
  const root = document.documentElement;
  const READY_CLASS = 'lqi-ready';
  // failsafe in case 'load' never fires (broken third-party, hung image).
  const FALLBACK_MS = 6000;

  let resolved = false;
  const markReady = () => {
    if (resolved) return;
    resolved = true;
    root.classList.add(READY_CLASS);
  };

  // promote the deferred web-font stylesheet to media="all" once the
  // browser has had a chance to fetch it without blocking initial paint.
  // can't use inline onload= on the <link> (csp would forbid it), so
  // we do the flip from this hashed inline boot script instead.
  const promoteFontLink = () => {
    const link = document.getElementById('google-fonts-link');
    if (link && link.getAttribute('media') !== 'all') {
      link.setAttribute('media', 'all');
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', promoteFontLink, { once: true });
  } else {
    promoteFontLink();
  }

  // already loaded by the time we ran (cached navigation, fast network).
  if (document.readyState === 'complete') {
    // one frame so the overlay actually paints before we fade it,
    // otherwise the user sees a single-frame flash on fast loads.
    requestAnimationFrame(() => requestAnimationFrame(markReady));
  } else {
    window.addEventListener('load', markReady, { once: true });
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

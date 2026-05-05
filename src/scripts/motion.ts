// tiny inline scripts that need to run synchronously and get hashed for
// the strict csp. heavier work — reveals, counters, magnetic buttons,
// hero spotlight, image fade — lives in scripts/motion-runtime.ts which
// astro bundles and serves from /_astro/ (allowed by script-src 'self').

export function getMotionBootstrap() {
  return String.raw`(() => {
  // sync head script: latch the js-available signal before paint so
  // reveal/entrance hide-styles activate without a flash of content.
  document.documentElement.classList.add('js-motion');
})();`;
}

export function getMotionScript() {
  // header scroll-state stays inline because it needs to run immediately
  // on page load (so .is-scrolled is applied before the user scrolls).
  // everything else lives in motion-runtime.ts.
  return String.raw`(() => {
  const header = document.querySelector('.site-header');
  if (header instanceof HTMLElement) {
    let raf = 0;
    const update = () => {
      raf = 0;
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    update();
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    }, { passive: true });
  }
})();`;
}

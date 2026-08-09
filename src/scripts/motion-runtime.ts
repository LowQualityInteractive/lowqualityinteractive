// motion one runtime. astro bundles this and serves it from /_astro/,
// which our existing csp `script-src 'self'` already lets through, so we
// don't need a hash for it.
//
// this file owns the obvious stuff:
//   - hero entrance with stagger and a nice spring
//   - reveal-on-scroll with displacement big enough to actually see
//   - image fade-in once they actually decode
//
// the inline motion script is still around for the head bootstrap
// (the .js-motion class set before paint) and the header scroll state.

// Every active animation targets DOM styles, so the WAAPI-only build is enough.
// The hybrid build was 68 KB and its object-animation path had no live caller.
import { animate } from 'motion/mini';
import { inView, stagger } from 'motion';

// tells the rest of the page that we're in charge now. css uses
// .motion-active to switch off the static keyframe fallbacks. without
// this both the keyframe and the web animations api would fight over
// the same properties, and that fight is ugly.
document.documentElement.classList.add('motion-active');

const root = document.documentElement;
const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const getMotionMode = () => root.getAttribute('data-motion-mode') || (systemReducedMotion.matches ? 'reduced' : 'motion');
const shouldReduceMotion = () => getMotionMode() !== 'motion';
const isNoMotion = () => getMotionMode() === 'none';
const easeEnter = [0.16, 1, 0.3, 1] as const;
const easeReveal = [0.22, 1, 0.36, 1] as const;

// motion one commits the final keyframe values to inline styles when an
// animation ends (transform, opacity). inline beats class selectors, so
// if we don't clean up, every revealed card stays pinned at translateY(0)
// and ignores hover forever. we hand the resting state back to css.
const releaseToCSS = (el: HTMLElement) => {
  el.style.opacity = '1';
  el.style.transform = '';
  el.style.willChange = '';
};

const revealElement = (el: HTMLElement) => {
  if (!el.isConnected) {
    // One retry covers callers that append on the next frame without leaving
    // an unbounded rAF loop behind if the node is never connected.
    requestAnimationFrame(() => {
      if (el.isConnected) revealElement(el);
    });
    return;
  }

  el.classList.add('is-revealed');
  if (shouldReduceMotion()) {
    releaseToCSS(el);
    return;
  }

  el.style.opacity = '0';
  el.style.transform = 'translate3d(0, 22px, 0) scale(0.97)';
  el.style.willChange = 'opacity, transform';
  animate(
    el,
    {
      opacity: [0, 1],
      transform: [
        'translate3d(0, 22px, 0) scale(0.97)',
        'translate3d(0, 0, 0) scale(1)',
      ],
    },
    { duration: 0.62, ease: easeReveal },
  ).finished.then(() => releaseToCSS(el)).catch(() => releaseToCSS(el));
};

const tweenContentSwap = (root: HTMLElement, mutate: () => void) => {
  if (shouldReduceMotion()) {
    mutate();
    return;
  }

  root.style.willChange = 'opacity, transform, filter';
  animate(
    root,
    {
      opacity: [1, 0],
      transform: ['translate3d(0, 0, 0) scale(1)', 'translate3d(0, -8px, 0) scale(0.985)'],
      filter: ['blur(0px)', 'blur(2px)'],
    },
    { duration: 0.22, ease: [0.4, 0, 1, 1] },
  ).finished.then(() => {
    mutate();
    root.style.opacity = '0';
    root.style.transform = 'translate3d(0, 12px, 0) scale(0.985)';
    root.style.filter = 'blur(2px)';
    animate(
      root,
      {
        opacity: [0, 1],
        transform: ['translate3d(0, 12px, 0) scale(0.985)', 'translate3d(0, 0, 0) scale(1)'],
        filter: ['blur(2px)', 'blur(0px)'],
      },
      { duration: 0.44, ease: easeEnter },
    ).finished.then(() => {
      root.style.opacity = '';
      root.style.transform = '';
      root.style.filter = '';
      root.style.willChange = '';
    });
  });
};

window.__lqiMotion = {
  replaceChildren(root, children) {
    tweenContentSwap(root, () => root.replaceChildren(...children));
  },
  enter(root) {
    const children = Array.from(root.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    if (children.length === 0) return;
    if (isNoMotion()) {
      children.forEach(releaseToCSS);
      return;
    }
    if (shouldReduceMotion()) return;
    children.forEach((child) => {
      child.style.opacity = '0';
      child.style.transform = 'translate3d(0, 14px, 0) scale(0.985)';
      child.style.willChange = 'opacity, transform';
    });
    animate(
      children,
      {
        opacity: [0, 1],
        transform: ['translate3d(0, 14px, 0) scale(0.985)', 'translate3d(0, 0, 0) scale(1)'],
      },
      { duration: 0.5, delay: stagger(0.05), ease: easeEnter },
    ).finished.then(() => {
      children.forEach(releaseToCSS);
    });
  },
  reveal(element) {
    revealElement(element);
  },
};

const settleForMotionMode = () => {
  const mode = getMotionMode();
  if (mode === 'motion') return;
  document.getAnimations().forEach((animation) => animation.cancel());
  const selector = mode === 'none' ? '[data-reveal], .hero-enter' : '[data-reveal].is-revealed, .hero-enter';
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    if (mode === 'none') el.classList.add('is-revealed');
    releaseToCSS(el);
  });
};

window.addEventListener('lqi-motion-mode-change', settleForMotionMode);
settleForMotionMode();

// hero entrance.
// the lcp candidate is usually a hero-enter <p>. we deliberately do
// NOT animate opacity here - the css path keeps these elements at
// opacity:1 from the first frame so lighthouse records lcp immediately
// instead of waiting for this bundled runtime to download. transform
// is what reads as motion; we run a richer spring on top of (or in
// place of) the css keyframe.
const heroChildren = Array.from(document.querySelectorAll<HTMLElement>('.hero-enter'));
if (heroChildren.length > 0) {
  if (shouldReduceMotion()) {
    // reduce-motion: no translate, no fade. the css path already shows
    // the element. nothing to do here.
    heroChildren.forEach(releaseToCSS);
  } else {
    // pin start transform so the spring has somewhere to come from.
    // opacity stays at 1 throughout. 24px is enough movement to read
    // without dragging the entrance out.
    heroChildren.forEach((el) => {
      el.style.transform = 'translate3d(0, 24px, 0) scale(0.97)';
    });
    animate(
      heroChildren,
      {
        transform: [
          'translate3d(0, 24px, 0) scale(0.97)',
          'translate3d(0, 0, 0) scale(1)',
        ],
      },
      {
        duration: 0.78,
        delay: stagger(0.08, { startDelay: 0.04 }),
        ease: easeEnter,
      },
    ).finished.then(() => {
      // hand the resting state back to css so hover transforms work.
      heroChildren.forEach(releaseToCSS);
    }).catch(() => {
      // belt-and-braces: if the animation rejects for any reason, never
      // leave the user staring at translated elements.
      heroChildren.forEach(releaseToCSS);
    });
  }
}

// reveal on scroll.
// inView fires once per element when it enters the viewport. the css
// fallback in global.css uses .motion-active to switch off its keyframe
// when this runtime is alive, so only one animation drives transform
// at any given time. (one cook in the kitchen, please.)
const reveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
if (reveals.length > 0) {
  if (isNoMotion()) {
    reveals.forEach((el) => {
      el.classList.add('is-revealed');
      releaseToCSS(el);
    });
  } else if (shouldReduceMotion()) {
    // reduce-motion path: opacity-only fade-in on enter, no translate.
    // we still gate on inView so off-screen content doesn't flash all at
    // once when the page first loads.
    reveals.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = '';
    });
    // One observer handles the full set. Calling inView once per element
    // creates one IntersectionObserver per node in Motion.
    inView(
      reveals,
      (element) => {
        const el = element as HTMLElement;
        el.classList.add('is-revealed');
        animate(el, { opacity: [0, 1] }, { duration: 0.45, ease: easeEnter })
          .finished.then(() => releaseToCSS(el))
          .catch(() => releaseToCSS(el));
        return undefined;
      },
      { margin: '0px 0px -10% 0px' },
    );
  } else {
    // pin the initial offset so the js-driven animation has somewhere
    // to come from. .motion-active gates the css fallback off so these
    // inline styles are the only thing shaping the start state.
    reveals.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translate3d(0, 26px, 0) scale(0.97)';
      el.style.willChange = 'opacity, transform';
    });
    inView(
      reveals,
      (element) => {
        const el = element as HTMLElement;
        el.classList.add('is-revealed');
        animate(
          el,
          {
            opacity: [0, 1],
            transform: [
              'translate3d(0, 26px, 0) scale(0.97)',
              'translate3d(0, 0, 0) scale(1)',
            ],
          },
          {
            duration: 0.62,
            ease: easeReveal,
          },
        ).finished.then(() => {
          // once revealed, give transform/opacity back to css so hover
          // (.game-card:hover etc.) and the magnetic rule can apply.
          releaseToCSS(el);
        }).catch(() => {
          // if the animation rejects, never leave the element invisible.
          releaseToCSS(el);
        });
        // No cleanup callback means reveal once, then unobserve.
        return undefined;
      },
      { margin: '0px 0px -10% 0px' },
    );
  }
}

// image fade-in on load.
const fadeImages = document.querySelectorAll<HTMLImageElement>('img[data-fade]');
fadeImages.forEach((img) => {
  if (img.complete && img.naturalWidth > 0) {
    img.classList.add('img-loaded');
  } else {
    img.addEventListener('load', () => img.classList.add('img-loaded'), { once: true });
    img.addEventListener('error', () => img.classList.add('img-loaded'), { once: true });
  }
});

// hero marquee speed-up on hover (small flair).
// already handled by css via animation-play-state: paused. no js needed.

export {};

// motion one runtime. astro bundles this and serves it from /_astro/,
// which our existing csp `script-src 'self'` already lets through, so we
// don't need a hash for it.
//
// this file owns the obvious stuff:
//   - hero entrance with stagger and a nice spring
//   - reveal-on-scroll with displacement big enough to actually see
//   - counter roll-ups (because watching numbers go brrr is fun)
//   - image fade-in once they actually decode
//   - magnetic buttons that follow the cursor like they want a hug
//   - hero spotlight (just a soft halo following the pointer around)
//
// the inline motion script is still around for the head bootstrap
// (the .js-motion class set before paint) and the header scroll state.

import { animate, inView, stagger } from 'motion';

// tells the rest of the page that we're in charge now. css uses
// .motion-active to switch off the static keyframe fallbacks. without
// this both the keyframe and the web animations api would fight over
// the same properties, and that fight is ugly.
document.documentElement.classList.add('motion-active');

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hoverable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const easeEnter = [0.16, 1, 0.3, 1] as const;
const easeReveal = [0.22, 1, 0.36, 1] as const;
const easePop = [0.34, 1.45, 0.5, 1] as const;

// motion one commits the final keyframe values to inline styles when an
// animation ends (transform, opacity). inline beats class selectors, so
// if we don't clean up, every revealed card stays pinned at translateY(0)
// and ignores hover forever. we hand the resting state back to css.
const releaseToCSS = (el: HTMLElement) => {
  el.style.opacity = '1';
  el.style.transform = '';
  el.style.willChange = '';
};

const tweenContentSwap = (root: HTMLElement, mutate: () => void) => {
  if (reduce) {
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
    { duration: 0.45, ease: [0.4, 0, 1, 1] },
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
      { duration: 0.9, ease: easeEnter },
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
    if (reduce) return;
    const children = Array.from(root.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    if (children.length === 0) return;
    children.forEach((child) => {
      child.style.opacity = '0';
      child.style.transform = 'translate3d(0, 16px, 0) scale(0.98)';
      child.style.willChange = 'opacity, transform';
    });
    animate(
      children,
      {
        opacity: [0, 1],
        transform: ['translate3d(0, 16px, 0) scale(0.98)', 'translate3d(0, 0, 0) scale(1)'],
      },
      { duration: 0.95, delay: stagger(0.11), ease: easeEnter },
    ).finished.then(() => {
      children.forEach(releaseToCSS);
    });
  },
};

// hero entrance.
// the lcp candidate is usually a hero-enter <p>. we deliberately do
// NOT animate opacity here — the css path keeps these elements at
// opacity:1 from the first frame so lighthouse records lcp immediately
// instead of waiting for this bundled runtime to download. transform
// is what reads as motion; we run a richer spring on top of (or in
// place of) the css keyframe.
const heroChildren = Array.from(document.querySelectorAll<HTMLElement>('.hero-enter'));
if (heroChildren.length > 0) {
  if (reduce) {
    // reduce-motion: no translate, no fade. the css path already shows
    // the element. nothing to do here.
    heroChildren.forEach(releaseToCSS);
  } else {
    // pin start transform so the spring has somewhere to come from.
    // opacity stays at 1 throughout. 60px is movement you can see.
    heroChildren.forEach((el) => {
      el.style.transform = 'translate3d(0, 60px, 0) scale(0.92)';
    });
    animate(
      heroChildren,
      {
        transform: [
          'translate3d(0, 60px, 0) scale(0.92)',
          'translate3d(0, 0, 0) scale(1)',
        ],
      },
      {
        duration: 2.2,
        delay: stagger(0.22, { startDelay: 0.1 }),
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
  if (reduce) {
    // reduce-motion path: opacity-only fade-in on enter, no translate.
    // we still gate on inView so off-screen content doesn't flash all at
    // once when the page first loads.
    reveals.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = '';
    });
    reveals.forEach((el) => {
      inView(
        el,
        () => {
          el.classList.add('is-revealed');
          animate(el, { opacity: [0, 1] }, { duration: 0.45, ease: easeEnter })
            .finished.then(() => releaseToCSS(el))
            .catch(() => releaseToCSS(el));
          return undefined;
        },
        { margin: '0px 0px -10% 0px' },
      );
    });
  } else {
    // pin the initial offset so the js-driven animation has somewhere
    // to come from. .motion-active gates the css fallback off so these
    // inline styles are the only thing shaping the start state.
    reveals.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translate3d(0, 70px, 0) scale(0.94)';
      el.style.willChange = 'opacity, transform';
    });
    reveals.forEach((el) => {
      inView(
        el,
        () => {
          el.classList.add('is-revealed');
          animate(
            el,
            {
              opacity: [0, 1],
              transform: [
                'translate3d(0, 70px, 0) scale(0.94)',
                'translate3d(0, 0, 0) scale(1)',
              ],
            },
            {
              duration: 1.9,
              ease: easeReveal,
            },
          ).finished.then(() => {
            // once revealed, give transform/opacity back to css so hover
            // (.game-card:hover etc.) and the magnetic rule can apply.
            // this is the surgical fix for the bug where every revealed
            // card stayed pinned and quietly ignored every hover attempt.
            releaseToCSS(el);
          }).catch(() => {
            // if the animation rejects, never leave the element invisible.
            releaseToCSS(el);
          });
          // inView callbacks can return a cleanup that fires on leave.
          // we don't replay, so undefined = once and done.
          return undefined;
        },
        { margin: '0px 0px -10% 0px' },
      );
    });
  }
}

// counter roll-up via motion one.
const counters = Array.from(document.querySelectorAll<HTMLElement>('[data-counter]'));

const formatCounter = (value: number, mode: string) => {
  if (mode === 'auto') {
    if (value >= 1_000_000) {
      const v = value / 1_000_000;
      return (v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')) + 'M';
    }
    if (value >= 1_000) {
      const v = value / 1_000;
      return (v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')) + 'k';
    }
    return String(Math.round(value));
  }
  if (mode === 'plus') return Math.round(value) + '+';
  return String(Math.round(value));
};

counters.forEach((el) => {
  const target = Number(el.getAttribute('data-counter'));
  const mode = el.getAttribute('data-counter-format') || 'none';
  if (!Number.isFinite(target) || target <= 0) {
    el.textContent = el.getAttribute('data-counter-fallback') || '—';
    return;
  }
  if (reduce) {
    el.textContent = formatCounter(target, mode);
    return;
  }
  inView(
    el,
    () => {
      const obj = { v: 0 };
      animate(
        obj,
        { v: target },
        {
          duration: Math.min(3.8, 1.8 + Math.log10(target + 1) * 0.36),
          ease: easeReveal,
          onUpdate: (latest) => {
            el.textContent = formatCounter(latest as number, mode);
          },
        },
      ).finished.then(() => {
        el.textContent = formatCounter(target, mode);
        // pop the final value so it lands with weight, then hand the
        // committed inline transform back to css so an inner-element
        // hover (.stat-tile:hover .stat-tile-value etc) can still apply.
        animate(
          el,
          { transform: ['scale(1)', 'scale(1.08)', 'scale(1)'] },
          { duration: 0.9, ease: easePop },
        ).finished.then(() => {
          el.style.transform = '';
        });
      });
      return undefined;
    },
    { margin: '0px 0px -20% 0px' },
  );
});

// magnetic buttons (cursor pull).
if (hoverable && !reduce) {
  const magnets = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]'));
  const STRENGTH = 0.28;
  const MAX = 12;
  magnets.forEach((el) => {
    let raf = 0;
    let tx = 0;
    let ty = 0;
    const apply = () => {
      raf = 0;
      el.style.setProperty('--mx', tx.toFixed(2) + 'px');
      el.style.setProperty('--my', ty.toFixed(2) + 'px');
    };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) * STRENGTH;
      const dy = (e.clientY - cy) * STRENGTH;
      tx = Math.max(-MAX, Math.min(MAX, dx));
      ty = Math.max(-MAX, Math.min(MAX, dy));
      if (!raf) raf = requestAnimationFrame(apply);
    });
    el.addEventListener('pointerleave', () => {
      // crucial: cancel any pointermove rAF still queued. without this
      // it would fire AFTER our spring-back starts, snap --mx/--my to
      // the latest tx/ty (which we're about to zero anyway), and the
      // animate() call below would have nothing left to animate from
      // — the bigger ctas (PLAY) showed this clearly because they had
      // bigger pre-animate offsets to fail to spring back from.
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      tx = 0;
      ty = 0;
      // capture the live offsets as the start of the spring-back so the
      // animation has something to interpolate from regardless of when
      // the browser last committed the inline style.
      const fromX = el.style.getPropertyValue('--mx') || '0px';
      const fromY = el.style.getPropertyValue('--my') || '0px';
      animate(
        el,
        { '--mx': [fromX, '0px'], '--my': [fromY, '0px'] },
        { duration: 0.55, ease: easeEnter },
      );
    });
  });

  // (cursor spotlight intentionally removed — was decorative noise.)
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

import { serializeInlineData } from './inline-data';

// iife that sets up window.__lqiTranslate. backend is lingva.ml (a foss
// google-translate proxy that returns access-control-allow-origin: *,
// so we can call it from the browser - google's own translate_a/single
// endpoint omits cors and is unreachable from a non-google origin).
//
// localStorage cache (persistent across sessions) keyed by source-text
// hash. inflight de-dup so simultaneous calls for the same string
// share one fetch. on failure the runtime returns the english source
// silently - never an empty node.
//
// the build-time pipeline (scripts/translate-locales.mjs) covers the
// big visible surfaces (markdown bodies, faqs, page descriptions); the
// runtime translator is only there for hardcoded inline strings the
// build pipeline doesn't reach yet.
export function getTranslateBootstrap(locale: string, toastLabel: string) {
  return String.raw`(() => {
  if (window.__lqiTranslate) return;
  const LOCALE = ${serializeInlineData(locale)};
  const TOAST_LABEL = ${serializeInlineData(toastLabel)};
  if (LOCALE === 'en') {
    window.__lqiTranslate = {
      enabled: false,
      one: (t) => Promise.resolve(t),
      translateScope: () => {},
    };
    return;
  }
  // lingva collapses regional variants (es-MX/es-ES -> es, pt-BR -> pt).
  const MAP = {
    'pt-BR': 'pt', 'es-MX': 'es', 'es-ES': 'es',
    ru: 'ru', de: 'de', it: 'it', fr: 'fr', ro: 'ro', el: 'el',
  };
  const target = MAP[LOCALE] || LOCALE;
  const MAX_SOURCE_LENGTH = 1000;
  const MAX_RESPONSE_BYTES = 16 * 1024;
  const MAX_TRANSLATION_LENGTH = 8 * 1024;
  const hash = (s) => {
    let h1 = 5381;
    let h2 = 2166136261;
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      h1 = ((h1 << 5) + h1) ^ code;
      h2 = Math.imul(h2 ^ code, 16777619);
    }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  };
  // localStorage > sessionStorage so a returning visitor doesn't pay
  // for the same translations again. quotas are per-origin so we have
  // ~5MB to play with - more than enough for the strings we tag.
  const cacheGet = (k) => {
    try {
      const value = localStorage.getItem(k);
      return value !== null && value.length <= MAX_TRANSLATION_LENGTH ? value : null;
    } catch { return null; }
  };
  const cacheSet = (k, v) => {
    if (typeof v !== 'string' || v.length > MAX_TRANSLATION_LENGTH) return;
    try { localStorage.setItem(k, v); } catch {}
  };
  const readCappedText = async (response, byteCap) => {
    const rawContentLength = response.headers.get('content-length');
    if (rawContentLength !== null) {
      const contentLength = Number(rawContentLength);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > byteCap) {
        throw new Error('lingva response too large');
      }
    }

    if (!response.body) {
      const text = await response.text();
      if (text.length > byteCap || new TextEncoder().encode(text).byteLength > byteCap) {
        throw new Error('lingva response too large');
      }
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let byteLength = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > byteCap) {
        await reader.cancel('lingva response too large').catch(() => {});
        throw new Error('lingva response too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  };
  // bottom-right toast that appears as soon as the first uncached
  // translation is in flight and disappears once everything settles.
  // a thin progress bar at the bottom of the toast fills from 0 -> 100
  // based on done/total. cache hits don't count - the user only sees
  // the toast for actual network work.
  let toastEl = null;
  let toastBarEl = null;
  let toastHideTimer = 0;
  let toastRemoveTimer = 0;
  let totalCalls = 0;
  let doneCalls = 0;
  const ensureToast = () => {
    if (toastEl || !document.body) return;
    toastEl = document.createElement('div');
    toastEl.className = 'lqi-translate-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    const label = document.createElement('span');
    label.className = 'lqi-translate-toast-label';
    label.textContent = TOAST_LABEL;
    toastEl.appendChild(label);
    const dots = document.createElement('span');
    dots.className = 'lqi-translate-toast-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = '...';
    toastEl.appendChild(dots);
    const bar = document.createElement('div');
    bar.className = 'lqi-translate-toast-bar';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('div');
    fill.className = 'lqi-translate-toast-fill';
    bar.appendChild(fill);
    toastEl.appendChild(bar);
    toastBarEl = fill;
    document.body.appendChild(toastEl);
  };
  const updateToast = () => {
    if (!toastEl) return;
    const ratio = totalCalls === 0 ? 0 : Math.min(1, doneCalls / totalCalls);
    if (toastBarEl) toastBarEl.style.width = (ratio * 100).toFixed(1) + '%';
    if (doneCalls >= totalCalls) {
      // all in-flight resolved. hold the bar full for a beat so the
      // animation lands, then fade out. if a new translation starts in
      // the meantime, cancel the timer and stay visible.
      if (toastHideTimer) clearTimeout(toastHideTimer);
      toastHideTimer = setTimeout(() => {
        toastHideTimer = 0;
        if (toastEl && doneCalls >= totalCalls) {
          toastEl.classList.add('is-hiding');
          toastRemoveTimer = setTimeout(() => {
            toastRemoveTimer = 0;
            if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
            toastEl = null;
            toastBarEl = null;
            totalCalls = 0;
            doneCalls = 0;
          }, 320);
        }
      }, 250);
    } else {
      if (toastHideTimer) { clearTimeout(toastHideTimer); toastHideTimer = 0; }
      if (toastRemoveTimer) { clearTimeout(toastRemoveTimer); toastRemoveTimer = 0; }
      toastEl.classList.remove('is-hiding');
    }
  };
  const trackCall = (promise) => {
    totalCalls += 1;
    ensureToast();
    updateToast();
    promise.then(() => {
      doneCalls += 1;
      updateToast();
    });
    return promise;
  };

  const inflight = new Map();
  const one = (text) => {
    if (!text || !text.trim()) return Promise.resolve(text);
    if (text.length > MAX_SOURCE_LENGTH) return Promise.resolve(text);
    const key = 'lqi-tx-' + LOCALE + '-' + text.length + '-' + hash(text);
    const cached = cacheGet(key);
    if (cached !== null) return Promise.resolve(cached);
    if (inflight.has(key)) return inflight.get(key);
    const url = 'https://lingva.ml/api/v1/en/' + target + '/' + encodeURIComponent(text);
    const p = fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      mode: 'cors',
      referrerPolicy: 'no-referrer',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('lingva ' + r.status);
        const contentType = (r.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('application/json')) throw new Error('lingva content type');
        const raw = await readCappedText(r, MAX_RESPONSE_BYTES);
        return JSON.parse(raw);
      })
      .then((data) => {
        const result = data && typeof data.translation === 'string' ? data.translation : text;
        const out = (
          !result.trim()
          || result === text
          || result.length > MAX_TRANSLATION_LENGTH
          || result.length > text.length * 8 + 256
        ) ? text : result;
        cacheSet(key, out);
        return out;
      })
      .catch(() => text);
    const tracked = p.finally(() => inflight.delete(key));
    inflight.set(key, tracked);
    trackCall(tracked);
    return tracked;
  };
  // when the runtime rewrites a node's textContent, the MutationObserver
  // would otherwise fire for every change and bounce us back into
  // translateAll(). a guard counter lets the observer skip mutations
  // that were caused by our own writes.
  let writing = 0;
  const translateNode = (node) => {
    if (!node || node.__lqiTranslated) return;
    const original = (node.textContent || '').trim();
    if (!original) return;
    node.__lqiTranslated = true;
    window.__lqiTranslate.one(original).then((translated) => {
      if (translated && translated !== original) {
        writing += 1;
        node.textContent = translated;
        // step back out of the guard one rAF later so the observer
        // doesn't see the write event before we've cleared the flag.
        requestAnimationFrame(() => { writing = Math.max(0, writing - 1); });
      }
    });
  };

  // deep mode: rather than collapsing the whole subtree's textContent
  // into one backend call (which loses structure), translate each
  // block-level element individually. used on rendered markdown so
  // paragraphs, headings, list items each translate as their own short
  // string. structural tags survive the translation pass intact.
  // BLOCK_TAGS picks the elements that read as standalone units. we
  // skip <pre>/<code> on purpose - the backend mangles code, and the
  // few lines of code we ever ship in markdown should stay as-authored.
  const BLOCK_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'DT', 'DD',
  ]);
  const translateDeep = (root) => {
    if (!root || root.__lqiTranslatedDeep) return;
    root.__lqiTranslatedDeep = true;
    const walk = (el) => {
      if (!(el instanceof Element)) return;
      const tag = el.tagName;
      if (tag === 'PRE' || tag === 'CODE' || tag === 'SCRIPT' || tag === 'STYLE') return;
      if (BLOCK_TAGS.has(tag)) {
        // only translate when the block has no block-level descendants
        // (otherwise we'd duplicate work - the inner blocks will be hit
        // by their own walk pass). a <p> with inline <strong>/<em> is a
        // leaf for us; a <blockquote> wrapping <p>s is not.
        let hasBlockChild = false;
        for (const child of el.children) {
          if (BLOCK_TAGS.has(child.tagName)) { hasBlockChild = true; break; }
        }
        if (!hasBlockChild) {
          translateNode(el);
          return;
        }
      }
      for (const child of el.children) walk(child);
    };
    walk(root);
  };

  const translateScope = (root) => {
    const scope = root || document;
    if (scope.matches && scope.matches('[data-translatable]')) translateNode(scope);
    if (scope.matches && scope.matches('[data-translatable-deep]')) translateDeep(scope);
    scope.querySelectorAll('[data-translatable]').forEach(translateNode);
    scope.querySelectorAll('[data-translatable-deep]').forEach(translateDeep);
  };

  window.__lqiTranslate = { enabled: true, one, translateScope };

  const translateAll = () => {
    if (!window.__lqiTranslate || !window.__lqiTranslate.enabled) return;
    translateScope(document);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', translateAll, { once: true });
  } else {
    translateAll();
  }

  // re-run when the blogs script injects fresh dom on its own schedule.
  // observer is debounced to one rAF and only triggers on actual added
  // nodes that look like they could carry translatable content. without
  // this guard, every translateNode() write fires the observer, which
  // re-queries the whole document and walks every leaf again - on a
  // dense wiki entity page that o(n^2) cascade was costing 10-15s of
  // jank during locale-switch navigation.
  let scheduled = false;
  const reSchedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      translateAll();
    });
  };
  const observerCallback = (mutations) => {
    if (writing > 0) return;
    for (const m of mutations) {
      if (m.type !== 'childList' || m.addedNodes.length === 0) continue;
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (
          node.matches?.('[data-translatable], [data-translatable-deep]')
          || node.querySelector?.('[data-translatable], [data-translatable-deep]')
        ) {
          reSchedule();
          return;
        }
      }
    }
  };
  const mo = new MutationObserver(observerCallback);
  if (document.body) {
    mo.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      mo.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  }
})();`;
}

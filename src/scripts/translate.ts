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
export function getTranslateBootstrap(locale: string) {
  return String.raw`(() => {
  if (window.__lqiTranslate) return;
  const LOCALE = ${JSON.stringify(locale)};
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
  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  };
  // localStorage > sessionStorage so a returning visitor doesn't pay
  // for the same translations again. quotas are per-origin so we have
  // ~5MB to play with - more than enough for the strings we tag.
  const cacheGet = (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  };
  const cacheSet = (k, v) => {
    try { localStorage.setItem(k, v); } catch {}
  };
  const inflight = new Map();
  const one = (text) => {
    if (!text || !text.trim()) return Promise.resolve(text);
    const key = 'lqi-tx-' + LOCALE + '-' + hash(text);
    const cached = cacheGet(key);
    if (cached !== null) return Promise.resolve(cached);
    if (inflight.has(key)) return inflight.get(key);
    const url = 'https://lingva.ml/api/v1/en/' + target + '/' + encodeURIComponent(text);
    const p = fetch(url, { signal: AbortSignal.timeout(8000) })
      .then((r) => { if (!r.ok) throw new Error('lingva ' + r.status); return r.json(); })
      .then((data) => {
        const result = (data && data.translation) || text;
        const out = (!result || !result.trim() || result === text) ? text : result;
        cacheSet(key, out);
        return out;
      })
      .catch(() => text);
    inflight.set(key, p);
    return p;
  };
  const translateNode = (node) => {
    if (!node || node.__lqiTranslated) return;
    const original = (node.textContent || '').trim();
    if (!original) return;
    node.__lqiTranslated = true;
    window.__lqiTranslate.one(original).then((translated) => {
      if (translated && translated !== original) node.textContent = translated;
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
  const mo = new MutationObserver(() => translateAll());
  if (document.body) {
    mo.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      mo.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  }
})();`;
}

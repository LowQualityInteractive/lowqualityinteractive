// IIFE that sets up window.__lqiTranslate (MyMemory + sessionStorage cache).
// Re-inlining is fine — first one wins.
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
  const MAP = {
    'pt-BR': 'pt-BR', 'es-MX': 'es', 'es-ES': 'es',
    ru: 'ru', de: 'de', it: 'it', fr: 'fr', ro: 'ro', el: 'el',
  };
  const target = MAP[LOCALE] || LOCALE;
  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
  };
  const inflight = new Map();
  const one = (text) => {
    if (!text || !text.trim()) return Promise.resolve(text);
    const key = 'lqi-tx-' + LOCALE + '-' + hash(text);
    try {
      const cached = sessionStorage.getItem(key);
      if (cached !== null) return Promise.resolve(cached);
    } catch {}
    if (inflight.has(key)) return inflight.get(key);
    const p = fetch(
      'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|' + target,
      { signal: AbortSignal.timeout(8000) },
    )
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => {
        const result = (data && data.responseData && data.responseData.translatedText) || text;
        const out = (!result.trim() || result === text) ? text : result;
        try { sessionStorage.setItem(key, out); } catch {}
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

  const translateScope = (root) => {
    const scope = root || document;
    if (scope.matches && scope.matches('[data-translatable]')) translateNode(scope);
    scope.querySelectorAll('[data-translatable]').forEach(translateNode);
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

  // re-run when blogs/status inject new DOM
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

export function getAboutTranslateScript() {
  // kept for back-compat — global auto-translate handles this now
  return String.raw`(() => {})();`;
}

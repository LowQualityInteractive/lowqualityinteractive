// Returns an IIFE-safe string of JS that defines window.__lqiTranslate,
// a per-locale MyMemory-backed translator with sessionStorage caching.
// Safe to inline multiple times: the first run wins, subsequent runs no-op.
export function getTranslateBootstrap(locale: string) {
  return String.raw`(() => {
  if (window.__lqiTranslate) return;
  const LOCALE = ${JSON.stringify(locale)};
  if (LOCALE === 'en') {
    window.__lqiTranslate = {
      enabled: false,
      one: (t) => Promise.resolve(t),
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
  window.__lqiTranslate = { enabled: true, one };
})();`;
}

export function getAboutTranslateScript() {
  return String.raw`(() => {
  const tx = window.__lqiTranslate;
  if (!tx || !tx.enabled) return;
  document.querySelectorAll('[data-translatable]').forEach((node) => {
    const original = node.textContent || '';
    if (!original.trim()) return;
    tx.one(original).then((translated) => {
      if (translated && translated !== original) node.textContent = translated;
    });
  });
})();`;
}

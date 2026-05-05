// one-shot translator for the i18n locale jsons.
//
// the english source of truth (src/i18n/locales/en.json) gets edited by
// the studio; the other nine locales would otherwise drift, especially
// after a voice rewrite. this script reads en.json, picks the keys
// that flow into user-visible body copy, and asks the translation
// backend to translate the english value into each target locale.
// we only rewrite a key if the english source has been changed (the
// marker is the per-locale __sourceHashes map stored alongside).
//
// translation backend: google translate's free public web endpoint
// (translate.googleapis.com/translate_a/single?client=gtx). no api key,
// no quota the studio is going to hit at build time, returns clean
// per-sentence chunks. lingva.ml is a fallback when google's response
// looks malformed - it's a foss google-translate proxy with the same
// underlying engine.
//
// we used to hit api.mymemory.translated.net but its free-tier quota
// (a few hundred chars per ip per day) made the whole pipeline brittle:
// one full run of all locales would burn the quota, then any visitor
// who happened to be on the same ip wouldn't be able to use the
// runtime translator either. google's endpoint solves that.
//
// kept narrow on purpose. titles and chrome strings stay hand-authored.
// only the prose-y keys go through mt.
//
// usage: node scripts/translate-locales.mjs
//        node scripts/translate-locales.mjs --force  (retranslate all)
//        node scripts/translate-locales.mjs --skip-markdown
//        node scripts/translate-locales.mjs --skip-wiki

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(here, '..', 'src', 'i18n', 'locales');
const aboutDir = path.resolve(here, '..', 'src', 'data', 'about');
const wikiDir = path.resolve(here, '..', 'src', 'data', 'wiki');
const force = process.argv.includes('--force');
const skipMarkdown = process.argv.includes('--skip-markdown');
const skipWiki = process.argv.includes('--skip-wiki');

// keys to translate, expressed as dotted paths into the locale json.
// catalog entries iterate per game id; we expand them at run time.
const KEY_PATHS = [
  'meta.organizationDescription',
  'pages.game.faq.heading',
  'pages.game.faq.qWhatIs',
  'pages.game.faq.qFree',
  'pages.game.faq.qPlatforms',
  'pages.game.faq.qHowToPlay',
  'pages.game.faq.qWhoMade',
  'pages.game.faq.qPlayers',
  'pages.game.faq.qUpdates',
  'pages.game.faq.aFree',
  'pages.game.faq.aPlatforms',
  'pages.game.faq.aWhoMade',
  'pages.game.faq.aPlayersGeneric',
  'pages.game.faq.aPlayersCount',
  'pages.game.faq.aStatusLive',
  'pages.game.faq.aStatusPreview',
  'pages.game.faq.aStatusSunset',
];
const CATALOG_PER_GAME_KEYS = ['description', 'pageDescription', 'pageLead', 'faqWhatIs', 'faqHowToPlay'];

// site locale -> google translate target language code. google handles
// regional pt/es variants natively (pt-BR, es-419 for latin-american
// spanish, es for european). we lean on those to keep the regional
// flavor where it matters.
const LOCALE_TO_GOOGLE = {
  'pt-BR': 'pt-BR',
  'es-MX': 'es-419',
  'es-ES': 'es',
  ru: 'ru',
  de: 'de',
  it: 'it',
  fr: 'fr',
  ro: 'ro',
  el: 'el',
};

// lingva codes are mostly aligned with iso-639 but it doesn't accept
// regional spanish or pt-BR - it falls back to the bare language. we
// map intentionally: any spanish to "es", any portuguese to "pt".
const LOCALE_TO_LINGVA = {
  'pt-BR': 'pt',
  'es-MX': 'es',
  'es-ES': 'es',
  ru: 'ru',
  de: 'de',
  it: 'it',
  fr: 'fr',
  ro: 'ro',
  el: 'el',
};

const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

function getAt(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
}

function setAt(obj, dotted, value) {
  const keys = dotted.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, k) => {
    if (!(k in acc) || typeof acc[k] !== 'object' || acc[k] === null) acc[k] = {};
    return acc[k];
  }, obj);
  target[last] = value;
}

// proper nouns and brand strings that mymemory tends to localise even
// though they shouldn't be. order matters - longer matches first so
// "DON POLLO OBBY" is replaced before its substring "POLLO".
const PROTECTED_TERMS = [
  'DON POLLO OBBY',
  'Don Pollo Obby',
  'Don Pollo',
  "Favela '94",
  'Favela 94',
  'Low Quality Interactive',
  'ERADICATION',
  'Roblox',
  'LQI',
  'PvPvE',
  // territory + faction proper nouns from the eradication lore
  'Whiskerhold',
  'Furward',
  'Furrow',
  'Purridge',
  'Whisken',
  'Bloodwhisk Reach',
  'Whiskspire',
  'Furries',
  'Furry',
];

// swap each protected term for a placeholder the backend will pass
// through untouched (token-style strings rarely get translated). also
// shields {curly-brace} interpolation tokens, which google otherwise
// localizes (e.g. "{game}" -> "{jogo}" in pt-BR) and breaks the
// runtime templating. returns the modified text plus a list of
// [placeholder, original] pairs to restore.
function shieldTerms(text) {
  const restore = [];
  let out = text;
  PROTECTED_TERMS.forEach((term, i) => {
    // word-boundary match. some terms contain apostrophes/spaces, so we
    // build the regex from the literal string rather than trusting \b.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    if (re.test(out)) {
      const placeholder = `XKEEP${i}X`;
      out = out.replace(re, placeholder);
      restore.push([placeholder, term]);
    }
  });
  // shield interpolation tokens like {game}, {n}. each unique token gets
  // its own placeholder index so we can restore them faithfully even if
  // a string contains multiple distinct ones.
  const tokenIndex = new Map();
  out = out.replace(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g, (match) => {
    if (!tokenIndex.has(match)) {
      const idx = PROTECTED_TERMS.length + tokenIndex.size;
      const placeholder = `XKEEP${idx}X`;
      tokenIndex.set(match, placeholder);
      restore.push([placeholder, match]);
    }
    return tokenIndex.get(match);
  });
  // shield markdown link targets: the (url) half of [text](url). google
  // translates path segments otherwise (/vehicles/ -> /veículos/),
  // breaking every internal link in the rendered page. pattern matches
  // both inline links and reference-style brackets. each unique url
  // gets a placeholder.
  const urlIndex = new Map();
  const reserveUrl = (url) => {
    if (!urlIndex.has(url)) {
      const idx = PROTECTED_TERMS.length + tokenIndex.size + urlIndex.size;
      const placeholder = `XKEEP${idx}X`;
      urlIndex.set(url, placeholder);
      restore.push([placeholder, url]);
    }
    return urlIndex.get(url);
  };
  out = out.replace(/\]\(([^)]+)\)/g, (_, url) => `](${reserveUrl(url)})`);
  // also shield bare absolute and root-relative urls that aren't inside
  // a markdown link wrapper (occasionally the prose drops one inline).
  out = out.replace(/https?:\/\/[^\s)]+/g, (m) => reserveUrl(m));
  return { shielded: out, restore };
}

function unshieldTerms(text, restore) {
  let out = text;
  for (const [placeholder, original] of restore) {
    // mymemory sometimes lower-cases or hyphenates placeholders. match
    // case-insensitively and accept stray surrounding spacing.
    const re = new RegExp(placeholder.replace(/X/g, '[Xx]'), 'g');
    out = out.replace(re, original);
  }
  return out;
}

// thrown when the backend rate-limits us. with google translate this
// is rare at build-time scale, but we keep the error class so callers
// can still cleanly stop and resume rather than grinding through retries.
class RateLimitError extends Error {
  constructor(message) {
    super(message || 'translation backend rate-limited');
  }
}

// google translate's public web endpoint. returns a nested array; the
// first element is an array of [translated, original, ...] tuples,
// one per source-side sentence. concatenating tuple[0] gives the
// translated full text.
async function translateGoogle(text, locale) {
  const target = LOCALE_TO_GOOGLE[locale];
  if (!target) throw new Error(`unknown locale: ${locale}`);
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: target,
    dt: 't',
    q: text,
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params}`;
  const res = await fetch(url, {
    headers: {
      // a real-browser ua sometimes matters for google's web endpoints.
      'User-Agent': 'Mozilla/5.0 (compatible; lqi-translate-locales/1.0)',
      Accept: 'application/json',
    },
  });
  if (res.status === 429 || res.status === 403) {
    throw new RateLimitError(`google ${res.status}`);
  }
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('google: unexpected shape');
  }
  const joined = data[0].map((c) => (Array.isArray(c) ? c[0] || '' : '')).join('');
  if (!joined.trim()) throw new Error('google: empty');
  return joined;
}

// fallback: lingva.ml, a foss google-translate proxy. simpler json
// shape, used when google's response is malformed.
async function translateLingva(text, locale) {
  const target = LOCALE_TO_LINGVA[locale];
  if (!target) throw new Error(`unknown locale: ${locale}`);
  const url = `https://lingva.ml/api/v1/en/${target}/${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 429) throw new RateLimitError('lingva 429');
  if (!res.ok) throw new Error(`lingva ${res.status}`);
  const data = await res.json();
  const out = data?.translation;
  if (!out || typeof out !== 'string' || !out.trim()) throw new Error('lingva: empty');
  return out;
}

async function translateOne(text, locale) {
  const { shielded, restore } = shieldTerms(text);
  let raw;
  let lastErr;
  // google first. lingva second. if both fail, propagate the last
  // error so the caller can decide (rate-limit -> stop; transient -> skip).
  try {
    raw = await translateGoogle(shielded, locale);
  } catch (err) {
    lastErr = err;
    if (err instanceof RateLimitError) {
      // try lingva once before giving up - it's a separate ip path so
      // it might still work even when google has cut us off.
      try {
        raw = await translateLingva(shielded, locale);
      } catch (err2) {
        if (err2 instanceof RateLimitError) throw err2;
        throw err;
      }
    } else {
      try {
        raw = await translateLingva(shielded, locale);
      } catch (err2) {
        // both backends failed. surface the original error.
        throw lastErr;
      }
    }
  }
  const out = unshieldTerms(raw, restore);
  // backends occasionally echo the source verbatim. don't write that back.
  if (out.trim() === text.trim()) return null;
  // sanity: if a placeholder leaked through, bail rather than ship a
  // broken token. google generally preserves these but lingva sometimes
  // splits them across word boundaries.
  if (/X[Xx]?KEEP\d+X/.test(out)) return null;
  return out.trim();
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

// markdown translator: walks src/data/about/<id>.md, splits into block
// chunks, translates each chunk, writes <id>.<locale>.md alongside.
//
// chunks are separated by blank lines. each chunk goes to mymemory as
// one call (small enough to fit the free-tier budget). lists translate
// item-by-item. tables and code fences pass through verbatim - mymemory
// mangles structured markup. lines that are pure markdown syntax (just
// "##" or "-" with nothing else) also pass through.
//
// the script writes a sidecar hash file at <id>.<locale>.md.hash so
// subsequent runs only retranslate when the english source changes.
async function translateMarkdownChunks(text, target) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  // helper: translate a single chunk. on rate-limit, propagate so the
  // caller can stop. on any other error, fall back to english (still
  // better than half a translation).
  const tryTranslate = async (s) => {
    try {
      const t = await translateOne(s, target);
      return t ?? s;
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      return s;
    }
  };
  while (i < lines.length) {
    const line = lines[i];

    // code fence: copy lines verbatim until the closing fence.
    if (/^```/.test(line.trim())) {
      out.push(line);
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        out.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) { out.push(lines[i]); i += 1; }
      continue;
    }

    // table row: passthrough. mymemory destroys pipe-delimited markup.
    if (/^\s*\|/.test(line)) {
      out.push(line);
      i += 1;
      continue;
    }

    // list item: translate just the content after the bullet.
    const listMatch = line.match(/^(\s*[-*+]\s+|\s*\d+\.\s+)(.*)$/);
    if (listMatch) {
      const [, prefix, content] = listMatch;
      if (content.trim()) {
        out.push(prefix + await tryTranslate(content));
        await new Promise((r) => setTimeout(r, 80));
      } else {
        out.push(line);
      }
      i += 1;
      continue;
    }

    // heading: translate just the text after the #s.
    const headingMatch = line.match(/^(#{1,6}\s+)(.*)$/);
    if (headingMatch) {
      const [, prefix, content] = headingMatch;
      if (content.trim()) {
        out.push(prefix + await tryTranslate(content));
        await new Promise((r) => setTimeout(r, 80));
      } else {
        out.push(line);
      }
      i += 1;
      continue;
    }

    // paragraph: collect contiguous non-blank lines, join, translate, restore line breaks.
    if (line.trim()) {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^[#`|]/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i += 1;
      }
      const joined = buf.join(' ');
      out.push(await tryTranslate(joined));
      await new Promise((r) => setTimeout(r, 80));
      continue;
    }

    // blank line: preserve.
    out.push(line);
    i += 1;
  }
  return out.join('\n');
}

async function processMarkdownFiles() {
  let entries;
  try {
    entries = await readdir(aboutDir, { withFileTypes: true });
  } catch {
    return;
  }
  // english source files only - .<locale>.md outputs are skipped via
  // the regex below. this prevents the script from translating its own
  // outputs back into themselves.
  const sources = entries
    .filter((e) => e.isFile() && /^[^.]+\.md$/.test(e.name))
    .map((e) => e.name);

  for (const file of sources) {
    const id = file.slice(0, -3);
    const sourcePath = path.join(aboutDir, file);
    const englishText = await readFile(sourcePath, 'utf8');
    const englishHash = sha(englishText);

    for (const locale of Object.keys(LOCALE_TO_GOOGLE)) {
      const outPath = path.join(aboutDir, `${id}.${locale}.md`);
      const hashPath = `${outPath}.hash`;
      let cachedHash = null;
      try { cachedHash = (await readFile(hashPath, 'utf8')).trim(); } catch {}
      if (!force && cachedHash === englishHash) {
        console.log(`  ${id}.${locale}.md: up to date`);
        continue;
      }
      console.log(`  ${id}.${locale}.md: translating...`);
      try {
        const translated = await translateMarkdownChunks(englishText, locale);
        await writeFile(outPath, translated, 'utf8');
        await writeFile(hashPath, englishHash, 'utf8');
        console.log(`  ${id}.${locale}.md: ok`);
      } catch (err) {
        if (err instanceof RateLimitError) {
          console.warn(`\nrate limit hit on ${id}.${locale}.md (${err.message}).`);
          console.warn(`stop here - resume after the limit clears.`);
          return;
        }
        console.warn(`  ${id}.${locale}.md: ${err.message}`);
      }
    }
  }
}

async function main() {
  const en = await loadJson(path.join(localesDir, 'en.json'));
  const gameIds = Object.keys(en?.catalog?.games ?? {});

  const allKeys = [
    ...KEY_PATHS,
    ...gameIds.flatMap((id) => CATALOG_PER_GAME_KEYS.map((k) => `catalog.games.${id}.${k}`)),
  ];

  for (const locale of Object.keys(LOCALE_TO_GOOGLE)) {
    const file = path.join(localesDir, `${locale}.json`);
    const data = await loadJson(file);
    const hashKey = '__sourceHashes';
    const hashes = data[hashKey] && typeof data[hashKey] === 'object' ? data[hashKey] : {};
    let dirty = false;
    let translated = 0;
    let skipped = 0;

    for (const key of allKeys) {
      const englishValue = getAt(en, key);
      if (typeof englishValue !== 'string' || !englishValue.trim()) continue;

      const newHash = sha(englishValue);
      const oldHash = hashes[key];
      const existing = getAt(data, key);

      if (!force && oldHash === newHash && typeof existing === 'string' && existing.trim()) {
        skipped += 1;
        continue;
      }

      try {
        const out = await translateOne(englishValue, locale);
        if (!out) {
          // backend echoed the source. skip writing so the fallback to
          // english kicks in instead of stamping english over the slot.
          continue;
        }
        setAt(data, key, out);
        hashes[key] = newHash;
        dirty = true;
        translated += 1;
        // tiny delay between calls. google's web endpoint doesn't
        // really care, but staying polite keeps us off the radar.
        await new Promise((r) => setTimeout(r, 80));
      } catch (err) {
        if (err instanceof RateLimitError) {
          // save what we've done, stop the whole run.
          if (dirty) {
            data[hashKey] = hashes;
            await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
          }
          console.warn(`\nrate limit hit on ${locale} ${key} (${err.message}).`);
          console.warn(`saved progress; resume later.`);
          return;
        }
        console.warn(`  ${locale} ${key}: ${err.message}`);
      }
    }

    if (dirty) {
      data[hashKey] = hashes;
      await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
    console.log(`${locale}: translated=${translated} skipped=${skipped}${dirty ? ' (saved)' : ''}`);
  }

  if (!skipMarkdown) {
    console.log('\nmarkdown bodies:');
    await processMarkdownFiles();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

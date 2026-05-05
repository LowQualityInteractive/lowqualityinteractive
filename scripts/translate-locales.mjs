// one-shot translator for the i18n locale jsons.
//
// the english source of truth (src/i18n/locales/en.json) gets edited by
// the studio; the other nine locales would otherwise drift, especially
// after a voice rewrite. this script reads en.json, picks the keys
// that flow into user-visible body copy, and asks mymemory to translate
// the english value into each target locale. we only rewrite a key if
// the english source has been changed (the marker is the per-locale
// __sourceHash field stored alongside each translated value).
//
// kept narrow on purpose. titles and chrome strings stay hand-authored.
// only the prose-y keys go through mt.
//
// usage: node scripts/translate-locales.mjs
//        node scripts/translate-locales.mjs --force  (retranslate all)

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(here, '..', 'src', 'i18n', 'locales');
const force = process.argv.includes('--force');

// keys to translate, expressed as dotted paths into the locale json.
// catalog entries iterate per game id; we expand them at run time.
const KEY_PATHS = [
  'meta.organizationDescription',
];
const CATALOG_PER_GAME_KEYS = ['description', 'pageDescription', 'pageLead'];

// english -> mymemory pair code. mymemory is picky about regional codes
// (es-MX -> es is fine; pt-BR -> pt-BR is the canonical pair).
const LOCALE_TO_MM = {
  'pt-BR': 'pt-BR',
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

// swap each protected term for a placeholder mymemory will pass through
// untouched (token-style strings rarely get translated). returns the
// modified text plus a list of [placeholder, original] pairs to restore.
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

async function translateOne(text, target) {
  const { shielded, restore } = shieldTerms(text);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(shielded)}&langpair=en|${target}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`mymemory ${res.status}`);
  const data = await res.json();
  const raw = data?.responseData?.translatedText;
  if (!raw || typeof raw !== 'string') throw new Error('empty translation');
  const out = unshieldTerms(raw, restore);
  // mymemory occasionally returns the source verbatim. don't write that back.
  if (out.trim() === text.trim()) return null;
  // sanity: if a placeholder leaked through (mymemory split it on a
  // word boundary), bail rather than ship the broken token.
  if (/X[Xx]?KEEP\d+X/.test(out)) return null;
  return out.trim();
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  const en = await loadJson(path.join(localesDir, 'en.json'));
  const gameIds = Object.keys(en?.catalog?.games ?? {});

  const allKeys = [
    ...KEY_PATHS,
    ...gameIds.flatMap((id) => CATALOG_PER_GAME_KEYS.map((k) => `catalog.games.${id}.${k}`)),
  ];

  for (const [locale, mmCode] of Object.entries(LOCALE_TO_MM)) {
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
        const out = await translateOne(englishValue, mmCode);
        if (!out) {
          // mymemory echoed the source. skip writing so the fallback to
          // english kicks in instead of stamping english over the slot.
          continue;
        }
        setAt(data, key, out);
        hashes[key] = newHash;
        dirty = true;
        translated += 1;
        // be polite to the free tier — small delay between calls.
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.warn(`  ${locale} ${key}: ${err.message}`);
      }
    }

    if (dirty) {
      data[hashKey] = hashes;
      await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
    console.log(`${locale}: translated=${translated} skipped=${skipped}${dirty ? ' (saved)' : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

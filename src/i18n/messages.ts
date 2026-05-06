import { createHash } from 'node:crypto';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';
import esMX from './locales/es-MX.json';
import esES from './locales/es-ES.json';
import ru from './locales/ru.json';
import de from './locales/de.json';
import it from './locales/it.json';
import fr from './locales/fr.json';
import ro from './locales/ro.json';
import el from './locales/el.json';
import { toAbsoluteSiteUrl } from '../data/site';

export const DEFAULT_LOCALE = 'en';
export const LOCALES = [
  'en',
  'pt-BR',
  'es-MX',
  'es-ES',
  'ru',
  'de',
  'it',
  'fr',
  'ro',
  'el',
] as const;

export type Locale = (typeof LOCALES)[number];
export type Messages = typeof en;

export const LOCALE_OPTIONS = {
  en: { nativeName: 'English' },
  'pt-BR': { nativeName: 'Português (Brasil)' },
  'es-MX': { nativeName: 'Español (México)' },
  'es-ES': { nativeName: 'Español (España)' },
  ru: { nativeName: 'Русский' },
  de: { nativeName: 'Deutsch' },
  it: { nativeName: 'Italiano' },
  fr: { nativeName: 'Français' },
  ro: { nativeName: 'Română' },
  el: { nativeName: 'Ελληνικά' },
} as const satisfies Record<Locale, { nativeName: string }>;

type Primitive = boolean | number | string | null;
type DeepPartial<T> = T extends Primitive
  ? T
  : T extends (infer U)[]
    ? DeepPartial<U>[]
    : { [K in keyof T]?: DeepPartial<T[K]> };

const rawMessages = {
  en,
  'pt-BR': ptBR,
  'es-MX': esMX,
  'es-ES': esES,
  ru,
  de,
  it,
  fr,
  ro,
  el,
} satisfies Record<Locale, DeepPartial<Messages>>;

const mergedMessages = new Map<Locale, Messages>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeWithEnglishFallback(base: unknown, override: unknown): unknown {
  if (override === undefined) {
    return base;
  }

  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }

  if (isPlainObject(base)) {
    const result: Record<string, unknown> = {};
    const overrideRecord = isPlainObject(override) ? override : {};

    for (const [key, value] of Object.entries(base)) {
      result[key] = mergeWithEnglishFallback(value, overrideRecord[key]);
    }

    return result;
  }

  if (typeof base === 'string' && typeof override === 'string' && override.trim() === '') {
    return base;
  }

  return override;
}

export function getMessages(locale: Locale): Messages {
  if (!mergedMessages.has(locale)) {
    mergedMessages.set(
      locale,
      mergeWithEnglishFallback(en, rawMessages[locale]) as Messages,
    );
  }

  return mergedMessages.get(locale)!;
}

// path lookups run thousands of times during a build (every layout
// computes header, footer, breadcrumb, and json-ld urls). cache the
// per-(locale, path) string so we're not re-parsing the same path
// regex over and over.
const localePathCache = new Map<string, string>();
const localeAbsolutePathCache = new Map<string, string>();

export function getLocalePath(locale: Locale, path = '') {
  const cacheKey = `${locale} ${path}`;
  const hit = localePathCache.get(cacheKey);
  if (hit !== undefined) return hit;

  const normalizedPath = path.replace(/^\/+|\/+$/g, '');
  const segments =
    locale === DEFAULT_LOCALE
      ? [normalizedPath]
      : [locale, normalizedPath];

  const joined = segments.filter(Boolean).join('/');
  const out = joined ? `/${joined}/` : '/';
  localePathCache.set(cacheKey, out);
  return out;
}

export function getLocaleAbsolutePath(locale: Locale, path = '') {
  const cacheKey = `${locale} ${path}`;
  const hit = localeAbsolutePathCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const out = toAbsoluteSiteUrl(getLocalePath(locale, path));
  localeAbsolutePathCache.set(cacheKey, out);
  return out;
}

const alternateLinksCache = new Map<string, ReadonlyArray<{ locale: Locale; href: string }>>();

export function getAlternateLinks(path = '') {
  const hit = alternateLinksCache.get(path);
  if (hit !== undefined) return hit;
  const out = LOCALES.map((locale) => ({
    locale,
    href: getLocaleAbsolutePath(locale, path),
  }));
  alternateLinksCache.set(path, out);
  return out;
}

export function getLocaleOptionLabel(locale: Locale) {
  const option = LOCALE_OPTIONS[locale];
  return option.nativeName;
}

export function interpolate(
  template: string,
  values: Record<string, number | string>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined ? '' : String(value);
  });
}

// neutralise sequences that would let a string literal break out of an
// inline <script> or json-ld block. covers:
//   </script ...>      - the obvious script-end tag
//   <!--               - html comment open. inside <script> this opens
//                        a comment that ends only at -->, letting an
//                        attacker hide subsequent code from the parser.
//   <script            - nested script-start tags (relevant inside
//                        json-ld <script type="application/ld+json">).
//   --> / ]]>          - tokens that close cdata-style sections used by
//                        some downstream renderers.
// the replacements all preserve string semantics in javascript (the
// extra backslash is a no-op inside a string literal) and in json
// (the values become harmless visually-identical text).
export function sanitizeInlineScript(script: string) {
  return script
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<script/gi, '<\\script')
    .replace(/<!--/g, '<\\!--')
    .replace(/-->/g, '--\\>')
    .replace(/\]\]>/g, ']]\\>');
}

// sha256 hash for the inline-script csp. has to match the exact body
// between <script>...</script>, character for character - no trimming,
// no creative reformatting, the browser is paying attention.
//
// many of the inline scripts we emit are the same bytes on every page
// (theme/cookies/loader bootstraps, motion bootstrap, the locale-aware
// site script for a given locale, etc). across 1801 build pages that's
// 1800x of duplicate hashing work. memoise by body.
const cspHashCache = new Map<string, string>();

export function cspScriptHash(scriptBody: string): string {
  const hit = cspHashCache.get(scriptBody);
  if (hit !== undefined) return hit;
  const out = `'sha256-${createHash('sha256').update(scriptBody).digest('base64')}'`;
  cspHashCache.set(scriptBody, out);
  return out;
}

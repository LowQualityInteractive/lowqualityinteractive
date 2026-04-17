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

export const NON_DEFAULT_LOCALES = LOCALES.filter(
  (locale) => locale !== DEFAULT_LOCALE,
) as Exclude<Locale, typeof DEFAULT_LOCALE>[];

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

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && LOCALES.includes(value as Locale);
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

export function getLocalePath(locale: Locale, path = '') {
  const normalizedPath = path.replace(/^\/+|\/+$/g, '');
  const segments =
    locale === DEFAULT_LOCALE
      ? [normalizedPath]
      : [locale, normalizedPath];

  const joined = segments.filter(Boolean).join('/');
  return joined ? `/${joined}/` : '/';
}

export function getLocaleAbsolutePath(locale: Locale, path = '') {
  return toAbsoluteSiteUrl(getLocalePath(locale, path));
}

export function getAlternateLinks(path = '') {
  return LOCALES.map((locale) => ({
    locale,
    href: getLocaleAbsolutePath(locale, path),
  }));
}

export function getLocaleOptionLabel(locale: Locale) {
  const option = LOCALE_OPTIONS[locale];
  return option.nativeName;
}

export function getLocaleFromPathname(pathname: string) {
  const normalizedPath = pathname.toLowerCase();
  const matchedLocale = NON_DEFAULT_LOCALES.find((locale) => {
    const localePath = `/${locale.toLowerCase()}`;
    return normalizedPath === localePath || normalizedPath.startsWith(`${localePath}/`);
  });

  return matchedLocale ?? DEFAULT_LOCALE;
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

export function sanitizeInlineScript(script: string) {
  return script.replace(/<\/script/gi, '<\\/script');
}

// CSP-compliant SHA-256 hash for an inline <script> body. The hash must be
// computed on the exact string that ends up between <script>...</script>.
export async function cspScriptHash(scriptBody: string) {
  const { createHash } = await import('node:crypto');
  return `'sha256-${createHash('sha256').update(scriptBody).digest('base64')}'`;
}

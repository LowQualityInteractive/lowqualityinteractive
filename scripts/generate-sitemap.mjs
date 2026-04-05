import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOCALE = 'en';
const LOCALES = ['en', 'pt-BR', 'es-MX', 'es-ES', 'ru', 'de', 'it', 'fr', 'ro', 'el'];
const NON_DEFAULT_LOCALES = new Set(LOCALES.filter((locale) => locale !== DEFAULT_LOCALE));
const SITE_URL = 'https://lowqualityinteractive.com';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(scriptDirectory, '..', 'dist');
const sitemapPath = path.join(distDirectory, 'sitemap.xml');

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toAbsoluteUrl(route) {
  return new URL(route, SITE_URL).toString();
}

function filePathToRoute(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join('/');

  if (normalizedPath === 'index.html') {
    return '/';
  }

  if (normalizedPath.endsWith('/index.html')) {
    return `/${normalizedPath.slice(0, -'/index.html'.length)}/`;
  }

  if (normalizedPath.endsWith('.html')) {
    return `/${normalizedPath.slice(0, -'.html'.length)}/`;
  }

  return null;
}

function splitLocale(route) {
  const normalizedRoute = route.replace(/^\/|\/$/g, '');
  if (!normalizedRoute) {
    return { locale: DEFAULT_LOCALE, routeKey: '' };
  }

  const [firstSegment, ...remainingSegments] = normalizedRoute.split('/');
  if (NON_DEFAULT_LOCALES.has(firstSegment)) {
    return {
      locale: firstSegment,
      routeKey: remainingSegments.join('/'),
    };
  }

  return {
    locale: DEFAULT_LOCALE,
    routeKey: normalizedRoute,
  };
}

async function walkHtmlFiles(directory, htmlFiles = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walkHtmlFiles(absolutePath, htmlFiles);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(absolutePath);
    }
  }

  return htmlFiles;
}

const htmlFiles = await walkHtmlFiles(distDirectory);
const groupedRoutes = new Map();

for (const absolutePath of htmlFiles) {
  const relativePath = path.relative(distDirectory, absolutePath);
  if (relativePath === '404.html') {
    continue;
  }

  const route = filePathToRoute(relativePath);
  if (!route) {
    continue;
  }

  const { locale, routeKey } = splitLocale(route);
  if (routeKey === '404') {
    continue;
  }

  const fileStats = await stat(absolutePath);
  const localizedRoutes = groupedRoutes.get(routeKey) ?? new Map();
  localizedRoutes.set(locale, {
    lastModified: fileStats.mtime.toISOString(),
    route,
  });
  groupedRoutes.set(routeKey, localizedRoutes);
}

const urls = [];
const sortedRouteKeys = [...groupedRoutes.keys()].sort((left, right) => left.localeCompare(right));

for (const routeKey of sortedRouteKeys) {
  const localizedRoutes = groupedRoutes.get(routeKey);
  if (!localizedRoutes || !localizedRoutes.has(DEFAULT_LOCALE)) {
    continue;
  }

  const lastModified = [...localizedRoutes.values()]
    .map((value) => value.lastModified)
    .sort()
    .at(-1);
  const xDefaultHref = toAbsoluteUrl(localizedRoutes.get(DEFAULT_LOCALE).route);

  for (const locale of LOCALES) {
    const entry = localizedRoutes.get(locale);
    if (!entry) {
      continue;
    }

    const alternateLinks = [...localizedRoutes.entries()]
      .map(
        ([alternateLocale, alternateEntry]) =>
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternateLocale)}" href="${escapeXml(
            toAbsoluteUrl(alternateEntry.route),
          )}" />`,
      )
      .join('\n');

    urls.push(`  <url>
    <loc>${escapeXml(toAbsoluteUrl(entry.route))}</loc>
${alternateLinks}
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(xDefaultHref)}" />
    <lastmod>${escapeXml(lastModified ?? entry.lastModified)}</lastmod>
  </url>`);
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;

await writeFile(sitemapPath, sitemap, 'utf8');

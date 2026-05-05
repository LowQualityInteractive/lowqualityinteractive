import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOCALE = 'en';
const LOCALES = ['en', 'pt-BR', 'es-MX', 'es-ES', 'ru', 'de', 'it', 'fr', 'ro', 'el'];
const NON_DEFAULT_LOCALES = new Set(LOCALES.filter((locale) => locale !== DEFAULT_LOCALE));
const SITE_URL = 'https://lowqualityinteractive.com';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(scriptDirectory, '..', 'dist');
const publicDirectory = path.resolve(scriptDirectory, '..', 'public');
const sitemapPath = path.join(distDirectory, 'sitemap.xml');
const publicSitemapPath = path.join(publicDirectory, 'sitemap.xml');

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

// llms.txt / llms-full.txt are non-html surfaces we still want crawlers
// to discover. they're brief pointer files now (not content dumps), so
// listing them in the sitemap helps ai-aware crawlers find the
// canonical pages they link to.
async function walkLlmsTxtFiles(directory, txtFiles = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walkLlmsTxtFiles(absolutePath, txtFiles);
      continue;
    }

    if (entry.isFile() && (entry.name === 'llms.txt' || entry.name === 'llms-full.txt')) {
      txtFiles.push(absolutePath);
    }
  }

  return txtFiles;
}

// astro emits redirect pages as a tiny html file with `Redirecting to:`
// in the title and a meta refresh. they shouldn't show up in the sitemap
// because they aren't canonical content, just legacy-url forwarders.
async function isRedirectFile(absolutePath) {
  const { readFile } = await import('node:fs/promises');
  const head = await readFile(absolutePath, 'utf-8');
  return head.includes('<title>Redirecting to:') || head.includes('http-equiv="refresh"');
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

  if (await isRedirectFile(absolutePath)) {
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

// append llms.txt / llms-full.txt entries. simple <loc>+<lastmod>;
// no hreflang because these aren't localized.
const llmsTxtFiles = await walkLlmsTxtFiles(distDirectory);
const llmsTxtEntries = [];
for (const absolutePath of llmsTxtFiles) {
  const relativePath = path.relative(distDirectory, absolutePath);
  const route = '/' + relativePath.split(path.sep).join('/');
  const fileStats = await stat(absolutePath);
  llmsTxtEntries.push({
    loc: toAbsoluteUrl(route),
    lastModified: fileStats.mtime.toISOString(),
  });
}
llmsTxtEntries.sort((left, right) => left.loc.localeCompare(right.loc));
for (const entry of llmsTxtEntries) {
  urls.push(`  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastModified)}</lastmod>
  </url>`);
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;

await writeFile(sitemapPath, sitemap, 'utf8');
await writeFile(publicSitemapPath, sitemap, 'utf8');

// rss feed for devlogs / patch notes. roblox studios live or die on
// devlog cadence; an rss feed lets readers and feed readers (and
// google news/discover) pick up new updates without scraping the page.
// the feed mirrors the data in public-devlogs.json - single source of
// truth, no parallel content surface.
//
// each <item> uses the per-update anchor on /updates/ as the link.
// updates aren't separately routed (they live as anchored sections on
// the catalog page), so the link is /updates/#<update-id>. that's
// stable enough for feed readers and matches what site visitors see.
const devlogsPath = path.join(publicDirectory, 'data', 'public-devlogs.json');
const rssPath = path.join(distDirectory, 'updates.xml');
const publicRssPath = path.join(publicDirectory, 'updates.xml');

// "M/D/YY" -> Date at midnight utc. format produced by the data file.
function parseDevlogDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const [, m, d, y] = match;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const month = Number(m) - 1;
  const day = Number(d);
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function rfc822(date) {
  return date.toUTCString();
}

// flatten { new, changes, bugs, removals, misc, footnotes } into a
// short html description. feed readers render html in <description>
// when wrapped in cdata.
function bulletsHtml(label, items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const lis = items.map((item) => `<li>${escapeXml(String(item))}</li>`).join('');
  return `<h3>${escapeXml(label)}</h3><ul>${lis}</ul>`;
}

function renderUpdateBody(contents) {
  if (!contents) return '';
  return [
    bulletsHtml('New', contents.new),
    bulletsHtml('Changes', contents.changes),
    bulletsHtml('Bug fixes', contents.bugs),
    bulletsHtml('Removals', contents.removals),
    bulletsHtml('Misc', contents.misc),
  ].filter(Boolean).join('');
}

try {
  const raw = await readFile(devlogsPath, 'utf8');
  const data = JSON.parse(raw);
  const items = [];
  if (Array.isArray(data.games)) {
    for (const g of data.games) {
      if (!Array.isArray(g.updates)) continue;
      for (const update of g.updates) {
        const date = parseDevlogDate(update.date);
        if (!date) continue;
        const title = `${g.name ?? ''} ${update.version ?? ''}`.trim();
        const link = `${SITE_URL}/updates/#${update.id}`;
        const body = renderUpdateBody(update.contents);
        items.push({
          title,
          link,
          guid: link,
          pubDate: rfc822(date),
          date,
          body,
          tag: g.tag ?? g.name ?? 'Update',
        });
      }
    }
  }
  // newest first.
  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  // cap the feed at a reasonable size - most readers only show recent
  // entries anyway and a runaway feed bloats every poll.
  const capped = items.slice(0, 50);
  const lastBuild = capped[0]?.pubDate ?? rfc822(new Date());
  const itemsXml = capped.map((it) => `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(it.link)}</link>
      <guid isPermaLink="true">${escapeXml(it.guid)}</guid>
      <pubDate>${escapeXml(it.pubDate)}</pubDate>
      <category>${escapeXml(it.tag)}</category>
      <description><![CDATA[${it.body}]]></description>
    </item>`).join('\n');
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Low Quality Interactive - updates</title>
    <link>${SITE_URL}/updates/</link>
    <atom:link href="${SITE_URL}/updates.xml" rel="self" type="application/rss+xml" />
    <description>Devlogs and patch notes for Low Quality Interactive's Roblox games (ERADICATION, Favela '94, DON POLLO OBBY).</description>
    <language>en</language>
    <lastBuildDate>${escapeXml(lastBuild)}</lastBuildDate>
${itemsXml}
  </channel>
</rss>
`;
  await writeFile(rssPath, rss, 'utf8');
  await writeFile(publicRssPath, rss, 'utf8');
} catch (err) {
  // never fail the build for rss: missing file or parse error just
  // skips the feed. the rest of the postbuild is more important.
  console.warn('rss feed not generated:', err.message);
}

import { execSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOCALE = 'en';
const LOCALES = ['en', 'pt-BR', 'es-MX', 'es-ES', 'ru', 'de', 'it', 'fr', 'ro', 'el'];
const NON_DEFAULT_LOCALES = new Set(LOCALES.filter((locale) => locale !== DEFAULT_LOCALE));
const SITE_URL = 'https://lowqualityinteractive.com';

// repo-wide last commit ISO timestamp. used as <lastmod> for every URL
// so the sitemap matches the JSON-LD dateModified emitted by
// src/data/site.ts. previously we used dist/*.html fs mtimes, which
// equal *build* time and advance on every scheduled rebuild even when
// no content changed - that broke IndexNow diffing because every cron
// run would re-ping every URL.
function readGitLastCommitIso() {
  try {
    const stdout = execSync('git log -1 --format=%cI', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (stdout && !Number.isNaN(Date.parse(stdout))) {
      return new Date(stdout).toISOString();
    }
  } catch {
    // fall through
  }
  return new Date().toISOString();
}
const SITE_LAST_MODIFIED = readGitLastCommitIso();

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
// (readFile is already imported at the top of this module - no need to
// dynamic-import it on every call.)
async function isRedirectFile(absolutePath) {
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

  // use the repo-wide commit timestamp instead of dist mtime. dist
  // mtime is always "now" because every scheduled build re-emits the
  // file - that made IndexNow diffing impossible.
  const localizedRoutes = groupedRoutes.get(routeKey) ?? new Map();
  localizedRoutes.set(locale, {
    lastModified: SITE_LAST_MODIFIED,
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
  llmsTxtEntries.push({
    loc: toAbsoluteUrl(route),
    lastModified: SITE_LAST_MODIFIED,
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

// stamp Last-Modified onto dist/_headers default block. invisible
// freshness signal that activates on cloudflare pages / netlify (github
// pages ignores _headers, same as the existing Link rules). reuses the
// repo's last commit time captured above so the sitemap, the JSON-LD,
// and the http header all agree.
try {
  const headersPath = path.join(distDirectory, '_headers');
  const headers = await readFile(headersPath, 'utf8');
  const lastModified = new Date(SITE_LAST_MODIFIED).toUTCString();
  // inject under the default /* block. matches the indentation pattern
  // of the existing rules (two spaces).
  const patched = headers.replace(
    /^\/\*\n((?: {2}[^\n]+\n)+)/m,
    (_match, body) => `/*\n${body}  Last-Modified: ${lastModified}\n`,
  );
  if (patched !== headers) {
    await writeFile(headersPath, patched, 'utf8');
  }
} catch (err) {
  console.warn('Last-Modified header not stamped:', err.message);
}

// build llms-full.txt as a real spec-compliant content bundle. the
// llmstxt.org spec defines llms-full.txt as the full content of all
// linked pages concatenated into one Markdown file. only english pages
// are bundled - the .md URLs for each locale are still discoverable via
// llms.txt and the sitemap, but concatenating all 10 locales would
// 10x the file size for crawlers that mostly want the english source.
//
// pages are ordered: home, games index, each game, updates, connect,
// privacy. matches the order a human would read them.
const LLMS_FULL_ORDER = [
  'index',
  'games/index',
  'eradication/index',
  'favela-94/index',
  'donpollo-obby/index',
  'updates/index',
  'connect/index',
  'privacy-policy/index',
];

try {
  const sections = [];
  for (const routeKey of LLMS_FULL_ORDER) {
    const mdPath = path.join(distDirectory, `${routeKey}.md`);
    try {
      const body = await readFile(mdPath, 'utf8');
      const sourceUrl = `${SITE_URL}/${routeKey}.md`;
      // separator + source pointer so a crawler can trace any chunk
      // back to its canonical url.
      sections.push(`<!-- source: ${sourceUrl} -->\n\n${body.trim()}\n`);
    } catch {
      // skip pages whose .md mirror isn't present
    }
  }

  if (sections.length > 0) {
    const header = `# Low Quality Interactive - full content bundle

> Independent Roblox game development studio (founded 2024). This file
> concatenates the Markdown rendering of every English page on
> lowqualityinteractive.com per the llmstxt.org spec. Each section is
> preceded by an HTML comment naming its canonical URL.
>
> For localized variants (pt-BR, es-MX, es-ES, ru, de, it, fr, ro, el),
> fetch the per-page .md mirrors directly - they live at
> /<locale>/<route>/index.md.

`;
    const bundle = header + sections.join('\n---\n\n');
    const distLlmsFullPath = path.join(distDirectory, 'llms-full.txt');
    const publicLlmsFullPath = path.join(publicDirectory, 'llms-full.txt');
    await writeFile(distLlmsFullPath, bundle, 'utf8');
    await writeFile(publicLlmsFullPath, bundle, 'utf8');
  }
} catch (err) {
  console.warn('llms-full.txt not generated:', err.message);
}

// IndexNow key file. ownership verification for the indexnow protocol
// (api.indexnow.org). bing/yandex/seznam/naver fetch the file at
// https://lowqualityinteractive.com/<key>.txt and compare its body to
// the key in the ping body - if they don't match, the ping is rejected.
//
// the key lives in the INDEXNOW_API_KEY secret on github actions and is
// only present during ci builds. local builds skip silently. the
// filename equals the key value, the file content equals the key
// value too - per the spec.
const indexNowKey = process.env.INDEXNOW_API_KEY;
if (indexNowKey && /^[a-f0-9]{8,128}$/i.test(indexNowKey)) {
  try {
    const keyFilePath = path.join(distDirectory, `${indexNowKey}.txt`);
    await writeFile(keyFilePath, indexNowKey, 'utf8');
  } catch (err) {
    console.warn('IndexNow key file not written:', err.message);
  }
} else if (indexNowKey) {
  console.warn('INDEXNOW_API_KEY format invalid (expected 8-128 hex chars); skipping key file.');
}

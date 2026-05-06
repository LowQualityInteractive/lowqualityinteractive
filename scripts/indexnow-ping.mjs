// IndexNow ping. fetches the just-deployed sitemap from the live site,
// diffs against the previous run's cached sitemap (if any), and pings
// api.indexnow.org/IndexNow with the changed URLs.
//
// run after `actions/deploy-pages` so the new sitemap is actually live
// when we fetch it. invoked from .github/workflows/deploy.yml; not part
// of the build-time postbuild because we need the deployed sitemap, not
// the local dist copy.
//
// inputs (env):
//   INDEXNOW_API_KEY        - 8-128 hex chars; required
//   INDEXNOW_PREV_SITEMAP   - optional path to the cached previous sitemap
//   INDEXNOW_OUT_SITEMAP    - optional path to write the new sitemap to
//                             for the next run's cache
//
// exits 0 always (a failed ping should never fail the deploy job).

import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const SITE_HOST = 'lowqualityinteractive.com';
const SITE_URL = `https://${SITE_HOST}`;
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow';
const KEY = process.env.INDEXNOW_API_KEY;
const PREV_SITEMAP_PATH = process.env.INDEXNOW_PREV_SITEMAP || '';
const OUT_SITEMAP_PATH = process.env.INDEXNOW_OUT_SITEMAP || '';

if (!KEY || !/^[a-f0-9]{8,128}$/i.test(KEY)) {
  console.warn('IndexNow: INDEXNOW_API_KEY missing or malformed; skipping.');
  process.exit(0);
}

// fetch the sitemap with a small retry loop. github pages can take a
// minute or two to update after deploy-pages reports success, so a
// single fetch can race the cdn.
async function fetchSitemap(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': `${SITE_HOST} IndexNow ping` } });
      if (res.ok) return await res.text();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) await sleep(15_000);
  }
  throw lastErr;
}

// minimal sitemap parser. we only need <loc> + <lastmod> pairs at the
// outer <url> level; xhtml:link alternates and other children don't
// affect the diff. a regex pass is plenty here - the file is generated
// by us, structure is predictable, and pulling in a real xml parser for
// 95 entries would be overkill.
function parseSitemap(xml) {
  const map = new Map();
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1];
    if (loc) {
      map.set(decodeXmlEntities(loc), lastmod ? decodeXmlEntities(lastmod) : '');
    }
  }
  return map;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// diff: a url is "changed" if it's new, or its lastmod advanced.
// urls that disappeared from the new sitemap are not pinged - search
// engines pick that up from 410/redirect/sitemap absence on their own.
function diffSitemaps(prev, next) {
  const changed = [];
  for (const [loc, lastmod] of next) {
    const prevLastmod = prev.get(loc);
    if (prevLastmod === undefined) {
      changed.push(loc);
      continue;
    }
    // string compare on iso8601 is correct lexically when both values
    // use the same precision/timezone. our generator always emits
    // utc with the same format, so this holds.
    if (lastmod && prevLastmod !== lastmod) {
      changed.push(loc);
    }
  }
  return changed;
}

async function postPing(urls) {
  const body = {
    host: SITE_HOST,
    key: KEY,
    keyLocation: `${SITE_URL}/${KEY}.txt`,
    urlList: urls,
  };
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text().catch(() => '') };
}

async function loadPrevSitemap() {
  if (!PREV_SITEMAP_PATH) return new Map();
  try {
    const xml = await readFile(PREV_SITEMAP_PATH, 'utf8');
    return parseSitemap(xml);
  } catch {
    return new Map();
  }
}

async function main() {
  let xml;
  try {
    xml = await fetchSitemap(SITEMAP_URL);
  } catch (err) {
    console.warn(`IndexNow: failed to fetch ${SITEMAP_URL}: ${err.message}. Skipping ping.`);
    return;
  }

  const next = parseSitemap(xml);
  if (next.size === 0) {
    console.warn('IndexNow: deployed sitemap parsed to zero URLs; skipping ping.');
    return;
  }

  const prev = await loadPrevSitemap();
  const changed = diffSitemaps(prev, next);

  // first run (no prev cache) would otherwise re-ping the entire site.
  // we deliberately skip the ping in that case - the next deploy that
  // actually changes a url will fire correctly.
  if (prev.size === 0) {
    console.log(`IndexNow: no previous sitemap cached; recording ${next.size} URLs as the baseline.`);
  } else if (changed.length === 0) {
    console.log('IndexNow: no URLs changed since last run; skipping ping.');
  } else {
    console.log(`IndexNow: ${changed.length} URL(s) changed; pinging ${INDEXNOW_ENDPOINT}.`);
    // batch at 10000 per the spec. we have ~95 urls so this is a
    // single batch in practice.
    const batchSize = 10_000;
    for (let i = 0; i < changed.length; i += batchSize) {
      const batch = changed.slice(i, i + batchSize);
      const { status, text } = await postPing(batch);
      const ok = status >= 200 && status < 300;
      console.log(`IndexNow: batch ${i / batchSize + 1} -> HTTP ${status}${ok ? '' : ` :: ${text.slice(0, 200)}`}`);
    }
  }

  // persist the new sitemap for next run's diff regardless of whether
  // we pinged - the cache is what makes the diff meaningful.
  if (OUT_SITEMAP_PATH) {
    try {
      await writeFile(OUT_SITEMAP_PATH, xml, 'utf8');
    } catch (err) {
      console.warn(`IndexNow: failed to write ${OUT_SITEMAP_PATH}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.warn(`IndexNow: unexpected error: ${err.message}`);
  process.exit(0);
});

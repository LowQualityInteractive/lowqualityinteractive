import { execSync } from 'node:child_process';

export const SITE_URL = 'https://lowqualityinteractive.com';
export const SITE_NAME = 'Low Quality Interactive';
export const CONTACT_EMAIL = 'contact@lowqualityinteractive.com';

export const SOCIAL_LINKS = {
  discord: 'https://discord.gg/G2J9rP5fBg',
  roblox: 'https://www.roblox.com/communities/7489017/Low-Quality-Int#!/about',
  x: 'https://x.com/LowQualityInt',
  youtube: 'https://www.youtube.com/@LowQualityInteractive',
} as const;

export const SOCIAL_URLS = Object.values(SOCIAL_LINKS);

// repo-wide last-commit timestamp, captured once at build start. used as
// dateModified across json-ld so AI extractors have a freshness signal
// (Princeton/GenOptima GEO research: pages without freshness lose
// citation priority within ~14 days). per-page git mtime would be more
// accurate but costs significant plumbing - repo-wide still advances on
// every commit, which is the signal we actually need.
//
// falls back to build time if git isn't available (CI without full
// history, etc). never crashes the build.
function readGitLastCommitIso(): string {
  try {
    const stdout = execSync('git log -1 --format=%cI', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (stdout && !Number.isNaN(Date.parse(stdout))) {
      return new Date(stdout).toISOString();
    }
  } catch {
    // fall through to build-time default
  }
  return new Date().toISOString();
}

export const SITE_LAST_MODIFIED = readGitLastCommitIso();

export function toAbsoluteSiteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

// Keep browser titles compact while preserving a stable brand token. The
// full studio name remains in descriptions, Open Graph metadata, and the
// visible footer; short titles are easier to scan in tabs and SERPs.
export function getSiteTitle(pageTitle: string) {
  return `${pageTitle} | LQI`;
}

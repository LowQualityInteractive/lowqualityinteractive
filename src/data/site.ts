export const SITE_URL = 'https://lowqualityinteractive.com';
export const SITE_NAME = 'Low Quality Interactive';
export const CONTACT_EMAIL = 'contact@lowqualityinteractive.com';
export const DISCORD_GUILD_ID = '1291532573960441907';

export const SOCIAL_LINKS = {
  discord: 'https://discord.gg/G2J9rP5fBg',
  roblox: 'https://www.roblox.com/communities/7489017/Low-Quality-Int#!/about',
  x: 'https://x.com/LowQualityInt',
  youtube: 'https://www.youtube.com/@LowQualityInteractive',
} as const;

export const SOCIAL_URLS = Object.values(SOCIAL_LINKS);

export function toAbsoluteSiteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

export function getSiteTitle(pageTitle: string) {
  return `${SITE_NAME} | ${pageTitle}`;
}

export const SITE_URL = 'https://lowqualityinteractive.com';
export const SITE_NAME = 'Low Quality Interactive';
export const SITE_DESCRIPTION = 'Official website for Low Quality Interactive, a Roblox indie studio.';
export const ORGANIZATION_DESCRIPTION =
  'Low Quality Interactive is an independent Roblox game development studio focused on competitive multiplayer, tactical systems, and high-replayability sandbox experiences.';

export const SOCIAL_LINKS = [
  'https://x.com/LowQualityInt',
  'https://discord.gg/G2J9rP5fBg',
  'https://www.youtube.com/@LowQualityInteractive',
  'https://www.roblox.com/communities/7489017/Low-Quality-Int',
] as const;

export function toAbsoluteSiteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

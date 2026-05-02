interface NotFoundLocaleContent {
  copy: string;
  description: string;
  gamesHref: string;
  goHome: string;
  heading: string;
  homeHref: string;
  kicker: string;
  locale: string;
  title: string;
  viewGames: string;
}

export function getNotFoundScript(
  contentByLocale: Record<string, NotFoundLocaleContent>,
) {
  return String.raw`(() => {
  const CONTENT = ${JSON.stringify(contentByLocale)};
  const pathname = window.location.pathname.toLowerCase();
  const matchedLocale =
    Object.keys(CONTENT).find((locale) => {
      if (locale === 'en') return false;
      const prefix = '/' + locale.toLowerCase();
      return pathname === prefix || pathname.startsWith(prefix + '/');
    }) || 'en';

  const content = CONTENT[matchedLocale] || CONTENT.en;
  document.documentElement.lang = content.locale;
  document.title = content.title;

  const description = document.querySelector('meta[name="description"]');
  if (description instanceof HTMLMetaElement) {
    description.content = content.description;
  }

  const kicker = document.getElementById('not-found-kicker');
  const heading = document.getElementById('not-found-heading');
  const copy = document.getElementById('not-found-copy');
  const homeLink = document.getElementById('not-found-home');
  const gamesLink = document.getElementById('not-found-games');

  if (kicker) kicker.textContent = content.kicker;
  if (heading) heading.textContent = content.heading;
  if (copy) copy.textContent = content.copy;

  if (homeLink instanceof HTMLAnchorElement) {
    homeLink.href = content.homeHref;
    homeLink.textContent = content.goHome;
  }

  if (gamesLink instanceof HTMLAnchorElement) {
    gamesLink.href = content.gamesHref;
    gamesLink.textContent = content.viewGames;
  }
})();`;
}

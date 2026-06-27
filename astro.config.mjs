import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://lowqualityinteractive.com',
  base: '/',
  output: 'static',
  // prefetch internal links on hover/focus so the next page's html is
  // already cached by the time the user clicks - the cross-document view
  // transition then has nothing to wait on and the nav feels instant.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'pt-BR', 'es-MX', 'es-ES', 'ru', 'de', 'it', 'fr', 'ro', 'el'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
});

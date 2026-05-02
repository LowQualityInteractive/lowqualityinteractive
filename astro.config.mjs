import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://lowqualityinteractive.com',
  base: '/',
  output: 'static',
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

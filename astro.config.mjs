import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://lowqualityinteractive.com',
  output: 'static',
  build: {
    format: 'directory',
  },
});

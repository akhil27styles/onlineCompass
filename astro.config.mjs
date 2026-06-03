// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://akhil27styles.github.io',
  base: '/onlineCompass',
  output: 'static',
  vite: {
    plugins: [tailwindcss()]
  }
});
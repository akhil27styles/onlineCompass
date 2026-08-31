// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { copyFileSync } from 'fs';
import { join } from 'path';

// https://astro.build/config
export default defineConfig({
	site: 'https://trulycompass.com',
	// Locales used across the site. We render localized pages under /ar/ and /id/.
	locales: [
		{ code: 'en', dir: 'ltr', path: '/' , default: true },
		{ code: 'ar', dir: 'rtl', path: '/ar/' },
		{ code: 'id', dir: 'ltr', path: '/id/' },
		{ code: 'ur', dir: 'rtl', path: '/ur/' },
		{ code: 'tr', dir: 'ltr', path: '/tr/' },
		{ code: 'ms', dir: 'ltr', path: '/ms/' },
		{ code: 'bn', dir: 'ltr', path: '/bn/' },
		{ code: 'fa', dir: 'rtl', path: '/fa/' },
	],
	integrations: [
		sitemap(),
		{
			name: 'sitemap-copy',
			hooks: {
				'astro:build:done': ({ dir }) => {
					copyFileSync(join(dir.pathname, 'sitemap-0.xml'), join(dir.pathname, 'sitemap.xml'));
				},
			},
		},
	],
	vite: {
		plugins: [tailwindcss()],
	},
});

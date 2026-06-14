// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { copyFileSync } from 'fs';
import { join } from 'path';

// https://astro.build/config
export default defineConfig({
	site: 'https://trulycompass.com',
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

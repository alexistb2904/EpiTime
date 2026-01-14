import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['icons/*.png'],
			useFilesForDev: true,
			logger: undefined,
			manifest: {
				name: 'EpiTime - Emploi du Temps',
				short_name: 'EpiTime',
				description: 'Ton emploi du temps EPITA, enfin bien fait ✨',
				theme_color: '#5b5fef',
				background_color: '#f2f4f8',
				display: 'standalone',
				scope: '/',
				start_url: '/',
				icons: [
					{
						src: '/icons/app_logo.png',
						sizes: 'any',
						type: 'image/png',
						purpose: 'any maskable',
					},
				],
				categories: ['education', 'productivity', 'utilities'],
				screenshots: [],
				shortcuts: [
					{
						name: 'Voir mon calendrier',
						short_name: 'Calendrier',
						description: "Afficher l'emploi du temps de la semaine",
						url: '/?view=week',
						icons: [
							{
								src: '/icons/app_logo.png',
								sizes: 'any',
							},
						],
					},
				],
			},
			workbox: false,
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'sw.js',
			injectManifest: {
				swSrc: 'src/sw.js',
				swDest: 'dist/sw.js',
			},
		}),
	],
	server: {
		port: 5000,
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
			'Cross-Origin-Embedder-Policy': 'credentialless',
		},
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: 'dist',
		sourcemap: false,
	},
});

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

registerRoute(
	({ url }) => url.pathname.startsWith('/api/'),
	new NetworkFirst({
		cacheName: 'EpiTime-api-v1',
	})
);

self.addEventListener('push', (event) => {
	const data = event.data ? event.data.json() : { title: 'EpiTime', body: 'Mise à jour' };
	const options = {
		body: data.body,
		icon: '/icons/app_logo.png',
		badge: '/icons/app_logo.png',
		vibrate: [100, 50, 100],
		data: data.data,
	};
	event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			for (const client of clientList) {
				if (client.url === '/' && 'focus' in client) return client.focus();
			}
			if (clients.openWindow) return clients.openWindow('/');
		})
	);
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

import { useCallback } from 'react';

export const usePushNotifications = (userEmail = null, userGroups = [], notificationSettings = null) => {
	const registerPushNotifications = useCallback(async () => {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
			console.warn('Push notifications non supportées');
			return null;
		}

		if (!userEmail) {
			console.warn('Email utilisateur requis pour les notifications');
			return null;
		}

		try {
			const vapidResponse = await fetch('/api/vapid-key');
			const vapidData = await vapidResponse.json();

			if (vapidData.error || vapidData.offline) {
				console.warn('VAPID key non disponible:', vapidData.error || 'Mode hors ligne');
				return null;
			}

			if (!vapidResponse.ok) {
				console.warn('VAPID key non disponible (statut:', vapidResponse.status, ')');
				return null;
			}

			const { publicKey, enabled } = vapidData;

			if (!enabled || !publicKey) {
				console.warn('Push notifications désactivées (VAPID keys non configurées)');
				return null;
			}

			const registration = await navigator.serviceWorker.ready;

			let subscription = await registration.pushManager.getSubscription();

			if (!subscription) {
				subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(publicKey),
				});
				console.log('Push subscription créée');
			}

			const settings = notificationSettings || { minutesBefore: 15, selectedDays: [0, 1, 2, 3, 4, 5, 6] };

			const response = await fetch('/api/subscribe', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-User-ID': userEmail,
					'X-User-Groups': JSON.stringify(userGroups),
					'X-Notification-Settings': JSON.stringify(settings),
				},
				body: JSON.stringify(subscription),
			});

			if (response.ok) {
				console.log('Subscription enregistrée au serveur');
				return subscription;
			}
		} catch (err) {
			console.error('❌ Erreur enregistrement notifications:', err.message);
		}

		return null;
	}, [userEmail, userGroups, notificationSettings]);

	const updateNotificationSettings = useCallback(
		async (settings, groups = null) => {
			try {
				const response = await fetch('/api/update-notification-settings', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-User-ID': userEmail,
					},
					body: JSON.stringify({
						minutesBefore: settings.minuesBefore || settings.minutesBefore || 15,
						selectedDays: settings.selectedDays || [0, 1, 2, 3, 4, 5, 6],
						groups: groups || userGroups,
					}),
				});

				if (response.ok) {
					console.log('Préférences de notification mises à jour');
					return true;
				}

				if (response.status === 404) {
					console.warn('⚠️ Subscription non trouvée, réenregistrement automatique...');
					await registerPushNotifications();

					const retryResponse = await fetch('/api/update-notification-settings', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-User-ID': userEmail,
						},
						body: JSON.stringify({
							minutesBefore: settings.minuesBefore || settings.minutesBefore || 15,
							selectedDays: settings.selectedDays || [0, 1, 2, 3, 4, 5, 6],
							groups: groups || userGroups,
						}),
					});

					if (retryResponse.ok) {
						console.log('✅ Préférences mises à jour après réenregistrement');
						return true;
					}
				}
			} catch (err) {
				console.error('❌ Erreur mise à jour préférences:', err.message);
			}
			return false;
		},
		[userEmail, userGroups, registerPushNotifications]
	);

	const checkNotifications = useCallback(
		async (events) => {
			if (!events || events.length === 0) return null;

			try {
				const response = await fetch('/api/check-notifications', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-User-ID': userEmail,
					},
					body: JSON.stringify({ events }),
				});

				const data = await response.json();
				if (response.ok) {
					if (data.notified > 0) {
						console.log(`📨 ${data.notified} notification(s) envoyée(s)`);
					}
					return data;
				}
			} catch (err) {
				if (navigator.onLine) {
					console.error('❌ Erreur vérification notifications:', err.message);
				}
			}
			return null;
		},
		[userEmail]
	);

	const sendTestNotification = useCallback(
		async (title, body) => {
			try {
				const response = await fetch('/api/notify-test', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-User-ID': userEmail,
					},
					body: JSON.stringify({ title, body }),
				});

				const data = await response.json();
				if (response.ok) {
					console.log(`Notification de test envoyée à ${data.sent} device(s)`);
					return data;
				} else {
					console.error('❌ Erreur envoi notification test:', response.status, data.error || data);
					return null;
				}
			} catch (err) {
				console.error('❌ Erreur envoi notification test:', err.message);
				return null;
			}
		},
		[userEmail]
	);

	const unsubscribeNotifications = useCallback(async () => {
		try {
			await fetch('/api/unsubscribe', {
				method: 'POST',
				headers: {
					'X-User-ID': userEmail,
				},
			});
			console.log('Unsubscribed');
		} catch (err) {
			console.error('❌ Erreur unsubscribe:', err);
		}
	}, [userEmail]);

	return {
		registerPushNotifications,
		updateNotificationSettings,
		checkNotifications,
		sendTestNotification,
		unsubscribeNotifications,
	};
};

function urlBase64ToUint8Array(base64String) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}

	return outputArray;
}

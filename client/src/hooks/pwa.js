import { useEffect, useState } from 'react';

export const pwa = () => {
	const [deferredPrompt, setDeferredPrompt] = useState(null);
	const [showInstallBanner, setShowInstallBanner] = useState(false);
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	const [isInstalled, setIsInstalled] = useState(false);

	useEffect(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker
				.register('/sw.js')
				.then((registration) => {
					console.log('✅ Service Worker enregistré:', registration.scope);
					setInterval(() => {
						registration.update();
					}, 60 * 60 * 1000);
				})
				.catch((error) => {
					console.error('❌ Erreur Service Worker:', error);
				});
		}

		if (window.navigator.standalone === true) {
			setIsInstalled(true);
		}

		window.addEventListener('appinstalled', () => {
			console.log('✅ PWA installée');
			setIsInstalled(true);
			setShowInstallBanner(false);
			setDeferredPrompt(null);
		});

		return () => {
			window.removeEventListener('appinstalled', () => {});
		};
	}, []);

	useEffect(() => {
		console.log('🔧 [usePWA] Configuration du listener beforeinstallprompt');

		const handleBeforeInstallPrompt = (e) => {
			console.log('🎉 [usePWA] beforeinstallprompt déclenché!', e);
			e.preventDefault();

			const dismissed = localStorage.getItem('pwa-install-dismissed');
			const lastDismissed = dismissed ? parseInt(dismissed) : 0;
			const now = Date.now();
			const threeDays = 3 * 24 * 60 * 60 * 1000;

			console.log('📱 [usePWA] Installation déjà rejetée?', {
				dismissed,
				now,
				lastDismissed,
				timeDiff: now - lastDismissed,
				shouldShow: !dismissed || now - lastDismissed > threeDays,
			});

			setDeferredPrompt(e);

			// Afficher la bannière si jamais rejetée ou si ça fait plus de 3 jours
			if (!dismissed || now - lastDismissed > threeDays) {
				console.log('📱 [usePWA] Affichage de la bannière installation');
				setTimeout(() => {
					console.log('📱 [usePWA] Affichage bannière après 2s');
					setShowInstallBanner(true);
				}, 2000);
			}
		};

		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		console.log('🔧 [usePWA] Listener beforeinstallprompt configuré');

		return () => {
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		};
	}, []);

	useEffect(() => {
		const handleOnline = () => {
			setIsOnline(true);
			console.log('✅ En ligne');
		};

		const handleOffline = () => {
			setIsOnline(false);
			console.log('⚠️ Mode hors ligne');
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, []);

	const handleInstall = async () => {
		if (!deferredPrompt) {
			console.log("Pas de prompt d'installation disponible");
			return;
		}

		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		console.log(`Installation PWA: ${outcome}`);

		setShowInstallBanner(false);
		setDeferredPrompt(null);
	};

	const handleDismiss = () => {
		setShowInstallBanner(false);
		localStorage.setItem('pwa-install-dismissed', Date.now().toString());
	};

	return {
		showInstallBanner,
		isOnline,
		isInstalled,
		handleInstall,
		handleDismiss,
	};
};

import { useEffect, useState } from 'react';

export const usePWA = () => {
	const [deferredPrompt, setDeferredPrompt] = useState(null);
	const [showInstallBanner, setShowInstallBanner] = useState(false);
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	const [isInstalled, setIsInstalled] = useState(false);
	const [installMethod, setInstallMethod] = useState(null);

	const isIOS = () => /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));
	const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

	const wasDismissedRecently = () => {
		const dismissed = localStorage.getItem('pwa-install-dismissed');
		const lastDismissed = dismissed ? parseInt(dismissed, 10) : 0;
		const now = Date.now();
		const threeDays = 3 * 24 * 60 * 60 * 1000;
		return dismissed && now - lastDismissed <= threeDays;
	};

	useEffect(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker
				.register('/sw.js')
				.then((registration) => {
					console.log('✅ Service Worker enregistré:', registration.scope);
					setInterval(
						() => {
							registration.update();
						},
						60 * 60 * 1000,
					);
				})
				.catch((error) => {
					console.error('❌ Erreur Service Worker:', error);
				});
		} else {
			console.warn('⚠️ Service Worker non supporté');
		}

		if (isStandalone()) {
			setIsInstalled(true);
		}

		if (isIOS() && !isStandalone() && !wasDismissedRecently()) {
			setInstallMethod('ios');
			setTimeout(() => {
				setShowInstallBanner(true);
			}, 2000);
		}

		const handleAppInstalled = () => {
			setIsInstalled(true);
			setShowInstallBanner(false);
			setDeferredPrompt(null);
			setInstallMethod(null);
		};

		window.addEventListener('appinstalled', handleAppInstalled);

		return () => {
			window.removeEventListener('appinstalled', handleAppInstalled);
		};
	}, []);

	useEffect(() => {
		const handleBeforeInstallPrompt = (e) => {
			e.preventDefault();

			setDeferredPrompt(e);
			setInstallMethod('prompt');

			if (!wasDismissedRecently()) {
				setTimeout(() => {
					setShowInstallBanner(true);
				}, 2000);
			}
		};

		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		return () => {
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		};
	}, []);

	// Gestion de l'état en ligne/hors ligne
	useEffect(() => {
		const handleOnline = () => {
			console.log('✅ En ligne');
			setIsOnline(true);
		};

		const handleOffline = () => {
			console.log('⚠️ Mode hors ligne');
			setIsOnline(false);
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}, []);

	const handleInstall = async () => {
		console.log('🚀 Installation cliquée');

		if (installMethod === 'ios') {
			window.alert("Sur iPhone : appuie sur Partager, puis 'Sur l'écran d'accueil'.");
			return;
		}

		if (!deferredPrompt) {
			console.error("❌ Pas de prompt d'installation disponible");
			return;
		}

		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		console.log(`✅ Installation PWA: ${outcome}`);

		setShowInstallBanner(false);
		setDeferredPrompt(null);
	};

	const handleDismiss = () => {
		console.log('❌ Installation rejetée - réapparaîtra dans 3 jours');
		setShowInstallBanner(false);
		localStorage.setItem('pwa-install-dismissed', Date.now().toString());
	};

	return {
		showInstallBanner,
		isOnline,
		isInstalled,
		installMethod,
		handleInstall,
		handleDismiss,
	};
};

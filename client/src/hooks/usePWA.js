import { useEffect, useState } from "react";

export const usePWA = () => {
	const [deferredPrompt, setDeferredPrompt] = useState(null);
	const [showInstallBanner, setShowInstallBanner] = useState(false);
	const [isOnline, setIsOnline] = useState(navigator.onLine);
	const [isInstalled, setIsInstalled] = useState(false);
	const [installMethod, setInstallMethod] = useState(null);
	const [isAndroid, setIsAndroid] = useState(false);

	const androidApkUrl =
		import.meta.env.VITE_ANDROID_APK_URL || "/downloads/epitime-beta.apk";

	const isIOS = () =>
		/iPad|iPhone|iPod/i.test(navigator.userAgent) ||
		(navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));

	const isAndroidDevice = () =>
		/Android/i.test(navigator.userAgent);

	const isStandalone = () =>
		window.matchMedia("(display-mode: standalone)").matches ||
		window.navigator.standalone === true;

	const wasDismissedRecently = () => {
		const dismissed = localStorage.getItem("pwa-install-dismissed");
		const lastDismissed = dismissed ? parseInt(dismissed, 10) : 0;
		const now = Date.now();
		const threeDays = 3 * 24 * 60 * 60 * 1000;

		return dismissed && now - lastDismissed <= threeDays;
	};

	useEffect(() => {
		const android = isAndroidDevice();
		setIsAndroid(android);

		if (isStandalone()) {
			setIsInstalled(true);
			return;
		}

		if (wasDismissedRecently()) {
			return;
		}

		if (isIOS()) {
			setInstallMethod("ios");

			setTimeout(() => {
				setShowInstallBanner(true);
			}, 2000);
		}

		if (android) {
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

		window.addEventListener("appinstalled", handleAppInstalled);

		return () => {
			window.removeEventListener("appinstalled", handleAppInstalled);
		};
	}, []);

	useEffect(() => {
		const handleBeforeInstallPrompt = (e) => {
			const shouldUseCustomBanner = !isStandalone() && !wasDismissedRecently();

			if (!shouldUseCustomBanner) {
				setDeferredPrompt(null);
				setShowInstallBanner(false);
				return;
			}

			e.preventDefault();

			setDeferredPrompt(e);
			setInstallMethod("prompt");

			setTimeout(() => {
				setShowInstallBanner(true);
			}, 2000);
		};

		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

		return () => {
			window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		};
	}, []);

	useEffect(() => {
		const handleOnline = () => {
			console.log("✅ En ligne");
			setIsOnline(true);
			document.body.classList.remove("offline");
		};

		const handleOffline = () => {
			console.log("⚠️ Mode hors ligne");
			setIsOnline(false);
			document.body.classList.add("offline");
		};

		if (!navigator.onLine) {
			document.body.classList.add("offline");
		}

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
			document.body.classList.remove("offline");
		};
	}, []);

	const handleInstall = async () => {
		console.log("🚀 Installation cliquée");

		if (installMethod === "ios") {
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

	const handleAndroidBetaInstall = () => {
		console.log("🤖 Téléchargement APK beta Android");
		window.open(androidApkUrl, "_blank", "noopener,noreferrer");
	};

	const handleDismiss = () => {
		console.log("❌ Installation rejetée - réapparaîtra dans 3 jours");
		setShowInstallBanner(false);
		localStorage.setItem("pwa-install-dismissed", Date.now().toString());
	};

	return {
		showInstallBanner,
		isOnline,
		isInstalled,
		installMethod,
		isAndroid,
		androidApkUrl,
		handleInstall,
		handleAndroidBetaInstall,
		handleDismiss,
	};
};

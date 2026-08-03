import React from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { NotificationProvider } from "./context/NotificationContext";
import Login from "./components/Login";
import Calendar from "./components/Calendar";
import { PWAInstallBanner } from "./components/PWAInstallBanner";
import { CookieBanner } from "./components/CookieBanner";
import { usePWA } from "./hooks/usePWA";
import {
	analyticsConsentValues,
	disableAnalyticsTracking,
	enableAnalyticsTracking,
	getAnalyticsConsent,
	loadAnalyticsScript,
	setAnalyticsConsent,
	shouldShowAnalyticsBanner,
} from "./utils/analyticsConsent";
import { trackEvent } from "./utils/analyticsTracker";
import LegalPage from "./components/LegalPage";
import "./App.css";

function AppContent() {
	const { user, loading } = useAuth();
	const isLegalPage = window.location.pathname.replace(/\/+$/, "") === "/legal";

	const { showInstallBanner, isOnline, installMethod, isAndroid, androidApkUrl, handleInstall, handleAndroidBetaInstall, handleDismiss } = usePWA();

	const [showCookieBanner, setShowCookieBanner] = React.useState(() => shouldShowAnalyticsBanner());

	React.useEffect(() => {
		document.body.classList.toggle("offline", !isOnline);
	}, [isOnline]);

	React.useEffect(() => {
		const canonical = document.querySelector('link[rel="canonical"]');
		const robots = document.querySelector('meta[name="robots"]');

		if (isLegalPage) {
			document.title = "Politique de confidentialité et mentions légales | EpiTime";
			canonical?.setAttribute("href", `${window.location.origin}/legal`);
			robots?.setAttribute("content", "noindex, follow");
			return;
		}

		document.title = "EpiTime - emploi du temps EPITA, PWA et Android";
		canonical?.setAttribute("href", `${window.location.origin}/`);
		robots?.setAttribute("content", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
	}, [isLegalPage]);

	React.useEffect(() => {
		if (getAnalyticsConsent() === analyticsConsentValues.accepted) {
			enableAnalyticsTracking();
			loadAnalyticsScript();
		} else {
			disableAnalyticsTracking();
		}
	}, []);

	const handleAcceptAnalytics = React.useCallback(async () => {
		setAnalyticsConsent(analyticsConsentValues.accepted);
		enableAnalyticsTracking();
		await loadAnalyticsScript();

		trackEvent("cookie_consent_accepted", {
			source: "cookie_banner",
		});

		setShowCookieBanner(false);
	}, []);

	const handleDeclineAnalytics = React.useCallback(() => {
		setAnalyticsConsent(analyticsConsentValues.declined);
		const mustReload = disableAnalyticsTracking();
		setShowCookieBanner(false);
		if (mustReload) window.location.reload();
	}, []);

	if (isLegalPage) {
		return <LegalPage />;
	}

	if (loading) {
		return (
			<div className="loading-screen">
				<div className="spinner"></div>
				<p>Chargement...</p>
			</div>
		);
	}

	return (
		<>
			<PWAInstallBanner
				show={showInstallBanner}
				installMethod={installMethod}
				isAndroid={isAndroid}
				androidApkUrl={androidApkUrl}
				onInstall={handleInstall}
				onAndroidBetaInstall={handleAndroidBetaInstall}
				onDismiss={handleDismiss}
			/>

			<CookieBanner show={showCookieBanner} onAccept={handleAcceptAnalytics} onDecline={handleDeclineAnalytics} />

			{user ? <Calendar /> : <Login />}
		</>
	);
}

function App() {
	return (
		<ThemeProvider>
			<AuthProvider>
				<NotificationProvider>
					<AppContent />
				</NotificationProvider>
			</AuthProvider>
		</ThemeProvider>
	);
}

export default App;

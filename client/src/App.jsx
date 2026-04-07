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
import "./App.css";

function AppContent() {
	const { user, loading } = useAuth();
	const { showInstallBanner, isOnline, installMethod, handleInstall, handleDismiss } = usePWA();
	const [showCookieBanner, setShowCookieBanner] = React.useState(() => shouldShowAnalyticsBanner());

	React.useEffect(() => {
		document.body.classList.toggle("offline", !isOnline);
	}, [isOnline]);

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
		disableAnalyticsTracking();
		setShowCookieBanner(false);
	}, []);

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
			<PWAInstallBanner show={showInstallBanner} installMethod={installMethod} onInstall={handleInstall} onDismiss={handleDismiss} />
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

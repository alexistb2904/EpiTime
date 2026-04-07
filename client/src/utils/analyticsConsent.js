const ANALYTICS_CONSENT_KEY = "epitime_analytics_consent";
const ANALYTICS_SCRIPT_ID = "epitime-analytics-script";
const ANALYTICS_SRC = "https://analytics.alexis.qzz.io/api/script.js";
const ANALYTICS_SITE_ID = "90e9c6fb1ad8";

export const analyticsConsentValues = {
	accepted: "accepted",
	declined: "declined",
};

const RYBBIT_OPTOUT_KEY = "disable-rybbit";

export function getAnalyticsConsent() {
	return localStorage.getItem(ANALYTICS_CONSENT_KEY);
}

export function setAnalyticsConsent(value) {
	localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
}

export function shouldShowAnalyticsBanner() {
	const consent = getAnalyticsConsent();
	return consent !== analyticsConsentValues.accepted && consent !== analyticsConsentValues.declined;
}

export function loadAnalyticsScript() {
	return new Promise((resolve) => {
		const existing = document.getElementById(ANALYTICS_SCRIPT_ID);
		if (existing) {
			resolve();
			return;
		}

		const script = document.createElement("script");
		script.id = ANALYTICS_SCRIPT_ID;
		script.src = ANALYTICS_SRC;
		script.defer = true;
		script.setAttribute("data-site-id", ANALYTICS_SITE_ID);
		script.onload = () => resolve();
		script.onerror = () => resolve();
		document.head.appendChild(script);
	});
}

export function enableAnalyticsTracking() {
	if (typeof window !== "undefined") {
		window.__RYBBIT_OPTOUT__ = false;
	}
	localStorage.removeItem(RYBBIT_OPTOUT_KEY);
}

export function disableAnalyticsTracking() {
	if (typeof window !== "undefined") {
		window.__RYBBIT_OPTOUT__ = true;
		if (typeof window.rybbit?.cleanup === "function") {
			window.rybbit.cleanup();
		}
	}
	localStorage.setItem(RYBBIT_OPTOUT_KEY, "true");
}

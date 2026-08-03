const ANALYTICS_CONSENT_KEY = "epitime_analytics_consent";
const ANALYTICS_SCRIPT_ID = "epitime-analytics-script";
const ANALYTICS_SRC = "https://analytics.alexis.qzz.io/api/script.js";
const ANALYTICS_SITE_ID = "90e9c6fb1ad8";
const ANALYTICS_VISITOR_ID_KEY = "epitime_analytics_visitor_id_v1";
const RYBBIT_USER_ID_KEY = "rybbit-user-id";

export const analyticsConsentValues = {
	accepted: "accepted",
	declined: "declined",
};

const RYBBIT_OPTOUT_KEY = "disable-rybbit";

const createPseudonymousId = () => {
	try {
		if (typeof globalThis.crypto?.randomUUID === "function") {
			return `ept_${globalThis.crypto.randomUUID()}`;
		}
	} catch {
		//
	}

	return `ept_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
};

const isPseudonymousId = (value) => /^ept_[a-z0-9_-]{16,}$/i.test(value || "");

export function getOrCreateAnalyticsVisitorId() {
	try {
		const storedId = localStorage.getItem(ANALYTICS_VISITOR_ID_KEY);
		const visitorId = isPseudonymousId(storedId) ? storedId : createPseudonymousId();

		localStorage.setItem(ANALYTICS_VISITOR_ID_KEY, visitorId);
		localStorage.setItem(RYBBIT_USER_ID_KEY, visitorId);
		return visitorId;
	} catch {
		return createPseudonymousId();
	}
}

const identifyAnalyticsVisitor = () => {
	const visitorId = getOrCreateAnalyticsVisitorId();
	if (typeof window.rybbit?.identify !== "function") return false;

	try {
		window.rybbit.identify(visitorId);
		return true;
	} catch {
		return false;
	}
};

const identifyAnalyticsVisitorWhenReady = () =>
	new Promise((resolve) => {
		const deadline = Date.now() + 5000;
		const attempt = () => {
			if (identifyAnalyticsVisitor() || Date.now() >= deadline) {
				resolve();
				return;
			}
			window.setTimeout(attempt, 50);
		};

		attempt();
	});

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
		getOrCreateAnalyticsVisitorId();

		const existing = document.getElementById(ANALYTICS_SCRIPT_ID);
		if (existing) {
			if (typeof window.rybbit?.identify === "function") {
				void identifyAnalyticsVisitorWhenReady().then(resolve);
				return;
			}

			existing.addEventListener(
				"load",
				() => {
					void identifyAnalyticsVisitorWhenReady().then(resolve);
				},
				{ once: true }
			);
			return;
		}

		const script = document.createElement("script");
		script.id = ANALYTICS_SCRIPT_ID;
		script.src = ANALYTICS_SRC;
		script.defer = true;
		script.setAttribute("data-site-id", ANALYTICS_SITE_ID);
		script.onload = () => {
			void identifyAnalyticsVisitorWhenReady().then(resolve);
		};
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
	const hadLoadedScript = typeof document !== "undefined" && Boolean(document.getElementById(ANALYTICS_SCRIPT_ID));

	if (typeof window !== "undefined") {
		window.__RYBBIT_OPTOUT__ = true;
		if (typeof window.rybbit?.cleanup === "function") {
			window.rybbit.cleanup();
		}
		if (typeof window.rybbit?.clearUserId === "function") {
			window.rybbit.clearUserId();
		}
	}
	try {
		localStorage.setItem(RYBBIT_OPTOUT_KEY, "true");
		localStorage.removeItem(ANALYTICS_VISITOR_ID_KEY);
		localStorage.removeItem(RYBBIT_USER_ID_KEY);
	} catch {
		//
	}
	return hadLoadedScript;
}

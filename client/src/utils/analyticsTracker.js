import { analyticsConsentValues, getAnalyticsConsent } from "./analyticsConsent";

const BLOCKED_PROP_KEYS = ["email", "mail", "user", "username", "id", "token", "auth", "phone", "name"];

const isTrackingAllowed = () => {
	if (typeof window === "undefined") return false;
	if (getAnalyticsConsent() !== analyticsConsentValues.accepted) return false;
	return typeof window.rybbit?.event === "function";
};

const sanitizeValue = (value) => {
	if (value === null || value === undefined) return undefined;

	if (typeof value === "number") {
		if (!Number.isFinite(value)) return undefined;
		return value;
	}

	if (typeof value === "boolean") return value ? 1 : 0;

	if (Array.isArray(value)) {
		const compact = value.map((v) => sanitizeValue(v)).filter((v) => v !== undefined);
		return compact.slice(0, 12).join(",").slice(0, 180);
	}

	if (typeof value === "string") {
		return value.trim().slice(0, 180);
	}

	return undefined;
};

const sanitizeProperties = (properties = {}) => {
	const output = {};

	Object.entries(properties).forEach(([rawKey, rawValue]) => {
		if (!rawKey) return;

		const key = String(rawKey).trim().toLowerCase();
		if (!key) return;
		if (BLOCKED_PROP_KEYS.some((blocked) => key.includes(blocked))) return;

		const value = sanitizeValue(rawValue);
		if (value === undefined || value === "") return;

		output[key.slice(0, 48)] = value;
	});

	return output;
};

export const trackEvent = (eventName, properties = {}) => {
	if (!isTrackingAllowed()) return;

	const safeName = String(eventName || "")
		.trim()
		.slice(0, 255);
	if (!safeName) return;

	try {
		const safeProps = sanitizeProperties(properties);
		window.rybbit.event(safeName, safeProps);
	} catch {
		// rien
	}
};

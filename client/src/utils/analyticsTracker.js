import { analyticsConsentValues, getAnalyticsConsent } from "./analyticsConsent";

const BLOCKED_PROP_KEYS = new Set([
	"email",
	"mail",
	"user",
	"username",
	"userid",
	"id",
	"token",
	"accesstoken",
	"refreshtoken",
	"authorization",
	"auth",
	"authentication",
	"phone",
	"name",
	"firstname",
	"lastname",
	"account",
	"accountid",
	"teacher",
	"teachername",
	"room",
	"roomname",
	"group",
	"groupname",
	"course",
	"coursename",
	"title",
	"url",
	"message",
	"errormessage",
	"filename",
]);

const CONTROLLED_VALUES = {
	calendar_loaded: { source: ["api", "cache"], result: ["success"], view_mode: ["week", "list", "day"], context_type: ["group", "teacher", "room"] },
	group_selection_saved: { result: ["success", "empty"] },
	calendar_view_changed: { view_mode: ["week", "list", "day"] },
	calendar_context_changed: { context_type: ["group", "teacher", "room"], source: ["event_details", "calendar_header", "room_search"] },
	notification_permission_result: { result: ["granted", "denied", "default", "unsupported"], source: ["notification_settings"] },
	notification_subscription_result: { result: ["success", "failure"], source: ["notification_settings"] },
	pwa_install_result: { result: ["accepted", "dismissed", "installed", "manual_instructions", "unavailable"], method: ["prompt", "ios", "unknown"] },
	room_map_opened: { source: ["event_details", "room_search"] },
	online_course_link_opened: { source: ["event_details"], link_type: ["course"] },
	event_details_load_failed: { result: ["failure"], source: ["event_details"], phase: ["reservation_details"] },
	preview_opened: { preview_type: ["android", "web", "pwa"] },
	bug_report_opened: { source: ["settings"] },
};

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

const sanitizeProperties = (eventName, properties = {}) => {
	const output = {};
	const valuePolicies = CONTROLLED_VALUES[eventName] || {};

	Object.entries(properties).forEach(([rawKey, rawValue]) => {
		if (!rawKey) return;

		const key = String(rawKey).trim().toLowerCase();
		if (!key) return;
		const compactKey = key.replace(/[_-]/g, "");
		if (BLOCKED_PROP_KEYS.has(compactKey)) return;
		const allowedValues = valuePolicies[key];
		if (allowedValues && !allowedValues.includes(rawValue)) return;

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
		const safeProps = sanitizeProperties(safeName, properties);
		window.rybbit.event(safeName, safeProps);
	} catch {
		// rien
	}
};

const BLOCKED_PROPERTY_KEYS = new Set([
	"email",
	"mail",
	"username",
	"user",
	"userid",
	"token",
	"accesstoken",
	"refreshtoken",
	"authorization",
	"auth",
	"account",
	"accountid",
	"id",
	"name",
	"firstname",
	"lastname",
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

const ALLOWED_PROPERTY_KEYS = new Set([
	"platform",
	"app_version",
	"build_version",
	"environment",
	"source",
	"result",
	"method",
	"flow",
	"error_kind",
	"launch_type",
	"step",
	"step_index",
	"total_steps",
	"screen",
	"view_mode",
	"event_count",
	"cancelled_count",
	"load_ms",
	"direction",
	"context_type",
	"has_room",
	"has_teacher",
	"is_online",
	"is_cancelled",
	"subject_count",
	"grade_count",
	"export_format",
	"has_text",
	"has_attachment",
	"attachment_type",
	"minutes_bucket",
	"selected_days_count",
	"reminder_type",
	"widget_type",
	"status",
	"resource",
	"service",
	"to_theme",
	"document_type",
]);

export const ANALYTICS_EVENTS = new Set([
	"analytics_consent_accepted",
	"app_opened",
	"app_became_active",
	"app_backgrounded",
	"login_started",
	"login_completed",
	"login_failed",
	"logout_triggered",
	"onboarding_started",
	"onboarding_step_viewed",
	"onboarding_completed",
	"onboarding_skipped",
	"screen_viewed",
	"calendar_loaded",
	"calendar_load_failed",
	"calendar_date_changed",
	"calendar_view_changed",
	"event_details_opened",
	"calendar_context_changed",
	"grades_loaded",
	"grades_load_failed",
	"grade_subject_opened",
	"syllabus_opened",
	"syllabus_export_started",
	"syllabus_export_completed",
	"syllabus_export_failed",
	"manual_grade_added",
	"grade_coefficient_changed",
	"course_notes_opened",
	"course_note_created",
	"course_note_updated",
	"course_note_deleted",
	"course_note_attachment_added",
	"notification_permission_result",
	"notification_settings_saved",
	"notification_test_sent",
	"reminder_created",
	"reminder_updated",
	"reminder_deleted",
	"notification_opened",
	"widget_data_refreshed",
	"widget_refresh_failed",
	"widget_opened",
	"offline_cache_used",
	"offline_cache_unavailable",
	"network_status_changed",
	"map_opened",
	"pdf_download_started",
	"pdf_download_completed",
	"pdf_download_failed",
	"external_service_opened",
	"theme_changed",
]);

const VALUE_RULES = {
	platform: ["android", "ios"],
	environment: ["development", "production"],
	method: ["microsoft"],
	flow: ["redirect", "browser", "unknown"],
	error_kind: ["cancelled", "network", "exchange_failed", "timeout", "server", "cache_unavailable", "unknown"],
	launch_type: ["normal", "notification", "widget", "unknown"],
	screen: ["home", "calendar", "grades", "notifications", "settings", "login", "onboarding"],
	view_mode: ["day", "week", "list"],
	direction: ["next", "previous", "today", "picker"],
	context_type: ["personal", "group", "teacher", "room"],
	source: ["api", "cache", "settings", "event_details", "automatic", "manual", "background", "system", "onboarding", "login", "calendar"],
	result: ["success", "failed", "granted", "denied", "undetermined", "unavailable", "started", "completed"],
	resource: ["calendar", "grades", "syllabus", "home"],
	status: ["online", "offline", "success", "failed", "unavailable"],
	widget_type: ["next_course", "upcoming_courses", "semester_grades", "semester_overview"],
	service: ["epita_maps", "moodle", "other"],
	to_theme: ["light", "dark", "system"],
	export_format: ["pdf", "other"],
	attachment_type: ["image", "pdf", "other"],
	minutes_bucket: ["0_10", "11_30", "31_60", "61_plus"],
	document_type: ["syllabus", "course_file", "other"],
};

const normalizeKey = (key) =>
	key
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_")
		.slice(0, 48);
const isBlocked = (key) => BLOCKED_PROPERTY_KEYS.has(key.replace(/[_-]/g, ""));
const looksSensitive = (value) => /https?:\/\//i.test(value) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value);

function sanitizeValue(value) {
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string") return undefined;
	const text = value.trim().slice(0, 180);
	return text && !looksSensitive(text) ? text : undefined;
}

export function sanitizeAnalyticsProperties(properties) {
	if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};
	const output = {};
	for (const [rawKey, rawValue] of Object.entries(properties)) {
		const key = normalizeKey(rawKey);
		if (!key || isBlocked(key) || !ALLOWED_PROPERTY_KEYS.has(key) || Object.keys(output).length >= 20) continue;
		const allowedValues = VALUE_RULES[key];
		if (allowedValues && (typeof rawValue !== "string" || !allowedValues.includes(rawValue))) continue;
		const value = sanitizeValue(rawValue);
		if (value !== undefined) output[key] = value;
	}
	return output;
}

export function validateAnalyticsPayload(payload) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, error: "Invalid payload" };
	const event = typeof payload.event === "string" ? payload.event.trim().toLowerCase() : "";
	if (!ANALYTICS_EVENTS.has(event) || !/^[a-z][a-z0-9_]{2,63}$/.test(event)) return { ok: false, error: "Invalid event" };
	return { ok: true, event, properties: sanitizeAnalyticsProperties(payload.properties) };
}

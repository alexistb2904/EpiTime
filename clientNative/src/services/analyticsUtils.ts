export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export type QueuedAnalyticsEvent = {
	event: string;
	properties: Record<string, string | number>;
	expiresAt: number;
};

export const MAX_ANALYTICS_QUEUE_SIZE = 20;
export const ANALYTICS_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;

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

const normalizePropertyKey = (key: string) =>
	key
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_")
		.slice(0, 48);
const isBlockedPropertyKey = (key: string) => BLOCKED_PROPERTY_KEYS.has(key.replace(/[_-]/g, ""));

const sanitizeValue = (value: string | number | boolean | null | undefined): string | number | undefined => {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	const text = value.trim().slice(0, 180);
	if (!text || /https?:\/\//i.test(text) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(text)) return undefined;
	return text;
};

export function sanitizeAnalyticsEventName(value: string) {
	const eventName = value.trim().toLowerCase();
	return ANALYTICS_EVENTS.has(eventName) && /^[a-z][a-z0-9_]{2,63}$/.test(eventName) ? eventName : null;
}

export function sanitizeAnalyticsProperties(_eventName: string, properties: AnalyticsProperties = {}) {
	const output: Record<string, string | number> = {};
	for (const [rawKey, rawValue] of Object.entries(properties)) {
		const key = normalizePropertyKey(rawKey);
		if (!key || isBlockedPropertyKey(key) || !ALLOWED_PROPERTY_KEYS.has(key) || Object.keys(output).length >= 16) continue;
		const value = sanitizeValue(rawValue);
		if (value !== undefined) output[key] = value;
	}
	return output;
}

export function canTrackAnalytics(consent: string | null | undefined) {
	return consent === "accepted";
}

export function pruneAnalyticsQueue(queue: QueuedAnalyticsEvent[], now = Date.now()) {
	return queue.filter((item) => item && typeof item.event === "string" && item.expiresAt > now).slice(-MAX_ANALYTICS_QUEUE_SIZE);
}

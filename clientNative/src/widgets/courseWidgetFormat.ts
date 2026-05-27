import type { CourseWidgetPayload, WidgetCourse } from "../services/widgets";

export const emptyWidgetPayload: CourseWidgetPayload = {
	generatedAt: 0,
	courses: [],
	groups: [],
};

export function upcomingCourses(payload?: CourseWidgetPayload | null, limit = 8, now = Date.now()) {
	return (payload?.courses || [])
		.filter((course) => Number.isFinite(course.endMillis) && course.endMillis > now)
		.sort((a, b) => a.startMillis - b.startMillis)
		.slice(0, limit);
}

export function courseUri(course?: WidgetCourse) {
	if (!course) return "epitime://agenda";
	const params = new URLSearchParams({
		targetDate: course.startDate,
		eventId: String(course.id || ""),
		eventReservationId: String(course.id || ""),
		eventStartDate: course.startDate,
	});
	return `epitime://agenda?${params.toString()}`;
}

export function relativeStart(course: WidgetCourse, now = Date.now()) {
	if (course.startMillis <= now && course.endMillis > now) return "En cours";
	const diffMinutes = Math.max(0, Math.floor((course.startMillis - now) / 60000));
	if (diffMinutes < 1) return "Maintenant";
	if (diffMinutes < 60) return `Dans ${diffMinutes} min`;
	const hours = Math.floor(diffMinutes / 60);
	const minutes = diffMinutes % 60;
	return minutes === 0 ? `Dans ${hours} h` : `Dans ${hours} h ${minutes}`;
}

export function formatTime(millis: number) {
	return new Date(millis).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(millis: number) {
	const label = new Date(millis).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
	return label.replace(".", "");
}

export function updatedLabel(payload?: CourseWidgetPayload | null) {
	if (!payload?.generatedAt) return "Non synchronise";
	return `Maj ${formatTime(payload.generatedAt)}`;
}

export function safeColor(value?: string) {
	return value?.startsWith("#") ? (value as `#${string}`) : "#475D92";
}

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

/** "En cours", "Dans 12 min", "Dans 2 h 05" today; the day label for later days. */
export function relativeStart(course: WidgetCourse, now = Date.now()) {
	if (course.startMillis <= now && course.endMillis > now) return "En cours";
	if (dayOffset(course.startMillis, now) !== 0) return dayLabel(course.startMillis, now);
	const diffMinutes = Math.max(0, Math.floor((course.startMillis - now) / 60000));
	if (diffMinutes < 1) return "Maintenant";
	if (diffMinutes < 60) return `Dans ${diffMinutes} min`;
	const hours = Math.floor(diffMinutes / 60);
	const minutes = diffMinutes % 60;
	return minutes === 0 ? `Dans ${hours} h` : `Dans ${hours} h ${String(minutes).padStart(2, "0")}`;
}

export function formatTime(millis: number) {
	return new Date(millis).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** "Aujourd'hui", "Demain", then "jeu. 20 nov.". */
export function dayLabel(millis: number, now = Date.now()) {
	const offset = dayOffset(millis, now);
	if (offset === 0) return "Aujourd'hui";
	if (offset === 1) return "Demain";
	const label = new Date(millis).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
	return label.charAt(0).toUpperCase() + label.slice(1);
}

function dayOffset(millis: number, now: number) {
	const day = (value: number) => {
		const date = new Date(value);
		return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
	};
	return Math.round((day(millis) - day(now)) / 86400000);
}

export function safeColor(value?: string) {
	return value?.startsWith("#") ? (value as `#${string}`) : "#475D92";
}

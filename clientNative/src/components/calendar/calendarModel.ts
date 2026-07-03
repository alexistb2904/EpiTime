import { getWeekRange, startOfDay } from "../../utils/calendar";

export type ViewMode = "week" | "day" | "list";
export type ScheduleContext = { type: "group" | "single-group" | "teacher" | "room"; ids: (string | number)[]; label: string };
export type CalendarRouteParams = {
	targetDate?: string;
	eventId?: string | number;
	eventReservationId?: string | number;
	eventStartDate?: string;
	openChangesPanel?: boolean;
	changeKey?: string;
};

export const minute = 60_000;

export const rangeFor = (date: Date, viewMode: ViewMode) => {
	if (viewMode === "day") {
		const start = startOfDay(date);
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		return { start, end };
	}
	return getWeekRange(date);
};

export const dayKey = (date: Date) => startOfDay(date).toISOString();

export const getTargetEventKey = (params?: CalendarRouteParams) => {
	if (!params?.eventStartDate) return null;
	return `${params.eventReservationId || params.eventId || "event"}-${params.eventStartDate}`;
};

export const getCourseProgress = (startMillis: number, endMillis: number, now: number) => {
	const duration = endMillis - startMillis;
	if (!Number.isFinite(duration) || duration <= 0) return 0;
	const progress = ((now - startMillis) / duration) * 100;
	return Math.max(0, Math.min(100, Math.round(progress)));
};

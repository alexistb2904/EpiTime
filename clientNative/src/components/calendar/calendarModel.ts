import { startOfDay } from "../../utils/calendar";

// "week": day agenda under the week strip (UI label "Jour"); "list": the whole week (UI label "Semaine"). Values are persisted.
export type ViewMode = "week" | "list";
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

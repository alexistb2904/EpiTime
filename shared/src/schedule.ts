import { endMs, formatTime, isEventCancelled, isMultiDay, startMs, subjectKey, type ZeusEvent } from "./events.ts";

export type ScheduleFilter = {
	ignoredSubjects?: string[];
};

export const isIgnored = (event: ZeusEvent, filter: ScheduleFilter = {}) => Boolean(filter.ignoredSubjects?.includes(subjectKey(event)));

const isActive = (event: ZeusEvent, filter: ScheduleFilter) => !isEventCancelled(event) && !isIgnored(event, filter);

const byStart = (a: ZeusEvent, b: ZeusEvent) => startMs(a) - startMs(b);

export function findCurrentEvent(events: ZeusEvent[], now: number, filter: ScheduleFilter = {}) {
	const ongoing = events.filter((event) => isActive(event, filter) && startMs(event) <= now && endMs(event) > now);
	return ongoing.sort((a, b) => Number(isMultiDay(a)) - Number(isMultiDay(b)) || byStart(a, b))[0] ?? null;
}

export function findNextEvent(events: ZeusEvent[], now: number, filter: ScheduleFilter = {}) {
	return events.filter((event) => isActive(event, filter) && startMs(event) > now && !isMultiDay(event)).sort(byStart)[0] ?? null;
}

const dayKey = (value: number) => new Date(value).toDateString();

export function remainingToday(events: ZeusEvent[], now: number) {
	const today = dayKey(now);
	return events.filter((event) => !isMultiDay(event) && endMs(event) > now && dayKey(startMs(event)) === today).sort(byStart);
}

export function eventsBetween(events: ZeusEvent[], from: number, to: number) {
	return events.filter((event) => startMs(event) < to && endMs(event) > from).sort(byStart);
}

export function formatCountdown(ms: number) {
	const minutes = Math.max(0, Math.round(ms / 60_000));
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

export function formatRelative(event: ZeusEvent, now: number) {
	const start = startMs(event);
	if (start <= now) return `jusqu'à ${formatTime(endMs(event))}`;
	const minutes = Math.round((start - now) / 60_000);
	if (minutes < 60) return `dans ${minutes} min`;
	if (dayKey(start) === dayKey(now)) {
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		return `dans ${hours} h${rest ? ` ${String(rest).padStart(2, "0")}` : ""}`;
	}
	if (dayKey(start) === dayKey(now + 86_400_000)) return `demain, ${formatTime(start)}`;
	return `${new Date(start).toLocaleDateString("fr-FR", { weekday: "long" })}, ${formatTime(start)}`;
}

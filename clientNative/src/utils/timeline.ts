type TimedEvent = { startDate: string; endDate: string };

export type TimelineItem<E> = { kind: "event"; event: E } | { kind: "break"; key: string; start: number; end: number; minutes: number } | { kind: "now" };

const MINUTE = 60_000;
export const MIN_BREAK_MINUTES = 15;

export function formatDuration(minutes: number) {
	const total = Math.round(minutes);
	const h = Math.floor(total / 60);
	const m = total % 60;
	if (!h) return `${m} min`;
	return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// Day agenda: courses in start order, breaks between active courses, and a "now" marker when nothing is running today.
export function buildTimeline<E extends TimedEvent>(events: E[], now: number, isToday: boolean, isActive: (event: E) => boolean): TimelineItem<E>[] {
	const items: TimelineItem<E>[] = [];
	const active = events.filter(isActive);
	const running = isToday && active.some((event) => +new Date(event.startDate) <= now && +new Date(event.endDate) > now);
	let nowPlaced = !isToday || running || !active.length;
	let previousEnd: number | null = null;
	for (const event of events) {
		const startMillis = +new Date(event.startDate);
		if (isActive(event)) {
			if (!nowPlaced && startMillis > now) {
				items.push({ kind: "now" });
				nowPlaced = true;
			}
			if (previousEnd !== null && (startMillis - previousEnd) / MINUTE >= MIN_BREAK_MINUTES) {
				items.push({ kind: "break", key: `break-${previousEnd}`, start: previousEnd, end: startMillis, minutes: (startMillis - previousEnd) / MINUTE });
			}
			previousEnd = Math.max(previousEnd ?? 0, +new Date(event.endDate));
		}
		items.push({ kind: "event", event });
	}
	if (!nowPlaced) items.push({ kind: "now" });
	return items;
}

// Share of [start, end] already elapsed at `now`, between 0 and 1.
export function elapsedShare(start: number, end: number, now: number) {
	if (!(end > start)) return now >= end ? 1 : 0;
	return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

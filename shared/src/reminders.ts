import { eventIdentity, eventTitle, formatTime, isEventCancelled, isMultiDay, roomNames, startMs, type ZeusEvent } from "./events.ts";
import { isIgnored, type ScheduleFilter } from "./schedule.ts";

export const REMINDER_PRESETS = [5, 10, 15, 30] as const;

export type PlannedReminder = {
	key: string;
	identity: string;
	fireAt: number;
	startAt: number;
	title: string;
	message: string;
};

export const clampReminderMinutes = (value: unknown) => {
	const minutes = Math.trunc(Number(value));
	return Number.isFinite(minutes) ? Math.min(24 * 60, Math.max(1, minutes)) : 15;
};

export function planReminders(events: ZeusEvent[], options: { minutesBefore: number; now: number; horizonMs: number } & ScheduleFilter): PlannedReminder[] {
	const offset = clampReminderMinutes(options.minutesBefore) * 60_000;
	const seen = new Set<string>();
	const planned: PlannedReminder[] = [];
	for (const event of events) {
		const startAt = startMs(event);
		if (!Number.isFinite(startAt) || isEventCancelled(event) || isMultiDay(event) || isIgnored(event, options)) continue;
		if (startAt <= options.now || startAt - offset > options.now + options.horizonMs) continue;
		const identity = eventIdentity(event);
		const key = `${identity}@${startAt}#${offset / 60_000}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const rooms = roomNames(event);
		planned.push({
			key,
			identity,
			fireAt: Math.max(options.now, startAt - offset),
			startAt,
			title: eventTitle(event),
			message: [`${formatTime(startAt)}`, rooms.length ? rooms.join(", ") : event.isOnline ? "En ligne" : "Salle non précisée"].join(" · "),
		});
	}
	return planned.sort((a, b) => a.fireAt - b.fireAt);
}

export function diffReminderKeys(scheduled: string[], wanted: PlannedReminder[], alreadyFired: Set<string>) {
	const wantedKeys = new Set(wanted.map((reminder) => reminder.key));
	return {
		cancel: scheduled.filter((key) => !wantedKeys.has(key)),
		create: wanted.filter((reminder) => !scheduled.includes(reminder.key) && !alreadyFired.has(reminder.key)),
	};
}

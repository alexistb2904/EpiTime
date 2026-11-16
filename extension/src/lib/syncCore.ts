import { diffSnapshots, type EventChange, type ScheduleSnapshot } from "../../../shared/src/changes.ts";
import { normalizeText } from "../../../shared/src/events.ts";
import type { ChangeLog, ScheduleState, Settings, SyncError } from "./state";

const LOG_SIZE = 50;
const NOTIFIED_KEYS = 500;

export type SyncOutcome = {
	schedule: ScheduleState;
	changes: ChangeLog;
	notify: EventChange[];
	expireSession: boolean;
};

export function applySyncResult(input: {
	schedule: ScheduleState;
	changes: ChangeLog;
	settings: Settings;
	now: number;
	result: ScheduleSnapshot | { error: SyncError };
}): SyncOutcome {
	const { schedule, changes, settings, now, result } = input;

	if ("error" in result) {
		return { schedule: { ...schedule, lastError: result.error }, changes, notify: [], expireSession: result.error.kind === "auth" };
	}

	const diff = diffSnapshots(schedule.reference, result, { now, windowDays: settings.changes.windowDays });
	if (diff.status === "suspicious" && schedule.pendingSuspicious !== diff.signature) {
		return {
			schedule: {
				...schedule,
				pendingSuspicious: diff.signature,
				lastError: { kind: "invalid", message: "Beaucoup de cours ont disparu d'un coup. On vérifie au prochain passage avant de te prévenir.", at: now },
			},
			changes,
			notify: [],
			expireSession: false,
		};
	}

	const nextSchedule: ScheduleState = { reference: result, lastSync: now, lastError: null, pendingSuspicious: null };
	const alreadyNotified = new Set(changes.notifiedKeys);
	const fresh = diff.changes.filter((change) => !alreadyNotified.has(change.key));
	const ignored = new Set(settings.ignoredSubjects);
	const relevant = fresh.filter((change) => !ignored.has(normalizeText(change.title)));

	return {
		schedule: nextSchedule,
		changes: {
			items: [...relevant.map((change) => ({ ...change, detectedAt: now })), ...changes.items].slice(0, LOG_SIZE),
			unseen: changes.unseen + relevant.length,
			notifiedKeys: [...fresh.map((change) => change.key), ...changes.notifiedKeys].slice(0, NOTIFIED_KEYS),
		},
		notify: settings.changes.enabled ? relevant.filter((change) => settings.changes.categories[change.category]) : [],
		expireSession: false,
	};
}

export function webPushCoversDay(webPush: { enabled: boolean; days: number[] } | undefined, startAt: number) {
	if (!webPush?.enabled) return false;
	const day = new Date(startAt).getDay();
	return webPush.days.includes(day);
}

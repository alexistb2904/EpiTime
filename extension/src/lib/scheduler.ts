import { eventIdentity, startMs } from "../../../shared/src/events.ts";
import { diffReminderKeys, planReminders } from "../../../shared/src/reminders.ts";
import { ApiError, fetchEvents } from "./api";
import { browser, notify, openWebApp, setBadge } from "./platform";
import { isSessionUsable } from "./sessionModel";
import { getLocal, getSession, getSettings, setLocal, setSession, type SyncError } from "./state";
import { applySyncResult, webPushCoversDay } from "./syncCore";

export const SYNC_ALARM = "sync";
const REMINDER_PREFIX = "rem|";
const CHANGE_PREFIX = "chg|";
const DAY = 86_400_000;
const FETCH_DAYS = 15;
const REMINDER_HORIZON_MS = 36 * 3_600_000;

export async function ensureSyncAlarm() {
	const { syncMinutes } = await getSettings();
	const existing = await browser.alarms.get(SYNC_ALARM);
	if (existing?.periodInMinutes === syncMinutes) return;
	await browser.alarms.create(SYNC_ALARM, { periodInMinutes: syncMinutes, delayInMinutes: 0.1 });
}

let inFlight: Promise<void> | null = null;

export function refreshSchedule() {
	inFlight ??= runRefresh().finally(() => {
		inFlight = null;
	});
	return inFlight;
}

async function runRefresh() {
	const [link, session, settings, schedule, changes] = await Promise.all([getLocal("link"), getSession(), getSettings(), getLocal("schedule"), getLocal("changes")]);
	if (!link || !link.groups.length) return updateBadge();
	const now = Date.now();
	let error: SyncError | null = null;
	if (!isSessionUsable(session, now)) error = { kind: "auth", message: "Reconnexion nécessaire.", at: now };
	else if (!navigator.onLine) error = { kind: "offline", message: "Hors ligne : planning enregistré affiché.", at: now };

	let result: Parameters<typeof applySyncResult>[0]["result"];
	if (error) {
		result = { error };
	} else {
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);
		const end = new Date(start.getTime() + FETCH_DAYS * DAY);
		try {
			const events = await fetchEvents(link.origin, session!.token, link.groups, start, end);
			result = { scope: [...link.groups].sort().join(","), rangeStart: start.getTime(), rangeEnd: end.getTime(), fetchedAt: now, events };
		} catch (caught) {
			const apiError = caught instanceof ApiError ? caught : new ApiError("network", "Relevé impossible.");
			result = { error: { kind: apiError.kind, message: apiError.message, at: now } };
		}
	}

	const outcome = applySyncResult({ schedule, changes, settings, now, result });

	if (outcome.expireSession && session) await setSession(null);
	await setLocal("schedule", outcome.schedule);
	await setLocal("changes", outcome.changes);
	for (const change of outcome.notify) {
		await notify(`${CHANGE_PREFIX}${change.identity}|${change.startDate}|${now}`, change.notification.title, change.notification.message).catch(() => undefined);
	}
	await scheduleReminders();
	await updateBadge();
}

export async function scheduleReminders() {
	const [settings, schedule, link, fired] = await Promise.all([getSettings(), getLocal("schedule"), getLocal("link"), getLocal("firedReminders")]);
	const now = Date.now();
	const events = link ? (schedule.reference?.events ?? []) : [];
	const wanted = settings.reminders.enabled
		? planReminders(events, { minutesBefore: settings.reminders.minutesBefore, now, horizonMs: REMINDER_HORIZON_MS, ignoredSubjects: settings.ignoredSubjects }).filter(
				(reminder) => settings.reminders.source === "always" || !webPushCoversDay(link?.webPush, reminder.startAt)
			)
		: [];
	const scheduled = (await browser.alarms.getAll()).filter((alarm) => alarm.name.startsWith(REMINDER_PREFIX)).map((alarm) => alarm.name.slice(REMINDER_PREFIX.length));
	const recent = Object.fromEntries(Object.entries(fired).filter(([, at]) => now - at < 2 * DAY));
	const { cancel, create } = diffReminderKeys(scheduled, wanted, new Set(Object.keys(recent)));
	await Promise.all(cancel.map((key) => browser.alarms.clear(REMINDER_PREFIX + key)));
	for (const reminder of create) await browser.alarms.create(REMINDER_PREFIX + reminder.key, { when: Math.max(reminder.fireAt, now + 1_000) });
	await setLocal("plannedReminders", Object.fromEntries(wanted.map((reminder) => [reminder.key, reminder])));
	await setLocal("firedReminders", recent);
}

export async function fireReminder(alarmName: string) {
	const key = alarmName.slice(REMINDER_PREFIX.length);
	const [planned, fired, schedule, settings] = await Promise.all([getLocal("plannedReminders"), getLocal("firedReminders"), getLocal("schedule"), getSettings()]);
	const reminder = planned[key];
	const now = Date.now();
	if (!reminder || fired[key] || !settings.reminders.enabled || now >= reminder.startAt) return;

	const still = schedule.reference?.events.some(
		(event) => eventIdentity(event) === reminder.identity && startMs(event) === reminder.startAt && !event.isCancelled && !event.isCanceled
	);
	if (!still) return;
	await setLocal("firedReminders", { ...fired, [key]: now });
	const minutes = Math.max(1, Math.round((reminder.startAt - now) / 60_000));
	await notify(`${REMINDER_PREFIX}${key}`, `${reminder.title} dans ${minutes} min`, reminder.message);
}

export const isReminderAlarm = (name: string) => name.startsWith(REMINDER_PREFIX);

export async function openFromNotification(notificationId: string) {
	await browser.notifications.clear(notificationId);
	const link = await getLocal("link");
	if (!link) return;
	let identity = "";
	let startDate = "";
	if (notificationId.startsWith(REMINDER_PREFIX)) {
		const reminder = (await getLocal("plannedReminders"))[notificationId.slice(REMINDER_PREFIX.length)];
		const [ident = "", rest = ""] = notificationId.slice(REMINDER_PREFIX.length).split("@");
		identity = reminder?.identity ?? ident;
		startDate = new Date(reminder?.startAt ?? Number(rest?.split("#")[0])).toISOString();
	} else if (notificationId.startsWith(CHANGE_PREFIX)) {
		[identity = "", startDate = ""] = notificationId.slice(CHANGE_PREFIX.length).split("|");
		const changes = await getLocal("changes");
		await setLocal("changes", { ...changes, unseen: 0 });
		await updateBadge();
	} else return;
	const params = new URLSearchParams();
	if (identity.startsWith("r:")) params.set("event", identity.slice(2));
	if (!Number.isNaN(Date.parse(startDate))) params.set("date", startDate);
	await openWebApp(link.origin, `/?${params}`);
}

export async function clearChangeNotifications() {
	const shown = await browser.notifications.getAll();
	await Promise.all(Object.keys(shown).filter((id) => id.startsWith(CHANGE_PREFIX)).map((id) => browser.notifications.clear(id)));
}

export async function updateBadge() {
	const [link, changes, session] = await Promise.all([getLocal("link"), getLocal("changes"), getSession()]);
	if (link && changes.unseen > 0) return setBadge(String(Math.min(changes.unseen, 99)), "#ff8fc1");
	if (link && !isSessionUsable(session)) return setBadge("!", "#ffd37a");
	return setBadge("", "");
}

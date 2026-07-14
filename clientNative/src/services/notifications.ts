import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";
import { ZeusEvent } from "../types";
import { getEventTitle, getRoomName } from "../utils/calendar";
import { publicConfig } from "./config";
import { EventChange, RoomChange } from "./eventsCache";
import { getJSON, setJSON } from "./storage";

export const COURSES_CHANNEL_ID = "courses";
export const GRADES_CHANNEL_ID = "grades";
const COURSES_SILENT_CHANNEL_ID = "courses-silent";
const GRADES_SILENT_CHANNEL_ID = "grades-silent";
const NOTIFICATION_SETTINGS_KEY = "notificationSettings";
const NOTIFICATION_DEBUG_SETTINGS_KEY = "notificationDebugSettings";
const SCHEDULED_COURSE_NOTIFICATION_IDS_KEY = "scheduledCourseNotificationIds";
const SCHEDULED_DEBUG_NOTIFICATION_IDS_KEY = "scheduledDebugNotificationIds";
const NOTIFIED_EVENT_CHANGES_KEY = "notifiedEventChanges";
const NOTIFIED_AURIGA_GRADE_CHANGES_KEY = "notifiedAurigaGradeChanges";
const EVENT_CHANGE_HISTORY_KEY = "eventChangeHistory";
const COURSE_NOTIFICATION_WINDOW_DAYS = 14;
const MAX_EVENT_CHANGE_HISTORY_ITEMS = 100;
const MAX_NOTIFIED_AURIGA_GRADE_CHANGES = 240;

const LiveCourse = NativeModules.EpiTimeLiveCourse as
	| {
			scheduleCourseStartNotification?: (title: string, room: string, eventId: string, startMillis: number, playSound: boolean) => Promise<boolean>;
			cancelScheduledCourseStartNotifications?: () => Promise<boolean>;
	  }
	| undefined;

export type NotificationSettings = {
	enabled: boolean;
	minutesBefore: number;
	selectedDays: number[];
	notificationType: "banner" | "sound" | "both";
	changeDetectionEnabled: boolean;
	changeDetectionWindowDays: number;
};

export type NotificationDebugSettings = {
	enabled: boolean;
	targetHour: number;
	targetMinute: number;
	progressDurationMinutes: number;
};

export type ScheduledNotificationItem = {
	id: string;
	title: string;
	body: string;
	type: string;
	scheduledAt: number | null;
	trigger: string;
};

export type EventChangeHistoryItem = EventChange & {
	notifiedAt: string;
};

export type AurigaGradeNotificationChange = {
	key: string;
	kind: "new" | "updated";
	name: string;
	code?: string;
	semester?: number;
	grade: number;
	alphaMark?: string;
};

type ScheduleLocalCourseNotificationOptions = {
	requestPermission?: boolean;
	windowDays?: number;
};

export const defaultNotificationSettings: NotificationSettings = {
	enabled: true,
	minutesBefore: 15,
	selectedDays: [0, 1, 2, 3, 4, 5, 6],
	notificationType: "both",
	changeDetectionEnabled: true,
	changeDetectionWindowDays: 3,
};

export const defaultNotificationDebugSettings: NotificationDebugSettings = {
	enabled: false,
	targetHour: 8,
	targetMinute: 0,
	progressDurationMinutes: 90,
};

Notifications.setNotificationHandler({
	handleNotification: async (notification) => {
		const data = notification.request.content.data as { notificationType?: unknown } | undefined;
		const notificationType = normalizeNotificationType(data?.notificationType);
		return {
			shouldShowBanner: notificationType !== "sound",
			shouldShowList: true,
			shouldPlaySound: notificationType !== "banner",
			shouldSetBadge: false,
		};
	},
});

export async function ensureAndroidChannel() {
	if (Platform.OS !== "android") return;
	await Promise.all([
		Notifications.setNotificationChannelAsync(COURSES_CHANNEL_ID, {
			name: "Cours avec son",
			importance: Notifications.AndroidImportance.HIGH,
		}),
		Notifications.setNotificationChannelAsync(COURSES_SILENT_CHANNEL_ID, {
			name: "Cours silencieux",
			importance: Notifications.AndroidImportance.HIGH,
			sound: null,
			vibrationPattern: [],
		}),
	]);
}

export async function ensureAndroidGradeChannel() {
	if (Platform.OS !== "android") return;
	await Promise.all([
		Notifications.setNotificationChannelAsync(GRADES_CHANNEL_ID, {
			name: "Notes Auriga avec son",
			importance: Notifications.AndroidImportance.HIGH,
		}),
		Notifications.setNotificationChannelAsync(GRADES_SILENT_CHANNEL_ID, {
			name: "Notes Auriga silencieuses",
			importance: Notifications.AndroidImportance.HIGH,
			sound: null,
			vibrationPattern: [],
		}),
	]);
}

export async function getNotificationPermissionStatus() {
	if (Platform.OS === "web") return { granted: true, canAskAgain: false, status: "granted" as const };
	return Notifications.getPermissionsAsync();
}

export async function requestNotificationPermission() {
	if (Platform.OS === "web") return true;
	const { status: existing } = await Notifications.getPermissionsAsync();
	if (existing === "granted") return true;
	const { status } = await Notifications.requestPermissionsAsync({
		ios: {
			allowAlert: true,
			allowSound: true,
		},
		android: {},
	});
	return status === "granted";
}

export async function requestPushToken() {
	if (Platform.OS === "web") return null;
	if (!Device.isDevice) return null;
	const granted = await requestNotificationPermission();
	if (!granted) return null;
	await ensureAndroidChannel();
	await ensureAndroidGradeChannel();
	const projectId = publicConfig.expoProjectId || Constants.expoConfig?.extra?.eas?.projectId;
	if (!projectId) throw new Error("Expo projectId manquant");
	return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Returns the device token without prompting, so logout can remove its subscription. */
export async function getExistingPushToken() {
	if (Platform.OS === "web" || !Device.isDevice) return null;
	const permission = await Notifications.getPermissionsAsync();
	if (permission.status !== "granted") return null;
	const projectId = publicConfig.expoProjectId || Constants.expoConfig?.extra?.eas?.projectId;
	if (!projectId) return null;
	return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function getNotificationSettings() {
	const saved = await getJSON<Partial<NotificationSettings>>(NOTIFICATION_SETTINGS_KEY, defaultNotificationSettings);
	return normalizeNotificationSettings({
		...defaultNotificationSettings,
		...saved,
		selectedDays: Array.isArray(saved.selectedDays) ? saved.selectedDays : defaultNotificationSettings.selectedDays,
	});
}

export async function setNotificationSettings(settings: NotificationSettings) {
	await setJSON(NOTIFICATION_SETTINGS_KEY, normalizeNotificationSettings(settings));
}

export async function getNotificationDebugSettings() {
	const saved = await getJSON<Partial<NotificationDebugSettings>>(NOTIFICATION_DEBUG_SETTINGS_KEY, defaultNotificationDebugSettings);
	return {
		...defaultNotificationDebugSettings,
		...saved,
		targetHour: clampInteger(saved.targetHour, 0, 23, defaultNotificationDebugSettings.targetHour),
		targetMinute: clampInteger(saved.targetMinute, 0, 59, defaultNotificationDebugSettings.targetMinute),
		progressDurationMinutes: clampInteger(saved.progressDurationMinutes, 1, 240, defaultNotificationDebugSettings.progressDurationMinutes),
	};
}

export async function setNotificationDebugSettings(settings: NotificationDebugSettings) {
	await setJSON<NotificationDebugSettings>(NOTIFICATION_DEBUG_SETTINGS_KEY, {
		enabled: settings.enabled,
		targetHour: clampInteger(settings.targetHour, 0, 23, defaultNotificationDebugSettings.targetHour),
		targetMinute: clampInteger(settings.targetMinute, 0, 59, defaultNotificationDebugSettings.targetMinute),
		progressDurationMinutes: clampInteger(settings.progressDurationMinutes, 1, 240, defaultNotificationDebugSettings.progressDurationMinutes),
	});
}

export async function scheduleLocalCourseNotifications(
	events: ZeusEvent[],
	minutesBefore = 15,
	selectedDays = [0, 1, 2, 3, 4, 5, 6],
	notificationType: NotificationSettings["notificationType"] = "both",
	options: ScheduleLocalCourseNotificationOptions = {}
) {
	if (Platform.OS === "web") return;
	await cancelScheduledCourseNotifications();
	const shouldRequestPermission = options.requestPermission ?? true;
	const granted = shouldRequestPermission ? await requestNotificationPermission() : (await Notifications.getPermissionsAsync()).status === "granted";
	if (!granted) return;
	await ensureAndroidChannel();

	const now = Date.now();
	const maxScheduledAt = now + (options.windowDays ?? COURSE_NOTIFICATION_WINDOW_DAYS) * 24 * 60 * 60_000;
	// Boolean sound values always map to the system notification sound. Passing
	// the string "default" is interpreted as a custom filename by recent Expo
	// native modules and produces a false "sound not found" error.
	const sound = notificationType === "banner" ? false : true;
	const channelId = courseChannelId(notificationType);
	const scheduledIds: string[] = [];

	const upcomingEvents = [...events]
		.filter((event) => !event.isCancelled && !event.isCanceled && !event.isIgnored)
		.map((event) => ({ event, startMillis: new Date(event.startDate).getTime() }))
		.filter(({ startMillis }) => Number.isFinite(startMillis) && startMillis > now && startMillis <= maxScheduledAt)
		.sort((a, b) => a.startMillis - b.startMillis);

	try {
		for (const { event: ev, startMillis } of upcomingEvents) {
			if (ev.isCancelled || ev.isCanceled || ev.isIgnored) continue;
			const startDate = new Date(ev.startDate);
			if (!selectedDays.includes(startDate.getDay())) continue;

			const title = getEventTitle(ev);
			const room = ev.rooms?.map(getRoomName).filter(Boolean).join(", ");
			const eventId = ev.idReservation || ev.id;
			const reminderDate = new Date(startMillis - minutesBefore * 60_000);

			if (minutesBefore > 0 && reminderDate.getTime() > now) {
				const notificationId = await Notifications.scheduleNotificationAsync({
					content: {
						title: "Cours bientôt",
						body: `${title} commence dans ${minutesBefore} min${room ? ` en ${room}` : ""}`,
						data: { type: "course-reminder", eventId, startsAt: ev.startDate, notificationType },
						sound,
					},
					trigger: {
						type: Notifications.SchedulableTriggerInputTypes.DATE,
						date: reminderDate,
						...(Platform.OS === "android" ? { channelId } : {}),
					},
				});
				scheduledIds.push(notificationId);
			}

			const nativeStartScheduled =
				Platform.OS === "android" && LiveCourse?.scheduleCourseStartNotification
					? await LiveCourse.scheduleCourseStartNotification(title, room || "", String(eventId || startMillis), startMillis, notificationType !== "banner").catch(
							() => false
						)
					: false;

			if (!nativeStartScheduled) {
				const startNotificationId = await Notifications.scheduleNotificationAsync({
					content: {
						title: "Cours maintenant",
						body: `${title} commence maintenant${room ? ` en ${room}` : ""}`,
						data: { type: "course-start", eventId, startsAt: ev.startDate, notificationType },
						sound,
					},
					trigger: {
						type: Notifications.SchedulableTriggerInputTypes.DATE,
						date: startDate,
						...(Platform.OS === "android" ? { channelId } : {}),
					},
				});
				scheduledIds.push(startNotificationId);
			}
		}
	} finally {
		await setJSON(SCHEDULED_COURSE_NOTIFICATION_IDS_KEY, scheduledIds);
	}
}

export async function clearLocalCourseNotifications() {
	if (Platform.OS === "web") return;
	await cancelScheduledCourseNotifications();
}

export async function notifyEventChanges(changes: EventChange[], notificationType: NotificationSettings["notificationType"] = "both") {
	if (!changes.length) return 0;

	await appendEventChangeHistory(changes);
	if (Platform.OS === "web") return 0;

	const granted = (await Notifications.getPermissionsAsync()).status === "granted";
	if (!granted) return 0;
	await ensureAndroidChannel();

	const notified = await getJSON<string[]>(NOTIFIED_EVENT_CHANGES_KEY, []);
	const notifiedSet = new Set(notified);
	const freshChanges = changes.filter((change) => !notifiedSet.has(change.key)).slice(0, 6);
	if (!freshChanges.length) return 0;

	const sound = notificationType === "banner" ? false : true;
	const channelId = courseChannelId(notificationType);
	for (const change of freshChanges) {
		const body = formatChangeNotificationBody(change);
		await Notifications.scheduleNotificationAsync({
			content: {
				title: formatChangeNotificationTitle(change),
				body,
				data: { type: "course-change", startsAt: change.startDate, changeKey: change.key, kind: change.kind, openPanel: "event-changes", notificationType },
				sound,
			},
			trigger: {
				type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
				seconds: 1,
				...(Platform.OS === "android" ? { channelId } : {}),
			},
		});
		notifiedSet.add(change.key);
	}

	await setJSON<string[]>(NOTIFIED_EVENT_CHANGES_KEY, Array.from(notifiedSet).slice(-180));
	return freshChanges.length;
}

/**
 * Signals Auriga grade changes discovered by a real background-task run.
 * Keys are retained locally so a task retry cannot re-alert the same result.
 */
export async function notifyAurigaGradeChanges(changes: AurigaGradeNotificationChange[], notificationType: NotificationSettings["notificationType"] = "both") {
	if (!changes.length || Platform.OS === "web") return 0;

	const granted = (await Notifications.getPermissionsAsync()).status === "granted";
	if (!granted) return 0;
	await ensureAndroidGradeChannel();

	const notified = await getJSON<string[]>(NOTIFIED_AURIGA_GRADE_CHANGES_KEY, []);
	const notifiedSet = new Set(notified.filter((key): key is string => typeof key === "string" && key.length > 0));
	const freshChanges = Array.from(new Map(changes.filter((change) => change?.key && !notifiedSet.has(change.key)).map((change) => [change.key, change])).values());
	if (!freshChanges.length) return 0;

	const firstChange = freshChanges[0];
	const multipleChanges = freshChanges.length > 1;
	const channelId = gradeChannelId(notificationType);
	await Notifications.scheduleNotificationAsync({
		content: {
			title: multipleChanges
				? `${freshChanges.length} notes Auriga mises à jour`
				: firstChange.kind === "new"
					? "Nouvelle note Auriga"
					: "Note Auriga modifiée",
			body: multipleChanges ? "Ouvre l’onglet Notes pour voir les changements." : formatAurigaGradeNotificationBody(firstChange),
			data: {
				type: "auriga-grade",
				openTab: "notes",
				changeKey: firstChange.key,
				changeCount: freshChanges.length,
				notificationType,
			},
			sound: notificationType === "banner" ? false : true,
		},
		trigger: {
			type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
			seconds: 1,
			...(Platform.OS === "android" ? { channelId } : {}),
		},
	});

	freshChanges.forEach((change) => notifiedSet.add(change.key));
	await setJSON<string[]>(NOTIFIED_AURIGA_GRADE_CHANGES_KEY, Array.from(notifiedSet).slice(-MAX_NOTIFIED_AURIGA_GRADE_CHANGES));
	return freshChanges.length;
}

export async function clearAurigaGradeNotificationHistory() {
	await setJSON<string[]>(NOTIFIED_AURIGA_GRADE_CHANGES_KEY, []);
	if (Platform.OS === "web") return;
	const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
	await Promise.all(
		scheduled
			.filter((notification) => (notification.content.data as { type?: unknown } | undefined)?.type === "auriga-grade")
			.map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined))
	);
}

export async function getEventChangeHistory() {
	const history = await getJSON<EventChangeHistoryItem[]>(EVENT_CHANGE_HISTORY_KEY, []);
	return history
		.filter((item) => item?.key && item?.title && item?.startDate)
		.sort((a, b) => new Date(b.notifiedAt).getTime() - new Date(a.notifiedAt).getTime());
}

export async function clearEventChangeHistory() {
	await setJSON<EventChangeHistoryItem[]>(EVENT_CHANGE_HISTORY_KEY, []);
}

export async function notifyRoomChanges(changes: RoomChange[], notificationType: NotificationSettings["notificationType"] = "both") {
	return notifyEventChanges(changes, notificationType);
}

export async function getScheduledNotifications(): Promise<ScheduledNotificationItem[]> {
	if (Platform.OS === "web") return [];
	const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
	return scheduledNotifications
		.map((notification) => {
			const data = notification.content.data as { type?: unknown; startsAt?: unknown; scheduledAt?: unknown } | undefined;
			const scheduledAt = getScheduledNotificationMillis(notification.trigger, data);
			return {
				id: notification.identifier,
				title: notification.content.title || "Notification",
				body: notification.content.body || "",
				type: typeof data?.type === "string" ? data.type : "unknown",
				scheduledAt,
				trigger: describeNotificationTrigger(notification.trigger, scheduledAt),
			};
		})
		.sort((a, b) => {
			if (a.scheduledAt == null && b.scheduledAt == null) return a.title.localeCompare(b.title);
			if (a.scheduledAt == null) return 1;
			if (b.scheduledAt == null) return -1;
			return a.scheduledAt - b.scheduledAt;
		});
}

export async function cancelScheduledNotification(id: string) {
	if (Platform.OS === "web") return;
	await Notifications.cancelScheduledNotificationAsync(id);
	await removeStoredNotificationId(SCHEDULED_COURSE_NOTIFICATION_IDS_KEY, id);
	await removeStoredNotificationId(SCHEDULED_DEBUG_NOTIFICATION_IDS_KEY, id);
}

export async function cancelAllScheduledNotifications() {
	if (Platform.OS === "web") return;
	if (Platform.OS === "android") {
		await LiveCourse?.cancelScheduledCourseStartNotifications?.().catch(() => false);
	}
	const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
	await Promise.all(scheduledNotifications.map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier).catch(() => undefined)));
	await setJSON<string[]>(SCHEDULED_COURSE_NOTIFICATION_IDS_KEY, []);
	await setJSON<string[]>(SCHEDULED_DEBUG_NOTIFICATION_IDS_KEY, []);
}

async function cancelScheduledCourseNotifications() {
	if (Platform.OS === "android") {
		await LiveCourse?.cancelScheduledCourseStartNotifications?.().catch(() => false);
	}
	const notificationIds = await getJSON<string[]>(SCHEDULED_COURSE_NOTIFICATION_IDS_KEY, []);
	const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
	const courseNotificationIds = scheduledNotifications
		.filter((notification) => {
			const data = notification.content.data as { type?: unknown; eventId?: unknown } | undefined;
			return data?.type === "course-reminder" || data?.type === "course-start" || (!data?.type && data?.eventId != null);
		})
		.map((notification) => notification.identifier);
	const idsToCancel = Array.from(new Set([...notificationIds, ...courseNotificationIds]));
	await Promise.all(idsToCancel.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
	await setJSON<string[]>(SCHEDULED_COURSE_NOTIFICATION_IDS_KEY, []);
}

export async function scheduleDebugNotificationAt(targetDate: Date) {
	if (Platform.OS === "web") return null;
	const targetMillis = targetDate.getTime();
	if (!Number.isFinite(targetMillis) || targetMillis <= Date.now()) throw new Error("Horaire de debug invalide ou déjà passé.");
	const granted = await requestNotificationPermission();
	if (!granted) throw new Error("Permission notification refusée.");
	await ensureAndroidChannel();
	const notificationId = await Notifications.scheduleNotificationAsync({
		content: {
			title: "Debug EpiTime",
			body: `Notification programmée à ${targetDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`,
			sound: true,
			data: { type: "debug-notification", scheduledAt: targetMillis },
		},
		trigger: {
			type: Notifications.SchedulableTriggerInputTypes.DATE,
			date: targetDate,
			...(Platform.OS === "android" ? { channelId: COURSES_CHANNEL_ID } : {}),
		},
	});
	const currentIds = await getJSON<string[]>(SCHEDULED_DEBUG_NOTIFICATION_IDS_KEY, []);
	await setJSON<string[]>(SCHEDULED_DEBUG_NOTIFICATION_IDS_KEY, Array.from(new Set([...currentIds, notificationId])));
	return notificationId;
}

export async function cancelDebugNotifications() {
	if (Platform.OS === "web") return;
	const notificationIds = await getJSON<string[]>(SCHEDULED_DEBUG_NOTIFICATION_IDS_KEY, []);
	const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
	const debugNotificationIds = scheduledNotifications
		.filter((notification) => {
			const data = notification.content.data as { type?: unknown } | undefined;
			return data?.type === "debug-notification";
		})
		.map((notification) => notification.identifier);
	const idsToCancel = Array.from(new Set([...notificationIds, ...debugNotificationIds]));
	await Promise.all(idsToCancel.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
	await setJSON<string[]>(SCHEDULED_DEBUG_NOTIFICATION_IDS_KEY, []);
}

export async function sendLocalTestNotification() {
	if (Platform.OS === "web") return false;
	const granted = await requestNotificationPermission();
	if (!granted) return false;
	await ensureAndroidChannel();
	await Notifications.scheduleNotificationAsync({
		content: {
			title: "Notification de test",
			body: "Les rappels locaux EpiTime sont actifs.",
			sound: true,
			data: { type: "local-test", timestamp: Date.now() },
		},
		trigger: {
			type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
			seconds: 1,
			...(Platform.OS === "android" ? { channelId: COURSES_CHANNEL_ID } : {}),
		},
	});
	return true;
}

function normalizeNotificationType(value: unknown): NotificationSettings["notificationType"] {
	return value === "banner" || value === "sound" || value === "both" ? value : "both";
}

function courseChannelId(notificationType: NotificationSettings["notificationType"]) {
	return notificationType === "banner" ? COURSES_SILENT_CHANNEL_ID : COURSES_CHANNEL_ID;
}

function gradeChannelId(notificationType: NotificationSettings["notificationType"]) {
	return notificationType === "banner" ? GRADES_SILENT_CHANNEL_ID : GRADES_CHANNEL_ID;
}

function normalizeNotificationSettings(settings: Partial<NotificationSettings>): NotificationSettings {
	return {
		enabled: settings.enabled ?? defaultNotificationSettings.enabled,
		minutesBefore: clampInteger(settings.minutesBefore, 1, 120, defaultNotificationSettings.minutesBefore),
		selectedDays: Array.isArray(settings.selectedDays)
			? settings.selectedDays.map((day) => clampInteger(day, 0, 6, 0)).filter((day, index, days) => days.indexOf(day) === index)
			: defaultNotificationSettings.selectedDays,
		notificationType: normalizeNotificationType(settings.notificationType),
		changeDetectionEnabled: settings.changeDetectionEnabled ?? defaultNotificationSettings.changeDetectionEnabled,
		changeDetectionWindowDays: clampInteger(settings.changeDetectionWindowDays, 1, 14, defaultNotificationSettings.changeDetectionWindowDays),
	};
}

async function appendEventChangeHistory(changes: EventChange[]) {
	const now = new Date().toISOString();
	const current = await getEventChangeHistory();
	const existing = new Map(current.map((item) => [item.key, item]));
	for (const change of changes) {
		existing.set(change.key, { ...change, notifiedAt: existing.get(change.key)?.notifiedAt || now });
	}
	const next = Array.from(existing.values())
		.sort((a, b) => new Date(b.notifiedAt).getTime() - new Date(a.notifiedAt).getTime())
		.slice(0, MAX_EVENT_CHANGE_HISTORY_ITEMS);
	await setJSON<EventChangeHistoryItem[]>(EVENT_CHANGE_HISTORY_KEY, next);
}

function formatChangeNotificationBody(change: EventChange) {
	const details = (change.details || [])
		.slice(0, 2)
		.map((detail) => `${detail.label}: ${detail.before || "Non défini"} -> ${detail.after || "Non défini"}`)
		.join(" · ");
	return details ? `${change.title} · ${details}` : `${change.title} · ${change.body}`;
}

function formatChangeNotificationTitle(change: EventChange) {
	if (change.kind === "created") return "Cours ajouté";
	if (change.kind === "deleted") return "Cours retiré";
	if (change.kind === "cancelled") return "Cours annulé";
	if (change.kind === "reactivated") return "Cours réactivé";
	return "Cours modifié";
}

function formatAurigaGradeNotificationBody(change: AurigaGradeNotificationChange) {
	const subject = change.name.trim() || change.code?.trim() || "Une matière";
	const grade = change.alphaMark === "VA" ? "Validé" : change.alphaMark === "NV" ? "Non validé" : `${formatAurigaGradeValue(change.grade)} / 20`;
	return `${subject} · ${grade}`;
}

function formatAurigaGradeValue(value: number) {
	if (!Number.isFinite(value)) return "Note disponible";
	return String(Math.round(value * 100) / 100).replace(".", ",");
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

async function removeStoredNotificationId(key: string, id: string) {
	const notificationIds = await getJSON<string[]>(key, []);
	await setJSON<string[]>(
		key,
		notificationIds.filter((notificationId) => notificationId !== id)
	);
}

function getScheduledNotificationMillis(trigger: Notifications.NotificationTrigger | null, data?: { startsAt?: unknown; scheduledAt?: unknown }) {
	const rawTrigger = trigger as Record<string, unknown> | null;
	const triggerValue = rawTrigger?.value ?? rawTrigger?.date;
	const triggerMillis = parseMillis(triggerValue);
	if (triggerMillis != null) return triggerMillis;

	const scheduledAtMillis = parseMillis(data?.scheduledAt);
	if (scheduledAtMillis != null) return scheduledAtMillis;

	return parseMillis(data?.startsAt);
}

function describeNotificationTrigger(trigger: Notifications.NotificationTrigger | null, scheduledAt: number | null) {
	const rawTrigger = trigger as Record<string, unknown> | null;
	const type = typeof rawTrigger?.type === "string" ? rawTrigger.type : "programmée";
	if (scheduledAt != null) return formatScheduledNotificationDate(scheduledAt);

	const seconds = typeof rawTrigger?.seconds === "number" ? rawTrigger.seconds : null;
	if (seconds != null) return `dans ${seconds} s`;

	return type;
}

function formatScheduledNotificationDate(millis: number) {
	const date = new Date(millis);
	return `${date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })} à ${date.toLocaleTimeString("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
	})}`;
}

function parseMillis(value: unknown) {
	if (value instanceof Date) {
		const millis = value.getTime();
		return Number.isFinite(millis) ? millis : null;
	}
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value === "string") {
		const millis = new Date(value).getTime();
		return Number.isFinite(millis) ? millis : null;
	}
	return null;
}

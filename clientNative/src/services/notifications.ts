import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";
import { ZeusEvent } from "../types";
import { getEventTitle, getRoomName } from "../utils/calendar";
import { publicConfig } from "./config";
import { getJSON, setJSON } from "./storage";

export const COURSES_CHANNEL_ID = "courses";
const NOTIFICATION_SETTINGS_KEY = "notificationSettings";
const NOTIFICATION_DEBUG_SETTINGS_KEY = "notificationDebugSettings";
const SCHEDULED_COURSE_NOTIFICATION_IDS_KEY = "scheduledCourseNotificationIds";
const SCHEDULED_DEBUG_NOTIFICATION_IDS_KEY = "scheduledDebugNotificationIds";
const COURSE_NOTIFICATION_WINDOW_DAYS = 14;

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

type ScheduleLocalCourseNotificationOptions = {
	requestPermission?: boolean;
	windowDays?: number;
};

export const defaultNotificationSettings: NotificationSettings = {
	enabled: true,
	minutesBefore: 15,
	selectedDays: [0, 1, 2, 3, 4, 5, 6],
	notificationType: "both",
};

export const defaultNotificationDebugSettings: NotificationDebugSettings = {
	enabled: false,
	targetHour: 8,
	targetMinute: 0,
	progressDurationMinutes: 90,
};

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: true,
		shouldSetBadge: false,
	}),
});

export async function ensureAndroidChannel() {
	if (Platform.OS !== "android") return;
	await Notifications.setNotificationChannelAsync(COURSES_CHANNEL_ID, {
		name: "Cours",
		importance: Notifications.AndroidImportance.HIGH,
	});
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
	const projectId = publicConfig.expoProjectId || Constants.expoConfig?.extra?.eas?.projectId;
	if (!projectId) throw new Error("Expo projectId manquant");
	return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function getNotificationSettings() {
	const saved = await getJSON<Partial<NotificationSettings>>(NOTIFICATION_SETTINGS_KEY, defaultNotificationSettings);
	return {
		...defaultNotificationSettings,
		...saved,
		selectedDays: Array.isArray(saved.selectedDays) ? saved.selectedDays : defaultNotificationSettings.selectedDays,
	};
}

export async function setNotificationSettings(settings: NotificationSettings) {
	await setJSON(NOTIFICATION_SETTINGS_KEY, settings);
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
	const sound = notificationType === "banner" ? undefined : "default";
	const scheduledIds: string[] = [];

	const upcomingEvents = [...events]
		.filter((event) => !event.isCancelled && !event.isCanceled)
		.map((event) => ({ event, startMillis: new Date(event.startDate).getTime() }))
		.filter(({ startMillis }) => Number.isFinite(startMillis) && startMillis > now && startMillis <= maxScheduledAt)
		.sort((a, b) => a.startMillis - b.startMillis);

	try {
		for (const { event: ev, startMillis } of upcomingEvents) {
			if (ev.isCancelled || ev.isCanceled) continue;
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
						data: { type: "course-reminder", eventId, startsAt: ev.startDate },
						sound,
					},
					trigger: {
						type: Notifications.SchedulableTriggerInputTypes.DATE,
						date: reminderDate,
						...(Platform.OS === "android" ? { channelId: COURSES_CHANNEL_ID } : {}),
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
						data: { type: "course-start", eventId, startsAt: ev.startDate },
						sound,
					},
					trigger: {
						type: Notifications.SchedulableTriggerInputTypes.DATE,
						date: startDate,
						...(Platform.OS === "android" ? { channelId: COURSES_CHANNEL_ID } : {}),
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
			sound: "default",
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
			sound: "default",
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

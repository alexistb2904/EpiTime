import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { ZeusEvent } from "../types";
import { getEventTitle, getRoomName } from "../utils/calendar";
import { publicConfig } from "./config";
import { getJSON, setJSON } from "./storage";

const COURSES_CHANNEL_ID = "courses";
const NOTIFICATION_SETTINGS_KEY = "notificationSettings";
const SCHEDULED_COURSE_NOTIFICATION_IDS_KEY = "scheduledCourseNotificationIds";
const COURSE_NOTIFICATION_WINDOW_DAYS = 14;

export type NotificationSettings = {
	enabled: boolean;
	minutesBefore: number;
	selectedDays: number[];
	notificationType: "banner" | "sound" | "both";
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

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: true,
		shouldSetBadge: false,
	}),
});

async function ensureAndroidChannel() {
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
	} finally {
		await setJSON(SCHEDULED_COURSE_NOTIFICATION_IDS_KEY, scheduledIds);
	}
}

export async function clearLocalCourseNotifications() {
	if (Platform.OS === "web") return;
	await cancelScheduledCourseNotifications();
}

async function cancelScheduledCourseNotifications() {
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

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { ZeusEvent } from "../types";
import { publicConfig } from "./config";

const COURSES_CHANNEL_ID = "courses";

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

export async function requestPushToken() {
	if (Platform.OS === "web") return null;
	if (!Device.isDevice) return null;
	const { status: existing } = await Notifications.getPermissionsAsync();
	let status = existing;
	if (status !== "granted") {
		const res = await Notifications.requestPermissionsAsync();
		status = res.status;
	}
	if (status !== "granted") return null;
	await ensureAndroidChannel();
	const projectId = publicConfig.expoProjectId || Constants.expoConfig?.extra?.eas?.projectId;
	if (!projectId) throw new Error("Expo projectId manquant");
	return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
export async function scheduleLocalCourseNotifications(events: ZeusEvent[], minutesBefore = 15, selectedDays = [0, 1, 2, 3, 4, 5, 6]) {
	if (Platform.OS === "web") return;
	await ensureAndroidChannel();
	await Notifications.cancelAllScheduledNotificationsAsync();
	const now = Date.now();
	for (const ev of events) {
		const startDate = new Date(ev.startDate);
		if (!selectedDays.includes(startDate.getDay())) continue;
		const triggerDate = new Date(startDate.getTime() - minutesBefore * 60_000);
		if (triggerDate.getTime() <= now) continue;
		await Notifications.scheduleNotificationAsync({
			content: {
				title: "Cours bientôt",
				body: `${ev.name || "Cours"} commence dans ${minutesBefore} min`,
				data: { eventId: ev.idReservation || ev.id },
				sound: "default",
			},
			trigger: {
				type: Notifications.SchedulableTriggerInputTypes.DATE,
				date: triggerDate,
				...(Platform.OS === "android" ? { channelId: COURSES_CHANNEL_ID } : {}),
			},
		});
	}
}

export async function clearLocalCourseNotifications() {
	if (Platform.OS === "web") return;
	await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function sendLocalTestNotification() {
	if (Platform.OS === "web") return false;
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

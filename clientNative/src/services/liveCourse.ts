import { NativeModules, Platform } from "react-native";
import { ZeusEvent } from "../types";
import { getEventTitle, getRoomName } from "../utils/calendar";
import { getJSON, setJSON } from "./storage";

const minute = 60_000;
const LIVE_COURSE_NOTIFICATION_SETTINGS_KEY = "liveCourseNotificationSettings";

export type LiveCourseNotificationSettings = {
	progressEnabled: boolean;
};

const defaultLiveCourseNotificationSettings: LiveCourseNotificationSettings = {
	progressEnabled: true,
};

const LiveCourse = NativeModules.EpiTimeLiveCourse as
	| {
			showCourseProgress?: (title: string, description: string, progress: number, chipText: string, timeoutMillis: number) => Promise<boolean>;
			stop?: () => Promise<boolean>;
	  }
	| undefined;

let lastSignature: string | null = null;
const eventSources = new Map<string, ZeusEvent[]>();

export async function syncLiveCourseNotification(events: ZeusEvent[], now = Date.now(), source = "default") {
	if (Platform.OS !== "android" || !LiveCourse?.showCourseProgress || !LiveCourse?.stop) return;
	const settings = await getLiveCourseNotificationSettings();
	if (!settings.progressEnabled) {
		eventSources.clear();
		lastSignature = null;
		await LiveCourse.stop().catch(() => false);
		return;
	}

	eventSources.set(source, events);
	const activeCourse = getActiveCourse(Array.from(eventSources.values()).flat(), now);
	if (!activeCourse) {
		if (lastSignature !== null) {
			lastSignature = null;
			await LiveCourse.stop().catch(() => false);
		}
		return;
	}

	const startMillis = new Date(activeCourse.startDate).getTime();
	const endMillis = new Date(activeCourse.endDate).getTime();
	const duration = Math.max(minute, endMillis - startMillis);
	const remainingMillis = Math.max(0, endMillis - now);
	const progress = Math.round(((now - startMillis) / duration) * 100);
	const remainingText = formatRemaining(remainingMillis);
	const room = activeCourse.rooms?.map(getRoomName).filter(Boolean).join(", ") || "Lieu à confirmer";
	const endTime = new Date(endMillis).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
	const title = getEventTitle(activeCourse);
	const description = `${room} · fin à ${endTime}`;
	const signature = `${activeCourse.idReservation || activeCourse.id || title}-${activeCourse.startDate}-${Math.floor(progress / 2)}`;

	if (signature === lastSignature) return;
	lastSignature = signature;
	await LiveCourse.showCourseProgress(title, description, progress, remainingText, remainingMillis).catch(() => false);
}

export async function stopLiveCourseNotification() {
	if (Platform.OS !== "android" || !LiveCourse?.stop) return;
	eventSources.clear();
	lastSignature = null;
	await LiveCourse.stop().catch(() => false);
}

export async function getLiveCourseNotificationSettings() {
	const saved = await getJSON<Partial<LiveCourseNotificationSettings>>(LIVE_COURSE_NOTIFICATION_SETTINGS_KEY, defaultLiveCourseNotificationSettings);
	return { ...defaultLiveCourseNotificationSettings, ...saved };
}

export async function setLiveCourseProgressNotificationEnabled(progressEnabled: boolean) {
	const current = await getLiveCourseNotificationSettings();
	await setJSON<LiveCourseNotificationSettings>(LIVE_COURSE_NOTIFICATION_SETTINGS_KEY, { ...current, progressEnabled });
	if (!progressEnabled) await stopLiveCourseNotification();
}

function getActiveCourse(events: ZeusEvent[], now: number) {
	return [...events]
		.map((event) => ({
			event,
			startMillis: new Date(event.startDate).getTime(),
			endMillis: new Date(event.endDate).getTime(),
		}))
		.filter(({ startMillis, endMillis }) => Number.isFinite(startMillis) && Number.isFinite(endMillis) && startMillis <= now && endMillis > now)
		.sort((a, b) => a.startMillis - b.startMillis)[0]?.event;
}

function formatRemaining(ms: number) {
	const totalMinutes = Math.max(1, Math.ceil(ms / minute));
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes ? `${hours} h ${minutes}` : `${hours} h`;
}

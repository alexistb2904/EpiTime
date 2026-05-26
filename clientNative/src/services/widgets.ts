import { NativeModules, Platform } from "react-native";
import { getEvents } from "./api";
import { publicConfig } from "./config";
import { getSession, getJSON, setJSON } from "./storage";
import { ZeusEvent } from "../types";
import { getCourseColor, getCourseTypeLabel, getEventTitle, getRoomName, getTeacherName, startOfDay } from "../utils/calendar";

const WidgetData = NativeModules.EpiTimeWidgetData as
	| {
			updateCourses?: (rawJson: string) => Promise<boolean>;
			refreshWidgets?: () => Promise<boolean>;
	  }
	| undefined;

export type WidgetCourse = {
	id?: string | number;
	title: string;
	type: string;
	code?: string;
	room: string;
	teacher: string;
	startMillis: number;
	endMillis: number;
	color: string;
};

export async function syncCourseWidgets(events: ZeusEvent[]) {
	if (!WidgetData?.updateCourses || (Platform.OS !== "android" && Platform.OS !== "ios")) return;
	const courses = normalizeWidgetCourses(events);
	try {
		const [session, groups] = await Promise.all([getSession(), getJSON<(string | number)[]>("selectedGroups", [])]);
		await WidgetData.updateCourses(
			JSON.stringify({
				generatedAt: Date.now(),
				courses,
				apiBase: publicConfig.apiBase,
				zeusToken: session?.zeusToken,
				groups: groups.map(String),
			})
		);
	} catch {
		// Widgets are an optional native surface; the app must keep working if native sync is unavailable.
	}
}

export async function refreshCourseWidgetsForGroups(groups: (string | number)[]) {
	if (!groups.length) {
		await syncCourseWidgets([]);
		return [];
	}
	const start = startOfDay(new Date());
	const end = new Date(start);
	end.setDate(end.getDate() + 30);
	const events = await getEvents(start, end, groups);
	const safeEvents = Array.isArray(events) ? events : [];
	await setJSON("lastEvents", safeEvents);
	await syncCourseWidgets(safeEvents);
	return safeEvents;
}

export async function refreshCourseWidgets() {
	try {
		await WidgetData?.refreshWidgets?.();
	} catch {
		// Best effort only.
	}
}

function normalizeWidgetCourses(events: ZeusEvent[]): WidgetCourse[] {
	const now = Date.now();
	return events
		.map((event) => {
			const startMillis = new Date(event.startDate).getTime();
			const endMillis = new Date(event.endDate).getTime();
			return { event, startMillis, endMillis };
		})
		.filter(({ startMillis, endMillis }) => Number.isFinite(startMillis) && Number.isFinite(endMillis) && endMillis > now)
		.sort((a, b) => a.startMillis - b.startMillis)
		.slice(0, 8)
		.map(({ event, startMillis, endMillis }) => ({
			id: event.idReservation || event.id,
			title: getEventTitle(event),
			type: getCourseTypeLabel(event),
			code: event.code,
			room: event.rooms?.map(getRoomName).filter(Boolean).join(", ") || "Lieu a confirmer",
			teacher: event.teachers?.map(getTeacherName).filter(Boolean).join(", ") || "",
			startMillis,
			endMillis,
			color: getCourseColor(event),
		}));
}

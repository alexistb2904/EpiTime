import React from "react";
import { NativeModules, Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { getEvents } from "./api";
import { publicConfig } from "./config";
import { getSession, getJSON, setJSON } from "./storage";
import { ZeusEvent } from "../types";
import { getCourseColor, getCourseTypeLabel, getEventTitle, getRoomName, getTeacherName, startOfDay } from "../utils/calendar";
import { isEventCancelled, isEventIgnored, mergeEventsWithLocal, reconcileEventsWithCache } from "./localEvents";
import { NextCourseWidget } from "../widgets/NextCourseWidget";
import { UpcomingCoursesWidget } from "../widgets/UpcomingCoursesWidget";

const WidgetData = NativeModules.EpiTimeWidgetData as
	| {
			updateCourses?: (rawJson: string) => Promise<boolean>;
	  }
	| undefined;

const CourseWidgets = NativeModules.EpiTimeCourseWidgets as
	| {
			scheduleRefreshes?: (rawPayloadJson: string) => Promise<boolean>;
			cancelRefreshes?: () => Promise<boolean>;
	  }
	| undefined;

export type WidgetCourse = {
	id?: string | number;
	title: string;
	type: string;
	code?: string;
	room: string;
	teacher: string;
	startDate: string;
	startMillis: number;
	endMillis: number;
	color: string;
};

export type CourseWidgetPayload = {
	generatedAt: number;
	courses: WidgetCourse[];
	apiBase?: string;
	zeusToken?: string;
	groups: string[];
};

export const COURSE_WIDGET_PAYLOAD_KEY = "epitime.courseWidgetPayload";
export const COURSE_WIDGET_REFRESH_ACTION = "REFRESH_WIDGET";

type SyncCourseWidgetsOptions = {
	requestAndroidUpdate?: boolean;
};

export async function syncCourseWidgets(events: ZeusEvent[], options: SyncCourseWidgetsOptions = {}) {
	if (Platform.OS !== "android" && Platform.OS !== "ios") return;
	const courses = normalizeWidgetCourses(events);
	try {
		const [session, groups] = await Promise.all([getSession(), getJSON<(string | number)[]>("selectedGroups", [])]);
		const payload: CourseWidgetPayload = {
			generatedAt: Date.now(),
			courses,
			apiBase: publicConfig.apiBase,
			zeusToken: session?.zeusToken,
			groups: groups.map(String),
		};
		await persistCourseWidgetPayload(payload, options.requestAndroidUpdate ?? true);
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
	const cachedEvents = await getJSON<ZeusEvent[]>("lastEvents", []);
	const reconciledEvents = reconcileEventsWithCache(safeEvents, cachedEvents);
	await setJSON("lastEvents", reconciledEvents);
	await syncCourseWidgets(await mergeEventsWithLocal(reconciledEvents, start, end));
	return reconciledEvents;
}

export async function getStoredCourseWidgetPayload() {
	return getJSON<CourseWidgetPayload | null>(COURSE_WIDGET_PAYLOAD_KEY, null);
}

export async function refreshCourseWidgetsFromStoredConfig() {
	const stored = await getStoredCourseWidgetPayload();
	if (!stored?.apiBase || !stored.zeusToken || !stored.groups.length) return stored;

	const start = startOfDay(new Date());
	const end = new Date(start);
	end.setDate(end.getDate() + 30);

	try {
		const events = await fetchWidgetEvents(stored.apiBase, stored.zeusToken, start, end, stored.groups);
		const safeEvents = Array.isArray(events) ? events : [];
		const cachedEvents = await getJSON<ZeusEvent[]>("lastEvents", []);
		const reconciledEvents = reconcileEventsWithCache(safeEvents, cachedEvents);
		await setJSON("lastEvents", reconciledEvents);
		const visibleEvents = await mergeEventsWithLocal(reconciledEvents, start, end);

		const nextPayload: CourseWidgetPayload = {
			...stored,
			generatedAt: Date.now(),
			courses: normalizeWidgetCourses(visibleEvents),
		};
		await persistCourseWidgetPayload(nextPayload, false);
		return nextPayload;
	} catch {
		return stored;
	}
}

export function normalizeWidgetCourses(events: ZeusEvent[]): WidgetCourse[] {
	const now = Date.now();
	return events
		.map((event) => {
			const startMillis = new Date(event.startDate).getTime();
			const endMillis = new Date(event.endDate).getTime();
			return { event, startMillis, endMillis };
		})
		.filter(({ event, startMillis, endMillis }) => !isEventCancelled(event) && !isEventIgnored(event) && Number.isFinite(startMillis) && Number.isFinite(endMillis) && endMillis > now)
		.sort((a, b) => a.startMillis - b.startMillis)
		.slice(0, 8)
		.map(({ event, startMillis, endMillis }) => ({
			id: event.idReservation || event.id,
			title: getEventTitle(event),
			type: getCourseTypeLabel(event),
			code: event.code,
			room: event.rooms?.map(getRoomName).filter(Boolean).join(", ") || "Lieu a confirmer",
			teacher: event.teachers?.map(getTeacherName).filter(Boolean).join(", ") || "",
			startDate: event.startDate,
			startMillis,
			endMillis,
			color: getCourseColor(event),
		}));
}

async function persistCourseWidgetPayload(payload: CourseWidgetPayload, requestAndroidUpdate: boolean) {
	await setJSON(COURSE_WIDGET_PAYLOAD_KEY, payload);

	if (Platform.OS === "ios" && WidgetData?.updateCourses) {
		await WidgetData.updateCourses(JSON.stringify(payload));
		return;
	}

	if (Platform.OS === "android") {
		await syncNativeCourseWidgetRefreshes(payload);
	}

	if (Platform.OS === "android" && requestAndroidUpdate) {
		await requestCourseWidgetUpdates(payload);
	}
}

async function syncNativeCourseWidgetRefreshes(payload: CourseWidgetPayload) {
	if (!payload.groups.length || !payload.courses.length) {
		await CourseWidgets?.cancelRefreshes?.().catch(() => false);
		return;
	}

	await CourseWidgets?.scheduleRefreshes?.(JSON.stringify(payload)).catch(() => false);
}

export async function requestCourseWidgetUpdates(payload: CourseWidgetPayload) {
	await Promise.all([
		requestWidgetUpdate({
			widgetName: "NextCourse",
			renderWidget: () => ({
				light: React.createElement(NextCourseWidget, { payload, theme: "light" }),
				dark: React.createElement(NextCourseWidget, { payload, theme: "dark" }),
			}),
			widgetNotFound: () => {},
		}),
		requestWidgetUpdate({
			widgetName: "UpcomingCourses",
			renderWidget: () => ({
				light: React.createElement(UpcomingCoursesWidget, { payload, theme: "light" }),
				dark: React.createElement(UpcomingCoursesWidget, { payload, theme: "dark" }),
			}),
			widgetNotFound: () => {},
		}),
	]);
}

async function fetchWidgetEvents(apiBase: string, zeusToken: string, start: Date, end: Date, groups: string[]) {
	const base = apiBase.replace(/\/$/, "");
	const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
	groups.forEach((group) => params.append("groups", group));

	const response = await fetch(`${base}/api/events?${params.toString()}`, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${zeusToken}`,
		},
	});
	if (!response.ok) throw new Error(`Widget refresh failed: HTTP ${response.status}`);
	return (await response.json()) as ZeusEvent[];
}

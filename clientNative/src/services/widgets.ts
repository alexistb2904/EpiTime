import React from "react";
import { NativeModules, Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { publicConfig } from "./config";
import { isAuthReconnectRequiredError } from "./api";
import { readEventsCache, reconcileEventsWithCache, writeEventsCache } from "./eventsCache";
import { isEventCancelled, isEventIgnored, mergeEventsWithLocal } from "./localEvents";
import { syncSchedule } from "./scheduleRepository";
import { getSession, getJSON, setJSON } from "./storage";
import { getCachedAurigaGrades, getCachedAurigaSyllabus } from "./aurigaCache";
import { getSubjectCoefficientOverrides } from "./gradeCoefficientOverrides";
import { getUseWeightedAverages } from "./gradePreferences";
import { buildGradesPeriods, type DisplayGrade, type GradesPeriod } from "./gradesService";
import { getManualGrades } from "./manualGrades";
import { ZeusEvent } from "../types";
import { getCourseColor, getCourseTypeLabel, getEventTitle, getRoomName, getTeacherName, startOfDay } from "../utils/calendar";
import { NextCourseWidget } from "../widgets/NextCourseWidget";
import { SemesterGradesWidget } from "../widgets/SemesterGradesWidget";
import { SemesterOverviewWidget } from "../widgets/SemesterOverviewWidget";
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

/** Display-only grade snapshot supplied by the app once Auriga data is available. */
export type WidgetGrade = {
	subject: string;
	label?: string;
	score: string;
};

export type WidgetGradeSummary = {
	semesterLabel?: string;
	average?: string;
	latestGrades?: WidgetGrade[];
};

export type CourseWidgetPayload = {
	generatedAt: number;
	courses: WidgetCourse[];
	gradeSummary?: WidgetGradeSummary;
	apiBase?: string;
	zeusToken?: string;
	groups: string[];
};

export const COURSE_WIDGET_PAYLOAD_KEY = "epitime.courseWidgetPayload";
export const COURSE_WIDGET_REFRESH_ACTION = "REFRESH_WIDGET";

type SyncCourseWidgetsOptions = {
	requestAndroidUpdate?: boolean;
	gradeSummary?: WidgetGradeSummary | null;
};

export async function syncCourseWidgets(events: ZeusEvent[], options: SyncCourseWidgetsOptions = {}) {
	if (Platform.OS !== "android" && Platform.OS !== "ios") return;
	const courses = normalizeWidgetCourses(events);
	try {
		const [session, groups, storedPayload] = await Promise.all([getSession(), getJSON<(string | number)[]>("selectedGroups", []), getStoredCourseWidgetPayload()]);
		const gradeSummary = options.gradeSummary === undefined ? storedPayload?.gradeSummary : options.gradeSummary || undefined;
		const payload: CourseWidgetPayload = {
			generatedAt: Date.now(),
			courses,
			gradeSummary,
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
	const result = await syncSchedule({ start, end, query: { groups } });
	await syncCourseWidgets(result.visibleEvents);
	return result.events;
}

export async function getStoredCourseWidgetPayload() {
	return getJSON<CourseWidgetPayload | null>(COURSE_WIDGET_PAYLOAD_KEY, null);
}

/**
 * Re-renders the semester widgets from a display-only snapshot. The caller owns
 * Auriga calculation and formatting; this layer only persists and displays it.
 */
export async function updateGradeWidgetSummary(gradeSummary?: WidgetGradeSummary | null) {
	if (Platform.OS !== "android" && Platform.OS !== "ios") return;
	const stored = await getStoredCourseWidgetPayload();
	const payload: CourseWidgetPayload = {
		generatedAt: Date.now(),
		courses: stored?.courses || [],
		gradeSummary: gradeSummary || undefined,
		apiBase: stored?.apiBase,
		zeusToken: stored?.zeusToken,
		groups: stored?.groups || [],
	};
	await persistCourseWidgetPayload(payload, true);
}

export async function clearGradeWidgetSummary() {
	await updateGradeWidgetSummary(null);
}

/**
 * Builds the display-only grade snapshot used by Android widgets from the same
 * stored data and coefficient settings as the Notes screen.  Keeping this
 * calculation local means a manual coefficient is reflected immediately and
 * no Auriga credential or academic result is sent to the shared backend.
 */
export async function syncGradeWidgetsFromStoredData() {
	if (Platform.OS !== "android" && Platform.OS !== "ios") return;

	const [grades, syllabus, manualGrades, useWeightedAverages, subjectCoefficientOverrides] = await Promise.all([
		getCachedAurigaGrades(),
		getCachedAurigaSyllabus(),
		getManualGrades(),
		getUseWeightedAverages(),
		getSubjectCoefficientOverrides(),
	]);
	const periods = buildGradesPeriods(grades, syllabus, {
		manualGrades,
		useWeightedAverages,
		subjectCoefficientOverrides,
	});
	await updateGradeWidgetSummary(buildGradeWidgetSummary(periods));
}

function buildGradeWidgetSummary(periods: GradesPeriod[]): WidgetGradeSummary | undefined {
	const period = currentGradeWidgetPeriod(periods);
	if (!period) return undefined;

	const latestGrades = period.ues
		.flatMap((ue) => ue.subjects.flatMap((subject) => subject.grades))
		.filter((grade) => Boolean(grade.studentScore))
		.sort((left, right) => (right.syncedAt || 0) - (left.syncedAt || 0))
		.slice(0, 8)
		.map(toWidgetGrade);

	return {
		semesterLabel: period.name,
		average: formatWidgetAverage(period.overallAverage),
		latestGrades,
	};
}

function currentGradeWidgetPeriod(periods: GradesPeriod[]) {
	if (!periods.length) return undefined;
	const month = new Date().getMonth();
	// Academic semesters are conventionally odd from September to January,
	// then even from February through August.  Falling back to the latest
	// available period keeps historical data useful outside a normal term.
	const wantsOddSemester = month >= 8 || month === 0;
	const matching = periods.filter((period) => period.semester > 0 && (period.semester % 2 === 1) === wantsOddSemester);
	return matching[matching.length - 1] || periods[periods.length - 1];
}

function formatWidgetAverage(score: GradesPeriod["overallAverage"]) {
	if (score.status) return score.status;
	if (!score.outOf || !Number.isFinite(score.value)) return "—";
	return score.value.toFixed(2).replace(".", ",");
}

function toWidgetGrade(grade: DisplayGrade): WidgetGrade {
	const score = grade.studentScore;
	const value = score?.status || (score?.outOf && Number.isFinite(score.value) ? `${formatWidgetScore(score.value)}/20` : "—");
	return {
		subject: grade.subjectName,
		label: grade.description || "Évaluation",
		score: value,
	};
}

function formatWidgetScore(value: number) {
	return value.toFixed(value % 1 ? 1 : 0).replace(".", ",");
}

export async function refreshCourseWidgetsFromStoredConfig() {
	const stored = await getStoredCourseWidgetPayload();
	const session = await getSession();
	const apiBase = publicConfig.apiBase || stored?.apiBase;
	if (!stored?.groups.length || !apiBase || !session?.zeusToken) return stored;

	const start = startOfDay(new Date());
	const end = new Date(start);
	end.setDate(end.getDate() + 30);

	try {
		// Use the live session token instead of the old widget snapshot. A Zeus
		// refresh or reconnection would otherwise leave widgets permanently stale.
		const events = await fetchWidgetEvents(apiBase, session.zeusToken, start, end, stored.groups);
		const safeEvents: ZeusEvent[] = Array.isArray(events) ? (events as ZeusEvent[]) : [];
		const cachedEvents = await readEventsCache(start, end, { groups: stored.groups }, true);
		const reconciledEvents = reconcileEventsWithCache(safeEvents, cachedEvents);
		await writeEventsCache(start, end, { groups: stored.groups }, reconciledEvents);
		const visibleEvents = await mergeEventsWithLocal(reconciledEvents, start, end);

		const nextPayload: CourseWidgetPayload = {
			...stored,
			generatedAt: Date.now(),
			courses: normalizeWidgetCourses(visibleEvents),
			apiBase,
			zeusToken: session.zeusToken,
		};
		await persistCourseWidgetPayload(nextPayload, false);
		return nextPayload;
	} catch (error) {
		if (isAuthReconnectRequiredError(error)) return stored;
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
		.filter(
			({ event, startMillis, endMillis }) =>
				!isEventCancelled(event) && !isEventIgnored(event) && Number.isFinite(startMillis) && Number.isFinite(endMillis) && endMillis > now
		)
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
		requestWidgetUpdate({
			widgetName: "SemesterGrades",
			renderWidget: () => ({
				light: React.createElement(SemesterGradesWidget, { payload, theme: "light" }),
				dark: React.createElement(SemesterGradesWidget, { payload, theme: "dark" }),
			}),
			widgetNotFound: () => {},
		}),
		requestWidgetUpdate({
			widgetName: "SemesterOverview",
			renderWidget: () => ({
				light: React.createElement(SemesterOverviewWidget, { payload, theme: "light" }),
				dark: React.createElement(SemesterOverviewWidget, { payload, theme: "dark" }),
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
	if (!response.ok) {
		if (response.status === 401) throw Object.assign(new Error("Session expirée, reconnecte-toi pour continuer."), { status: 401, code: "AUTH_RECONNECT_REQUIRED" });
		throw new Error(`Widget refresh failed: HTTP ${response.status}`);
	}
	return (await response.json()) as ZeusEvent[];
}

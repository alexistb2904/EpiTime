import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { AurigaAuthError, getRememberedAurigaCredentials, hasAurigaRefreshToken } from "./aurigaAuth";
import { getCachedAurigaGrades, saveAurigaGrades } from "./aurigaCache";
import { fetchAurigaGrades } from "./aurigaClient";
import type { AurigaGrade } from "./aurigaTypes";
import { rescheduleCourseNoteReminders } from "./courseNotes";
import { isAuthReconnectRequiredError } from "./api";
import { isEventCancelled, isEventIgnored } from "./localEvents";
import {
	getNotificationSettings,
	notifyAurigaGradeChanges,
	notifyEventChanges,
	scheduleLocalCourseNotifications,
	type AurigaGradeNotificationChange,
	type NotificationSettings,
} from "./notifications";
import { syncSchedule } from "./scheduleRepository";
import { getJSON, getSession, setJSON } from "./storage";
import { syncCourseWidgets, syncGradeWidgetsFromStoredData } from "./widgets";

const PLANNING_NOTIFICATION_SYNC_TASK = "sync-planning-notifications";
const BACKGROUND_SYNC_INTERVAL_MINUTES = 15;
const BACKGROUND_NOTIFICATION_WINDOW_DAYS = 14;
const LAST_BACKGROUND_SYNC_KEY = "lastPlanningNotificationBackgroundSync";
const LAST_AURIGA_GRADE_BACKGROUND_SYNC_KEY = "lastAurigaGradeBackgroundSync";
const BACKGROUND_SYNC_REGISTRATION_INTERVAL_KEY = "planningNotificationBackgroundSyncInterval";

async function syncPlanningNotificationsInBackground() {
	const [session, selectedGroups, notificationSettings, hasAurigaToken, rememberedAurigaCredentials] = await Promise.all([
		getSession(),
		getJSON<(string | number)[]>("selectedGroups", []),
		getNotificationSettings(),
		hasAurigaRefreshToken(),
		getRememberedAurigaCredentials(),
	]);
	let completedWork = false;
	let planningError: unknown = null;

	if (session?.zeusToken && selectedGroups.length) {
		try {
			const start = new Date();
			const end = new Date(start);
			end.setDate(end.getDate() + BACKGROUND_NOTIFICATION_WINDOW_DAYS);

			const result = await syncSchedule({
				start,
				end,
				query: { groups: selectedGroups },
				changeDetectionWindowDays: notificationSettings.changeDetectionWindowDays,
			});
			const visibleEvents = result.visibleEvents;
			await syncCourseWidgets(visibleEvents);
			await rescheduleCourseNoteReminders(visibleEvents);
			if (notificationSettings.enabled) {
				await scheduleLocalCourseNotifications(
					visibleEvents.filter((event) => !isEventCancelled(event) && !isEventIgnored(event)),
					notificationSettings.minutesBefore,
					notificationSettings.selectedDays,
					notificationSettings.notificationType,
					{ requestPermission: false, windowDays: BACKGROUND_NOTIFICATION_WINDOW_DAYS }
				);
			}
			if (result.source === "network" && notificationSettings.changeDetectionEnabled && result.changes.length) {
				await notifyEventChanges(result.changes, notificationSettings.notificationType);
			}
			await setJSON(LAST_BACKGROUND_SYNC_KEY, new Date().toISOString());
			completedWork = true;
		} catch (error) {
			if (!isAuthReconnectRequiredError(error)) planningError = error;
		}
	}

	if (hasAurigaToken || rememberedAurigaCredentials) {
		completedWork = (await syncAurigaGradesInBackground(notificationSettings)) || completedWork;
	}

	// If Auriga completed, report success even when the independent planning
	// refresh failed. Returning Failed here would make Android back off and
	// delay the very grade check that succeeded.
	if (planningError && !completedWork) throw planningError;
	return completedWork;
}

async function syncAurigaGradesInBackground(notificationSettings: NotificationSettings) {
	try {
		// Read the previous cache before the request so only a task that actually ran can create an alert.
		const previousGrades = await getCachedAurigaGrades();
		const fetchedGrades = await fetchAurigaGrades();
		const changes = findAurigaGradeChanges(previousGrades, fetchedGrades);

		// On a first sync, establish the baseline without spamming historical grades.
		if (previousGrades.length > 0 && changes.length > 0 && notificationSettings.enabled) {
			await notifyAurigaGradeChanges(changes, notificationSettings.notificationType);
		}

		const grades = preserveAurigaGradeSyncDates(previousGrades, fetchedGrades);
		// This is deliberately a grades-only refresh; keep auriga.lastSync reserved for a complete grades/syllabus sync.
		await Promise.all([saveAurigaGrades(grades), setJSON(LAST_AURIGA_GRADE_BACKGROUND_SYNC_KEY, new Date().toISOString())]);
		await syncGradeWidgetsFromStoredData().catch(() => {});
		return true;
	} catch (error) {
		// The user may have revoked Auriga access while the app was closed. Keep planning sync healthy in that case.
		if (error instanceof AurigaAuthError) return false;
		throw error;
	}
}

function findAurigaGradeChanges(previousGrades: AurigaGrade[], nextGrades: AurigaGrade[]): AurigaGradeNotificationChange[] {
	const previousByIdentity = new Map(previousGrades.map((grade) => [aurigaGradeIdentity(grade), grade]));

	return nextGrades.flatMap((grade) => {
		const previous = previousByIdentity.get(aurigaGradeIdentity(grade));
		if (!previous) {
			return [toAurigaGradeNotificationChange("new", grade)];
		}
		if (aurigaGradeValueSignature(previous) === aurigaGradeValueSignature(grade)) return [];
		return [toAurigaGradeNotificationChange("updated", grade, previous)];
	});
}

function toAurigaGradeNotificationChange(kind: AurigaGradeNotificationChange["kind"], grade: AurigaGrade, previous?: AurigaGrade): AurigaGradeNotificationChange {
	const identity = aurigaGradeIdentity(grade);
	const previousSignature = previous ? aurigaGradeValueSignature(previous) : "";
	const nextSignature = aurigaGradeValueSignature(grade);
	return {
		key: `${kind}:${identity}:${previousSignature}:${nextSignature}`,
		kind,
		name: grade.name,
		code: grade.code,
		semester: grade.semester,
		grade: grade.grade,
		alphaMark: grade.alphaMark,
	};
}

function preserveAurigaGradeSyncDates(previousGrades: AurigaGrade[], nextGrades: AurigaGrade[]) {
	const previousByIdentity = new Map(previousGrades.map((grade) => [aurigaGradeIdentity(grade), grade]));
	const now = Date.now();
	return nextGrades.map((grade) => {
		const previous = previousByIdentity.get(aurigaGradeIdentity(grade));
		const isUnchanged = previous && aurigaGradeValueSignature(previous) === aurigaGradeValueSignature(grade);
		return { ...grade, syncedAt: isUnchanged ? previous.syncedAt || grade.syncedAt || now : now };
	});
}

function aurigaGradeIdentity(grade: AurigaGrade) {
	return [grade.code, grade.name, grade.type, grade.semester].map((value) => encodeURIComponent(String(value ?? "").trim())).join("|");
}

function aurigaGradeValueSignature(grade: AurigaGrade) {
	return [grade.alphaMark || "", Number.isFinite(grade.grade) ? grade.grade : "", Number.isFinite(grade.coefficient) ? grade.coefficient : ""]
		.map((value) => String(value))
		.join("|");
}

if (!TaskManager.isTaskDefined(PLANNING_NOTIFICATION_SYNC_TASK)) {
	TaskManager.defineTask(PLANNING_NOTIFICATION_SYNC_TASK, async () => {
		try {
			await syncPlanningNotificationsInBackground();
			return BackgroundTask.BackgroundTaskResult.Success;
		} catch {
			return BackgroundTask.BackgroundTaskResult.Failed;
		}
	});
}

export async function registerPlanningNotificationBackgroundSync() {
	if (Platform.OS === "web") return false;

	const [session, selectedGroups, status, hasAurigaToken, rememberedAurigaCredentials, registeredInterval] = await Promise.all([
		getSession(),
		getJSON<(string | number)[]>("selectedGroups", []),
		BackgroundTask.getStatusAsync(),
		hasAurigaRefreshToken(),
		getRememberedAurigaCredentials(),
		getJSON<number>(BACKGROUND_SYNC_REGISTRATION_INTERVAL_KEY, 0),
	]);
	const hasPlanningSource = Boolean(session?.zeusToken && selectedGroups.length);
	const canSync = Boolean(session && (hasPlanningSource || hasAurigaToken || rememberedAurigaCredentials));

	if (!canSync || status !== BackgroundTask.BackgroundTaskStatus.Available) {
		await unregisterPlanningNotificationBackgroundSync();
		return false;
	}

	const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(PLANNING_NOTIFICATION_SYNC_TASK);
	if (!alreadyRegistered || registeredInterval !== BACKGROUND_SYNC_INTERVAL_MINUTES) {
		if (alreadyRegistered) await TaskManager.unregisterTaskAsync(PLANNING_NOTIFICATION_SYNC_TASK);
		await BackgroundTask.registerTaskAsync(PLANNING_NOTIFICATION_SYNC_TASK, {
			minimumInterval: BACKGROUND_SYNC_INTERVAL_MINUTES,
		});
		await setJSON(BACKGROUND_SYNC_REGISTRATION_INTERVAL_KEY, BACKGROUND_SYNC_INTERVAL_MINUTES);
	}

	return true;
}

export async function unregisterPlanningNotificationBackgroundSync() {
	if (Platform.OS === "web") return;
	const registered = await TaskManager.isTaskRegisteredAsync(PLANNING_NOTIFICATION_SYNC_TASK);
	if (registered) await BackgroundTask.unregisterTaskAsync(PLANNING_NOTIFICATION_SYNC_TASK);
	await setJSON(BACKGROUND_SYNC_REGISTRATION_INTERVAL_KEY, 0);
}

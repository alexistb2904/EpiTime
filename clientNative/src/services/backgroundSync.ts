import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { rescheduleCourseNoteReminders } from "./courseNotes";
import { isEventCancelled, isEventIgnored } from "./localEvents";
import { getNotificationSettings, notifyEventChanges, scheduleLocalCourseNotifications } from "./notifications";
import { syncSchedule } from "./scheduleRepository";
import { getJSON, getSession, setJSON } from "./storage";
import { syncCourseWidgets } from "./widgets";

const PLANNING_NOTIFICATION_SYNC_TASK = "sync-planning-notifications";
const BACKGROUND_SYNC_INTERVAL_MINUTES = 5 * 60;
const BACKGROUND_NOTIFICATION_WINDOW_DAYS = 14;
const LAST_BACKGROUND_SYNC_KEY = "lastPlanningNotificationBackgroundSync";

async function syncPlanningNotificationsInBackground() {
	const [session, selectedGroups, notificationSettings] = await Promise.all([getSession(), getJSON<(string | number)[]>("selectedGroups", []), getNotificationSettings()]);

	if (!session?.zeusToken || !selectedGroups.length) return true;

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

	return result.source === "network";
}

if (!TaskManager.isTaskDefined(PLANNING_NOTIFICATION_SYNC_TASK)) {
	TaskManager.defineTask(PLANNING_NOTIFICATION_SYNC_TASK, async () => {
		try {
			const synced = await syncPlanningNotificationsInBackground();
			return synced ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
		} catch {
			return BackgroundTask.BackgroundTaskResult.Failed;
		}
	});
}

export async function registerPlanningNotificationBackgroundSync() {
	if (Platform.OS === "web") return false;

	const [session, selectedGroups, status] = await Promise.all([getSession(), getJSON<(string | number)[]>("selectedGroups", []), BackgroundTask.getStatusAsync()]);

	if (!session?.zeusToken || !selectedGroups.length || status !== BackgroundTask.BackgroundTaskStatus.Available) {
		await unregisterPlanningNotificationBackgroundSync();
		return false;
	}

	const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(PLANNING_NOTIFICATION_SYNC_TASK);
	if (!alreadyRegistered) {
		await BackgroundTask.registerTaskAsync(PLANNING_NOTIFICATION_SYNC_TASK, {
			minimumInterval: BACKGROUND_SYNC_INTERVAL_MINUTES,
		});
	}

	return true;
}

export async function unregisterPlanningNotificationBackgroundSync() {
	if (Platform.OS === "web") return;
	const registered = await TaskManager.isTaskRegisteredAsync(PLANNING_NOTIFICATION_SYNC_TASK);
	if (registered) await BackgroundTask.unregisterTaskAsync(PLANNING_NOTIFICATION_SYNC_TASK);
}

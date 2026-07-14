import { Linking, Platform } from "react-native";
import { canScheduleExactLiveCourseNotification, requestExactLiveCourseNotificationPermission } from "./liveCourse";
import { getNotificationPermissionStatus, requestNotificationPermission } from "./notifications";

export type RequiredPermissionId = "notifications" | "exactAlarms";

export type RequiredPermissionState = {
	id: RequiredPermissionId;
	label: string;
	granted: boolean;
	canAskAgain: boolean;
};

export type RequiredPermissionsResult = {
	permissions: RequiredPermissionState[];
	missing: RequiredPermissionState[];
};

export type RequiredAppPermissionsOptions = {
	/**
	 * Exact alarms are a special access, not a normal notification permission.
	 * Keep the onboarding request focused on notifications and ask for this
	 * capability only from a feature-specific user action or the Settings screen.
	 */
	includeExactAlarms?: boolean;
};

function buildResult(permissions: RequiredPermissionState[]): RequiredPermissionsResult {
	return {
		permissions,
		missing: permissions.filter((permission) => !permission.granted),
	};
}

export async function getRequiredAppPermissions(options: RequiredAppPermissionsOptions = {}): Promise<RequiredPermissionsResult> {
	if (Platform.OS === "web") return buildResult([]);
	const notifications = await getNotificationPermissionStatus();
	const permissions: RequiredPermissionState[] = [
		{
			id: "notifications",
			label: "Notifications",
			granted: notifications.granted || notifications.status === "granted",
			canAskAgain: notifications.canAskAgain,
		},
	];

	if (options.includeExactAlarms) {
		permissions.push({
			id: "exactAlarms",
			label: "Alarmes exactes",
			granted: await canScheduleExactLiveCourseNotification(),
			canAskAgain: true,
		});
	}

	return buildResult(permissions);
}

export async function requestRequiredAppPermissions(options: RequiredAppPermissionsOptions = {}): Promise<RequiredPermissionsResult> {
	const current = await getRequiredAppPermissions(options);
	if (!current.missing.length) return current;

	for (const permission of current.missing) {
		if (permission.id === "notifications" && permission.canAskAgain) {
			await requestNotificationPermission();
		}
		if (permission.id === "exactAlarms") {
			await requestExactLiveCourseNotificationPermission();
		}
	}

	return getRequiredAppPermissions(options);
}

export async function openAppPermissionSettings() {
	await Linking.openSettings();
}

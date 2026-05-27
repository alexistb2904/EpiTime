import { Linking, Platform } from "react-native";
import { getNotificationPermissionStatus, requestNotificationPermission } from "./notifications";

export type RequiredPermissionId = "notifications";

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

function buildResult(permissions: RequiredPermissionState[]): RequiredPermissionsResult {
	return {
		permissions,
		missing: permissions.filter((permission) => !permission.granted),
	};
}

export async function getRequiredAppPermissions(): Promise<RequiredPermissionsResult> {
	if (Platform.OS === "web") return buildResult([]);
	const notifications = await getNotificationPermissionStatus();
	return buildResult([
		{
			id: "notifications",
			label: "Notifications",
			granted: notifications.granted || notifications.status === "granted",
			canAskAgain: notifications.canAskAgain,
		},
	]);
}

export async function requestRequiredAppPermissions(): Promise<RequiredPermissionsResult> {
	const current = await getRequiredAppPermissions();
	if (!current.missing.length) return current;

	for (const permission of current.missing) {
		if (permission.id === "notifications" && permission.canAskAgain) {
			await requestNotificationPermission();
		}
	}

	return getRequiredAppPermissions();
}

export async function openAppPermissionSettings() {
	await Linking.openSettings();
}

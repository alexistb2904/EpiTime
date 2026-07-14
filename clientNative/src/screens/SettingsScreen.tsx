import React, { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useVersion } from "../context/VersionContext";
import { registerExpoPushToken, isAuthReconnectRequiredError } from "../services/api";
import { clearRememberedAurigaCredentials, logoutAuriga } from "../services/aurigaAuth";
import { clearAurigaCache } from "../services/aurigaCache";
import { registerPlanningNotificationBackgroundSync } from "../services/backgroundSync";
import { clearSubjectCoefficientOverrides } from "../services/gradeCoefficientOverrides";
import { rescheduleCourseNoteReminders } from "../services/courseNotes";
import { getUseWeightedAverages, setUseWeightedAverages } from "../services/gradePreferences";
import { getDeletedRealEventsCount, restoreDeletedRealEvents } from "../services/localEvents";
import {
	getLiveCourseNotificationSettings,
	scheduleDebugCourseProgressAt,
	setLiveCourseProgressNotificationEnabled,
	showDebugCourseProgressNow,
	stopDebugCourseProgress,
} from "../services/liveCourse";
import {
	cancelAllScheduledNotifications,
	clearAurigaGradeNotificationHistory,
	cancelDebugNotifications,
	cancelScheduledNotification,
	defaultNotificationDebugSettings,
	getNotificationDebugSettings,
	getNotificationSettings,
	getScheduledNotifications,
	requestPushToken,
	scheduleDebugNotificationAt,
	scheduleLocalCourseNotifications,
	setNotificationDebugSettings,
	type NotificationDebugSettings,
	type ScheduledNotificationItem,
} from "../services/notifications";
import { getRequiredAppPermissions, openAppPermissionSettings, requestRequiredAppPermissions, type RequiredPermissionsResult } from "../services/permissions";
import { readCachedSelectedGroupsSchedule } from "../services/scheduleRepository";
import { getJSON } from "../services/storage";
import { clearGradeWidgetSummary, syncGradeWidgetsFromStoredData } from "../services/widgets";
import { SettingsContent, buildNextDebugTargetDate, formatDebugTargetDate, wrapNumber } from "../components/settings/SettingsComponents";

export default function SettingsScreen() {
	const { logout, session, handleAuthExpired } = useAuth();
	const { mode, resolvedMode, setThemeMode, materialYouEnabled, materialYouAvailable, materialYouActive, setMaterialYouEnabled } = useTheme();
	const { currentVersion, latestVersion, updateAvailable, checking, error, lastCheckedAt, checkForUpdates, openLatestRelease } = useVersion();
	const [liveCourseProgressEnabled, setLiveCourseProgressEnabled] = useState(true);
	const [notificationDebugSettings, setNotificationDebugSettingsState] = useState(defaultNotificationDebugSettings);
	const [debugBusyAction, setDebugBusyAction] = useState<string | null>(null);
	const [debugStatus, setDebugStatus] = useState("");
	const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotificationItem[]>([]);
	const [scheduledNotificationsLoading, setScheduledNotificationsLoading] = useState(false);
	const [useWeightedAverages, setUseWeightedAveragesState] = useState(true);
	const [aurigaDisconnecting, setAurigaDisconnecting] = useState(false);
	const [creditsVisible, setCreditsVisible] = useState(false);
	const [deletedEventsCount, setDeletedEventsCount] = useState(0);
	const [permissionState, setPermissionState] = useState<RequiredPermissionsResult | null>(null);
	const [permissionsLoading, setPermissionsLoading] = useState(false);
	const account = session?.account as { displayName?: string; id?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
	const userId = account?.id || account?.userPrincipalName || account?.mail || "";
	const missingPermissionsCount = permissionState?.missing.length ?? 0;
	const permissionsKnown = permissionState !== null;
	const versionStatus = updateAvailable ? "Mise à jour disponible" : error ? "Vérification indisponible" : "Application à jour";
	const versionDetails = updateAvailable
		? `Version installée ${currentVersion} · Release ${latestVersion}`
		: error
			? `Version installée ${currentVersion} · ${error}`
			: `Version installée ${currentVersion}${lastCheckedAt ? ` · Vérifiée à ${lastCheckedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}`;
	const modeLabel = mode === "system" ? "Système" : mode === "dark" ? "Sombre" : "Clair";
	const materialYouDetails = materialYouActive ? "Couleurs dynamiques actives" : materialYouAvailable ? "Désactivé" : "Non disponible sur cet appareil";
	const debugTargetDate = buildNextDebugTargetDate(notificationDebugSettings.targetHour, notificationDebugSettings.targetMinute);
	const debugTargetLabel = formatDebugTargetDate(debugTargetDate);

	const refreshScheduledNotifications = useCallback(async () => {
		setScheduledNotificationsLoading(true);
		try {
			setScheduledNotifications(await getScheduledNotifications());
		} catch (err: any) {
			setDebugStatus(err?.message || "Impossible de lire les notifications programmées.");
		} finally {
			setScheduledNotificationsLoading(false);
		}
	}, []);

	useEffect(() => {
		Promise.all([getLiveCourseNotificationSettings(), getNotificationDebugSettings()])
			.then(([liveCourseSettings, debugSettings]) => {
				setLiveCourseProgressEnabled(liveCourseSettings.progressEnabled);
				setNotificationDebugSettingsState(debugSettings);
			})
			.catch(() => {});
		getUseWeightedAverages()
			.then(setUseWeightedAveragesState)
			.catch(() => {});
	}, []);

	useFocusEffect(
		useCallback(() => {
			getDeletedRealEventsCount()
				.then(setDeletedEventsCount)
				.catch(() => {});
			getRequiredAppPermissions({ includeExactAlarms: true })
				.then(setPermissionState)
				.catch(() => {});
			if (notificationDebugSettings.enabled) void refreshScheduledNotifications();
		}, [notificationDebugSettings.enabled, refreshScheduledNotifications])
	);

	useEffect(() => {
		if (notificationDebugSettings.enabled) void refreshScheduledNotifications();
	}, [notificationDebugSettings.enabled, refreshScheduledNotifications]);

	const toggleLiveCourseProgress = async (enabled: boolean) => {
		setLiveCourseProgressEnabled(enabled);
		try {
			await setLiveCourseProgressNotificationEnabled(enabled);
		} catch {
			setLiveCourseProgressEnabled(!enabled);
		}
	};

	const toggleGradeWeighting = async (enabled: boolean) => {
		setUseWeightedAveragesState(enabled);
		try {
			await setUseWeightedAverages(enabled);
			await syncGradeWidgetsFromStoredData().catch(() => {});
		} catch {
			setUseWeightedAveragesState(!enabled);
		}
	};

	const disconnectAuriga = () => {
		Alert.alert("Déconnexion Auriga", "Supprimer la session Auriga et le cache Auriga local ?", [
			{ text: "Annuler", style: "cancel" },
			{
				text: "Déconnecter",
				style: "destructive",
				onPress: () =>
					void (async () => {
						setAurigaDisconnecting(true);
						try {
							await Promise.all([
								logoutAuriga(),
								clearRememberedAurigaCredentials(),
								clearAurigaCache(),
								clearSubjectCoefficientOverrides(),
								clearAurigaGradeNotificationHistory(),
							]);
							await clearGradeWidgetSummary().catch(() => {});
							Alert.alert("Auriga déconnecté", "La session Auriga, les identifiants mémorisés et le cache local ont été supprimés.");
						} catch {
							Alert.alert("Erreur", "La déconnexion Auriga n'a pas pu être terminée.");
						} finally {
							setAurigaDisconnecting(false);
						}
					})(),
			},
		]);
	};

	const saveNotificationDebugSettings = async (next: NotificationDebugSettings) => {
		setNotificationDebugSettingsState(next);
		try {
			await setNotificationDebugSettings(next);
			if (!next.enabled) setDebugStatus("");
		} catch {
			setNotificationDebugSettingsState(notificationDebugSettings);
		}
	};

	const updateDebugSettings = (patch: Partial<NotificationDebugSettings>) => {
		const next = { ...notificationDebugSettings, ...patch };
		void saveNotificationDebugSettings(next);
	};

	const runDebugAction = async (actionId: string, action: () => Promise<string>) => {
		setDebugBusyAction(actionId);
		try {
			const message = await action();
			setDebugStatus(message);
			Alert.alert("Debug notifications", message);
		} catch (err: any) {
			const message = err?.message || "Action de debug impossible.";
			setDebugStatus(message);
			Alert.alert("Debug notifications", message);
		} finally {
			setDebugBusyAction(null);
		}
	};

	const scheduleDebugLocal = () =>
		runDebugAction("local", async () => {
			await scheduleDebugNotificationAt(debugTargetDate);
			await refreshScheduledNotifications();
			return `Notification locale programmée pour ${debugTargetLabel}.`;
		});

	const scheduleDebugProgress = () =>
		runDebugAction("progress", async () => {
			const scheduled = await scheduleDebugCourseProgressAt(debugTargetDate, notificationDebugSettings.progressDurationMinutes);
			if (!scheduled) throw new Error("Progression debug disponible uniquement sur Android avec le module natif installé.");
			return `Progression fictive programmée pour ${debugTargetLabel}.`;
		});

	const showDebugProgress = () =>
		runDebugAction("showProgress", async () => {
			const shown = await showDebugCourseProgressNow(notificationDebugSettings.progressDurationMinutes);
			if (!shown) throw new Error("Progression debug disponible uniquement sur Android avec le module natif installé.");
			return "Progression fictive affichée maintenant.";
		});

	const clearDebugNotifications = () =>
		runDebugAction("clear", async () => {
			await Promise.all([cancelDebugNotifications(), stopDebugCourseProgress()]);
			await refreshScheduledNotifications();
			return "Notifications et progression debug annulées.";
		});

	const deleteScheduledNotification = (notification: ScheduledNotificationItem) => {
		Alert.alert("Supprimer la notification", `${notification.title}\n${notification.trigger}`, [
			{ text: "Annuler", style: "cancel" },
			{
				text: "Supprimer",
				style: "destructive",
				onPress: () =>
					void runDebugAction("deleteScheduled", async () => {
						await cancelScheduledNotification(notification.id);
						await refreshScheduledNotifications();
						return "Notification programmée supprimée.";
					}),
			},
		]);
	};

	const deleteAllScheduledNotifications = () => {
		Alert.alert("Tout supprimer", "Supprimer toutes les notifications programmées connues par l'app ?", [
			{ text: "Annuler", style: "cancel" },
			{
				text: "Tout supprimer",
				style: "destructive",
				onPress: () =>
					void runDebugAction("deleteAllScheduled", async () => {
						await Promise.all([cancelAllScheduledNotifications(), stopDebugCourseProgress()]);
						await refreshScheduledNotifications();
						return "Toutes les notifications programmées connues ont été supprimées.";
					}),
			},
		]);
	};

	const restoreEvents = async () => {
		await restoreDeletedRealEvents();
		setDeletedEventsCount(0);
		Alert.alert("Agenda restauré", "Les cours supprimés réapparaîtront et les cours ignorés seront de nouveau actifs au prochain chargement de l'agenda.");
	};

	const refreshNotificationServices = async () => {
		const [notificationSettings, cachedSchedule, groups] = await Promise.all([
			getNotificationSettings(),
			readCachedSelectedGroupsSchedule(14),
			getJSON<(string | number)[]>("selectedGroups", []),
		]);

		await rescheduleCourseNoteReminders(cachedSchedule.visibleEvents).catch(() => {});
		if (!notificationSettings.enabled) return;

		await scheduleLocalCourseNotifications(
			cachedSchedule.activeEvents,
			notificationSettings.minutesBefore,
			notificationSettings.selectedDays,
			notificationSettings.notificationType,
			{
				requestPermission: false,
			}
		).catch(() => {});
		await registerPlanningNotificationBackgroundSync().catch(() => {});
		if (!userId) return;
		const token = await requestPushToken().catch(() => null);
		if (token) {
			try {
				await registerExpoPushToken(token, userId, groups, notificationSettings);
			} catch (err) {
				if (isAuthReconnectRequiredError(err)) {
					await handleAuthExpired();
					return;
				}
			}
		}
	};

	const requestMissingPermissions = async () => {
		setPermissionsLoading(true);
		try {
			const result = await requestRequiredAppPermissions({ includeExactAlarms: true });
			setPermissionState(result);
			if (!result.missing.length) {
				await refreshNotificationServices();
				Alert.alert("Permissions accordées", "Les rappels et synchronisations nécessaires sont prêts.");
				return;
			}

			const blocked = result.missing.some((permission) => !permission.canAskAgain);
			const missingExactAlarms = result.missing.some((permission) => permission.id === "exactAlarms");
			if (blocked) {
				Alert.alert("Permission à activer", "Active les permissions manquantes dans les réglages système pour que les rappels EpiTime fonctionnent.", [
					{ text: "Plus tard", style: "cancel" },
					{ text: "Ouvrir les réglages", onPress: () => void openAppPermissionSettings() },
				]);
				return;
			}

			Alert.alert(
				"Permission manquante",
				missingExactAlarms
					? "Active les alarmes exactes pour que la notification de début de cours se déclenche à l'heure exacte."
					: "La permission notification n'a pas été accordée."
			);
		} catch (err: any) {
			Alert.alert("Permissions indisponibles", err?.message || "Impossible de vérifier les permissions.");
		} finally {
			setPermissionsLoading(false);
		}
	};

	return (
		<SettingsContent
			account={account}
			aurigaDisconnecting={aurigaDisconnecting}
			checkForUpdates={checkForUpdates}
			checking={checking}
			creditsVisible={creditsVisible}
			debugBusyAction={debugBusyAction}
			debugStatus={debugStatus}
			debugTargetLabel={debugTargetLabel}
			deleteAllScheduledNotifications={deleteAllScheduledNotifications}
			deleteScheduledNotification={deleteScheduledNotification}
			deletedEventsCount={deletedEventsCount}
			disconnectAuriga={disconnectAuriga}
			logout={logout}
			materialYouDetails={materialYouDetails}
			materialYouEnabled={materialYouEnabled}
			missingPermissionsCount={missingPermissionsCount}
			mode={mode}
			modeLabel={modeLabel}
			notificationDebugSettings={notificationDebugSettings}
			openLatestRelease={openLatestRelease}
			permissionsKnown={permissionsKnown}
			permissionsLoading={permissionsLoading}
			refreshScheduledNotifications={refreshScheduledNotifications}
			requestMissingPermissions={requestMissingPermissions}
			resolvedMode={resolvedMode}
			restoreEvents={restoreEvents}
			saveNotificationDebugSettings={saveNotificationDebugSettings}
			scheduleDebugLocal={scheduleDebugLocal}
			scheduleDebugProgress={scheduleDebugProgress}
			scheduledNotifications={scheduledNotifications}
			scheduledNotificationsLoading={scheduledNotificationsLoading}
			setCreditsVisible={setCreditsVisible}
			setMaterialYouEnabled={setMaterialYouEnabled}
			setThemeMode={setThemeMode}
			showDebugProgress={showDebugProgress}
			clearDebugNotifications={clearDebugNotifications}
			toggleGradeWeighting={toggleGradeWeighting}
			toggleLiveCourseProgress={toggleLiveCourseProgress}
			updateAvailable={updateAvailable}
			updateDebugSettings={updateDebugSettings}
			useWeightedAverages={useWeightedAverages}
			versionDetails={versionDetails}
			versionStatus={versionStatus}
			liveCourseProgressEnabled={liveCourseProgressEnabled}
		/>
	);
}

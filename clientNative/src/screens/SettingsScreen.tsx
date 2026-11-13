import React, { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useVersion } from "../context/VersionContext";
import { clearRememberedAurigaCredentials, logoutAuriga } from "../services/aurigaAuth";
import { clearAurigaCache } from "../services/aurigaCache";
import { clearSubjectCoefficientOverrides } from "../services/gradeCoefficientOverrides";
import { getUseWeightedAverages, setUseWeightedAverages } from "../services/gradePreferences";
import { getDeletedRealEventsCount, restoreDeletedRealEvents } from "../services/localEvents";
import { scheduleDebugCourseProgressAt, showDebugCourseProgressNow, stopDebugCourseProgress } from "../services/liveCourse";
import {
	cancelAllScheduledNotifications,
	clearAurigaGradeNotificationHistory,
	cancelDebugNotifications,
	cancelScheduledNotification,
	defaultNotificationDebugSettings,
	getNotificationDebugSettings,
	getScheduledNotifications,
	scheduleDebugNotificationAt,
	setNotificationDebugSettings,
	type NotificationDebugSettings,
	type ScheduledNotificationItem,
} from "../services/notifications";
import { clearGradeWidgetSummary, syncGradeWidgetsFromStoredData } from "../services/widgets";
import { getAnalyticsConsent, setAnalyticsConsent, trackEvent } from "../services/analytics";
import { SettingsContent, buildNextDebugTargetDate, formatDebugTargetDate, wrapNumber } from "../components/settings/SettingsComponents";

export default function SettingsScreen() {
	const { logout, session } = useAuth();
	const { mode, resolvedMode, setThemeMode, materialYouEnabled, materialYouAvailable, setMaterialYouEnabled } = useTheme();
	const {
		currentVersion,
		latestVersion,
		updateAvailable,
		checking,
		error,
		lastCheckedAt,
		updatePhase,
		updateProgress,
		updateError,
		checkForUpdates,
		openLatestRelease,
		startUpdate,
	} = useVersion();
	const [notificationDebugSettings, setNotificationDebugSettingsState] = useState(defaultNotificationDebugSettings);
	const [debugBusyAction, setDebugBusyAction] = useState<string | null>(null);
	const [debugStatus, setDebugStatus] = useState("");
	const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotificationItem[]>([]);
	const [scheduledNotificationsLoading, setScheduledNotificationsLoading] = useState(false);
	const [useWeightedAverages, setUseWeightedAveragesState] = useState(true);
	const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
	const [aurigaDisconnecting, setAurigaDisconnecting] = useState(false);
	const [creditsVisible, setCreditsVisible] = useState(false);
	const [deletedEventsCount, setDeletedEventsCount] = useState(0);
	const account = session?.account as { displayName?: string; id?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
	const versionStatus = updateAvailable
		? updatePhase === "downloading"
			? `Téléchargement de la mise à jour · ${Math.round(updateProgress * 100)}%`
			: updatePhase === "permission"
				? "Autorisation d’installation requise"
				: updatePhase === "error"
					? "Mise à jour à réessayer"
					: "Mise à jour disponible"
		: error
			? "Vérification indisponible"
			: "Application à jour";
	const versionDetails = updateAvailable
		? updateError
			? `Version installée ${currentVersion} · ${updateError}`
			: `Version installée ${currentVersion} · Release ${latestVersion}`
		: error
			? `Version installée ${currentVersion} · ${error}`
			: `Version installée ${currentVersion}${lastCheckedAt ? ` · Vérifiée à ${lastCheckedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}`;
	const materialYouDetails = materialYouAvailable ? "Couleurs tirées de ton fond d’écran" : "Non disponible sur cet appareil";
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
		getNotificationDebugSettings()
			.then(setNotificationDebugSettingsState)
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
			if (notificationDebugSettings.enabled) void refreshScheduledNotifications();
		}, [notificationDebugSettings.enabled, refreshScheduledNotifications])
	);

	useFocusEffect(
		useCallback(() => {
			getAnalyticsConsent()
				.then(setAnalyticsEnabled)
				.catch(() => setAnalyticsEnabled(false));
		}, [])
	);

	useEffect(() => {
		if (notificationDebugSettings.enabled) void refreshScheduledNotifications();
	}, [notificationDebugSettings.enabled, refreshScheduledNotifications]);

	const toggleGradeWeighting = async (enabled: boolean) => {
		setUseWeightedAveragesState(enabled);
		try {
			await setUseWeightedAverages(enabled);
			await syncGradeWidgetsFromStoredData().catch(() => {});
		} catch {
			setUseWeightedAveragesState(!enabled);
		}
	};

	const toggleAnalytics = async (enabled: boolean) => {
		setAnalyticsEnabled(enabled);
		await setAnalyticsConsent(enabled, account?.id);
		if (enabled) await trackEvent("analytics_consent_accepted", { source: "settings" });
	};

	const changeTheme = async (nextMode: "system" | "light" | "dark") => {
		await setThemeMode(nextMode);
		void trackEvent("theme_changed", { to_theme: nextMode });
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

	return (
		<SettingsContent
			account={account}
			analyticsEnabled={analyticsEnabled}
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
			materialYouAvailable={materialYouAvailable}
			materialYouDetails={materialYouDetails}
			materialYouEnabled={materialYouEnabled}
			mode={mode}
			notificationDebugSettings={notificationDebugSettings}
			openLatestRelease={openLatestRelease}
			startUpdate={startUpdate}
			updatePhase={updatePhase}
			updateProgress={updateProgress}
			refreshScheduledNotifications={refreshScheduledNotifications}
			resolvedMode={resolvedMode}
			restoreEvents={restoreEvents}
			saveNotificationDebugSettings={saveNotificationDebugSettings}
			scheduleDebugLocal={scheduleDebugLocal}
			scheduleDebugProgress={scheduleDebugProgress}
			scheduledNotifications={scheduledNotifications}
			scheduledNotificationsLoading={scheduledNotificationsLoading}
			setCreditsVisible={setCreditsVisible}
			setMaterialYouEnabled={setMaterialYouEnabled}
			setThemeMode={changeTheme}
			showDebugProgress={showDebugProgress}
			clearDebugNotifications={clearDebugNotifications}
			toggleGradeWeighting={toggleGradeWeighting}
			toggleAnalytics={toggleAnalytics}
			updateAvailable={updateAvailable}
			updateDebugSettings={updateDebugSettings}
			useWeightedAverages={useWeightedAverages}
			versionDetails={versionDetails}
			versionStatus={versionStatus}
		/>
	);
}

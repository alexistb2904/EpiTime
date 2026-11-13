import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AlertCircle, BellRing, CalendarClock, CalendarDays, Clock, Radio, Send, Volume2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton, Row, ScreenTitle, Section, Segmented, Stepper, s as ls } from "../components/settings/SettingsList";
import { getLiveCourseNotificationSettings, setLiveCourseProgressNotificationEnabled } from "../services/liveCourse";
import { getRequiredAppPermissions, openAppPermissionSettings, requestRequiredAppPermissions, type RequiredPermissionsResult } from "../services/permissions";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { registerExpoPushToken, unregisterExpoPushToken, sendMobileTestNotification, isAuthReconnectRequiredError } from "../services/api";
import { registerPlanningNotificationBackgroundSync } from "../services/backgroundSync";
import { rescheduleCourseNoteReminders } from "../services/courseNotes";
import {
	clearLocalCourseNotifications,
	defaultNotificationSettings,
	getNotificationSettings,
	getExistingPushToken,
	NotificationSettings,
	requestPushToken,
	scheduleLocalCourseNotifications,
	sendLocalTestNotification,
	setNotificationSettings,
} from "../services/notifications";
import { readCachedSelectedGroupsSchedule } from "../services/scheduleRepository";
import { getJSON } from "../services/storage";
import { daysOfWeek } from "../utils/calendar";
import { trackEvent } from "../services/analytics";

export default function NotificationsScreen() {
	const { theme } = useTheme();
	const insets = useSafeAreaInsets();
	const { session, handleAuthExpired } = useAuth();
	const [settings, setSettings] = useState(defaultNotificationSettings);
	const [message, setMessage] = useState("Les rappels locaux sont planifiés automatiquement.");
	const [loading, setLoading] = useState(false);
	const [liveCourseProgressEnabled, setLiveCourseProgressEnabled] = useState(true);
	const [permissionState, setPermissionState] = useState<RequiredPermissionsResult | null>(null);
	const [permissionsLoading, setPermissionsLoading] = useState(false);
	const account = session?.account as { id?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
	const userId = account?.id || account?.userPrincipalName || account?.mail || "";

	useEffect(() => {
		getNotificationSettings()
			.then(setSettings)
			.catch(() => {});
		getLiveCourseNotificationSettings()
			.then((liveCourse) => setLiveCourseProgressEnabled(liveCourse.progressEnabled))
			.catch(() => {});
	}, []);

	useFocusEffect(
		useCallback(() => {
			getRequiredAppPermissions({ includeExactAlarms: true })
				.then(setPermissionState)
				.catch(() => {});
		}, [])
	);

	const toggleLiveCourseProgress = async (enabled: boolean) => {
		setLiveCourseProgressEnabled(enabled);
		try {
			await setLiveCourseProgressNotificationEnabled(enabled);
		} catch {
			setLiveCourseProgressEnabled(!enabled);
		}
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

	const ensureRemoteSubscription = async (settingsOverride?: NotificationSettings) => {
		if (!userId) throw new Error("Profil Microsoft indisponible.");
		const token = await requestPushToken();
		if (!token) throw new Error("Permission refusée ou appareil non compatible.");
		const groups = await getJSON<(string | number)[]>("selectedGroups", []);
		await registerExpoPushToken(token, userId, groups, settingsOverride || { ...settings, enabled: true });
		return token;
	};

	const saveSettings = async (next: NotificationSettings) => {
		setSettings(next);
		await setNotificationSettings(next);
		const cachedSchedule = await readCachedSelectedGroupsSchedule(Math.max(14, next.changeDetectionWindowDays));
		await rescheduleCourseNoteReminders(cachedSchedule.visibleEvents);
		if (next.enabled) {
			await scheduleLocalCourseNotifications(cachedSchedule.activeEvents, next.minutesBefore, next.selectedDays, next.notificationType);
			await registerPlanningNotificationBackgroundSync();
		} else {
			await clearLocalCourseNotifications();
			await registerPlanningNotificationBackgroundSync();
		}
		const minutesBucket = next.minutesBefore <= 10 ? "0_10" : next.minutesBefore <= 30 ? "11_30" : next.minutesBefore <= 60 ? "31_60" : "61_plus";
		void trackEvent("notification_settings_saved", { source: "settings", selected_days_count: next.selectedDays.length, minutes_bucket: minutesBucket });
	};

	const enableRemote = async () => {
		if (!userId) {
			setMessage("Profil Microsoft indisponible. Reconnecte-toi avant d'activer le push distant.");
			return;
		}
		setLoading(true);
		try {
			const next = { ...settings, enabled: true };
			await ensureRemoteSubscription(next);
			await saveSettings(next);
			void trackEvent("notification_permission_result", { result: "granted", source: "settings" });
			setMessage("Notifications activées pour cet appareil.");
		} catch (err: any) {
			if (isAuthReconnectRequiredError(err)) {
				await handleAuthExpired();
				return;
			}
			setMessage("Activation échouée : " + (err?.message || "erreur inconnue"));
			void trackEvent("notification_permission_result", { result: "failed", source: "settings" });
		} finally {
			setLoading(false);
		}
	};

	const disableRemote = async () => {
		setLoading(true);
		try {
			await saveSettings({ ...settings, enabled: false });
			if (userId) {
				const token = await getExistingPushToken().catch(() => null);
				if (token) await unregisterExpoPushToken(token, userId);
			}
			setMessage("Notifications désactivées et abonnement push supprimé pour cet appareil.");
		} catch (err: any) {
			setMessage("Notifications locales désactivées, mais la suppression du push distant a échoué : " + (err?.message || "erreur inconnue"));
		} finally {
			setLoading(false);
		}
	};

	const test = async () => {
		if (!userId) return setMessage("Profil Microsoft indisponible.");
		setLoading(true);
		try {
			await sendLocalTestNotification();
			void trackEvent("notification_test_sent", { source: "settings" });
			try {
				await sendMobileTestNotification(userId);
				setMessage("Notification de test envoyée.");
			} catch (err: any) {
				if (isAuthReconnectRequiredError(err)) {
					await handleAuthExpired();
					return;
				}
				if (err?.status === 404) {
					await ensureRemoteSubscription();
					await sendMobileTestNotification(userId);
					setMessage("Notification locale envoyée, push distant réinitialisé puis testé.");
				} else {
					throw err;
				}
			}
		} catch (err: any) {
			if (isAuthReconnectRequiredError(err)) {
				await handleAuthExpired();
				return;
			}
			setMessage("Test échoué : " + (err?.message || "erreur inconnue"));
		} finally {
			setLoading(false);
		}
	};

	const toggleDay = (day: number) => {
		const selectedDays = settings.selectedDays.includes(day) ? settings.selectedDays.filter((value) => value !== day) : [...settings.selectedDays, day];
		saveSettings({ ...settings, selectedDays });
	};

	const missingPermissions = permissionState?.missing ?? [];
	const allDays = settings.selectedDays.length === 7;

	return (
		<ScrollView style={[ls.screen, { backgroundColor: theme.bg }]} contentContainerStyle={[ls.screenContent, { paddingTop: insets.top + 16 }]}>
			<ScreenTitle>Notifications</ScreenTitle>

			{missingPermissions.length ? (
				<Section>
					<Row
						icon={AlertCircle}
						iconColor={theme.warn}
						title={missingPermissions.length > 1 ? `${missingPermissions.length} autorisations manquantes` : "Autorisation manquante"}
						subtitle={`${missingPermissions.map((permission) => permission.label).join(", ")} : sans ${missingPermissions.length > 1 ? "elles" : "elle"}, les rappels peuvent ne pas arriver.`}
						loading={permissionsLoading}
						onPress={() => void requestMissingPermissions()}
					/>
				</Section>
			) : null}

			<Section title="Avant les cours">
				<Row
					icon={BellRing}
					title="Rappels de cours"
					subtitle={settings.enabled ? "Une notification avant chaque cours" : "Désactivés"}
					loading={loading}
					toggle={{ value: settings.enabled, onValueChange: (enabled) => void (enabled ? enableRemote() : disableRemote()), disabled: loading }}
				/>
				{settings.enabled ? (
					<Row
						icon={Clock}
						title="Délai"
						trailing={
							<Stepper
								label="le délai"
								value={`${settings.minutesBefore} min`}
								onDecrease={() => saveSettings({ ...settings, minutesBefore: Math.max(1, settings.minutesBefore - 5) })}
								onIncrease={() => saveSettings({ ...settings, minutesBefore: Math.min(120, settings.minutesBefore + 5) })}
							/>
						}
					/>
				) : null}
				{settings.enabled ? (
					<Row
						icon={CalendarDays}
						title="Jours"
						trailing={
							<Pressable accessibilityRole="button" hitSlop={12} onPress={() => saveSettings({ ...settings, selectedDays: allDays ? [] : [0, 1, 2, 3, 4, 5, 6] })}>
								<Text style={[s.textButton, { color: theme.accent }]}>{allDays ? "Aucun" : "Tous"}</Text>
							</Pressable>
						}
						below={
							<View style={s.days}>
								{daysOfWeek.map((day) => {
									const active = settings.selectedDays.includes(day.value);
									return (
										<Pressable
											key={day.value}
											accessibilityRole="checkbox"
											accessibilityState={{ checked: active }}
											onPress={() => toggleDay(day.value)}
											style={[s.day, { backgroundColor: active ? theme.accent : theme.surfaceSoft, borderColor: active ? theme.accent : theme.border }]}>
											<Text style={[s.dayText, { color: active ? theme.bg : theme.muted }]}>{day.label}</Text>
										</Pressable>
									);
								})}
							</View>
						}
					/>
				) : null}
				{settings.enabled ? (
					<Row
						icon={Volume2}
						title="Type d’alerte"
						below={
							<Segmented
								value={settings.notificationType}
								onChange={(notificationType) => saveSettings({ ...settings, notificationType })}
								options={[
									{ value: "banner", label: "Bannière" },
									{ value: "sound", label: "Son" },
									{ value: "both", label: "Les deux" },
								]}
							/>
						}
					/>
				) : null}
			</Section>

			<Section title="Changements de planning">
				<Row
					icon={CalendarClock}
					title="Cours modifiés"
					subtitle="Prévenir quand un cours change"
					toggle={{ value: settings.changeDetectionEnabled, onValueChange: (changeDetectionEnabled) => saveSettings({ ...settings, changeDetectionEnabled }) }}
				/>
				{settings.changeDetectionEnabled ? (
					<Row
						icon={CalendarDays}
						title="Période surveillée"
						trailing={
							<Stepper
								label="la période"
								value={`${settings.changeDetectionWindowDays} j`}
								onDecrease={() => saveSettings({ ...settings, changeDetectionWindowDays: Math.max(1, settings.changeDetectionWindowDays - 1) })}
								onIncrease={() => saveSettings({ ...settings, changeDetectionWindowDays: Math.min(14, settings.changeDetectionWindowDays + 1) })}
							/>
						}
					/>
				) : null}
			</Section>

			{Platform.OS === "android" ? (
				<Section title="Pendant le cours">
					<Row
						icon={Radio}
						title="Progression du cours"
						subtitle="Notification persistante pendant le cours"
						toggle={{ value: liveCourseProgressEnabled, onValueChange: (enabled) => void toggleLiveCourseProgress(enabled) }}
					/>
				</Section>
			) : null}

			<PrimaryButton label="Tester une notification" icon={Send} onPress={test} loading={loading} />
			<Text style={[s.status, { color: theme.muted }]}>{message}</Text>
		</ScrollView>
	);
}

const s = StyleSheet.create({
	textButton: { fontSize: 15, fontWeight: "800" },
	days: { flexDirection: "row", gap: 6 },
	day: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	dayText: { fontSize: 13, fontWeight: "800" },
	status: { fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 12, paddingHorizontal: 16 },
});

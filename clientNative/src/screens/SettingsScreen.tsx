import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
	BellRing,
	Bug,
	ChevronRight,
	Clock,
	Code2,
	Download,
	Info,
	LogOut,
	Moon,
	RefreshCw,
	RotateCcw,
	Send,
	Shield,
	ShieldCheck,
	Smartphone,
	Square,
	Sun,
	Trash2,
	User,
} from "lucide-react-native";
import Card from "../components/Card";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useVersion } from "../context/VersionContext";
import { registerExpoPushToken } from "../services/api";
import { registerPlanningNotificationBackgroundSync } from "../services/backgroundSync";
import { rescheduleCourseNoteReminders } from "../services/courseNotes";
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

export default function SettingsScreen() {
	const { logout, session } = useAuth();
	const { theme, mode, resolvedMode, setThemeMode, materialYouEnabled, materialYouAvailable, materialYouActive, setMaterialYouEnabled } = useTheme();
	const { currentVersion, latestVersion, updateAvailable, checking, error, lastCheckedAt, checkForUpdates, openLatestRelease } = useVersion();
	const [liveCourseProgressEnabled, setLiveCourseProgressEnabled] = useState(true);
	const [notificationDebugSettings, setNotificationDebugSettingsState] = useState(defaultNotificationDebugSettings);
	const [debugBusyAction, setDebugBusyAction] = useState<string | null>(null);
	const [debugStatus, setDebugStatus] = useState("");
	const [scheduledNotifications, setScheduledNotifications] = useState<ScheduledNotificationItem[]>([]);
	const [scheduledNotificationsLoading, setScheduledNotificationsLoading] = useState(false);
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
	}, []);

	useFocusEffect(
		useCallback(() => {
			getDeletedRealEventsCount()
				.then(setDeletedEventsCount)
				.catch(() => {});
			getRequiredAppPermissions()
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

		await scheduleLocalCourseNotifications(cachedSchedule.activeEvents, notificationSettings.minutesBefore, notificationSettings.selectedDays, notificationSettings.notificationType, {
			requestPermission: false,
		}).catch(() => {});
		await registerPlanningNotificationBackgroundSync().catch(() => {});
		if (!userId) return;
		const token = await requestPushToken().catch(() => null);
		if (token) await registerExpoPushToken(token, userId, groups, notificationSettings).catch(() => {});
	};

	const requestMissingPermissions = async () => {
		setPermissionsLoading(true);
		try {
			const result = await requestRequiredAppPermissions();
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
		<ScrollView style={[s.root, { backgroundColor: theme.bg }]} contentContainerStyle={s.content}>
			<View style={s.header}>
				<View style={s.headerText}>
					<Text style={[s.eyebrow, { color: theme.accent }]}>PROFIL & PRÉFÉRENCES</Text>
					<Text style={[s.title, { color: theme.text }]}>Réglages</Text>
				</View>
			</View>

			<Card style={s.profileCard} glow={true} accent>
				<View style={[s.avatar, { backgroundColor: theme.bg }]}>
					<User color={theme.accent} size={28} />
				</View>
				<View style={s.profileText}>
					<Text style={[s.name, { color: theme.text }]} numberOfLines={1}>
						{account?.displayName || "Microsoft Account"}
					</Text>
					<Text style={[s.meta, { color: theme.text, opacity: 0.7 }]} numberOfLines={1}>
						{account?.userPrincipalName || account?.mail || "Connecté avec succès"}
					</Text>
				</View>
			</Card>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>APPARENCE</Text>
			<Card style={s.settingCard} variant="default" glow={false}>
				<View style={s.settingHeader}>
					<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
						{mode === "system" ? (
							<Smartphone color={theme.accent} size={20} />
						) : resolvedMode === "dark" ? (
							<Moon color={theme.accent} size={20} />
						) : (
							<Sun color={theme.accent} size={20} />
						)}
					</View>
					<View style={s.settingBody}>
						<Text style={[s.settingTitle, { color: theme.text }]}>Mode {modeLabel}</Text>
						<Text style={[s.meta, { color: theme.muted }]}>Système, clair ou sombre</Text>
					</View>
				</View>
				<View style={s.modeOptions}>
					{[
						{ value: "system" as const, label: "Système" },
						{ value: "light" as const, label: "Clair" },
						{ value: "dark" as const, label: "Sombre" },
					].map((item) => {
						const active = mode === item.value;
						return (
							<Pressable
								key={item.value}
								onPress={() => void setThemeMode(item.value)}
								style={({ pressed }) => [
									s.modeOption,
									{
										backgroundColor: active ? theme.accent : pressed ? theme.surfaceSoft : theme.bg,
										borderColor: active ? theme.accent : theme.border,
									},
								]}>
								<Text style={[s.modeOptionLabel, { color: active ? "#fff" : theme.text }]}>{item.label}</Text>
							</Pressable>
						);
					})}
				</View>
			</Card>
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					<Smartphone color={theme.accent} size={20} />
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Material You</Text>
					<Text style={[s.meta, { color: theme.muted }]}>{materialYouDetails}</Text>
				</View>
				<Switch
					value={materialYouEnabled}
					onValueChange={(enabled) => void setMaterialYouEnabled(enabled)}
					thumbColor={theme.accent}
					trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
				/>
			</Card>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>COURS EN DIRECT</Text>
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					<BellRing color={theme.accent} size={20} />
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Notification persistante</Text>
					<Text style={[s.meta, { color: theme.muted }]}>Progression du cours en direct via une notification persistante</Text>
				</View>
				<Switch
					value={liveCourseProgressEnabled}
					onValueChange={(enabled) => void toggleLiveCourseProgress(enabled)}
					thumbColor={theme.accent}
					trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
				/>
			</Card>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>PERMISSIONS</Text>
			<View style={s.group}>
				<Action
					icon={permissionsLoading ? <ActivityIndicator color={theme.accent} /> : <ShieldCheck color={theme.accent} size={20} />}
					label={
						permissionsLoading
							? "Vérification des permissions"
							: !permissionsKnown
								? "Vérifier les permissions"
								: missingPermissionsCount
									? `Redemander ${missingPermissionsCount} permission${missingPermissionsCount > 1 ? "s" : ""}`
									: "Toutes les permissions accordées"
					}
					onPress={() => void requestMissingPermissions()}
					disabled={permissionsLoading || (permissionsKnown && !missingPermissionsCount)}
				/>
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>AGENDA</Text>
			<View style={s.group}>
				<Action
					icon={<RotateCcw color={theme.accent} size={20} />}
					label={deletedEventsCount ? `Restaurer ${deletedEventsCount} cours supprimé${deletedEventsCount > 1 ? "s" : ""} ou ignoré${deletedEventsCount > 1 ? "s" : ""}` : "Aucun cours à restaurer"}
					onPress={() => void restoreEvents()}
					disabled={!deletedEventsCount}
				/>
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>APPLICATION</Text>
			<View style={s.group}>
				<Card style={s.versionCard} variant="default" glow={false} accent={updateAvailable} accentColor={theme.warn}>
					<View style={s.infoHeader}>
						<View style={[s.iconBox, { backgroundColor: updateAvailable ? "rgba(245, 158, 11, 0.14)" : theme.surfaceSoft }]}>
							<Smartphone color={updateAvailable ? theme.warn : theme.accent} size={20} />
						</View>
						<View style={s.settingBody}>
							<Text style={[s.infoTitle, { color: theme.text }]}>{versionStatus}</Text>
							<Text style={[s.meta, { color: theme.muted }]}>{versionDetails}</Text>
						</View>
					</View>
					{updateAvailable ? (
						<Pressable
							onPress={() => void openLatestRelease()}
							style={({ pressed }) => [s.downloadButton, { backgroundColor: theme.warn, opacity: pressed ? 0.82 : 1 }]}>
							<Download color="#fff" size={18} />
							<Text style={s.downloadText}>Télécharger la version correcte</Text>
						</Pressable>
					) : null}
				</Card>

				<Action
					icon={checking ? <ActivityIndicator color={theme.accent} /> : <RefreshCw color={theme.accent} size={20} />}
					label={checking ? "Vérification en cours" : "Vérifier les mises à jour"}
					onPress={() => void checkForUpdates(true)}
					disabled={checking}
				/>
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>INFORMATIONS</Text>
			<View style={s.group}>
				<Card style={s.infoCard} variant="default" glow={false}>
					<View style={s.infoHeader}>
						<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
							<Shield color={theme.accent} size={20} />
						</View>
						<Text style={[s.infoTitle, { color: theme.text }]}>Confidentialité</Text>
					</View>
					<Text style={[s.meta, { color: theme.muted }]}>
						Authentification Microsoft EPITA. Les groupes, la session et les préférences sont stockés localement sur votre appareil.
					</Text>
				</Card>

				<Card style={s.infoCard} variant="default" glow={false}>
					<View style={s.infoHeader}>
						<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
							<Info color={theme.accent} size={20} />
						</View>
						<Text style={[s.infoTitle, { color: theme.text }]}>Avertissement</Text>
					</View>
					<Text style={[s.meta, { color: theme.muted }]}>EpiTime est un projet étudiant indépendant, non affilié à Zeus, IONIS Education Group ou EPITA.</Text>
				</Card>
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>DÉVELOPPEUR</Text>
			<View style={s.group}>
				<Action
					icon={<Bug color={theme.accent} size={20} />}
					label="Signaler un bug"
					onPress={() => Linking.openURL("https://github.com/alexistb2904/EpiTime/issues/new")}
				/>
				<Action icon={<Code2 color={theme.accent} size={20} />} label="Code source GitHub" onPress={() => Linking.openURL("https://github.com/alexistb2904/EpiTime")} />
			</View>

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>DEBUG NOTIFICATIONS</Text>
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					<Bug color={theme.accent} size={20} />
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Mode debug notifications</Text>
					<Text style={[s.meta, { color: theme.muted }]}>Jouer avec les notifications programmées et progression</Text>
				</View>
				<Switch
					value={notificationDebugSettings.enabled}
					onValueChange={(enabled) => void saveNotificationDebugSettings({ ...notificationDebugSettings, enabled })}
					thumbColor={theme.accent}
					trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }}
				/>
			</Card>
			{notificationDebugSettings.enabled ? (
				<View style={s.group}>
					<Card style={s.debugCard} variant="default" glow={false}>
						<View style={s.infoHeader}>
							<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
								<Clock color={theme.accent} size={20} />
							</View>
							<View style={s.settingBody}>
								<Text style={[s.infoTitle, { color: theme.text }]}>Scénario cible</Text>
								<Text style={[s.meta, { color: theme.muted }]}>Prochaine cible : {debugTargetLabel}</Text>
							</View>
						</View>
						<View style={s.debugStepperGrid}>
							<DebugStepper
								label="Heure"
								value={String(notificationDebugSettings.targetHour).padStart(2, "0")}
								onDecrease={() => updateDebugSettings({ targetHour: wrapNumber(notificationDebugSettings.targetHour - 1, 0, 23) })}
								onIncrease={() => updateDebugSettings({ targetHour: wrapNumber(notificationDebugSettings.targetHour + 1, 0, 23) })}
							/>
							<DebugStepper
								label="Minute"
								value={String(notificationDebugSettings.targetMinute).padStart(2, "0")}
								onDecrease={() => updateDebugSettings({ targetMinute: wrapNumber(notificationDebugSettings.targetMinute - 1, 0, 59) })}
								onIncrease={() => updateDebugSettings({ targetMinute: wrapNumber(notificationDebugSettings.targetMinute + 1, 0, 59) })}
							/>
							<DebugStepper
								label="Durée"
								value={`${notificationDebugSettings.progressDurationMinutes} min`}
								onDecrease={() => updateDebugSettings({ progressDurationMinutes: Math.max(1, notificationDebugSettings.progressDurationMinutes - 15) })}
								onIncrease={() => updateDebugSettings({ progressDurationMinutes: Math.min(240, notificationDebugSettings.progressDurationMinutes + 15) })}
							/>
						</View>
						{debugStatus ? <Text style={[s.debugStatus, { color: theme.text }]}>{debugStatus}</Text> : null}
					</Card>
					<Action
						icon={debugBusyAction === "local" ? <ActivityIndicator color={theme.accent} /> : <Send color={theme.accent} size={20} />}
						label="Programmer une notification à l'heure cible"
						onPress={scheduleDebugLocal}
						disabled={!!debugBusyAction}
					/>
					<Action
						icon={debugBusyAction === "progress" ? <ActivityIndicator color={theme.accent} /> : <BellRing color={theme.accent} size={20} />}
						label="Programmer une progression fake à l'heure cible"
						onPress={scheduleDebugProgress}
						disabled={!!debugBusyAction}
					/>
					<Action
						icon={debugBusyAction === "showProgress" ? <ActivityIndicator color={theme.accent} /> : <Clock color={theme.accent} size={20} />}
						label="Afficher une progression fake maintenant"
						onPress={showDebugProgress}
						disabled={!!debugBusyAction}
					/>
					<Action
						icon={debugBusyAction === "clear" ? <ActivityIndicator color={theme.accent} /> : <Square color={theme.accent} size={20} />}
						label="Annuler les scénarios debug"
						onPress={clearDebugNotifications}
						disabled={!!debugBusyAction}
					/>
					<Card style={s.debugCard} variant="default" glow={false}>
						<View style={s.scheduledHeader}>
							<View style={s.settingBody}>
								<Text style={[s.infoTitle, { color: theme.text }]}>Notifications programmées</Text>
								<Text style={[s.meta, { color: theme.muted }]}>
									{scheduledNotificationsLoading
										? "Chargement..."
										: `${scheduledNotifications.length} notification${scheduledNotifications.length > 1 ? "s" : ""} locale${scheduledNotifications.length > 1 ? "s" : ""}`}
								</Text>
							</View>
							<Pressable
								onPress={() => void refreshScheduledNotifications()}
								disabled={scheduledNotificationsLoading || !!debugBusyAction}
								style={({ pressed }) => [s.iconAction, { backgroundColor: pressed ? theme.surfaceSoft : theme.bg, borderColor: theme.border }]}>
								{scheduledNotificationsLoading ? <ActivityIndicator color={theme.accent} /> : <RefreshCw color={theme.accent} size={18} />}
							</Pressable>
							<Pressable
								onPress={deleteAllScheduledNotifications}
								disabled={!scheduledNotifications.length || !!debugBusyAction}
								style={({ pressed }) => [
									s.iconAction,
									{
										backgroundColor: pressed ? theme.surfaceSoft : theme.bg,
										borderColor: theme.border,
										opacity: !scheduledNotifications.length || debugBusyAction ? 0.5 : 1,
									},
								]}>
								<Trash2 color={theme.danger} size={18} />
							</Pressable>
						</View>
						<View style={s.scheduledList}>
							{scheduledNotifications.length ? (
								scheduledNotifications.map((notification) => (
									<ScheduledNotificationRow
										key={notification.id}
										notification={notification}
										disabled={!!debugBusyAction}
										onDelete={() => deleteScheduledNotification(notification)}
									/>
								))
							) : (
								<Text style={[s.meta, { color: theme.muted }]}>Aucune notification locale programmée.</Text>
							)}
						</View>
					</Card>
				</View>
			) : null}

			<View style={s.footer}>
				<Pressable onPress={logout} style={({ pressed }) => [s.logoutButton, { backgroundColor: theme.danger, opacity: pressed ? 0.8 : 1 }]}>
					<LogOut color="#fff" size={20} />
					<Text style={s.logoutText}>Se déconnecter</Text>
				</Pressable>
				<View style={s.brandFooter}>
					<Text style={[s.versionText, { color: theme.muted }]}>EpiTime • Made by Alexis Thierry-Bellefond</Text>
				</View>
			</View>
		</ScrollView>
	);
}

function ScheduledNotificationRow({ notification, disabled, onDelete }: { notification: ScheduledNotificationItem; disabled: boolean; onDelete: () => void }) {
	const { theme } = useTheme();
	return (
		<View style={[s.scheduledRow, { borderColor: theme.border, backgroundColor: theme.bg }]}>
			<View style={s.settingBody}>
				<Text style={[s.scheduledTitle, { color: theme.text }]} numberOfLines={1}>
					{notification.title}
				</Text>
				{notification.body ? (
					<Text style={[s.scheduledBody, { color: theme.muted }]} numberOfLines={2}>
						{notification.body}
					</Text>
				) : null}
				<Text style={[s.scheduledMeta, { color: theme.muted }]} numberOfLines={1}>
					{notification.trigger} · {notification.type}
				</Text>
			</View>
			<Pressable
				onPress={onDelete}
				disabled={disabled}
				style={({ pressed }) => [s.iconAction, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface, borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}>
				<Trash2 color={theme.danger} size={18} />
			</Pressable>
		</View>
	);
}

function DebugStepper({ label, value, onDecrease, onIncrease }: { label: string; value: string; onDecrease: () => void; onIncrease: () => void }) {
	const { theme } = useTheme();
	return (
		<View style={[s.debugStepper, { borderColor: theme.border, backgroundColor: theme.bg }]}>
			<Text style={[s.debugStepperLabel, { color: theme.muted }]}>{label}</Text>
			<View style={s.debugStepperControls}>
				<Pressable style={({ pressed }) => [s.debugStepButton, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]} onPress={onDecrease}>
					<Text style={[s.debugStepText, { color: theme.text }]}>-</Text>
				</Pressable>
				<Text style={[s.debugStepperValue, { color: theme.text }]}>{value}</Text>
				<Pressable style={({ pressed }) => [s.debugStepButton, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface }]} onPress={onIncrease}>
					<Text style={[s.debugStepText, { color: theme.text }]}>+</Text>
				</Pressable>
			</View>
		</View>
	);
}

function Action({ icon, label, onPress, disabled = false }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
	const { theme } = useTheme();
	return (
		<Pressable
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [s.actionItem, { backgroundColor: pressed ? theme.surfaceSoft : theme.surface, borderColor: theme.border, opacity: disabled ? 0.65 : 1 }]}>
			<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>{icon}</View>
			<Text style={[s.actionText, { color: theme.text }]}>{label}</Text>
			<ChevronRight color={theme.muted} size={20} />
		</Pressable>
	);
}

function buildNextDebugTargetDate(hour: number, minute: number) {
	const target = new Date();
	target.setHours(hour, minute, 0, 0);
	if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
	return target;
}

function formatDebugTargetDate(date: Date) {
	const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
	const day = date.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" });
	return `${day} à ${time}`;
}

function wrapNumber(value: number, min: number, max: number) {
	const range = max - min + 1;
	return ((((value - min) % range) + range) % range) + min;
}

const s = StyleSheet.create({
	root: { flex: 1 },
	content: { padding: 20, paddingTop: 60, paddingBottom: 120 },
	header: { marginBottom: 24 },
	headerText: { gap: 4 },
	eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1 },
	title: { fontSize: 34, fontWeight: "900", letterSpacing: -0.5 },

	profileCard: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 32, padding: 20 },
	avatar: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
	profileText: { flex: 1, gap: 4 },
	name: { fontSize: 19, fontWeight: "800" },

	sectionHeader: { fontSize: 12, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 12, paddingLeft: 4 },
	group: { gap: 12, marginBottom: 24 },

	settingCard: { gap: 16, marginBottom: 12 },
	settingHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
	settingRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
	iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
	settingBody: { flex: 1, gap: 2 },
	settingTitle: { fontWeight: "800", fontSize: 16 },
	modeOptions: { flexDirection: "row", gap: 8 },
	modeOption: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
	modeOptionLabel: { fontSize: 13, fontWeight: "800" },

	infoCard: { padding: 20 },
	infoHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
	infoTitle: { fontSize: 17, fontWeight: "800" },
	versionCard: { padding: 20 },
	debugCard: { padding: 20, gap: 14 },
	debugStepperGrid: { gap: 10 },
	debugStepper: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
	debugStepperLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
	debugStepperControls: { flexDirection: "row", alignItems: "center", gap: 10 },
	debugStepButton: { width: 40, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
	debugStepText: { fontSize: 20, fontWeight: "900" },
	debugStepperValue: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "900" },
	debugStatus: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
	scheduledHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
	iconAction: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	scheduledList: { gap: 10 },
	scheduledRow: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
	scheduledTitle: { fontSize: 15, fontWeight: "900" },
	scheduledBody: { marginTop: 4, fontSize: 13, lineHeight: 18 },
	scheduledMeta: { marginTop: 6, fontSize: 12, fontWeight: "700" },
	downloadButton: {
		minHeight: 48,
		borderRadius: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 9,
		marginTop: 6,
	},
	downloadText: { color: "#fff", fontSize: 15, fontWeight: "900" },

	actionItem: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 16 },
	actionText: { flex: 1, fontSize: 16, fontWeight: "700" },

	meta: { fontSize: 14, lineHeight: 20 },

	footer: { marginTop: 20, gap: 24 },
	logoutButton: {
		minHeight: 56,
		borderRadius: 16,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		elevation: 2,
		shadowColor: "#000",
		shadowOpacity: 0.1,
		shadowRadius: 8,
		shadowOffset: { width: 0, height: 4 },
	},
	logoutText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },

	brandFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: 0.7 },
	versionText: { fontSize: 13, fontWeight: "600" },
});

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { BellRing, Bug, CheckCircle2, Clock, PlayCircle, Send, Square } from "lucide-react-native";
import Card from "../components/Card";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { registerExpoPushToken, sendMobileTestNotification } from "../services/api";
import { showDebugLiveCourseNotification, stopLiveCourseNotification } from "../services/liveCourse";
import {
	clearLocalCourseNotifications,
	defaultNotificationSettings,
	getNotificationSettings,
	NotificationSettings,
	requestPushToken,
	scheduleLocalCourseNotifications,
	sendDebugCourseReminderNotification,
	sendLocalTestNotification,
	setNotificationSettings,
} from "../services/notifications";
import { getJSON, setJSON } from "../services/storage";
import { daysOfWeek } from "../utils/calendar";
import { ZeusEvent } from "../types";

const NOTIFICATION_DEBUG_MODE_KEY = "notificationDebugMode";

export default function NotificationsScreen() {
	const { theme } = useTheme();
	const { session } = useAuth();
	const [settings, setSettings] = useState(defaultNotificationSettings);
	const [debugMode, setDebugMode] = useState(false);
	const [message, setMessage] = useState("Les rappels locaux sont planifiés après chaque synchronisation de l'agenda.");
	const [loading, setLoading] = useState(false);
	const [debugLoading, setDebugLoading] = useState<string | null>(null);
	const account = session?.account as { id?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
	const userId = account?.id || account?.userPrincipalName || account?.mail || "";

	useEffect(() => {
		getNotificationSettings()
			.then(setSettings)
			.catch(() => {});
		getJSON<boolean>(NOTIFICATION_DEBUG_MODE_KEY, false)
			.then(setDebugMode)
			.catch(() => {});
	}, []);

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
		const events = await getJSON<ZeusEvent[]>("lastEvents", []);
		if (next.enabled) await scheduleLocalCourseNotifications(events, next.minutesBefore, next.selectedDays);
		else await clearLocalCourseNotifications();
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
			setMessage("Notifications activées pour cet appareil.");
		} catch (err: any) {
			setMessage("Activation échouée : " + (err?.message || "erreur inconnue"));
		} finally {
			setLoading(false);
		}
	};

	const test = async () => {
		if (!userId) return setMessage("Profil Microsoft indisponible.");
		setLoading(true);
		try {
			await sendLocalTestNotification();
			try {
				await sendMobileTestNotification(userId);
				setMessage("Notification de test envoyée.");
			} catch (err: any) {
				if (err?.status === 404) {
					await ensureRemoteSubscription();
					await sendMobileTestNotification(userId);
					setMessage("Notification locale envoyée, push distant réinitialisé puis testé.");
				} else {
					throw err;
				}
			}
		} catch (err: any) {
			setMessage("Test échoué : " + (err?.message || "erreur inconnue"));
		} finally {
			setLoading(false);
		}
	};

	const toggleDay = (day: number) => {
		const selectedDays = settings.selectedDays.includes(day) ? settings.selectedDays.filter((value) => value !== day) : [...settings.selectedDays, day];
		saveSettings({ ...settings, selectedDays });
	};

	const toggleDebugMode = async (enabled: boolean) => {
		setDebugMode(enabled);
		await setJSON(NOTIFICATION_DEBUG_MODE_KEY, enabled);
		setMessage(enabled ? "Mode debug activé : les notifications peuvent être déclenchées manuellement." : "Mode debug désactivé.");
	};

	const runDebugAction = async (actionId: string, successMessage: string, action: () => Promise<boolean | void>) => {
		setDebugLoading(actionId);
		try {
			const result = await action();
			setMessage(result === false ? "Action debug indisponible sur cette plateforme ou permission refusée." : successMessage);
		} catch (err: any) {
			setMessage("Action debug échouée : " + (err?.message || "erreur inconnue"));
		} finally {
			setDebugLoading(null);
		}
	};

	const renderDebugButton = (id: string, label: string, detail: string, icon: React.ReactNode, onPress: () => void) => {
		const disabled = !debugMode || loading || !!debugLoading;
		return (
			<Pressable
				key={id}
				disabled={disabled}
				onPress={onPress}
				style={[
					s.debugButton,
					{ backgroundColor: debugMode ? theme.surfaceSoft : theme.bg, borderColor: theme.border, opacity: disabled && debugLoading !== id ? 0.58 : 1 },
				]}>
				<View style={s.debugButtonHeader}>
					{debugLoading === id ? <ActivityIndicator color={theme.accent} /> : icon}
					<Text style={[s.debugButtonTitle, { color: theme.text }]}>{label}</Text>
				</View>
				<Text style={[s.debugButtonDetail, { color: theme.muted }]}>{detail}</Text>
			</Pressable>
		);
	};

	return (
		<ScrollView style={[s.root, { backgroundColor: theme.bg }]} contentContainerStyle={s.content}>
			<Text style={[s.eyebrow, { color: theme.accent }]}>Notifications</Text>
			<Text style={[s.title, { color: theme.text }]}>Rappels de cours</Text>

			<Card style={s.rowCard}>
				<View style={[s.iconBox, { backgroundColor: theme.accentSoft }]}>
					<BellRing color={theme.accent} size={22} />
				</View>
				<View style={s.rowBody}>
					<Text style={[s.rowTitle, { color: theme.text }]}>Activer les alertes</Text>
					<Text style={[s.meta, { color: theme.muted }]}>Notifications de vos cours</Text>
				</View>
				<Switch value={settings.enabled} onValueChange={(enabled) => (enabled ? enableRemote() : saveSettings({ ...settings, enabled }))} thumbColor={theme.accent} />
			</Card>

			<Card>
				<View style={s.rowHeader}>
					<Clock color={theme.accent} size={20} />
					<Text style={[s.sectionTitle, { color: theme.text }]}>Alerter avant</Text>
				</View>
				<View style={s.stepper}>
					<Pressable
						style={[s.stepBtn, { borderColor: theme.border }]}
						onPress={() => saveSettings({ ...settings, minutesBefore: Math.max(1, settings.minutesBefore - 5) })}>
						<Text style={[s.stepText, { color: theme.text }]}>-</Text>
					</Pressable>
					<Text style={[s.minutes, { color: theme.text }]}>{settings.minutesBefore} min</Text>
					<Pressable
						style={[s.stepBtn, { borderColor: theme.border }]}
						onPress={() => saveSettings({ ...settings, minutesBefore: Math.min(120, settings.minutesBefore + 5) })}>
						<Text style={[s.stepText, { color: theme.text }]}>+</Text>
					</Pressable>
				</View>
			</Card>

			<Card>
				<Text style={[s.sectionTitle, { color: theme.text }]}>Type de notification</Text>
				<View style={s.typeRow}>
					{[
						{ value: "banner" as const, label: "Bannière" },
						{ value: "sound" as const, label: "Son" },
						{ value: "both" as const, label: "Les deux" },
					].map((item) => {
						const active = settings.notificationType === item.value;
						return (
							<Pressable
								key={item.value}
								style={[s.typeChip, { backgroundColor: active ? theme.accent : theme.surfaceSoft, borderColor: theme.border }]}
								onPress={() => saveSettings({ ...settings, notificationType: item.value })}>
								<Text style={[s.typeText, { color: active ? "#fff" : theme.text }]}>{item.label}</Text>
							</Pressable>
						);
					})}
				</View>
			</Card>

			<Card>
				<Text style={[s.sectionTitle, { color: theme.text }]}>Jours d'alerte</Text>
				<View style={s.days}>
					{daysOfWeek.map((day) => {
						const active = settings.selectedDays.includes(day.value);
						return (
							<Pressable
								key={day.value}
								onPress={() => toggleDay(day.value)}
								style={[s.day, { backgroundColor: active ? theme.accent : theme.surfaceSoft, borderColor: theme.border }]}>
								<Text style={[s.dayText, { color: active ? "#fff" : theme.text }]}>{day.label}</Text>
							</Pressable>
						);
					})}
				</View>
				<View style={s.quickRow}>
					<Pressable onPress={() => saveSettings({ ...settings, selectedDays: [0, 1, 2, 3, 4, 5, 6] })}>
						<Text style={[s.link, { color: theme.accent }]}>Tous</Text>
					</Pressable>
					<Pressable onPress={() => saveSettings({ ...settings, selectedDays: [] })}>
						<Text style={[s.link, { color: theme.accent }]}>Aucun</Text>
					</Pressable>
				</View>
			</Card>

			<Card>
				<View style={s.rowHeader}>
					<CheckCircle2 color={theme.accent} size={20} />
					<Text style={[s.sectionTitle, { color: theme.text }]}>Résumé</Text>
				</View>
				<Text style={[s.meta, { color: theme.muted }]}>
					Notification {settings.minutesBefore} minutes avant chaque cours, sur{" "}
					{settings.selectedDays.length === 7 ? "tous les jours" : `${settings.selectedDays.length} jour(s)`}.
				</Text>
				<Text style={[s.status, { color: theme.text }]}>{message}</Text>
			</Card>

			{/* <Card>
				<View style={s.debugModeHeader}>
					<View style={s.rowHeaderNoMargin}>
						<Bug color={theme.accent} size={20} />
						<View>
							<Text style={[s.sectionTitle, { color: theme.text }]}>Mode debug</Text>
							<Text style={[s.meta, { color: theme.muted }]}>Déclenchement manuel des notifications.</Text>
						</View>
					</View>
					<Switch value={debugMode} onValueChange={(enabled) => void toggleDebugMode(enabled)} thumbColor={theme.accent} />
				</View>
				{debugMode ? (
					<View style={s.debugGrid}>
						{renderDebugButton(
							"local-test",
							"Test locale",
							"Notification simple immédiate",
							<Send color={theme.accent} size={18} />,
							() => void runDebugAction("local-test", "Notification locale debug envoyée.", sendLocalTestNotification)
						)}
						{renderDebugButton(
							"course-reminder",
							"Rappel cours",
							"Simulation du rappel avant cours",
							<BellRing color={theme.accent} size={18} />,
							() =>
								void runDebugAction("course-reminder", "Rappel de cours debug envoyé.", () =>
									sendDebugCourseReminderNotification(settings.minutesBefore)
								)
						)}
						{renderDebugButton(
							"remote-push",
							"Push distant",
							"Réinscrit l'appareil puis teste l'API",
							<PlayCircle color={theme.accent} size={18} />,
							() =>
								void runDebugAction("remote-push", "Push distant debug envoyé.", async () => {
									if (!userId) throw new Error("Profil Microsoft indisponible.");
									await ensureRemoteSubscription();
									await sendMobileTestNotification(userId);
								})
						)}
						{renderDebugButton(
							"live-course",
							"Persistante",
							"Notification de cours en direct Android",
							<Clock color={theme.accent} size={18} />,
							() => void runDebugAction("live-course", "Notification persistante debug affichée.", () => showDebugLiveCourseNotification(64))
						)}
						{renderDebugButton(
							"stop-live-course",
							"Stop persistante",
							"Supprime la notification en direct",
							<Square color={theme.accent} size={18} />,
							() => void runDebugAction("stop-live-course", "Notification persistante debug arrêtée.", stopLiveCourseNotification)
						)}
					</View>
				) : (
					<Text style={[s.debugHint, { color: theme.muted }]}>Active le mode debug pour afficher les actions manuelles.</Text>
				)}
			</Card> */}

			<Pressable onPress={test} disabled={loading} style={[s.primaryBtn, { backgroundColor: theme.accent }]}>
				{loading ? <ActivityIndicator color="#fff" /> : <Send color="#fff" size={18} />}
				<Text style={s.primaryText}>Tester une notification</Text>
			</Pressable>
		</ScrollView>
	);
}
const s = StyleSheet.create({
	root: { flex: 1 },
	content: { padding: 18, paddingTop: 58, paddingBottom: 108, gap: 12 },
	eyebrow: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	title: { fontSize: 32, fontWeight: "900", letterSpacing: 0, marginBottom: 6 },
	rowCard: { flexDirection: "row", alignItems: "center", gap: 12 },
	iconBox: { width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
	rowBody: { flex: 1 },
	rowTitle: { fontSize: 16, fontWeight: "900" },
	meta: { marginTop: 5, lineHeight: 19 },
	rowHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
	rowHeaderNoMargin: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
	sectionTitle: { fontSize: 17, fontWeight: "900" },
	stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
	stepBtn: { width: 44, height: 42, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	stepText: { fontSize: 22, fontWeight: "900" },
	minutes: { flex: 1, textAlign: "center", fontSize: 22, fontWeight: "900" },
	days: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	day: { width: 58, height: 42, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
	dayText: { fontWeight: "900" },
	typeRow: { flexDirection: "row", gap: 8 },
	typeChip: { flex: 1, minHeight: 42, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
	typeText: { fontWeight: "900", fontSize: 13 },
	quickRow: { flexDirection: "row", gap: 18, marginTop: 12 },
	link: { fontWeight: "900" },
	status: { marginTop: 12, fontWeight: "800", lineHeight: 20 },
	debugModeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
	debugGrid: { gap: 10, marginTop: 14 },
	debugButton: { minHeight: 72, borderRadius: 10, borderWidth: 1, padding: 12, justifyContent: "center" },
	debugButtonHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
	debugButtonTitle: { fontSize: 15, fontWeight: "900" },
	debugButtonDetail: { marginTop: 6, lineHeight: 18, fontSize: 13 },
	debugHint: { marginTop: 12, lineHeight: 19 },
	primaryBtn: { minHeight: 52, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
	primaryText: { color: "#fff", fontWeight: "900" },
});

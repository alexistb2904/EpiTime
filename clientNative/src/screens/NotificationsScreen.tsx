import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { BellRing, CheckCircle2, Clock, Send } from "lucide-react-native";
import Card from "../components/Card";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { registerExpoPushToken, sendMobileTestNotification } from "../services/api";
import { registerPlanningNotificationBackgroundSync } from "../services/backgroundSync";
import { rescheduleCourseNoteReminders } from "../services/courseNotes";
import {
	clearLocalCourseNotifications,
	defaultNotificationSettings,
	getNotificationSettings,
	NotificationSettings,
	requestPushToken,
	scheduleLocalCourseNotifications,
	sendLocalTestNotification,
	setNotificationSettings,
} from "../services/notifications";
import { getJSON } from "../services/storage";
import { daysOfWeek } from "../utils/calendar";
import { ZeusEvent } from "../types";

export default function NotificationsScreen() {
	const { theme } = useTheme();
	const { session } = useAuth();
	const [settings, setSettings] = useState(defaultNotificationSettings);
	const [message, setMessage] = useState("Les rappels locaux sont planifiés après chaque synchronisation de l'agenda.");
	const [loading, setLoading] = useState(false);
	const account = session?.account as { id?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
	const userId = account?.id || account?.userPrincipalName || account?.mail || "";

	useEffect(() => {
		getNotificationSettings()
			.then(setSettings)
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
		await rescheduleCourseNoteReminders(events);
		if (next.enabled) {
			await scheduleLocalCourseNotifications(events, next.minutesBefore, next.selectedDays, next.notificationType);
			await registerPlanningNotificationBackgroundSync();
		} else {
			await clearLocalCourseNotifications();
			await registerPlanningNotificationBackgroundSync();
		}
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
	primaryBtn: { minHeight: 52, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
	primaryText: { color: "#fff", fontWeight: "900" },
});

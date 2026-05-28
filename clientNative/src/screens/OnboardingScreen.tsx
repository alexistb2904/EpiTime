import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp, Layout, SlideInRight } from "react-native-reanimated";
import { BellRing, CalendarDays, Check, DoorOpen, LogOut, Search, ShieldCheck, Users } from "lucide-react-native";
import Card from "../components/Card";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getEvents, getGroups, registerExpoPushToken } from "../services/api";
import { registerPlanningNotificationBackgroundSync } from "../services/backgroundSync";
import { rescheduleCourseNoteReminders } from "../services/courseNotes";
import { getNotificationSettings, requestPushToken, scheduleLocalCourseNotifications, setNotificationSettings } from "../services/notifications";
import { requestRequiredAppPermissions } from "../services/permissions";
import { getJSON, setJSON } from "../services/storage";
import { syncCourseWidgets } from "../services/widgets";
import { Group, ZeusEvent } from "../types";
import { startOfDay } from "../utils/calendar";

type Props = {
	onDone: () => void;
};

const features = [
	{ icon: CalendarDays, title: "Agenda synchronisé", text: "Vues semaine, jour et liste avec détails de cours." },
	{ icon: DoorOpen, title: "Salles libres", text: "Recherche rapide par durée, capacité et localisation." },
	{ icon: BellRing, title: "Rappels", text: "Notifications avant les cours sur les jours choisis." },
];

export default function OnboardingScreen({ onDone }: Props) {
	const { theme } = useTheme();
	const { logout, session } = useAuth();
	const [step, setStep] = useState<"intro" | "groups">("intro");
	const [groups, setGroups] = useState<Group[]>([]);
	const [selected, setSelected] = useState<(string | number)[]>([]);
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const account = session?.account as { id?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
	const userId = account?.id || account?.userPrincipalName || account?.mail || "";

	useEffect(() => {
		(async () => {
			setLoading(true);
			try {
				const [allGroups, savedGroups] = await Promise.all([getGroups(), getJSON<(string | number)[]>("selectedGroups", [])]);
				setGroups(allGroups);
				setSelected(savedGroups);
				await setJSON("lastGroups", allGroups);
			} catch (err: any) {
				setError(err?.message || "Impossible de charger les groupes.");
				setGroups(await getJSON("lastGroups", []));
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const filteredGroups = useMemo(() => {
		const term = search.trim().toLowerCase();
		return groups.filter((group) => !term || group.name.toLowerCase().includes(term)).slice(0, 220);
	}, [groups, search]);

	const toggle = (id: string | number) => {
		setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
	};

	const finish = async () => {
		if (!selected.length) {
			setError("Sélectionne au moins un groupe pour afficher ton agenda.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await setJSON("selectedGroups", selected);
			await setJSON("onboardingCompleted", true);
			const start = startOfDay(new Date());
			const end = new Date(start);
			end.setDate(end.getDate() + 30);
			const events = await getEvents(start, end, selected).catch(() => []);
			const safeEvents = Array.isArray(events) ? events : [];
			await setJSON("lastEvents", safeEvents);
			await syncCourseWidgets(safeEvents);
			await rescheduleCourseNoteReminders(safeEvents);
			await enableDefaultNotifications(safeEvents);
			onDone();
		} finally {
			setSaving(false);
		}
	};

	const enableDefaultNotifications = async (events: ZeusEvent[]) => {
		const notificationSettings = { ...(await getNotificationSettings()), enabled: true };
		await setNotificationSettings(notificationSettings);
		const permissions = await requestRequiredAppPermissions().catch(() => null);
		const notificationsGranted = permissions ? !permissions.missing.some((permission) => permission.id === "notifications") : false;
		const token = notificationsGranted ? await requestPushToken().catch(() => null) : null;
		if (notificationsGranted) {
			await scheduleLocalCourseNotifications(events, notificationSettings.minutesBefore, notificationSettings.selectedDays, notificationSettings.notificationType, {
				requestPermission: false,
			}).catch(() => {});
			await registerPlanningNotificationBackgroundSync().catch(() => {});
		}
		if (token && userId) await registerExpoPushToken(token, userId, selected, notificationSettings).catch(() => {});
	};

	return (
		<View style={[s.root, { backgroundColor: theme.bg }]}>
			<ScrollView contentContainerStyle={s.content}>
				<Animated.View entering={FadeInUp.duration(520)} style={s.brandRow}>
					<Image source={require("../../assets/logo.png")} style={s.logo} resizeMode="contain" />
					<View style={s.brandCopy}>
						<Text style={[s.brand, { color: theme.accent }]}>EpiTime</Text>
						<Text style={[s.brandMeta, { color: theme.muted }]}>Configuration initiale</Text>
					</View>
					<Pressable style={[s.logout, { borderColor: theme.border }]} onPress={logout}>
						<LogOut color={theme.muted} size={18} />
					</Pressable>
				</Animated.View>

				{step === "intro" ? (
					<Animated.View entering={FadeIn.duration(400)} style={s.stack}>
						<Card style={s.hero}>
							<Text style={[s.title, { color: theme.text }]}>Prépare ton planning avant d'ouvrir l'app.</Text>
							<Text style={[s.body, { color: theme.muted }]}>
								Choisis tes groupes une fois. EpiTime prépare ensuite l'agenda, les rappels et les raccourcis utiles.
							</Text>
						</Card>

						{features.map((feature, index) => {
							const Icon = feature.icon;
							return (
								<Animated.View key={feature.title} entering={FadeInDown.delay(120 + index * 80).duration(420)}>
									<Card style={s.featureCard}>
										<View style={[s.featureIcon, { backgroundColor: theme.accentSoft }]}>
											<Icon color={theme.accent} size={21} />
										</View>
										<View style={s.featureCopy}>
											<Text style={[s.featureTitle, { color: theme.text }]}>{feature.title}</Text>
											<Text style={[s.featureText, { color: theme.muted }]}>{feature.text}</Text>
										</View>
									</Card>
								</Animated.View>
							);
						})}

						<Pressable style={[s.primary, { backgroundColor: theme.accent }]} onPress={() => setStep("groups")}>
							<Users color="#fff" size={19} />
							<Text style={s.primaryText}>Choisir mes groupes</Text>
						</Pressable>
					</Animated.View>
				) : (
					<Animated.View entering={SlideInRight.duration(380)} style={s.stack}>
						<View>
							<Text style={[s.title, { color: theme.text }]}>Sélectionne tes groupes</Text>
							<Text style={[s.body, { color: theme.muted }]}>Tu pourras modifier cette sélection depuis l'agenda.</Text>
						</View>

						<View style={[s.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
							<Search color={theme.muted} size={18} />
							<TextInput
								value={search}
								onChangeText={setSearch}
								placeholder="Rechercher B2, SRS, ING..."
								placeholderTextColor={theme.muted}
								style={[s.searchInput, { color: theme.text }]}
							/>
						</View>

						<View style={[s.selectionBar, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
							<ShieldCheck color={theme.accent} size={18} />
							<Text style={[s.selectionText, { color: theme.text }]}>{selected.length} groupe(s) sélectionné(s)</Text>
						</View>

						{error ? <Text style={[s.error, { color: theme.danger }]}>{error}</Text> : null}
						{loading ? <ActivityIndicator color={theme.accent} /> : null}

						<View style={s.groupList}>
							{filteredGroups.map((group, index) => {
								const active = selected.includes(group.id);
								return (
									<Animated.View key={String(group.id)} entering={FadeInDown.delay(Math.min(index, 20) * 18).duration(260)} layout={Layout.springify()}>
										<Pressable
											style={[s.groupRow, { backgroundColor: theme.surface, borderColor: active ? theme.accent : theme.border }]}
											onPress={() => toggle(group.id)}>
											<View style={[s.check, { backgroundColor: active ? theme.accent : "transparent", borderColor: active ? theme.accent : theme.border }]}>
												{active ? <Check color="#fff" size={14} /> : null}
											</View>
											<Text style={[s.groupName, { color: theme.text }]} numberOfLines={1}>
												{group.name}
											</Text>
										</Pressable>
									</Animated.View>
								);
							})}
						</View>

						<Pressable
							style={[s.primary, { backgroundColor: selected.length ? theme.accent : theme.border, opacity: saving ? 0.72 : 1 }]}
							onPress={finish}
							disabled={saving}>
							{saving ? <ActivityIndicator color="#fff" /> : <Check color="#fff" size={19} />}
							<Text style={s.primaryText}>Terminer la configuration</Text>
						</Pressable>
					</Animated.View>
				)}
			</ScrollView>
		</View>
	);
}

const s = StyleSheet.create({
	root: { flex: 1 },
	content: { padding: 20, paddingTop: 58, paddingBottom: 42 },
	brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
	logo: { width: 52, height: 52, marginRight: 12 },
	brandCopy: { flex: 1 },
	brand: { fontSize: 26, fontWeight: "900", letterSpacing: 0 },
	brandMeta: { fontWeight: "800", marginTop: 2 },
	logout: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	stack: { gap: 12 },
	hero: { padding: 22, overflow: "hidden" },
	heroBadge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 18 },
	heroBadgeText: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
	title: { fontSize: 31, fontWeight: "900", letterSpacing: 0, lineHeight: 36 },
	body: { marginTop: 10, fontSize: 15, lineHeight: 22 },
	featureCard: { flexDirection: "row", alignItems: "center", gap: 13 },
	featureIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
	featureCopy: { flex: 1 },
	featureTitle: { fontSize: 16, fontWeight: "900" },
	featureText: { marginTop: 4, lineHeight: 19 },
	primary: { minHeight: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 4 },
	primaryText: { color: "#fff", fontWeight: "900", fontSize: 16 },
	searchBox: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8 },
	searchInput: { flex: 1, minHeight: 48, fontSize: 16 },
	selectionBar: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 9 },
	selectionText: { flex: 1, fontWeight: "900" },
	error: { fontWeight: "800" },
	groupList: { gap: 8 },
	groupRow: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
	check: { width: 22, height: 22, borderWidth: 1, borderRadius: 6, alignItems: "center", justifyContent: "center" },
	groupName: { flex: 1, fontWeight: "800" },
});

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { BellRing, Bug, ChevronRight, Code2, Download, Info, LogOut, Moon, RefreshCw, RotateCcw, Shield, Smartphone, Sun, User } from "lucide-react-native";
import Card from "../components/Card";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useVersion } from "../context/VersionContext";
import { getDeletedRealEventsCount, restoreDeletedRealEvents } from "../services/localEvents";
import { getLiveCourseNotificationSettings, setLiveCourseProgressNotificationEnabled } from "../services/liveCourse";

export default function SettingsScreen() {
	const { logout, session } = useAuth();
	const { theme, mode, toggleTheme } = useTheme();
	const { currentVersion, latestVersion, updateAvailable, checking, error, lastCheckedAt, checkForUpdates, openLatestRelease } = useVersion();
	const [liveCourseProgressEnabled, setLiveCourseProgressEnabled] = useState(true);
	const [deletedEventsCount, setDeletedEventsCount] = useState(0);
	const account = session?.account as { displayName?: string; userPrincipalName?: string; mail?: string | null } | null | undefined;
	const versionStatus = updateAvailable ? "Mise à jour disponible" : error ? "Vérification indisponible" : "Application à jour";
	const versionDetails = updateAvailable
		? `Version installée ${currentVersion} · Release ${latestVersion}`
		: error
			? `Version installée ${currentVersion} · ${error}`
			: `Version installée ${currentVersion}${lastCheckedAt ? ` · Vérifiée à ${lastCheckedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}`;

	useEffect(() => {
		getLiveCourseNotificationSettings()
			.then((settings) => setLiveCourseProgressEnabled(settings.progressEnabled))
			.catch(() => {});
	}, []);

	useFocusEffect(
		useCallback(() => {
			getDeletedRealEventsCount()
				.then(setDeletedEventsCount)
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
	const restoreEvents = async () => {
		await restoreDeletedRealEvents();
		setDeletedEventsCount(0);
		Alert.alert("Agenda restauré", "Les cours supprimés réapparaîtront au prochain chargement de l'agenda.");
	};

	return (
		<ScrollView style={[s.root, { backgroundColor: theme.bg }]} contentContainerStyle={s.content}>
			<View style={s.header}>
				<View style={s.headerText}>
					<Text style={[s.eyebrow, { color: theme.accent }]}>PROFIL & PRÉFÉRENCES</Text>
					<Text style={[s.title, { color: theme.text }]}>Réglages</Text>
				</View>
			</View>

			<Card style={s.profileCard} variant="glass" glow={true} accent>
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
			<Card style={s.settingRow} variant="default" glow={false}>
				<View style={[s.iconBox, { backgroundColor: theme.surfaceSoft }]}>
					{mode === "dark" ? <Moon color={theme.accent} size={20} /> : <Sun color={theme.accent} size={20} />}
				</View>
				<View style={s.settingBody}>
					<Text style={[s.settingTitle, { color: theme.text }]}>Mode {mode === "dark" ? "Sombre" : "Clair"}</Text>
					<Text style={[s.meta, { color: theme.muted }]}>Ajuste l'apparence globale</Text>
				</View>
				<Switch value={mode === "dark"} onValueChange={toggleTheme} thumbColor={theme.accent} trackColor={{ false: theme.surfaceSoft, true: theme.accentSoft }} />
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

			<Text style={[s.sectionHeader, { color: theme.text, opacity: 0.6 }]}>AGENDA</Text>
			<View style={s.group}>
				<Action
					icon={<RotateCcw color={theme.accent} size={20} />}
					label={deletedEventsCount ? `Restaurer ${deletedEventsCount} cours supprimé${deletedEventsCount > 1 ? "s" : ""}` : "Aucun cours à restaurer"}
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

	settingRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
	iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
	settingBody: { flex: 1, gap: 2 },
	settingTitle: { fontWeight: "800", fontSize: 16 },

	infoCard: { padding: 20 },
	infoHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
	infoTitle: { fontSize: 17, fontWeight: "800" },
	versionCard: { padding: 20 },
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
